/**
 * Code review: a site in www, a GitHub repository or any Git address (Azure DevOps, GitLab,
 * Bitbucket) is read by Claude Code or by your chosen model, which writes a report of security
 * problems and bugs with the file, line and fix. A built-in check also looks for leaked keys.
 */
import { buildSkillSet, detectStack, recommend, skillCatalog, type SkillItem, type StackTag } from './seckit/skillplan'
import { ensureLmContext } from './seckit/lmstudio'
import { packPluginDirs } from './seckit/skillpacks'
import { execFile, spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative, sep } from 'path'
import { randomBytes } from 'crypto'
import type { ReviewerKind, ReviewFocus, ReviewInfo, ReviewResult, SecretHit } from '../shared/types'
import { reviewerRun, explainFailure, REVIEWER_NAMES, type LocalModel, type ReviewerId } from './seckit/reviewers'
import { SKILLS, skillNames, skillText, writePlugin } from './seckit/skills'
import { homedir } from 'os'
import { dirs } from './paths'
import { chatWithLlm } from './models'
import { findCli } from './aitools'
import { runtimeEnv } from './runtimes'

export const reviewsDir = (): string => join(dirs.root(), 'reviews')
export const reviewSourcesDir = (): string => join(reviewsDir(), 'src')

const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', '.output', 'storage', 'bootstrap', 'target', 'bin', 'obj', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage', 'Pods', 'DerivedData', '.turbo', '.cache', 'public/build', 'wp-admin', 'wp-includes'])
const CODE_EXT = new Set(['.php', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.py', '.cs', '.go', '.rs', '.java', '.kt', '.rb', '.swift', '.sql', '.twig', '.blade.php', '.html', '.yml', '.yaml', '.json', '.env', '.ini', '.conf', '.sh', '.toml', '.xml', '.config'])
const RISKY = /(auth|login|logout|password|passwd|token|session|jwt|oauth|admin|user|account|payment|checkout|billing|upload|file|download|api|route|controller|middleware|guard|policy|permission|role|query|sql|db|database|model|repository|crypto|hash|secret|key|config|settings|security|csrf|cors|webhook|mail|search|export|import)/i

/** Every source file worth reading, risky ones first, skipping dependencies and builds. */
export function listSourceFiles(root: string, max = 4000): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (out.length >= max || depth > 12) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (out.length >= max) return
      const full = join(dir, name)
      const rel = relative(root, full)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue
        if (name.startsWith('.') && name !== '.github') continue
        walk(full, depth + 1)
      } else if (st.isFile() && st.size < 400_000) {
        const ext = name.endsWith('.blade.php') ? '.blade.php' : extname(name).toLowerCase()
        if (CODE_EXT.has(ext) || name === '.env' || /^\.env\./.test(name) || name === 'Dockerfile') {
          if (/(\.min\.|\.lock$|package-lock\.json|yarn\.lock|pnpm-lock|composer\.lock|\.map$)/.test(name)) continue
          out.push(rel)
        }
      }
    }
  }
  walk(root, 0)
  const RISKY_ALL = new RegExp(RISKY.source, 'gi')
  const score = (f: string): number => -(f.match(RISKY_ALL)?.length ?? 0) + (/(test|spec|__tests__|fixtures|migrations|seed)/i.test(f) ? 2 : 0) + (/\.(json|yml|yaml|xml|toml|ini)$/.test(f) ? 1 : 0)
  return out.sort((a, b) => score(a) - score(b) || a.length - b.length)
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['Free LLM API key', /\bfreellmapi-(?!admin-)[a-f0-9]{32,}\b/],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI or Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Laravel app key', /^APP_KEY=base64:[A-Za-z0-9+/=]{40,}/m],
  ['Password in code', /\b(?:password|passwd|db_password|secret)\s*[:=]\s*["'][^"'\s$]{6,}["']/i]
]

/** Looks for keys and passwords written into files. The values themselves are never stored. */
export function scanSecrets(root: string, files: string[]): SecretHit[] {
  const hits: SecretHit[] = []
  for (const rel of files) {
    if (hits.length > 200) break
    let text: string
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      for (const [kind, re] of SECRET_PATTERNS) {
        if (!re.test(line)) continue
        // Example and test files commonly hold fake keys.
        if (/example|sample|dummy|placeholder|changeme|your[_-]?(key|token|secret)|xxxx|<[\w -]{2,40}>/i.test(line) && kind !== 'Private key') continue
        if (kind === 'Laravel app key' && !/^\.env$/.test(rel.split('/').pop() ?? '')) continue
        hits.push({ file: rel, line: i + 1, kind })
        break
      }
    })
  }
  return hits
}

