/** Background commands per site (queue workers, schedulers), each with its own log. */
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { SiteInfo, WorkerConfig } from '../shared/types'
import { dirs } from './paths'
import { ManagedProcess, tailFile } from './process'

const procs = new Map<string, ManagedProcess>()
const key = (site: string, id: string): string => `${site}:${id}`
export const workerLog = (site: string, id: string): string => join(dirs.logs(), `worker-${site.replace(/[^a-zA-Z0-9._-]/g, '_')}-${id.replace(/[^a-zA-Z0-9._-]/g, '_')}.log`)

export const workerRunning = (site: string, id: string): boolean => !!procs.get(key(site, id))?.running

export async function startWorker(site: SiteInfo, w: WorkerConfig, env: NodeJS.ProcessEnv): Promise<void> {
  let p = procs.get(key(site.name, w.id))
  if (p?.running) return
  if (!p) {
    p = new ManagedProcess(`${site.name} ${w.name}`)
    procs.set(key(site.name, w.id), p)
  }
  writeFileSync(workerLog(site.name, w.id), '')
  const [command, ...args] = w.command
  await p.start({ command, args, cwd: site.path, env: { ...env, FORCE_COLOR: '0' }, logFile: workerLog(site.name, w.id), group: true }, undefined, 5000)
}

export async function stopWorker(site: string, id: string): Promise<void> {
  await procs.get(key(site, id))?.stop()
}

export async function stopAllWorkers(): Promise<void> {
  await Promise.allSettled([...procs.values()].map((p) => p.stop()))
}

export const workerLogs = (site: string, id: string): string => tailFile(workerLog(site, id), 200)
