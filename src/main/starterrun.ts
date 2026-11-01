/**
 * Runs a starter from the catalog: installs what it needs, runs the framework's own setup tool,
 * prepares the database and .env, and sets up its dev server at name.test.
 */
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { StarterRequest } from '../shared/types'
import { BREW_TOOLS, laravelEnv, resolveOptions, starterById, starterContext, type StarterStep } from '../shared/starters'
import { ensureWww, getSettings } from './settings'
import { jobs } from './jobs'
import { validateProjectName } from './creator'
import { ensureRuntimes, runtimeEnv } from './runtimes'
import { defaultMinor, phpBinary, phpIniPath, writePhpConfig } from './php'
import { composerPhar, installComposer, refreshShims } from './tools'
import { createDatabase } from './svc/mysql'
import { createPgDatabase } from './svc/postgres'
import { services } from './services'
import { brew } from './brew'
import { findOnPath } from './platform'
import { setSiteConfig } from './sites'
import { pickDevPort } from './devservers'
import type { ServiceId } from '../shared/types'

type Update = (p: number | null, label?: string) => void

/** Runs a command with no keyboard attached, so setup tools never stop to ask a question. */
export function runQuiet(argv: string[], cwd: string, env: NodeJS.ProcessEnv, onLine: (l: string) => void, timeoutMs = 20 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = argv
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env, CI: env.CI ?? '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail: string[] = []
    const on = (b: Buffer): void => {
      // eslint-disable-next-line no-control-regex
      for (const raw of b.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n|\r/)) {
        const line = raw.trim()
        if (!line) continue
        tail.push(line)
        if (tail.length > 12) tail.shift()
        onLine(line)
      }
    }
    child.stdout.on('data', on)
    child.stderr.on('data', on)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error((err as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} was not found.` : err.message))
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${argv.slice(0, 3).join(' ')} ${signal ? 'was stopped' : 'failed'}.\n${tail.slice(-8).join('\n')}`))
    })
  })
}

/** Turns "composer" and "php" into Laramac's own PHP with its settings. */
export function expandCommand(argv: string[], php: { bin: string; ini: string; composer: string } | null): string[] {
  const [cmd, ...rest] = argv
  if (!php) return argv
  if (cmd === 'composer') return [php.bin, '-c', php.ini, php.composer, ...rest]
  if (cmd === 'php') return [php.bin, '-c', php.ini, ...rest]
  return argv
}

/** Applies a patch step. Missing files or patterns are skipped, since templates change. */
export function applyPatch(file: string, step: Extract<StarterStep, { patch: string }>): boolean {
  if (!existsSync(file)) return false
  let text = readFileSync(file, 'utf8')
  const before = text
  for (const [re, to] of step.replace ?? []) text = text.replace(re, to)
  if (step.append) text = `${text.trimEnd()}\n${step.append}`
  if (text === before) return false
  writeFileSync(file, text)
  return true
}

async function ensureService(id: ServiceId): Promise<void> {
  const info = services.list().find((s) => s.id === id)
  if (info?.status === 'not-installed') await services.install(id)
  await services.start(id)
}

export async function createFromStarter(req: StarterRequest): Promise<{ target: string; devPort: number | null }> {
  const starter = starterById(req.starter)
  if (!starter) throw new Error('That starter does not exist.')
  const problem = validateProjectName(req.name)
  if (problem) throw new Error(problem)
  const root = ensureWww()
  const target = join(root, req.name)
  if (existsSync(target)) throw new Error(`A folder named "${req.name}" already exists in your www folder.`)

  const opts = resolveOptions(starter, req.options ?? {})
  const ctx = starterContext(req.name, getSettings().tld)
  const steps = starter.steps(ctx, opts)

  // Everything it needs, before touching the www folder.
  await ensureRuntimes(starter.runtimes)
  let php: { bin: string; ini: string; composer: string } | null = null
  if (starter.runtimes.includes('php')) {
    const minor = defaultMinor()
    if (minor) {
      writePhpConfig(minor)
      if (!existsSync(composerPhar())) await installComposer()
      php = { bin: phpBinary(minor), ini: phpIniPath(minor), composer: composerPhar() }
      refreshShims()
    } else if (!findOnPath('php') || !findOnPath('composer')) {
      throw new Error('Install PHP on the PHP page first.')
    }
    // Otherwise the PHP and Composer already on this Mac (from Homebrew, say) are used.
  }
  const env = runtimeEnv()
  for (const tool of Object.keys(BREW_TOOLS)) {
    if (!steps.some((s) => 'run' in s && s.run[0] === tool)) continue
    if (findOnPath(tool, (env.PATH ?? '').split(':'))) continue
    await jobs.run(`Installing ${tool}`, (update) => brew(['install', BREW_TOOLS[tool]], (l) => update(null, `${tool}: ${l.slice(0, 60)}`)))
  }
  for (const s of steps) {
    if ('database' in s) await ensureService(s.database === 'postgres' ? 'postgres' : 'mysql')
  }

  let devPort: number | null = null
  await jobs.run(`Creating ${req.name} with ${starter.name}`, async (update: Update) => {
    try {
      for (const [i, step] of steps.entries()) {
        const pct = Math.round((i / steps.length) * 100)
        update(pct, step.label)
        if ('run' in step) {
          const cwd = step.cwd === 'project' ? target : root
          await runQuiet(expandCommand(step.run, php), cwd, { ...env, ...step.env }, (l) => update(pct, `${step.label}: ${l.slice(0, 70)}`))
        } else if ('write' in step) {
          const file = join(target, step.write)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, step.content)
        } else if ('patch' in step) {
          applyPatch(join(target, step.patch), step)
        } else if ('mkdir' in step) {
          mkdirSync(target, { recursive: true })
        } else if ('database' in step) {
          const ok = step.database === 'postgres' ? await createPgDatabase(ctx.db) : await createDatabase(ctx.db)
          if (!ok) throw new Error(`The ${step.database === 'postgres' ? 'PostgreSQL' : 'MySQL'} database could not be created. Is the server running?`)
        } else if ('laravelEnv' in step) {
          const file = join(target, '.env')
          if (existsSync(file)) writeFileSync(file, laravelEnv(readFileSync(file, 'utf8'), step.laravelEnv, ctx.db, ctx.domain))
        }
      }

      if (req.git && existsSync(target) && !existsSync(join(target, '.git'))) {
        update(96, 'Making the first Git commit')
        await runQuiet(['git', 'init', '-q', '-b', 'main'], target, env, () => undefined)
        await runQuiet(['git', 'add', '-A'], target, env, () => undefined)
        await runQuiet(['git', '-c', 'user.name=Laramac', '-c', 'user.email=laramac@localhost', 'commit', '-q', '-m', `New ${starter.name} project`], target, env, () => undefined).catch(() => undefined)
      }

      const dev = starter.dev?.(opts)
      if (dev) {
        devPort = await pickDevPort()
        setSiteConfig(req.name, { dev: { command: dev.command, port: devPort, proxy: dev.proxy, ...(dev.env ? { env: dev.env } : {}) } })
      }
    } catch (err) {
      // A half-made project would block trying again with the same name.
      rmSync(target, { recursive: true, force: true })
      throw err
    }
  })
  return { target, devPort }
}