const FOCUS: Record<ReviewFocus, string> = {
  security: 'security problems: injection (SQL, command, template), XSS, broken access control and missing authorization, insecure direct object references, CSRF, authentication and session flaws, unsafe file uploads and path traversal, SSRF, insecure deserialization, weak cryptography, secrets in code, and dangerous configuration',
  bugs: 'bugs: logic errors, unhandled errors, race conditions, wrong edge cases, null handling, resource leaks, and code that will fail in production',
  all: 'security problems first (injection, XSS, access control, CSRF, auth and sessions, uploads, SSRF, secrets, configuration), then real bugs, then the most important maintainability issues'
}

const FORMAT = `Write the report in Markdown, exactly like this:

## Summary
Two or three sentences on the overall state and the most urgent problem.

## Findings
### [HIGH] Short title
File: path/to/file.ext:123
What: what is wrong and how it could be abused or fail, in plain words.
Fix: the concrete change, with a short code snippet when it helps.
OWASP: the OWASP Top 10 (2025) category and the CWE, like "A05 Injection, CWE-89" (leave it out for plain bugs).

Use [CRITICAL], [HIGH], [MEDIUM] or [LOW]. Order by severity. Only report real problems you can point to
in the code; never invent files or lines. If nothing is wrong, say so under Findings.`

export function reviewPrompt(focus: ReviewFocus, name: string): string {
  return `Review the code of the project "${name}" in this folder for ${FOCUS[focus]}.
Read the code itself: start with routes, controllers, authentication, database access, uploads and configuration.
Do not change any file.

${FORMAT}`
}

// ---------------------------------------------------------------- Skills

/** Laramac's security skills, as a Claude Code plugin loaded for its reviews. */
export const pluginDir = (): string => join(dirs.root(), 'claude-plugin')
/** Your own skills: one folder each with a SKILL.md, loaded into every review too. */
export const mySkillsDir = (): string => join(dirs.root(), 'my-skills')
/** Skill packs from the internet (Trail of Bits, Sentry), cloned here. */
export const packsRoot = (): string => join(dirs.root(), 'skill-packs')

export function ensurePlugins(): string[] {
  writePlugin(pluginDir(), 'laramac-security', 'Laramac security skills: code review method, secrets, dependencies, recon, JavaScript recon and reports.')
  const mine = mySkillsDir()
  if (!existsSync(join(mine, '.claude-plugin', 'plugin.json'))) {
    mkdirSync(join(mine, '.claude-plugin'), { recursive: true })
    mkdirSync(join(mine, 'skills'), { recursive: true })
    writeFileSync(join(mine, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'my-skills', version: '1.0.0', description: 'Your own skills for Laramac reviews.', license: 'MIT' }, null, 2))
    writeFileSync(join(mine, 'skills', 'README.md'), 'Put each skill in its own folder here, with a SKILL.md inside (name and description at the top). Laramac loads them into every review.\n')
  }
  return [pluginDir(), ...(skillNames(join(mine, 'skills')).length ? [mine] : []), ...packPluginDirs(packsRoot())]
}

/** Every skill a review can load, and the ones that fit this project. */
export function skillPlan(root: string | null): { items: SkillItem[]; stack: StackTag[]; recommended: string[]; files: number } {
  ensurePlugins()
  const items = skillCatalog({ app: 'Laramac', ownDir: pluginDir(), mineDir: mySkillsDir(), packsRoot: packsRoot() })
  const stack = root ? detectStack(root) : []
  return { items, stack, recommended: recommend(items, stack), files: root ? listSourceFiles(root).length : 0 }
}

export const skillList = (): string[] => [...Object.keys(SKILLS), ...skillNames(join(mySkillsDir(), 'skills'))]

// ---------------------------------------------------------------- MacSec's scanners, when MacSec is installed

const macsecBin = (n: string): string => join(homedir(), 'MacSec', 'tools', 'bin', n)
export const hasMacsec = (): boolean => existsSync(macsecBin('semgrep')) || existsSync(macsecBin('gitleaks'))

