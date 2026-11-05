/**
 * Tools on a site's page: its requests from the web server log, background workers (queues,
 * schedulers), its tests, Docker Compose, editor debug settings, addresses for other devices,
 * scrambling personal data in a local copy, comparing two database schemas, and hosting.
 *
 * Anything that runs the project's own code (workers, tests, Compose) only starts when you press
 * its button on the site's page.
 */
import { existsSync, readFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { join } from 'path'
import type { SiteInfo, WorkerConfig } from '../shared/types'

// ---------------------------------------------------------------- Requests

export interface RequestLine {
  at: string
  host: string
  method: string
  path: string
  status: number
  ms: number
  bytes: number
}

/** One line of Laramac's access log format (n| for Nginx, seconds; a| for Apache, microseconds). */
export function parseAccessLine(line: string): RequestLine | null {
  const p = line.trim().split('|')
  if (p.length < 8 || (p[0] !== 'n' && p[0] !== 'a')) return null
  const status = Number(p[5])
  const t = Number(p[6])
  if (!Number.isFinite(status) || !Number.isFinite(t)) return null
  return { at: p[1], host: p[2].toLowerCase(), method: p[3], path: p[4] || '/', status, ms: p[0] === 'n' ? Math.round(t * 1000) : Math.round(t / 1000), bytes: Number(p[7]) || 0 }
}

export interface RequestSummary {
  lines: RequestLine[]
  count: number
  errors: number
  p50: number
  p95: number
  slowest: { path: string; method: string; ms: number; count: number }[]
}

/** The latest requests for a site and its other names, newest first, with the slowest addresses. */
export function siteRequests(text: string, hosts: string[], max = 300): RequestSummary {
  const names = new Set(hosts.map((h) => h.toLowerCase()))
  const all: RequestLine[] = []
  for (const l of text.split('\n')) {
    const r = parseAccessLine(l)
    if (r && (names.has(r.host) || [...names].some((n) => r.host.endsWith(`.${n}`)))) all.push(r)
  }
  const recent = all.slice(-2000)
  const times = recent.map((r) => r.ms).sort((a, b) => a - b)
  const pct = (q: number): number => (times.length ? times[Math.min(times.length - 1, Math.floor(q * times.length))] : 0)
  const byPath = new Map<string, { path: string; method: string; total: number; count: number; max: number }>()
  for (const r of recent) {
    const key = `${r.method} ${r.path.split('?')[0]}`
    const e = byPath.get(key) ?? { path: r.path.split('?')[0], method: r.method, total: 0, count: 0, max: 0 }
    e.total += r.ms
    e.count++
    e.max = Math.max(e.max, r.ms)
    byPath.set(key, e)
  }
  return {
    lines: recent.slice(-max).reverse(),
    count: recent.length,
    errors: recent.filter((r) => r.status >= 500).length,
    p50: pct(0.5),
    p95: pct(0.95),
    slowest: [...byPath.values()].sort((a, b) => b.total / b.count - a.total / a.count).slice(0, 10).map((e) => ({ path: e.path, method: e.method, ms: Math.round(e.total / e.count), count: e.count }))
  }
}

// ---------------------------------------------------------------- Workers

const pkgScripts = (dir: string): Record<string, string> => {
  try {
    return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
  } catch {
    return {}
  }
}

/** Workers a project usually needs, found from its files. Nothing runs until you start one. */
export function suggestWorkers(site: SiteInfo): WorkerConfig[] {
  const out: WorkerConfig[] = []
  if (existsSync(join(site.path, 'artisan'))) {
    const composer = readJson(join(site.path, 'composer.json')) as { require?: Record<string, string> } | null
    const req = composer?.require ?? {}
    if (req['laravel/horizon']) out.push({ id: 'horizon', name: 'Horizon (queues)', command: ['php', 'artisan', 'horizon'] })
    else out.push({ id: 'queue', name: 'Queue worker', command: ['php', 'artisan', 'queue:work', '--tries=3'] })
    out.push({ id: 'schedule', name: 'Scheduler', command: ['php', 'artisan', 'schedule:work'] })
    if (req['laravel/reverb']) out.push({ id: 'reverb', name: 'Reverb (WebSockets)', command: ['php', 'artisan', 'reverb:start'] })
    if (req['laravel/pulse']) out.push({ id: 'pulse', name: 'Pulse checks', command: ['php', 'artisan', 'pulse:check'] })
  }
  if (existsSync(join(site.path, 'bin', 'console')) && existsSync(join(site.path, 'config', 'packages', 'messenger.yaml'))) out.push({ id: 'messenger', name: 'Messenger consumer', command: ['php', 'bin/console', 'messenger:consume', 'async', '-vv'] })
  const scripts = pkgScripts(site.path)
  for (const name of ['worker', 'queue', 'jobs', 'cron', 'scheduler']) if (scripts[name]) out.push({ id: `npm-${name}`, name: `npm run ${name}`, command: ['npm', 'run', name] })
  if (existsSync(join(site.path, 'manage.py')) && /celery/.test(readText(join(site.path, 'requirements.txt')) + readText(join(site.path, 'pyproject.toml')))) out.push({ id: 'celery', name: 'Celery worker', command: ['uv', 'run', 'celery', '-A', 'config', 'worker', '-l', 'info'] })
  return out
}

const readText = (f: string): string => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}
const readJson = (f: string): unknown => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}

