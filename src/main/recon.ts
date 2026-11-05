/**
 * Recon sessions: each run of the shared recon engine (seckit/recon.ts) is kept in
 * ~/.laramac/recon/<id> with its hosts, scripts, findings and the AI's write-up, so you can come
 * back to it. Read-only, and anything that is not on this Mac needs your confirmation.
 */
import { assetUrl, latestRelease } from './seckit/ghapi'
import { ensureLmContext } from './seckit/lmstudio'
import { spawn } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ReconDetail, ReconFindingInfo, ReconInfo, ReconRequest, ReconSeverity, ReconStep } from '../shared/types'
import { dirs } from './paths'
import { runRecon, reconPrompt, normalizeTarget, type ReconResult } from './seckit/recon'
import { reviewerRun, explainFailure, REVIEWER_NAMES, type ReviewerId } from './seckit/reviewers'
import { ensurePlugins, mySkillsDir } from './review'
import { skillText } from './seckit/skills'
import { findCli } from './aitools'
import { chatWithLlm } from './models'
import { runtimeEnv, shaFor } from './runtimes'
import { downloadFile, extract, removeQuarantine, sha256File, USER_AGENT } from './download'
import { getSettings } from './settings'

export const reconDir = (): string => join(dirs.root(), 'recon')
const SAFE_ID = /^[a-z0-9-]{8,80}$/
const dirOf = (id: string): string => {
  if (!SAFE_ID.test(id)) throw new Error('Unknown recon.')
  return join(reconDir(), id)
}

const running = new Map<string, { cancelled: boolean; children: Set<ReturnType<typeof spawn>> }>()
type Emit = (info: ReconInfo) => void
type Line = (id: string, text: string) => void

const empty = (): Record<ReconSeverity, number> => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })

export const isLocalDomain = (d: string): boolean => /\.(test|localhost)$/.test(d) || d === 'localhost'

function save(info: ReconInfo): void {
  const d = dirOf(info.id)
  if (!existsSync(d)) return
  writeFileSync(join(d, 'info.json'), JSON.stringify(info, null, 2))
}