function runFile(bin: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  const home = join(homedir(), 'MacSec', 'tools', 'home')
  mkdirSync(join(home, 'tmp'), { recursive: true })
  return new Promise((resolve) =>
    execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 200 * 1024 * 1024, env: { PATH: `${dirname(bin)}:/usr/bin:/bin`, HOME: home, TMPDIR: join(home, 'tmp'), SEMGREP_SEND_METRICS: 'off', NO_COLOR: '1', ...Object.fromEntries(['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE'].filter((k) => process.env[k]).map((k) => [k, process.env[k] as string])) } }, (_e, out) => resolve(String(out)))
  )
}

/** Semgrep, Gitleaks and OSV-Scanner from MacSec's folder: a list the AI reviewer then checks. */
export async function macsecScan(root: string, onLine: (l: string) => void): Promise<string[]> {
  const out: string[] = []
  if (existsSync(macsecBin('semgrep'))) {
    onLine('Semgrep (from MacSec) is reading the code')
    try {
      const j = JSON.parse(await runFile(macsecBin('semgrep'), ['scan', '--config', 'p/default', '--config', 'p/secrets', '--json', '--quiet', '--metrics', 'off', '--timeout', '20', '.'], root, 20 * 60_000)) as { results?: { path: string; start: { line: number }; check_id: string; extra: { severity: string; message: string } }[] }
      for (const r of (j.results ?? []).slice(0, 80)) out.push(`[Semgrep ${r.extra.severity}] ${r.path}:${r.start.line} ${r.check_id.split('.').pop()}: ${r.extra.message.split('\n')[0].slice(0, 160)}`)
    } catch {
      // No usable report.
    }
  }
  if (existsSync(macsecBin('gitleaks'))) {
    onLine('Gitleaks (from MacSec) is looking for keys')
    const report = join(reviewsDir(), `gitleaks-${randomBytes(4).toString('hex')}.json`)
    mkdirSync(reviewsDir(), { recursive: true })
    await runFile(macsecBin('gitleaks'), ['dir', '.', '--report-format', 'json', '--report-path', report, '--no-banner', '--redact', '--exit-code', '0', '--log-level', 'error'], root, 10 * 60_000)
    try {
      for (const g of (JSON.parse(readFileSync(report, 'utf8')) as { File: string; StartLine: number; Description: string }[]).slice(0, 40)) out.push(`[Gitleaks] ${g.File}:${g.StartLine} ${g.Description}`)
    } catch {
      // Nothing found.
    }
    rmSync(report, { force: true })
  }
  if (existsSync(macsecBin('osv-scanner'))) {
    onLine('OSV-Scanner (from MacSec) is checking packages')
    try {
      const j = JSON.parse(await runFile(macsecBin('osv-scanner'), ['scan', 'source', '-r', '--format', 'json', '.'], root, 10 * 60_000)) as { results?: { packages?: { package: { name: string; version: string }; vulnerabilities?: { id: string; summary?: string }[] }[] }[] }
      for (const r of j.results ?? []) for (const p of r.packages ?? []) for (const v of (p.vulnerabilities ?? []).slice(0, 3)) out.push(`[OSV] ${p.package.name} ${p.package.version}: ${v.id} ${v.summary ?? ''}`.slice(0, 200))
    } catch {
      // No lock files.
    }
  }
  return out.slice(0, 160)
}

// ---------------------------------------------------------------- Any agent CLI

export function runAgent(bin: string, args: string[], env: Record<string, string>, cwd: string, onLine: (l: string) => void, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...runtimeEnv(), ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const t0 = Date.now()
    child.stdout.on('data', (d) => {
      out += d.toString()
      onLine(`Reading the code… ${Math.round((Date.now() - t0) / 60000)} min`)
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
      if (err.length > 100_000) err = err.slice(-50_000)
    })
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (out.trim() && (code === 0 || out.length > 200)) resolve(out.trim())
      else reject(new Error(err || `exit ${code}`))
    })
  })
}

const CLI_NAMES: Record<ReviewerId, string[]> = { claude: ['claude'], 'claude-local': ['claude'], 'claude-free': ['claude'], codex: ['codex'], gemini: ['gemini'], coderabbit: ['coderabbit', 'cr'] }