/** A worker command must be a plain list of words: no shell, no operators. */
export function checkCommand(cmd: unknown): string[] {
  if (!Array.isArray(cmd) || !cmd.length || cmd.length > 30 || cmd.some((c) => typeof c !== 'string' || c.length > 300 || /[\n\r\0]/.test(c))) throw new Error('Enter the command as words, such as php artisan queue:work.')
  if (!/^[A-Za-z0-9._/-]+$/.test(cmd[0] as string)) throw new Error('The command must start with a program name, such as php or npm.')
  return cmd as string[]
}

// ---------------------------------------------------------------- Tests

export interface TestRunner {
  id: string
  name: string
  command: string[]
}

/** The test commands a project has: Pest, PHPUnit, Vitest, Jest, Playwright, npm test, pytest, go test, cargo test. */
export function findTestRunners(site: SiteInfo): TestRunner[] {
  const out: TestRunner[] = []
  const d = site.path
  if (existsSync(join(d, 'vendor', 'bin', 'pest'))) out.push({ id: 'pest', name: 'Pest', command: ['php', 'vendor/bin/pest', '--colors=never'] })
  else if (existsSync(join(d, 'vendor', 'bin', 'phpunit'))) out.push({ id: 'phpunit', name: 'PHPUnit', command: ['php', 'vendor/bin/phpunit', '--colors=never'] })
  const scripts = pkgScripts(d)
  const has = (bin: string): boolean => existsSync(join(d, 'node_modules', '.bin', bin))
  if (has('vitest')) out.push({ id: 'vitest', name: 'Vitest', command: ['npx', 'vitest', 'run', '--reporter=default'] })
  else if (has('jest')) out.push({ id: 'jest', name: 'Jest', command: ['npx', 'jest', '--ci'] })
  else if (scripts.test && !/no test specified/.test(scripts.test)) out.push({ id: 'npm-test', name: 'npm test', command: ['npm', 'test'] })
  if (has('playwright')) out.push({ id: 'playwright', name: 'Playwright', command: ['npx', 'playwright', 'test', '--reporter=line'] })
  if (existsSync(join(d, 'pytest.ini')) || /pytest/.test(readText(join(d, 'pyproject.toml')))) out.push({ id: 'pytest', name: 'pytest', command: ['uv', 'run', 'pytest', '-q'] })
  if (existsSync(join(d, 'go.mod'))) out.push({ id: 'go', name: 'go test', command: ['go', 'test', './...'] })
  if (existsSync(join(d, 'Cargo.toml'))) out.push({ id: 'cargo', name: 'cargo test', command: ['cargo', 'test'] })
  return out
}

export interface TestSummary {
  passed: number
  failed: number
  skipped: number
  /** Names or first lines of failures, as printed. */
  failures: string[]
}

