/**
 * Commands for a site: the scripts you keep in a project (tools/make_film.py, scripts/deploy.sh,
 * bin/import.php), the project's own scripts (package.json, composer.json, a Makefile), and the
 * commands you save, each run in the site's folder with the site's PHP, Node.js and Python.
 *
 * A command is split into its words here and run without a shell, so what you type is exactly
 * what runs: no pipes, redirects or variables. A saved command can also run on a schedule while
 * Laramac is open.
 *
 * The parts here are pure (no Electron), so they can be tested.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

export interface FoundCommand {
  /** Shown in the list, like "tools/make_film.py" or "npm run build". */
  name: string
  argv: string[]
  /** script (a file in the project), npm, composer, make. */
  kind: 'script' | 'npm' | 'composer' | 'make'
  /** For scripts, the file, relative to the site's folder. */
  file?: string
}

export interface CommandSchedule {
  /** Every N minutes, or every day at HH:MM. */
  every: 'minutes' | 'daily'
  minutes?: number
  at?: string
}

export interface SavedCommand {
  id: string
  name: string
  /** The words of the command, as typed. */
  argv: string[]
  /** A folder inside the site to run in, relative; empty for the site's own folder. */
  cwd?: string
  schedule?: CommandSchedule | null
}

/** Folders never worth looking in. */
const SKIP = new Set(['node_modules', 'vendor', '.git', '.venv', 'venv', '__pycache__', 'storage', 'bootstrap', 'dist', 'build', '.next', '.nuxt', '.output', 'public', 'target', 'coverage', '.idea', '.vscode', 'tests', 'test', 'resources', 'database', 'config', 'routes', 'app', 'src', 'lib'])
/** Folders where people keep their own scripts: looked at more deeply. */
const SCRIPT_DIRS = ['tools', 'scripts', 'script', 'bin', 'cli', 'tasks', 'jobs', 'cron', 'utils', 'utilities', 'commands', 'ops', 'devtools']

const RUNNER: Record<string, string> = { '.py': 'python3', '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh', '.php': 'php', '.js': 'node', '.mjs': 'node', '.cjs': 'node', '.rb': 'ruby', '.pl': 'perl' }

/** How to run a script file, from its extension or its first line (#!/usr/bin/env python3). */
export function runnerFor(file: string, firstLine: string): string | null {
  const shebang = /^#!\s*(?:\/usr\/bin\/env\s+(?:-S\s+)?)?(?:\S*\/)?(python3?|python2|bash|sh|zsh|php|node|ruby|perl)\b/.exec(firstLine)
  if (shebang) return shebang[1] === 'python' ? 'python3' : shebang[1]
  return RUNNER[extname(file).toLowerCase()] ?? null
}

function firstLine(path: string): string {
  try {
    return readFileSync(path, 'utf8').slice(0, 200).split('\n')[0] ?? ''
  } catch {
    return ''
  }
}

/**
 * Every script in the folders people keep them in (tools, scripts, bin and the like, two levels
 * deep), scripts at the top of the project, and the project's own named scripts.
 */
export function findCommands(root: string, max = 200): FoundCommand[] {
  const out: FoundCommand[] = []
  const addScript = (abs: string): void => {
    const rel = relative(root, abs)
    if (/(^|\/)(artisan|server\.php|index\.php|vite\.config\.[cm]?js|webpack\.config\.js|tailwind\.config\.[cm]?js|postcss\.config\.[cm]?js|eslint\.config\.[cm]?js|\.?prettierrc.*|jest\.config\.[cm]?js|vitest\.config\.[cm]?js|next\.config\.[cm]?js|nuxt\.config\.[cm]?js|svelte\.config\.js|wp-.*\.php)$/.test(rel)) return
    const runner = runnerFor(abs, firstLine(abs))
    if (!runner) return
    out.push({ name: rel, argv: [runner, rel], kind: 'script', file: rel })
  }
  const walk = (dir: string, depth: number): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const n of names) {
      if (out.length >= max) return
      if (n.startsWith('.')) continue
      const p = join(dir, n)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (!SKIP.has(n) && depth < 2) walk(p, depth + 1)
      } else if (st.size < 2_000_000) addScript(p)
    }
  }
  // The usual script folders first, then the top of the project.
  for (const d of SCRIPT_DIRS) if (existsSync(join(root, d))) walk(join(root, d), 0)
  try {
    for (const n of readdirSync(root).sort()) {
      const p = join(root, n)
      if (!n.startsWith('.') && statSync(p).isFile() && statSync(p).size < 2_000_000) addScript(p)
    }
  } catch {
    // An unreadable folder has nothing to list.
  }
  const json = <T>(f: string): T | null => {
    try {
      return JSON.parse(readFileSync(join(root, f), 'utf8')) as T
    } catch {
      return null
    }
  }
  const pkg = json<{ scripts?: Record<string, string> }>('package.json')
  const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock')) ? 'bun' : 'npm'
  for (const s of Object.keys(pkg?.scripts ?? {})) out.push({ name: `${pm} run ${s}`, argv: [pm, 'run', s], kind: 'npm' })
  const composer = json<{ scripts?: Record<string, unknown> }>('composer.json')
  for (const s of Object.keys(composer?.scripts ?? {})) if (!/^(pre|post)-/.test(s)) out.push({ name: `composer run ${s}`, argv: ['composer', 'run-script', s], kind: 'composer' })
  try {
    const make = readFileSync(join(root, 'Makefile'), 'utf8')
    for (const m of make.matchAll(/^([A-Za-z0-9][\w.-]*):(?!=)/gm)) if (!out.some((o) => o.kind === 'make' && o.argv[1] === m[1])) out.push({ name: `make ${m[1]}`, argv: ['make', m[1]], kind: 'make' })
  } catch {
    // No Makefile.
  }
  // Scripts found twice (in tools/ and at the top through a link) are listed once.
  return out.filter((c, i) => out.findIndex((d) => d.name === c.name) === i).slice(0, max)
}

