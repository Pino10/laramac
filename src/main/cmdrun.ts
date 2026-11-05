/**
 * Runs a site's commands. Each run gets a pseudo-terminal from macOS's own `script` tool, so
 * colours, progress bars and questions work, and its output streams to Laramac's terminal. No
 * shell is involved: the words run as they are (see commands.ts splitCommand).
 *
 * Scheduled commands run the same way in the background while Laramac is open, each with a log.
 */
import { spawn, type ChildProcess } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { delimiter, dirname, join } from 'path'
import { dirs } from './paths'

export interface RunInfo {
  id: string
  site: string
  name: string
  startedAt: number
  endedAt: number | null
  code: number | null
}

interface Run extends RunInfo {
  child: ChildProcess
  buffer: string
  scheduled: boolean
}

const runs = new Map<string, Run>()
let counter = 0
type Listener = (e: { kind: 'data'; id: string; data: string } | { kind: 'exit'; id: string; code: number | null }) => void
let listener: Listener = () => undefined
export const onRunEvent = (fn: Listener): void => {
  listener = fn
}

/** Finds a program on a PATH. */
export function which(cmd: string, path: string | undefined): string | null {
  if (cmd.includes('/')) return existsSync(cmd) ? cmd : null
  for (const d of (path ?? '').split(delimiter)) if (d && existsSync(join(d, cmd))) return join(d, cmd)
  return null
}

/**
 * The words to run. Python goes through Laramac's uv when it is there, in whatever folder you run
 * it from: uv brings its own Python, and when the script's folder (or the folder you run in) has a
 * requirements.txt it installs those packages for that run, cached; a pyproject.toml is used as a
 * project. Without uv, python3 from this Mac is used.
 */
export function resolveArgv(argv: string[], path: string | undefined, uv: string | null, cwd = '', exists: (p: string) => boolean = existsSync): string[] {
  const [cmd, ...rest] = argv
  if (!/^python(3(\.\d+)?)?$/.test(cmd) || !uv) return argv
  const script = rest.find((a) => /\.py$/.test(a))
  const folders = [...new Set([script ? join(cwd, dirname(script)) : null, cwd].filter((f): f is string => !!f))]
  const project = folders.some((f) => exists(join(f, 'pyproject.toml')))
  const reqs = folders.map((f) => join(f, 'requirements.txt')).find((f) => exists(f))
  const version = /^python3\.\d+$/.test(cmd) ? ['--python', cmd.slice(6)] : []
  return [uv, 'run', ...(project ? [] : ['--no-project']), ...(reqs && !project ? ['--with-requirements', reqs] : []), ...version, 'python', ...rest]
}

const stateFile = (): string => join(dirs.root(), 'commands-state.json')
type LastRuns = Record<string, { at: number; code: number | null; ms: number }>
export function lastRuns(): LastRuns {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as LastRuns
  } catch {
    return {}
  }
}
function remember(key: string, at: number, code: number | null, ms: number): void {
  const all = lastRuns()
  all[key] = { at, code, ms }
  try {
    writeFileSync(stateFile(), JSON.stringify(all))
  } catch {
    // Not important.
  }
}
export const commandLog = (site: string, id: string): string => join(dirs.logs(), `command-${site.replace(/[^\w.-]/g, '_')}-${id.replace(/[^\w.-]/g, '_')}.log`)

/** Starts a command. Returns its run id; output arrives through onRunEvent. */
export function startRun(o: { site: string; name: string; argv: string[]; cwd: string; env: NodeJS.ProcessEnv; cols?: number; rows?: number; savedId?: string; scheduled?: boolean; uv?: string | null }): string {
  const id = `r${Date.now().toString(36)}${(counter++).toString(36)}`
  const argv = resolveArgv(o.argv, o.env.PATH, o.uv ?? null, o.cwd)
  const env: NodeJS.ProcessEnv = { ...o.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', COLUMNS: String(o.cols ?? 120), LINES: String(o.rows ?? 32), PYTHONUNBUFFERED: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  // macOS's script gives the command a terminal of its own; -q keeps its own lines out.
  const viaScript = process.platform === 'darwin' && !o.scheduled
  const child = viaScript ? spawn('/usr/bin/script', ['-q', '/dev/null', ...argv], { cwd: o.cwd, env, detached: true }) : spawn(argv[0], argv.slice(1), { cwd: o.cwd, env, detached: true })
  const run: Run = { id, site: o.site, name: o.name, startedAt: Date.now(), endedAt: null, code: null, child, buffer: '', scheduled: !!o.scheduled }
  runs.set(id, run)
  const log = o.savedId ? commandLog(o.site, o.savedId) : null
  if (log) {
    mkdirSync(dirs.logs(), { recursive: true })
    writeFileSync(log, `--- ${new Date().toISOString()} ${o.argv.join(' ')}\n`)
  }
  const data = (b: Buffer): void => {
    const s = b.toString('utf8')
    run.buffer = (run.buffer + s).slice(-400_000)
    if (log) appendFileSync(log, s)
    if (!run.scheduled) listener({ kind: 'data', id, data: s })
  }
  child.stdout?.on('data', data)
  child.stderr?.on('data', data)
  const done = (code: number | null): void => {
    if (run.endedAt) return
    run.endedAt = Date.now()
    run.code = code
    if (o.savedId) remember(`${o.site}:${o.savedId}`, run.startedAt, code, run.endedAt - run.startedAt)
    listener({ kind: 'exit', id, code })
    // Finished runs are kept a while so the page can show them again.
    setTimeout(() => runs.delete(id), 30 * 60_000)
  }
  child.on('exit', (code) => done(code))
  child.on('error', (e) => {
    data(Buffer.from(`\r\n${e.message.includes('ENOENT') ? `${argv[0]} is not on this Mac. Install it, or check the spelling.` : e.message}\r\n`))
    done(127)
  })
  return id
}

export function inputRun(id: string, text: string): void {
  const r = runs.get(id)
  if (r && !r.endedAt) r.child.stdin?.write(text)
}

export function stopRun(id: string): void {
  const r = runs.get(id)
  if (!r || r.endedAt || !r.child.pid) return
  try {
    // The whole group: the command and everything it started.
    process.kill(-r.child.pid, 'SIGTERM')
  } catch {
    r.child.kill('SIGTERM')
  }
  setTimeout(() => {
    if (!r.endedAt && r.child.pid) {
      try {
        process.kill(-r.child.pid, 'SIGKILL')
      } catch {
        // Gone.
      }
    }
  }, 4000)
}

export const runOutput = (id: string): string => runs.get(id)?.buffer ?? ''

export function siteRuns(site: string): RunInfo[] {
  return [...runs.values()]
    .filter((r) => r.site === site && !r.scheduled)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(({ id, site: s, name, startedAt, endedAt, code }) => ({ id, site: s, name, startedAt, endedAt, code }))
}

export const isRunning = (site: string, name: string): boolean => [...runs.values()].some((r) => r.site === site && r.name === name && !r.endedAt)

export function stopAllRuns(): void {
  for (const r of runs.values()) if (!r.endedAt) stopRun(r.id)
}