/** Reads the counts from the end of a test run's output, for the common runners. */
export function summariseTests(out: string): TestSummary {
  const text = out.replace(/\x1b\[[0-9;]*m/g, '')
  const num = (re: RegExp): number => {
    const m = re.exec(text)
    return m ? Number(m[1]) : 0
  }
  let passed = 0
  let failed = 0
  let skipped = 0
  // Pest / Vitest / Jest: "Tests:  2 failed, 10 passed" or "Tests  2 failed | 10 passed (12)"
  const tests = /Tests:?\s+(.+)$/m.exec(text)?.[1] ?? ''
  if (/passed|failed/.test(tests)) {
    passed = Number(/(\d+) passed/.exec(tests)?.[1] ?? 0)
    failed = Number(/(\d+) failed/.exec(tests)?.[1] ?? 0)
    skipped = Number(/(\d+) (?:skipped|todo|pending)/.exec(tests)?.[1] ?? 0)
  } else if (/^OK \((\d+) tests?/m.test(text)) {
    passed = num(/^OK \((\d+) tests?/m)
  } else if (/Tests: (\d+), Assertions/.test(text)) {
    // PHPUnit with problems: "Tests: 12, Assertions: 30, Failures: 2, Errors: 1, Skipped: 1."
    const total = num(/Tests: (\d+), Assertions/)
    failed = num(/Failures: (\d+)/) + num(/Errors: (\d+)/)
    skipped = num(/Skipped: (\d+)/)
    passed = Math.max(0, total - failed - skipped)
  } else if (/(\d+) passed/.test(text) || /(\d+) failed/.test(text)) {
    // Playwright, pytest
    passed = num(/(\d+) passed/)
    failed = num(/(\d+) failed/)
    skipped = num(/(\d+) skipped/)
  } else if (/test result: /.test(text)) {
    passed = [...text.matchAll(/test result: \w+\. (\d+) passed/g)].reduce((a, m) => a + Number(m[1]), 0)
    failed = [...text.matchAll(/; (\d+) failed/g)].reduce((a, m) => a + Number(m[1]), 0)
  } else if (/^(ok|FAIL)\s/m.test(text)) {
    passed = (text.match(/^ok\s/gm) ?? []).length
    failed = (text.match(/^FAIL\s/gm) ?? []).length
  }
  const failures = [...text.matchAll(/^\s*(?:FAIL(?:ED)?|✕|×|✗|\d+\))\s+(.{3,160})$/gm)].map((m) => m[1].trim()).filter((v, i, a) => a.indexOf(v) === i).slice(0, 30)
  return { passed, failed, skipped, failures }
}

// ---------------------------------------------------------------- Docker Compose

export const composeFile = (dir: string): string | null => ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].map((f) => join(dir, f)).find((f) => existsSync(f)) ?? null

export interface ComposeService {
  name: string
  state: string
  status: string
  ports: string
}

/** `docker compose ps --format json`: one JSON object per line (newer) or one array (older). */
export function parseComposePs(out: string): ComposeService[] {
  const t = out.trim()
  if (!t) return []
  type R = { Service?: string; Name?: string; State?: string; Status?: string; Publishers?: { URL?: string; PublishedPort?: number; TargetPort?: number }[] }
  let rows: R[] = []
  try {
    rows = t.startsWith('[') ? (JSON.parse(t) as R[]) : t.split('\n').map((l) => JSON.parse(l) as R)
  } catch {
    return []
  }
  return rows.map((r) => ({
    name: r.Service ?? r.Name ?? '?',
    state: r.State ?? '',
    status: r.Status ?? '',
    ports: (r.Publishers ?? []).filter((p) => p.PublishedPort).map((p) => `${p.PublishedPort}→${p.TargetPort}`).join(', ')
  }))
}

// ---------------------------------------------------------------- Editor debug settings

/** Adds "Listen for Xdebug" to .vscode/launch.json, keeping what is there. */
export function mergeLaunchJson(existing: string | null): string {
  type Launch = { version?: string; configurations?: { name?: string; type?: string }[] }
  let cfg: Launch = { version: '0.2.0', configurations: [] }
  if (existing?.trim()) {
    try {
      // launch.json allows comments; drop them before reading.
      cfg = JSON.parse(existing.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1')) as Launch
    } catch {
      throw new Error('.vscode/launch.json could not be read, so it was left as it is. Add "Listen for Xdebug" on port 9003 by hand.')
    }
  }
  cfg.version ??= '0.2.0'
  cfg.configurations ??= []
  if (!cfg.configurations.some((c) => c.type === 'php' && /xdebug/i.test(c.name ?? ''))) cfg.configurations.push({ name: 'Listen for Xdebug (Laramac)', type: 'php', request: 'launch', port: 9003 } as never)
  return JSON.stringify(cfg, null, 2) + '\n'
}

// ---------------------------------------------------------------- Other devices

/** This Mac's addresses on the local network, for opening a site from a phone. */
export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address)
  return out
}

// ---------------------------------------------------------------- Personal data in local copies