export function reviewerOptions(model: string, free = false): { id: ReviewerKind; name: string; installed: boolean; note?: string }[] {
  const has = (id: ReviewerId): boolean => !!findCli(CLI_NAMES[id])
  return [
    { id: 'claude', name: 'Claude Code', installed: has('claude'), note: has('claude') ? undefined : 'Install Claude Code on the AI tools page.' },
    { id: 'claude-local', name: model ? `Claude Code on ${model.split('/').pop()}` : 'Claude Code on your model', installed: has('claude') && !!model, note: !has('claude') ? 'Install Claude Code first.' : !model ? 'Choose a model (LM Studio) in the Assistant first.' : 'Your model, through LM Studio 0.4.1 or newer. Load it with 32k context or more.' },
    { id: 'claude-free', name: 'Claude Code on Free LLM API', installed: has('claude') && free, note: !has('claude') ? 'Install Claude Code first.' : !free ? 'Connect Free LLM API on the AI tools page first.' : 'Your free keys (Google AI Studio, Groq, NVIDIA, OpenRouter and more) through Free LLM API.' },
    { id: 'codex', name: 'Codex', installed: has('codex'), note: has('codex') ? undefined : 'npm install -g @openai/codex' },
    { id: 'gemini', name: 'Gemini CLI', installed: has('gemini'), note: has('gemini') ? undefined : 'npm install -g @google/gemini-cli' },
    { id: 'coderabbit', name: 'CodeRabbit (changes only)', installed: has('coderabbit'), note: has('coderabbit') ? 'Reviews the changes in a Git project.' : 'curl -fsSL https://cli.coderabbit.ai/install.sh | sh' },
    { id: 'model', name: model ? `${model.split('/').pop()} directly` : 'Your model directly', installed: !!model }
  ]
}

/** Splits files into pieces small enough for a local model, risky files first. */
export function chunkFiles(root: string, files: string[], perChunk = 24_000, total = 120_000): string[] {
  const chunks: string[] = []
  let cur = ''
  let used = 0
  for (const rel of files) {
    if (used >= total) break
    let text: string
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    if (/\0/.test(text.slice(0, 1000))) continue
    const numbered = text
      .split('\n')
      .slice(0, 800)
      .map((l, i) => `${i + 1}: ${l}`)
      .join('\n')
    const block = `=== ${rel} ===\n${numbered}\n`
    const piece = block.length > perChunk ? block.slice(0, perChunk) : block
    if (cur.length + piece.length > perChunk && cur) {
      chunks.push(cur)
      cur = ''
    }
    cur += piece
    used += piece.length
  }
  if (cur) chunks.push(cur)
  return chunks
}

