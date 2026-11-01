/**
 * Development servers for JavaScript, Python, .NET, Go, Rust and Swift projects.
 * Each runs on its own port; the web server passes name.test through to it.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DevConfig, SiteInfo } from '../shared/types'
import { fillPort } from '../shared/starters'
import { dirs } from './paths'
import { getSettings } from './settings'
import { ManagedProcess, isPortOpen, tailFile } from './process'
import { runtimeEnv } from './runtimes'

const procs = new Map<string, ManagedProcess>()

export const devLogFile = (site: string): string => join(dirs.logs(), `dev-${site.replace(/[^a-zA-Z0-9._-]/g, '_')}.log`)

export const isDevRunning = (site: string): boolean => !!procs.get(site)?.running

/** Picks a free port for a new dev server, away from the ones other sites use. */
export async function pickDevPort(start = 5170): Promise<number> {
  const taken = new Set(Object.values(getSettings().siteConfig).map((c) => c.dev?.port).filter(Boolean))
  for (let p = start; p < start + 400; p++) {
    if (taken.has(p)) continue
    if (await isPortOpen(p)) continue
    return p
  }
  throw new Error('No free port was found for the dev server.')
}

/** Reads package.json and suggests the command that runs it in development. */
export function suggestDevScript(dir: string): string | null {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return null
  try {
    const scripts = (JSON.parse(readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
    for (const name of ['dev', 'start:dev', 'serve', 'start']) if (scripts[name]) return name
  } catch {
    // Not valid JSON; nothing to suggest.
  }
  return null
}

/**
 * The dev command for a package.json script, with the port passed the way that tool expects.
 * Most dev servers accept --port; Next.js wants -p, and the rest read PORT from the environment.
 */
export function devFromScript(dir: string, script: string, port: number): DevConfig {
  let body = ''
  try {
    body = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts?.[script] ?? ''
  } catch {
    body = ''
  }
  const run = ['npm', 'run', script]
  if (/\bnext\b/.test(body)) return { command: [...run, '--', '-p', '{port}', '-H', '127.0.0.1'], port, proxy: true }
  if (/\b(vite|astro|nuxt|nuxi|ng serve|react-router)\b/.test(body)) return { command: [...run, '--', '--port', '{port}', '--host', '127.0.0.1'], port, proxy: true }
  return { command: run, port, proxy: true, env: { PORT: '{port}' } }
}

export async function startDev(site: SiteInfo, dev: DevConfig): Promise<void> {
  let proc = procs.get(site.name)
  if (proc?.running) return
  if (!proc) {
    proc = new ManagedProcess(`${site.name} dev server`)
    procs.set(site.name, proc)
  }
  const log = devLogFile(site.name)
  writeFileSync(log, '')
  const [command, ...args] = fillPort(dev.command, dev.port)
  const env = { ...runtimeEnv(), ...fillPort(dev.env ?? {}, dev.port), FORCE_COLOR: '0', BROWSER: 'none' }
  // Wait for the port only when something is listening for it; desktop apps have none.
  await proc.start({ command, args, cwd: site.path, env, logFile: log, group: true }, dev.proxy ? dev.port : undefined, 180000)
}

export async function stopDev(name: string): Promise<void> {
  await procs.get(name)?.stop()
}

export async function stopAllDev(): Promise<void> {
  await Promise.allSettled([...procs.values()].map((p) => p.stop()))
}

export const devLogs = (name: string): string => tailFile(devLogFile(name), 300)