const PII: { re: RegExp; sql: (col: string) => string }[] = [
  { re: /^(e_?mail|email_address|user_email|contact_email)$/i, sql: () => `CONCAT('user', id, '@example.test')` },
  { re: /^(phone|phone_number|mobile|telephone|tel)$/i, sql: () => `CONCAT('+1555', LPAD(id, 7, '0'))` },
  { re: /^(first_?name|given_name)$/i, sql: () => `CONCAT('First', id)` },
  { re: /^(last_?name|surname|family_name)$/i, sql: () => `CONCAT('Last', id)` },
  { re: /^(name|full_name|display_name)$/i, sql: () => `CONCAT('Person ', id)` },
  { re: /^(address|address_?line_?1|address_?line_?2|street|street_address)$/i, sql: () => `CONCAT(id, ' Example Street')` },
  { re: /^(postcode|post_code|zip|zip_code|postal_code)$/i, sql: () => `'00000'` },
  { re: /^(ip|ip_address|last_login_ip|remote_addr)$/i, sql: () => `'127.0.0.1'` },
  { re: /^(date_of_birth|dob|birth_?date|birthday)$/i, sql: () => `'1990-01-01'` },
  { re: /^(iban|card_number|card_last4|ssn|national_id|tax_id|passport_number)$/i, sql: () => `NULL` }
]

export interface ScramblePlan {
  table: string
  column: string
  sql: string
}

/** Which columns hold personal data, by name, and the UPDATE for each. Tables must have an id column. */
export function scramblePlan(columns: { table: string; column: string }[], tablesWithId: Set<string>): ScramblePlan[] {
  const out: ScramblePlan[] = []
  for (const c of columns) {
    if (!tablesWithId.has(c.table) || !/^[A-Za-z0-9_]+$/.test(c.table) || !/^[A-Za-z0-9_]+$/.test(c.column)) continue
    const rule = PII.find((p) => p.re.test(c.column))
    if (rule) out.push({ table: c.table, column: c.column, sql: `UPDATE \`${c.table}\` SET \`${c.column}\` = ${rule.sql(c.column)} WHERE \`${c.column}\` IS NOT NULL;` })
  }
  return out
}

// ---------------------------------------------------------------- Schema compare

export interface SchemaDiff {
  onlyA: string[]
  onlyB: string[]
  changed: { table: string; column: string; a: string; b: string }[]
  missingColumns: { table: string; column: string; side: 'a' | 'b' }[]
}

/** Compares two schemas given as table.column → type. */
export function schemaDiff(a: Map<string, Map<string, string>>, b: Map<string, Map<string, string>>): SchemaDiff {
  const onlyA = [...a.keys()].filter((t) => !b.has(t)).sort()
  const onlyB = [...b.keys()].filter((t) => !a.has(t)).sort()
  const changed: SchemaDiff['changed'] = []
  const missingColumns: SchemaDiff['missingColumns'] = []
  for (const [t, colsA] of a) {
    const colsB = b.get(t)
    if (!colsB) continue
    for (const [c, ta] of colsA) {
      const tb = colsB.get(c)
      if (tb === undefined) missingColumns.push({ table: t, column: c, side: 'b' })
      else if (tb !== ta) changed.push({ table: t, column: c, a: ta, b: tb })
    }
    for (const c of colsB.keys()) if (!colsA.has(c)) missingColumns.push({ table: t, column: c, side: 'a' })
  }
  return { onlyA, onlyB, changed, missingColumns }
}

// ---------------------------------------------------------------- Hosting

/** Forge and Ploi deploy hooks: only their own addresses, so the token in it goes nowhere else. */
export function checkDeployHook(kind: 'forge' | 'ploi', url: string): string {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    throw new Error('Paste the full deploy hook address.')
  }
  const ok = kind === 'forge' ? u.protocol === 'https:' && (u.hostname === 'forge.laravel.com' || u.hostname.endsWith('.laravel.com')) && /\/deploy/.test(u.pathname) : u.protocol === 'https:' && u.hostname === 'ploi.io' && /\/deploy|webhooks/.test(u.pathname)
  if (!ok) throw new Error(kind === 'forge' ? 'That is not a Forge deploy hook. In Forge, open the site, then Deployments, and copy the "Deployment trigger URL".' : 'That is not a Ploi deploy webhook. In Ploi, open the site, then Deployment, and copy the webhook URL.')
  return u.toString()
}

/** The command each hosting CLI uses to deploy, run in Terminal so you see it and can sign in. */
export function hostingCommand(kind: 'vercel' | 'netlify' | 'azure', o: { app?: string; group?: string; prod?: boolean }): string {
  if (kind === 'vercel') return `npx --yes vercel@latest deploy${o.prod ? ' --prod' : ''}`
  if (kind === 'netlify') return `npx --yes netlify-cli@latest deploy${o.prod ? ' --prod' : ''}`
  const app = (o.app ?? '').replace(/[^A-Za-z0-9-]/g, '')
  const group = (o.group ?? '').replace(/[^A-Za-z0-9._()-]/g, '')
  if (!app) throw new Error('Enter the App Service name.')
  return `az webapp up --name ${app}${group ? ` --resource-group ${group}` : ''}`
}