async function runModel(root: string, name: string, focus: ReviewFocus, files: string[], onLine: (l: string, pct?: number) => void): Promise<string> {
  const chunks = chunkFiles(root, files)
  if (chunks.length === 0) throw new Error('No source files were found to review.')
  const parts: string[] = []
  for (const [i, chunk] of chunks.entries()) {
    onLine(`Reading part ${i + 1} of ${chunks.length}`, Math.round(((i + 0.2) / (chunks.length + 1)) * 100))
    const reply = await chatWithLlm(
      [
        { role: 'system', content: `You are a senior code reviewer. Lines are numbered as "N: code". ${FORMAT}` },
        { role: 'user', content: `Project "${name}", part ${i + 1} of ${chunks.length}. Review for ${FOCUS[focus]}.\n\n${chunk}` }
      ],
      600000
    )
    parts.push(reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim())
  }
  if (parts.length === 1) return parts[0]
  onLine('Putting the report together', 90)
  try {
    const merged = await chatWithLlm(
      [
        { role: 'system', content: `You merge code review notes into one report. Remove duplicates, keep every real finding with its file and line, and order by severity. ${FORMAT}` },
        { role: 'user', content: parts.map((p, i) => `--- Notes for part ${i + 1} ---\n${p}`).join('\n\n') }
      ],
      600000
    )
    return merged.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch {
    return parts.join('\n\n')
  }
}

/** Counts findings by severity from the report's headings. */
export function countFindings(md: string): Record<'critical' | 'high' | 'medium' | 'low', number> {
  const c = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const m of md.matchAll(/^#{2,4}\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]/gim)) c[m[1].toLowerCase() as keyof typeof c]++
  return c
}

export const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'project'

export async function runReview(o: { root: string; name: string; reviewer: ReviewerKind; focus: ReviewFocus; modelName: string; local?: LocalModel; remote?: boolean; scanners?: boolean; skills?: string[] }, update: (p: number | null, l?: string) => void): Promise<ReviewResult> {
  const started = Date.now()
  update(5, 'Listing the source files')
  const files = listSourceFiles(o.root)
  update(10, 'Looking for leaked keys and passwords')
  const secrets = scanSecrets(o.root, files)
  const scanned = o.scanners && hasMacsec() ? await macsecScan(o.root, (l) => update(20, l)) : []
  let session: string | undefined
  let skills = skillList()
  let report: string
  if (o.reviewer === 'model') report = await runModel(o.root, o.name, o.focus, files, (l, p) => update(p ?? null, l))
  else {
    const id = o.reviewer as ReviewerId
    const bin = findCli(CLI_NAMES[id])
    if (!bin) throw new Error(`${REVIEWER_NAMES[id]} is not installed. ${reviewerOptions(o.modelName).find((r) => r.id === id)?.note ?? ''}`.trim())
    const viaClaude = id === 'claude' || id === 'claude-local' || id === 'claude-free'
    // The skills you picked, from a folder built for this review; without a choice, the ones that fit the project.
    let skillDir: string | null = null
    let plugins: string[] = []
    let chosenSkills: string[]
    if (viaClaude) {
      const plan = skillPlan(o.root)
      const ids = o.skills?.length ? o.skills.filter((s) => plan.items.some((i) => i.id === s)) : plan.recommended
      chosenSkills = plan.items.filter((i) => ids.includes(i.id)).map((i) => i.name)
      skills = chosenSkills
      skillDir = join(reviewsDir(), `.skills-${randomBytes(4).toString('hex')}`)
      plugins = buildSkillSet(plan.items, ids, skillDir)
    }
    // Claude Code loads the skills itself; the others get the method in the prompt.
    // Claude Code loads skills itself. Big-context reviewers get every vector; a local model gets the plan and the core method.
    const vectorSkills = ['api-security-review', 'auth-session-review', 'injection-catalog', 'client-side-review', 'business-logic-review', 'infra-config-review', 'supply-chain-review', 'cloud-baas-review', 'ai-app-review', 'electron-review', 'privacy-data-review']
    // Free LLM API routes to big hosted models, so it gets every vector like Codex and Gemini.
    const method = id === 'claude' ? '' : `\n\nFollow this method:\n\n${skillText(['review-vectors', 'security-code-review', ...(id === 'claude-local' ? ['local-model-review'] : vectorSkills), 'secrets-triage', 'security-report'], [join(mySkillsDir(), 'skills')])}`
    const brief = scanned.length ? `\n\nScanners already ran. Check each against the code, say which are real, and add what they missed:\n${scanned.map((s) => `- ${s}`).join('\n')}` : ''
    const prompt = `${reviewPrompt(o.focus, o.name)}${viaClaude ? '\n\nUse the laramac-security skills: start with review-vectors to plan which areas apply to this stack, then security-code-review and every vector skill that applies (api-security-review, auth-session-review, injection-catalog, client-side-review, business-logic-review, infra-config-review, supply-chain-review, cloud-baas-review, ai-app-review, electron-review, privacy-data-review), then secrets-triage, dependency-triage and security-report. Use any of your own skills too. Say which areas were not applicable.' : ''}${brief}${method}`
    const outFile = join(reviewsDir(), `codex-${randomBytes(4).toString('hex')}.md`)
    mkdirSync(reviewsDir(), { recursive: true })
    const run = reviewerRun(id, bin, prompt, { plugins, name: `Laramac review: ${o.name}`, local: o.local, outFile, cwd: o.root })
    session = run.session
    if (id === 'claude-local' && o.local) {
      update(25, 'Checking the model has enough context for Claude Code')
      const ctx = await ensureLmContext(o.local.baseUrl, o.local.model, o.local.token)
      if (!ctx.ok) throw new Error(ctx.note)
      if (ctx.note) update(28, ctx.note)
    }
    update(30, `${REVIEWER_NAMES[id]} is reading the code`)
    try {
      const text = await runAgent(run.bin, run.args, run.env, o.root, (l) => update(null, `${REVIEWER_NAMES[id]}: ${l}`), (id === 'claude-local' || id === 'claude-free' ? 60 : 30) * 60_000)
      report = id === 'codex' && existsSync(outFile) ? readFileSync(outFile, 'utf8') : text
    } catch (e) {
      throw new Error(explainFailure(id, (e as Error).message))
    } finally {
      rmSync(outFile, { force: true })
      if (skillDir) rmSync(skillDir, { recursive: true, force: true })
    }
  }
  if (scanned.length) report += `\n\n## What the scanners reported\n${scanned.map((s) => `- ${s}`).join('\n')}`
  const secretMd = secrets.length
    ? `\n\n## Keys and passwords in files\n${secrets.map((s) => `- ${s.kind} in \`${s.file}:${s.line}\``).join('\n')}\n\nMove them to environment variables and rotate any that were ever pushed.`
    : ''
  const when = new Date()
  const title = `${o.name}, ${when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
  const who = o.reviewer === 'model' ? o.modelName : o.reviewer === 'claude-local' ? `Claude Code on ${o.local?.model ?? o.modelName}` : o.reviewer === 'claude-free' ? `Claude Code on Free LLM API (${o.local?.model ?? 'auto'})` : REVIEWER_NAMES[o.reviewer as ReviewerId]
  const markdown = `# Code review: ${o.name}\n\nReviewer: ${who}. Focus: ${o.focus}. ${files.length} files.${o.reviewer === 'claude' || o.reviewer === 'claude-local' || o.reviewer === 'claude-free' ? ` Skills: ${skills.join(', ')}.` : ''}${scanned.length ? ` Scanners: ${scanned.length} results checked.` : ''}\n\n${report}${secretMd}\n`
  mkdirSync(reviewsDir(), { recursive: true })
  const id = `${slugOf(o.name)}-${when.toISOString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const reportPath = join(reviewsDir(), `${id}.md`)
  writeFileSync(reportPath, markdown)
  const usedSkills = o.reviewer === 'claude' || o.reviewer === 'claude-local' || o.reviewer === 'claude-free' ? skills : undefined
  writeFileSync(join(reviewsDir(), `${id}.json`), JSON.stringify({ id, title, folder: o.remote ? '' : o.root, reviewer: o.reviewer, focus: o.focus, at: when.toISOString(), counts: countFindings(report), secrets: secrets.length, remote: !!o.remote, session, skills: usedSkills }))
  return { id, title, folder: o.remote ? '' : o.root, remote: !!o.remote, reviewer: o.reviewer, markdown, secrets, files: files.length, ms: Date.now() - started, reportPath, counts: countFindings(report), session, skills: usedSkills }
}

export function listReviews(): ReviewInfo[] {
  if (!existsSync(reviewsDir())) return []
  return readdirSync(reviewsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(reviewsDir(), f), 'utf8')) as ReviewInfo
      } catch {
        return null
      }
    })
    .filter((x): x is ReviewInfo => !!x)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50)
}

export function readReview(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Unknown review.')
  const f = join(reviewsDir(), `${id}.md`)
  if (!existsSync(f)) throw new Error('That review is gone.')
  return readFileSync(f, 'utf8')
}

export function deleteReview(id: string): void {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Unknown review.')
  rmSync(join(reviewsDir(), `${id}.md`), { force: true })
  rmSync(join(reviewsDir(), `${id}.json`), { force: true })
  rmSync(join(reviewsDir(), `${id}.deep`), { recursive: true, force: true })
}

/** Basic-auth header for cloning with a token. Azure DevOps and others accept any user name. */
export function gitAuthHeader(url: string, token: string): string {
  const host = new URL(url).hostname
  const user = host === 'github.com' ? 'x-access-token' : /gitlab/.test(host) ? 'oauth2' : 'pat'
  return `AUTHORIZATION: basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

/**
 * A private session folder for one review: a fresh shallow copy of the repository, only for
 * reading. Every review gets its own, so reviews never share or reuse code, and the caller
 * deletes it with endReviewSession as soon as the review is done.
 */
export function cloneForReview(url: string, token: string | null): Promise<string> {
  if (!/^https:\/\/[^\s'"]+$/.test(url)) return Promise.reject(new Error('Use the https address of the repository.'))
  mkdirSync(reviewSourcesDir(), { recursive: true, mode: 0o700 })
  const session = join(reviewSourcesDir(), `session-${randomBytes(8).toString('hex')}`)
  mkdirSync(session, { mode: 0o700 })
  const target = join(session, 'code')
  const origin = new URL(url).origin
  const args = [...(token ? ['-c', `http.${origin}/.extraheader=${gitAuthHeader(url, token)}`] : []), 'clone', '--depth', '1', '--quiet', url, target]
  return new Promise((resolve, reject) => {
    execFile('git', args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 }, (err, _o, stderr) => {
      if (!err) return resolve(target)
      endReviewSession(target)
      const msg = String(stderr || err.message)
      reject(new Error(/Authentication|403|401|could not read Username|not found/i.test(msg) ? 'The repository could not be read. Check the address, and add a token if it is private.' : `Cloning failed: ${msg.trim().split('\n').pop()}`))
    })
  })
}

/** Deletes a review session folder. Only ever removes folders inside the review sessions area. */
export function endReviewSession(codeDir: string): void {
  const session = dirname(codeDir)
  const root = reviewSourcesDir()
  if (!session.startsWith(root + sep) || !/session-[a-f0-9]{16}$/.test(session)) return
  rmSync(session, { recursive: true, force: true })
}

/** Removes session folders left behind if Laramac quit in the middle of a review. */
export function cleanReviewSessions(): void {
  if (!existsSync(reviewSourcesDir())) return
  for (const f of readdirSync(reviewSourcesDir())) rmSync(join(reviewSourcesDir(), f), { recursive: true, force: true })
}

export interface RemoteRepo {
  name: string
  url: string
  private: boolean
  project?: string
}

/** Lists repositories a token can read, so you can pick one instead of typing its address. */
export async function listRemoteRepos(provider: 'github' | 'azure', token: string, org = ''): Promise<RemoteRepo[]> {
  if (!token.trim()) throw new Error('Paste a token first.')
  if (provider === 'github') {
    const out: RemoteRepo[] = []
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`, {
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Laramac' },
        signal: AbortSignal.timeout(20000)
      })
      if (res.status === 401) throw new Error('GitHub did not accept that token.')
      if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
      const list = (await res.json()) as { full_name: string; clone_url: string; private: boolean }[]
      out.push(...list.map((r) => ({ name: r.full_name, url: r.clone_url, private: r.private })))
      if (list.length < 100) break
    }
    return out
  }
  const o = org.trim().replace(/^https:\/\/dev\.azure\.com\//, '').replace(/\/.*$/, '')
  if (!/^[\w.-]{1,100}$/.test(o)) throw new Error('Enter your Azure DevOps organization, the name after dev.azure.com/.')
  const res = await fetch(`https://dev.azure.com/${encodeURIComponent(o)}/_apis/git/repositories?api-version=7.1`, {
    headers: { Authorization: `Basic ${Buffer.from(`:${token.trim()}`).toString('base64')}`, Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  })
  // Azure answers a bad token with a redirect to its sign-in page.
  if (res.status === 401 || res.status === 203 || (res.status >= 300 && res.status < 400)) throw new Error('Azure DevOps did not accept that token. It needs Code (Read) access.')
  if (res.status === 404) throw new Error('That Azure DevOps organization was not found.')
  if (!res.ok) throw new Error(`Azure DevOps answered ${res.status}.`)
  const data = (await res.json()) as { value: { name: string; remoteUrl: string; project: { name: string; visibility?: string } }[] }
  return data.value
    .map((r) => ({ name: `${r.project.name}/${r.name}`, url: r.remoteUrl, private: r.project.visibility !== 'public', project: r.project.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Files git would push (tracked or new, never ignored), or all source files outside git. */
export function pushableFiles(root: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(listSourceFiles(root))
      const files = String(out).split('\0').filter(Boolean)
      resolve(files.filter((f) => !/(^|\/)(node_modules|vendor)\//.test(f)).slice(0, 8000))
    })
  })
}

/** Saves a review's details (what you decided about each finding, for example). */
export function saveReviewInfo(info: ReviewInfo): void {
  if (!/^[a-z0-9-]+$/.test(info.id)) throw new Error('Unknown review.')
  writeFileSync(join(reviewsDir(), `${info.id}.json`), JSON.stringify(info))
}
