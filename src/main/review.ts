/**
 * Code review: a site in www, a GitHub repository or any Git address (Azure DevOps, GitLab,
 * Bitbucket) is read by Claude Code or by your chosen model, which writes a report of security
 * problems and bugs with the file, line and fix. A built-in check also looks for leaked keys.
 */
import { execFile, spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { extname, join, relative } from 'path'
import type { ReviewFocus, ReviewInfo, ReviewResult, SecretHit } from '../shared/types'
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
        if (/example|sample|dummy|placeholder|changeme|your[_-]?(key|token|secret)|xxxx|<.*>/i.test(line) && kind !== 'Private key') continue
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

Use [CRITICAL], [HIGH], [MEDIUM] or [LOW]. Order by severity. Only report real problems you can point to
in the code; never invent files or lines. If nothing is wrong, say so under Findings.`

export function reviewPrompt(focus: ReviewFocus, name: string): string {
  return `Review the code of the project "${name}" in this folder for ${FOCUS[focus]}.
Read the code itself: start with routes, controllers, authentication, database access, uploads and configuration.
Do not change any file.

${FORMAT}`
}

function runClaude(cwd: string, prompt: string, onLine: (l: string) => void): Promise<string> {
  const claude = findCli(['claude'])
  if (!claude) return Promise.reject(new Error('Claude Code is not installed. Install it on the Tools page, or choose a model instead.'))
  return new Promise((resolve, reject) => {
    // Plan mode and read-only tools: Claude Code can read and search, but not edit or run anything.
    const child = spawn(claude, ['-p', prompt, '--output-format', 'text', '--permission-mode', 'plan', '--allowedTools', 'Read,Grep,Glob'], {
      cwd,
      env: { ...process.env, ...runtimeEnv() },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
      onLine('Claude Code is reading the code…')
    })
    child.stderr.on('data', (d) => (err += d.toString()))
    const timer = setTimeout(() => child.kill('SIGTERM'), 20 * 60 * 1000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve(out.trim())
      else if (/log ?in|auth|credential|api key/i.test(err)) reject(new Error('Claude Code is not signed in. Open it once in Terminal and sign in, then try again.'))
      else reject(new Error(`Claude Code stopped without a report. ${err.trim().split('\n').slice(-3).join(' ')}`.trim()))
    })
  })
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

const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'project'

export async function runReview(o: { root: string; name: string; reviewer: 'claude' | 'model'; focus: ReviewFocus; modelName: string }, update: (p: number | null, l?: string) => void): Promise<ReviewResult> {
  const started = Date.now()
  update(5, 'Listing the source files')
  const files = listSourceFiles(o.root)
  update(10, 'Looking for leaked keys and passwords')
  const secrets = scanSecrets(o.root, files)
  const report =
    o.reviewer === 'claude'
      ? await runClaude(o.root, reviewPrompt(o.focus, o.name), (l) => update(null, l))
      : await runModel(o.root, o.name, o.focus, files, (l, p) => update(p ?? null, l))
  const secretMd = secrets.length
    ? `\n\n## Keys and passwords in files\n${secrets.map((s) => `- ${s.kind} in \`${s.file}:${s.line}\``).join('\n')}\n\nMove them to environment variables and rotate any that were ever pushed.`
    : ''
  const when = new Date()
  const title = `${o.name}, ${when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
  const markdown = `# Code review: ${o.name}\n\nReviewer: ${o.reviewer === 'claude' ? 'Claude Code' : o.modelName}. Focus: ${o.focus}. ${files.length} files.\n\n${report}${secretMd}\n`
  mkdirSync(reviewsDir(), { recursive: true })
  const id = `${slugOf(o.name)}-${when.toISOString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const reportPath = join(reviewsDir(), `${id}.md`)
  writeFileSync(reportPath, markdown)
  writeFileSync(join(reviewsDir(), `${id}.json`), JSON.stringify({ id, title, folder: o.root, reviewer: o.reviewer, focus: o.focus, at: when.toISOString(), counts: countFindings(report), secrets: secrets.length }))
  return { id, title, folder: o.root, reviewer: o.reviewer, markdown, secrets, files: files.length, ms: Date.now() - started, reportPath, counts: countFindings(report) }
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
}

/** Basic-auth header for cloning with a token. Azure DevOps and others accept any user name. */
export function gitAuthHeader(url: string, token: string): string {
  const host = new URL(url).hostname
  const user = host === 'github.com' ? 'x-access-token' : /gitlab/.test(host) ? 'oauth2' : 'pat'
  return `AUTHORIZATION: basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

/** A fresh shallow copy of a repository, only for reading. */
export function cloneForReview(url: string, token: string | null, name: string): Promise<string> {
  if (!/^https:\/\/[^\s'"]+$/.test(url)) return Promise.reject(new Error('Use the https address of the repository.'))
  const target = join(reviewSourcesDir(), slugOf(name))
  rmSync(target, { recursive: true, force: true })
  mkdirSync(reviewSourcesDir(), { recursive: true })
  const origin = new URL(url).origin
  const args = [...(token ? ['-c', `http.${origin}/.extraheader=${gitAuthHeader(url, token)}`] : []), 'clone', '--depth', '1', '--quiet', url, target]
  return new Promise((resolve, reject) => {
    execFile('git', args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 }, (err, _o, stderr) => {
      if (!err) return resolve(target)
      const msg = String(stderr || err.message)
      reject(new Error(/Authentication|403|401|could not read Username|not found/i.test(msg) ? 'The repository could not be read. Check the address, and add a token if it is private.' : `Cloning failed: ${msg.trim().split('\n').pop()}`))
    })
  })
}