export interface Pulse {
  /** Requests per minute for the last `minutes`, oldest first. */
  perMinute: number[]
  /** Since midnight. */
  today: number
  errorsToday: number
  /** Median response time of today's requests, in ms. */
  medianMs: number
}

/** The Overview's live strip: traffic per minute and today's totals, from the web servers' access logs. */
export function pulseFrom(text: string, now: number, minutes = 30): Pulse {
  const perMinute = new Array<number>(minutes).fill(0)
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  let today = 0
  let errorsToday = 0
  const times: number[] = []
  for (const l of text.split('\n')) {
    const r = parseAccessLine(l)
    if (!r) continue
    const at = Date.parse(r.at.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))
    if (!Number.isFinite(at)) continue
    if (at >= midnight.getTime() && at <= now + 60_000) {
      today++
      if (r.status >= 500) errorsToday++
      times.push(r.ms)
    }
    const ago = Math.floor((now - at) / 60_000)
    if (ago >= 0 && ago < minutes) perMinute[minutes - 1 - ago]++
  }
  times.sort((a, b) => a - b)
  return { perMinute, today, errorsToday, medianMs: times.length ? times[Math.floor(times.length / 2)] : 0 }
}

export interface SitePulse {
  host: string
  perMinute: number[]
  today: number
  errors: number
  medianMs: number
}

/** The same traffic, per site: the busiest hosts today, each with its own last half hour. */
export function pulseBySite(text: string, now: number, minutes = 30, max = 6): SitePulse[] {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const by = new Map<string, { perMinute: number[]; today: number; errors: number; times: number[] }>()
  for (const l of text.split('\n')) {
    const r = parseAccessLine(l)
    if (!r) continue
    const at = Date.parse(r.at.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))
    if (!Number.isFinite(at)) continue
    const host = r.host.replace(/:\d+$/, '')
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) continue
    let s = by.get(host)
    if (!s) by.set(host, (s = { perMinute: new Array<number>(minutes).fill(0), today: 0, errors: 0, times: [] }))
    if (at >= midnight.getTime() && at <= now + 60_000) {
      s.today++
      if (r.status >= 500) s.errors++
      s.times.push(r.ms)
    }
    const ago = Math.floor((now - at) / 60_000)
    if (ago >= 0 && ago < minutes) s.perMinute[minutes - 1 - ago]++
  }
  return [...by.entries()]
    .map(([host, s]) => {
      s.times.sort((a, b) => a - b)
      return { host, perMinute: s.perMinute, today: s.today, errors: s.errors, medianMs: s.times.length ? s.times[Math.floor(s.times.length / 2)] : 0 }
    })
    .filter((s) => s.today > 0 || s.perMinute.some((n) => n > 0))
    .sort((a, b) => b.today - a.today)
    .slice(0, max)
}

/**
 * CPU and memory for each process Laramac runs, with everything it started (PHP-FPM's workers,
 * Nginx's workers, npm then Vite), from `ps -axo pid=,ppid=,pcpu=,rss=`.
 */
export function processUsage(ps: string, roots: { name: string; pid: number; since: number }[], now: number): { name: string; cpu: number; memMb: number; uptimeSec: number; count: number }[] {
  const rows = ps
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 4 && /^\d+$/.test(p[0]))
    .map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), cpu: Number(p[2]) || 0, rssKb: Number(p[3]) || 0 }))
  const kids = new Map<number, number[]>()
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r.pid])
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  return roots
    .filter((root) => byPid.has(root.pid))
    .map((root) => {
      let cpu = 0
      let kb = 0
      let count = 0
      const seen = new Set<number>()
      const stack = [root.pid]
      while (stack.length) {
        const pid = stack.pop() as number
        if (seen.has(pid)) continue
        seen.add(pid)
        const r = byPid.get(pid)
        if (!r) continue
        cpu += r.cpu
        kb += r.rssKb
        count++
        stack.push(...(kids.get(pid) ?? []))
      }
      return { name: root.name, cpu: Math.round(cpu * 10) / 10, memMb: Math.round(kb / 102.4) / 10, uptimeSec: root.since ? Math.max(0, Math.round((now - root.since) / 1000)) : 0, count }
    })
    .sort((a, b) => b.memMb - a.memMb)
}
