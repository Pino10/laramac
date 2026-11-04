/**
 * The pieces behind the site page and the Doctor:
 *
 *   health    what is wrong right now (no web server, .test not resolving, a service that failed,
 *             a site that does not answer, a dev server that stopped, a project that wants another
 *             Node version) with a fix for each one that Laramac can fix itself
 *   .env      reading and writing a site's environment file, nothing outside the site
 *   packages  outdated npm and Composer packages of one site (no project scripts are run)
 *   reviews   the findings of a code review report, with what you decided about each
 *   recon     what changed since the last recon of the same domain, and exports
 */
import { execFile } from 'child_process'
import { request } from 'http'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve, sep } from 'path'
import type { HealthIssue, OutdatedPackage, ReconDiff, ReviewFinding, ServiceInfo, SiteInfo } from '../shared/types'
import { runtimeEnv } from './runtimes'

// ---------------------------------------------------------------- Health

/** Asks the web server for a site the way a browser would, without needing .test to resolve. */
export function probeSite(port: number, domain: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((done) => {
    const req = request({ host: '127.0.0.1', port, path: '/', method: 'GET', headers: { Host: domain, 'User-Agent': 'Laramac health check' }, timeout: timeoutMs }, (res) => {
      res.resume()
      done(res.statusCode ?? null)
    })
    req.on('timeout', () => {
      req.destroy()
      done(null)
    })
    req.on('error', () => done(null))
    req.end()
  })
}

/** The Node version a project asks for (.nvmrc, .node-version, or package.json engines). */
export function wantedNode(dir: string): string | null {
  for (const f of ['.nvmrc', '.node-version']) {
    const p = join(dir, f)
    if (existsSync(p)) {
      const v = readFileSync(p, 'utf8').trim().replace(/^v/, '')
      if (/^\d+/.test(v)) return v.split('.')[0]
    }
  }
  try {
    const e = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { engines?: { node?: string } }).engines?.node
    const m = e ? /(\d{2,})/.exec(e) : null
    return m ? m[1] : null
  } catch {
    return null
  }
}

export interface HealthInput {
  services: ServiceInfo[]
  sites: SiteInfo[]
  dnsReady: boolean
  httpPort: number
  nodeMajor: string | null
  /** Status code per site name, from probeSite; null when nothing answered. */
  probes: Record<string, number | null>
}

/** Turns what Laramac sees into plain problems, each with a fix when there is one. */
export function healthIssues(h: HealthInput): HealthIssue[] {
  const out: HealthIssue[] = []
  const svc = (id: string): ServiceInfo | undefined => h.services.find((s) => s.id === id)
  const webInstalled = ['apache', 'nginx'].filter((id) => svc(id) && svc(id)!.status !== 'not-installed')
  const webRunning = webInstalled.some((id) => svc(id)!.status === 'running')
  if (!webInstalled.length) out.push({ id: 'web-missing', level: 'error', title: 'No web server yet', detail: 'Your sites have no web server to answer them. Install Apache or Nginx.', fix: 'start-web', fixLabel: 'Install Apache' })
  else if (!webRunning) out.push({ id: 'web-stopped', level: 'error', title: `${webInstalled.map((x) => (x === 'apache' ? 'Apache' : 'Nginx')).join(' and ')} ${webInstalled.length > 1 ? 'are' : 'is'} not running`, detail: 'Sites will not open until a web server is running.', fix: 'start-web', fixLabel: 'Start it' })
  if (!h.dnsReady) out.push({ id: 'dns', level: 'error', title: '.test addresses are not set up', detail: 'Your browser cannot find name.test addresses yet. macOS asks for your password once.', fix: 'setup-dns', fixLabel: 'Set them up' })
  for (const s of h.services) {
    if (s.status !== 'error') continue
    const busy = /address already in use|bind\(\)|EADDRINUSE|port.*in use/i.test(s.error ?? '')
    out.push({ id: `svc-${s.id}`, level: 'error', title: `${s.name} stopped with an error`, detail: busy ? `Port ${s.port ?? ''} is used by another program, often a copy of ${s.name} you installed yourself or macOS's own Apache. Quit that program, or change the port in Settings.` : (s.error ?? '').split('\n')[0].slice(0, 220), fix: `restart:${s.id}`, fixLabel: 'Start again' })
  }
  const phpSites = h.sites.filter((s) => ['laravel', 'wordpress', 'symfony', 'php'].includes(s.kind))
  if (phpSites.length && svc('php') && svc('php')!.status === 'stopped') out.push({ id: 'php', level: 'warn', title: 'PHP is not running', detail: `${phpSites.length} PHP ${phpSites.length === 1 ? 'site needs' : 'sites need'} it.`, fix: 'restart:php', fixLabel: 'Start PHP' })
  if (webRunning) {
    for (const s of h.sites) {
      const code = h.probes[s.name]
      if (s.dev?.proxy && !s.dev.running) {
        out.push({ id: `dev-${s.name}`, level: 'warn', site: s.name, title: `${s.name}: its dev server is not running`, detail: `${s.domain} shows "not running" until it starts.`, fix: `start-dev:${s.name}`, fixLabel: 'Start it' })
        continue
      }
      if (code === null || code === undefined) out.push({ id: `down-${s.name}`, level: 'error', site: s.name, title: `${s.name} does not answer`, detail: `Nothing came back from ${s.domain}. Its logs usually say why.`, fix: `logs:${s.name}`, fixLabel: 'Open its logs' })
      else if (code >= 500) out.push({ id: `5xx-${s.name}`, level: 'error', site: s.name, title: `${s.name} shows an error (${code})`, detail: 'The site answers with a server error. Its logs say why.', fix: `logs:${s.name}`, fixLabel: 'Open its logs' })
    }
  }
  if (h.nodeMajor) {
    for (const s of h.sites) {
      const want = wantedNode(s.path)
      if (want && want !== h.nodeMajor && Number(want) > 0) out.push({ id: `node-${s.name}`, level: 'info', site: s.name, title: `${s.name} asks for Node ${want}`, detail: `Laramac runs Node ${h.nodeMajor}. Most projects still work; if this one does not, install Node ${want} on the Languages page.` })
    }
  }
  return out
}