export function listRecon(): ReconInfo[] {
  if (!existsSync(reconDir())) return []
  return readdirSync(reconDir())
    .filter((n) => SAFE_ID.test(n) && existsSync(join(reconDir(), n, 'info.json')))
    .map((n) => {
      try {
        return JSON.parse(readFileSync(join(reconDir(), n, 'info.json'), 'utf8')) as ReconInfo
      } catch {
        return null
      }
    })
    .filter((x): x is ReconInfo => !!x)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function reconDetail(id: string): ReconDetail {
  const d = dirOf(id)
  const info = JSON.parse(readFileSync(join(d, 'info.json'), 'utf8')) as ReconInfo
  const r = existsSync(join(d, 'result.json')) ? (JSON.parse(readFileSync(join(d, 'result.json'), 'utf8')) as ReconResult & { findings: ReconFindingInfo[] }) : null
  return {
    ...info,
    hostCount: info.hosts,
    findings: r?.findings ?? [],
    hosts: r?.hosts ?? [],
    js: r?.js ?? [],
    endpoints: r?.endpoints ?? [],
    params: r?.params ?? [],
    urls: r?.urls.length ?? 0,
    report: existsSync(join(d, 'report.md')) ? readFileSync(join(d, 'report.md'), 'utf8') : undefined
  }
}

export function deleteRecon(id: string): void {
  cancelRecon(id)
  rmSync(dirOf(id), { recursive: true, force: true })
}

export function cancelRecon(id: string): void {
  const r = running.get(id)
  if (!r) return
  r.cancelled = true
  for (const c of r.children) c.kill('SIGTERM')
}

// ---------------------------------------------------------------- subfinder

export const subfinderBinary = (): string => join(dirs.root(), 'runtimes', 'security', 'subfinder')
export const hasSubfinder = (): boolean => existsSync(subfinderBinary())

/** ProjectDiscovery's subfinder, from its GitHub release, checked against its checksums. */
export async function installSubfinder(update: (p: number | null, l?: string) => void): Promise<void> {
  const latest = await latestRelease('projectdiscovery/subfinder')
  const v = latest.tag.replace(/^v/, '')
  const name = `subfinder_${v}_macOS_${process.arch === 'arm64' ? 'arm64' : 'amd64'}.zip`
  // From the release page (GitHub's hourly limit used up), the file names are known: build their links.
  const rel = { assets: latest.fromWeb ? [name, `subfinder_${v}_checksums.txt`].map((n) => ({ name: n, browser_download_url: assetUrl('projectdiscovery/subfinder', latest.tag, n) })) : latest.assets.map((a) => ({ name: a.name, browser_download_url: a.url })) }
  const asset = rel.assets.find((a) => a.name === name)
  const sums = rel.assets.find((a) => /checksums\.txt$/.test(a.name))
  if (!asset) throw new Error('No subfinder build for this Mac was found.')
  const archive = join(dirs.downloads(), name)
  await downloadFile(asset.browser_download_url, archive, (p) => update(p, 'Downloading subfinder'))
  if (sums) {
    const want = shaFor(await (await fetch(sums.browser_download_url, { headers: { 'User-Agent': USER_AGENT } })).text(), name)
    if (want && (await sha256File(archive)) !== want) {
      rmSync(archive, { force: true })
      throw new Error('The subfinder download did not match its checksum and was deleted.')
    }
  }
  const staging = `${archive}-staging`
  rmSync(staging, { recursive: true, force: true })
  await extract(archive, staging)
  mkdirSync(join(dirs.root(), 'runtimes', 'security'), { recursive: true })
  rmSync(subfinderBinary(), { force: true })
  renameSync(join(staging, 'subfinder'), subfinderBinary())
  chmodSync(subfinderBinary(), 0o755)
  await removeQuarantine(subfinderBinary())
  rmSync(staging, { recursive: true, force: true })
  rmSync(archive, { force: true })
}

// ---------------------------------------------------------------- A run

export function startRecon(req: ReconRequest, emit: Emit, line: Line): ReconInfo {
  const { domain } = normalizeTarget(req.target)
  if (!isLocalDomain(domain) && !req.authorized) throw new Error('Confirm that you own this domain or have written permission to assess it.')
  const id = `${domain.replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`
  mkdirSync(dirOf(id), { recursive: true })
  const info: ReconInfo = { id, target: req.target.trim(), domain, depth: req.depth, reviewer: req.reviewer, createdAt: new Date().toISOString(), status: 'running', steps: [], counts: empty() }
  save(info)
  void run(info, req, emit, line)
  return info
}

async function run(info: ReconInfo, req: ReconRequest, emit: Emit, line: Line): Promise<void> {
  const r = { cancelled: false, children: new Set<ReturnType<typeof spawn>>() }
  running.set(info.id, r)
  const d = dirOf(info.id)
  const push = (): void => {
    save(info)
    emit(info)
  }
  const stepOf = (id: string, label: string): ReconStep => {
    let s = info.steps.find((x) => x.id === id)
    if (!s) {
      s = { id, label, status: 'waiting' }
      info.steps.push(s)
    }
    return s
  }
  try {
    const result = await runRecon(req.target, {
      depth: req.depth,
      userAgent: 'Laramac recon (read-only)',
      cancelled: () => r.cancelled,
      step: (id, label, status, detail) => {
        const s = stepOf(id, label)
        if (status === 'running') s.startedAt = new Date().toISOString()
        if (status !== 'running' && s.startedAt) s.ms = Date.now() - new Date(s.startedAt).getTime()
        Object.assign(s, { label, status, detail })
        push()
      },
      line: (t) => line(info.id, t),
      tool: (n) => (n === 'subfinder' && hasSubfinder() ? subfinderBinary() : null),
      run: (bin, args, timeoutMs) =>
        new Promise((resolve) => {
          const c = spawn(bin, args, { env: { ...process.env, HOME: join(dirs.root(), 'runtimes', 'security', 'home') }, stdio: ['ignore', 'pipe', 'pipe'] })
          r.children.add(c)
          let out = ''
          c.stdout.on('data', (x) => (out += x.toString()))
          const t = setTimeout(() => c.kill('SIGTERM'), timeoutMs)
          c.on('close', () => {
            clearTimeout(t)
            r.children.delete(c)
            resolve(out)
          })
        })
    })
    const findings: ReconFindingInfo[] = result.findings.map((f) => ({ ...f }))
    writeFileSync(join(d, 'result.json'), JSON.stringify({ ...result, findings }))
    Object.assign(info, { hosts: result.hosts.length, live: result.hosts.filter((h) => h.live).length, scripts: result.js.length, sourceMaps: result.js.filter((j) => j.sourceMap).length, endpoints: result.endpoints.length })
    info.counts = count(findings)
    push()

    if (req.reviewer !== 'none' && !r.cancelled) {
      const s = stepOf('ai', 'AI: the attack surface and where to look first')
      Object.assign(s, { status: 'running', startedAt: new Date().toISOString() })
      push()
      try {
        const report = await aiReport(result, req.reviewer, d, r, (t) => line(info.id, t))
        writeFileSync(join(d, 'report.md'), report)
        applyVerdicts(report, findings)
        writeFileSync(join(d, 'result.json'), JSON.stringify({ ...result, findings }))
        info.counts = count(findings)
        Object.assign(s, { status: 'done', ms: Date.now() - new Date(s.startedAt!).getTime() })
      } catch (e) {
        Object.assign(s, { status: 'failed', detail: (e as Error).message.slice(0, 300) })
      }
    }
    info.status = r.cancelled ? 'cancelled' : 'done'
  } catch (e) {
    info.status = 'failed'
    info.error = (e as Error).message
  } finally {
    info.finishedAt = new Date().toISOString()
    info.steps = info.steps.map((s) => (s.status === 'running' || s.status === 'waiting' ? { ...s, status: 'skipped' } : s))
    push()
    running.delete(info.id)
  }
}

function count(f: ReconFindingInfo[]): Record<ReconSeverity, number> {
  const c = empty()
  for (const x of f) if (x.verdict !== 'false-positive') c[x.severity]++
  return c
}

/** Reads the verdicts block at the end of the AI's report. */
export function applyVerdicts(report: string, findings: ReconFindingInfo[]): void {
  const m = /```json\s*([\s\S]*?)```\s*$/.exec(report.trim())
  if (!m) return
  try {
    const v = JSON.parse(m[1]) as { verdicts?: { id: string; verdict: 'confirmed' | 'false-positive'; severity?: ReconSeverity; reason?: string }[] }
    for (const x of v.verdicts ?? []) {
      const f = findings.find((y) => y.id === x.id)
      if (!f) continue
      f.verdict = x.verdict
      f.aiNote = x.reason
      if (x.verdict === 'confirmed' && x.severity && ['critical', 'high', 'medium', 'low', 'info'].includes(x.severity)) f.severity = x.severity
    }
  } catch {
    // No usable block.
  }
}

async function aiReport(result: ReconResult, reviewer: ReconRequest['reviewer'], cwd: string, r: { children: Set<ReturnType<typeof spawn>> }, onLine: (t: string) => void): Promise<string> {
  const prompt = reconPrompt(result)
  if (reviewer === 'model') return chatWithLlm([{ role: 'system', content: skillText(['recon-methodology', 'js-recon', 'attack-surface-report']) }, { role: 'user', content: prompt }], 20 * 60_000)
  const id = reviewer as ReviewerId
  if (id === 'coderabbit') throw new Error('CodeRabbit reviews code, not recon. Choose another AI.')
  const bin = findCli(id === 'claude-local' || id === 'claude' ? ['claude'] : [id])
  if (!bin) throw new Error(`${REVIEWER_NAMES[id]} is not installed.`)
  const st = getSettings()
  const method = id === 'claude' ? '' : `\n\nMethod:\n${skillText(['recon-methodology', 'js-recon', 'attack-surface-report'], [join(mySkillsDir(), 'skills')])}`
  if (id === 'claude-local') {
    const ctx = await ensureLmContext(st.llm.baseUrl, st.llm.model)
    if (!ctx.ok) throw new Error(ctx.note)
  }
  const run = reviewerRun(id, bin, prompt + method, { plugins: id === 'claude' || id === 'claude-local' ? ensurePlugins() : [], name: `Laramac recon: ${result.domain}`, local: { baseUrl: st.llm.baseUrl, model: st.llm.model }, outFile: join(cwd, 'codex.md') })
  onLine(`${REVIEWER_NAMES[id]} is reading the recon`)
  return new Promise((resolve, reject) => {
    const c = spawn(run.bin, run.args, { cwd, env: { ...process.env, ...runtimeEnv(), ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    r.children.add(c)
    let out = ''
    let err = ''
    c.stdout.on('data', (x) => (out += x.toString()))
    c.stderr.on('data', (x) => (err += x.toString()))
    const t = setTimeout(() => c.kill('SIGTERM'), 40 * 60_000)
    c.on('close', () => {
      clearTimeout(t)
      r.children.delete(c)
      const file = join(cwd, 'codex.md')
      const text = id === 'codex' && existsSync(file) ? readFileSync(file, 'utf8') : out
      rmSync(file, { force: true })
      if (text.trim()) resolve(text.trim())
      else reject(new Error(explainFailure(id, err)))
    })
  })
}