/**
 * Splits what you typed into words, the way a shell does for quotes and backslashes, without
 * running a shell: `python3 tools/make_film.py --from-clips "My clips"` becomes four words.
 * Pipes, redirects, ; && and $ are refused with a plain message, because nothing would run them.
 */
export function splitCommand(text: string): string[] {
  const s = text.trim()
  if (!s) throw new Error('Type a command to run.')
  if (s.length > 4000) throw new Error('That command is too long.')
  const words: string[] = []
  let cur = ''
  let has = false
  let q: '"' | "'" | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && (s[i + 1] === '"' || s[i + 1] === '\\')) cur += s[++i]
      else cur += c
      continue
    }
    if (c === '"' || c === "'") {
      q = c
      has = true
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i]
      has = true
    } else if (/\s/.test(c)) {
      if (has) words.push(cur)
      cur = ''
      has = false
    } else if ('|&;<>`$'.includes(c) || (c === '(' && !has)) {
      throw new Error('Pipes, redirects, ; && and $variables need a shell. Run this one in Terminal (the button next to Run), or put it in a script and run the script here.')
    } else {
      cur += c
      has = true
    }
  }
  if (q) throw new Error('A quote is not closed.')
  if (has) words.push(cur)
  return words
}

/** A command's words back into one line, quoted where needed, for showing and editing. */
export function joinCommand(argv: string[]): string {
  return argv.map((w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`)).join(' ')
}

/** Whether a scheduled command is due now. `last` is when it last started (ms), 0 for never. */
export function isDue(s: CommandSchedule | null | undefined, last: number, now: number): boolean {
  if (!s) return false
  if (s.every === 'minutes') {
    const n = Math.max(1, Math.min(1440, Math.floor(s.minutes ?? 60)))
    return now - last >= n * 60_000 - 5_000
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.at ?? '')
  if (!m) return false
  const at = new Date(now)
  at.setHours(Number(m[1]), Number(m[2]), 0, 0)
  // Once a day, at or after the time, if it has not run since that time today.
  return now >= at.getTime() && last < at.getTime()
}

/** Schedules in words: "Every 5 minutes", "Every day at 02:30". */
export function scheduleWords(s: CommandSchedule | null | undefined): string {
  if (!s) return 'Not scheduled'
  if (s.every === 'minutes') {
    const n = s.minutes ?? 60
    return n === 1 ? 'Every minute' : n % 60 === 0 ? (n === 60 ? 'Every hour' : `Every ${n / 60} hours`) : `Every ${n} minutes`
  }
  return `Every day at ${s.at}`
}

/** A saved command, checked: words, a folder inside the site, a sensible schedule. */
export function cleanSaved(input: unknown): SavedCommand[] {
  if (!Array.isArray(input)) throw new Error('Commands must be a list.')
  if (input.length > 100) throw new Error('Keep it to 100 commands per site.')
  return input.map((raw, i) => {
    const c = (raw ?? {}) as Record<string, unknown>
    const argv = Array.isArray(c.argv) ? c.argv.filter((w): w is string => typeof w === 'string' && w.length < 2000) : []
    if (!argv.length) throw new Error(`Command ${i + 1} is empty.`)
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 80) : joinCommand(argv).slice(0, 80)
    const cwd = typeof c.cwd === 'string' ? c.cwd.replace(/^\/+/, '').trim() : ''
    if (cwd.split('/').includes('..')) throw new Error(`${name}: the folder must be inside the site.`)
    let schedule: CommandSchedule | null = null
    const s = c.schedule as Record<string, unknown> | null | undefined
    if (s && s.every === 'minutes') schedule = { every: 'minutes', minutes: Math.max(1, Math.min(1440, Math.floor(Number(s.minutes) || 60))) }
    else if (s && s.every === 'daily' && typeof s.at === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.at)) schedule = { every: 'daily', at: s.at.padStart(5, '0') }
    const id = typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : `c${Date.now().toString(36)}${i}`
    return { id, name, argv, cwd, schedule }
  })
}

const HEAVY = new Set(['node_modules', 'vendor', '.git', '.venv', 'venv', '__pycache__', '.next', '.nuxt', '.output', 'dist', 'build', 'target', 'coverage', '.idea', '.vscode', '.cache', '.turbo'])

/** The folders of a site you can run a command in (three levels deep), relative to the site. */
export function listFolders(root: string, max = 400): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    let names: string[] = []
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const n of names) {
      if (out.length >= max) return
      if (n.startsWith('.') || HEAVY.has(n)) continue
      const p = join(dir, n)
      try {
        if (!statSync(p).isDirectory()) continue
      } catch {
        continue
      }
      out.push(relative(root, p))
      if (depth < 2 && !(depth === 0 && n === 'storage')) walk(p, depth + 1)
    }
  }
  walk(root, 0)
  return out
}