// ---------------------------------------------------------------- .env

const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local']

/** Only these files, only inside the site's folder. */
export function envPath(site: SiteInfo, file: string): string {
  if (!ENV_FILES.includes(file)) throw new Error('Only .env files can be edited here.')
  const p = resolve(site.path, file)
  if (!p.startsWith(resolve(site.path) + sep)) throw new Error('That file is outside the site.')
  return p
}

export function envFiles(site: SiteInfo): { file: string; exists: boolean }[] {
  return ENV_FILES.map((file) => ({ file, exists: existsSync(join(site.path, file)) }))
}

export function readEnv(site: SiteInfo, file: string): string {
  const p = envPath(site, file)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

export function writeEnvFile(site: SiteInfo, file: string, text: string): void {
  if (text.length > 512 * 1024) throw new Error('That file is too large.')
  writeFileSync(envPath(site, file), text.endsWith('\n') ? text : `${text}\n`)
}

// ---------------------------------------------------------------- Packages

function sh(cmd: string, args: string[], cwd: string): Promise<string> {
  // Both tools exit 1 when something is outdated; the output is what matters.
  return new Promise((done) => execFile(cmd, args, { cwd, env: runtimeEnv(), timeout: 120000, maxBuffer: 20 * 1024 * 1024 }, (_e, out) => done(String(out))))
}

export function parseNpmOutdated(json: string): OutdatedPackage[] {
  try {
    const j = JSON.parse(json || '{}') as Record<string, { current?: string; wanted?: string; latest?: string; type?: string }>
    return Object.entries(j).map(([name, v]) => ({ name, manager: 'npm' as const, current: v.current ?? 'not installed', wanted: v.wanted ?? '', latest: v.latest ?? '', major: !!v.current && !!v.latest && v.current.split('.')[0] !== v.latest.split('.')[0], dev: v.type === 'devDependencies' }))
  } catch {
    return []
  }
}

export function parseComposerOutdated(json: string): OutdatedPackage[] {
  try {
    const j = JSON.parse(json || '{}') as { installed?: { name: string; version: string; latest: string; 'latest-status'?: string; abandoned?: boolean | string }[] }
    return (j.installed ?? []).map((p) => ({ name: p.name, manager: 'composer' as const, current: p.version, wanted: p['latest-status'] === 'semver-safe-update' ? p.latest : p.version, latest: p.latest, major: p['latest-status'] === 'update-possible', dev: false, abandoned: !!p.abandoned }))
  } catch {
    return []
  }
}

/** Outdated packages of one site, from npm and Composer's own reports. */
export async function outdated(site: SiteInfo, composer: string[] | null): Promise<OutdatedPackage[]> {
  const out: OutdatedPackage[] = []
  if (existsSync(join(site.path, 'package.json')) && existsSync(join(site.path, 'node_modules'))) out.push(...parseNpmOutdated(await sh('npm', ['outdated', '--json'], site.path)))
  if (composer && existsSync(join(site.path, 'composer.json')) && existsSync(join(site.path, 'vendor'))) out.push(...parseComposerOutdated(await sh(composer[0], [...composer.slice(1), 'outdated', '--direct', '--format=json', '--no-interaction'], site.path)))
  return out.sort((a, b) => Number(b.major) - Number(a.major) || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------- Review findings

/** The findings in a review report: "### [HIGH] Title" with File:, What: and Fix: lines. */
export function reviewFindings(md: string): ReviewFinding[] {
  const out: ReviewFinding[] = []
  const parts = md.split(/\n(?=#{2,4}\s*\[(?:CRITICAL|HIGH|MEDIUM|LOW)\])/i)
  for (const p of parts) {
    const h = /^#{2,4}\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*(.+)$/im.exec(p)
    if (!h) continue
    const field = (k: string): string | undefined => new RegExp(`^\\**${k}\\**:?\\**\\s*(.+)$`, 'im').exec(p)?.[1]?.trim()
    const where = field('File') ?? field('Where')
    const fileLine = where ? /`?([^\s`:]+\.[A-Za-z0-9]+)(?::(\d+))?`?/.exec(where) : null
    const body = p.replace(/^#{2,4}.*\n/, '').trim()
    out.push({ index: out.length, severity: h[1].toLowerCase() as ReviewFinding['severity'], title: h[2].trim().replace(/\*+/g, ''), file: fileLine?.[1], line: fileLine?.[2] ? Number(fileLine[2]) : undefined, what: field('What') ?? body.split('\n').find((l) => l.trim() && !/^(\**)?(File|Where|Fix)/i.test(l.trim()))?.trim(), fix: field('Fix') })
  }
  return out
}

// ---------------------------------------------------------------- Recon compare

interface ReconLike {
  hosts: { host: string; live?: unknown }[]
  js: { url: string; sourceMap?: unknown }[]
  findings: { id: string; title: string; severity: string }[]
  endpoints: string[]
}

export function reconDiff(now: ReconLike, before: ReconLike | null, beforeAt?: string): ReconDiff {
  if (!before) return { first: true, newHosts: [], goneHosts: [], newSourceMaps: [], newFindings: [], fixedFindings: [], newEndpoints: [] }
  const set = <T>(a: T[]): Set<T> => new Set(a)
  const hb = set(before.hosts.map((h) => h.host))
  const hn = set(now.hosts.map((h) => h.host))
  const mb = set(before.js.filter((j) => j.sourceMap).map((j) => j.url))
  const fb = set(before.findings.map((f) => f.id))
  const fn = set(now.findings.map((f) => f.id))
  const eb = set(before.endpoints)
  return {
    first: false,
    since: beforeAt,
    newHosts: [...hn].filter((h) => !hb.has(h)),
    goneHosts: [...hb].filter((h) => !hn.has(h)),
    newSourceMaps: now.js.filter((j) => j.sourceMap && !mb.has(j.url)).map((j) => j.url),
    newFindings: now.findings.filter((f) => !fb.has(f.id)).map((f) => ({ severity: f.severity, title: f.title })),
    fixedFindings: before.findings.filter((f) => !fn.has(f.id)).map((f) => ({ severity: f.severity, title: f.title })),
    newEndpoints: now.endpoints.filter((e) => !eb.has(e))
  }
}

const csvCell = (v: unknown): string => {
  const s = String(v ?? '')
  // A leading = + - @ would run as a formula in Excel or Numbers: quote it as text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function reconCsv(r: { findings: { severity: string; title: string; url?: string; kind: string; fix?: string }[] }): string {
  return ['severity,kind,title,where,fix', ...r.findings.map((f) => [f.severity, f.kind, f.title, f.url, f.fix].map(csvCell).join(','))].join('\n') + '\n'
}

/** Every URL the recon saw on live hosts, one per line, for Burp Suite's target list. */
export function reconUrls(r: { hosts: { live?: { url: string } }[]; js: { url: string }[]; endpoints: string[] }): string {
  const base = r.hosts.map((h) => h.live?.url).filter((u): u is string => !!u)
  const abs = r.endpoints.filter((e) => /^https?:\/\//.test(e))
  const rel = base[0] ? r.endpoints.filter((e) => e.startsWith('/')).map((e) => new URL(e, base[0]).href) : []
  return [...new Set([...base, ...r.js.map((j) => j.url), ...abs, ...rel])].join('\n') + '\n'
}
