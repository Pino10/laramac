import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'
import { Agent, fetch as ufetch } from 'undici'
import type { ProfileFunction, ProfileListItem, ProfileReport } from '../shared/types'
import { dirs } from './paths'

/**
 * The free profiler. It is Xdebug's profiler, off unless the person switches it on. When on, PHP
 * profiles only the requests that ask for it (the XDEBUG_PROFILE cookie), so other pages stay fast.
 * Laramac reads the cachegrind files and shows where the time went, slowest first.
 */

export const profilesDir = (): string => join(dirs.root(), 'profiles')
const KEEP = 60

/** Milliseconds per unit of the time event in the file's "events:" line. */
function timeUnit(events: string): number {
  const t = events.split(/\s+/)[0] ?? ''
  if (/10ns/i.test(t)) return 1e-5
  if (/\(ns\)/i.test(t)) return 1e-6
  if (/µs|us\)/i.test(t)) return 1e-3
  if (/ms\)/i.test(t)) return 1
  return 1e-5
}

const pretty = (raw: string): { name: string; internal: boolean } => {
  if (raw.startsWith('php::')) return { name: `${raw.slice(5)}()`, internal: true }
  const inc = /^(require|require_once|include|include_once)::(.*)$/.exec(raw)
  if (inc) return { name: `${inc[1]} ${inc[2]}`, internal: false }
  return { name: raw === '{main}' ? '{main}' : `${raw}()`, internal: false }
}

/**
 * Reads a cachegrind file line by line, so large profiles do not fill memory. Self time is what a
 * function did itself; inclusive time adds what it called. Recursive calls are counted once.
 */
export function parseCachegrind(lines: Iterable<string>): ProfileReport {
  const p = cachegrindParser()
  for (const l of lines) p.feed(l)
  return p.done()
}

/** The same parser, fed one line at a time. */
export function cachegrindParser(): {
  feed: (line: string) => void
  done: () => ProfileReport
} {
  const fileNames = new Map<string, string>()
  const fnNames = new Map<string, string>()
  const fnFile = new Map<string, string>()
  const fnLine = new Map<string, number>()
  const self = new Map<string, number>()
  const selfMem = new Map<string, number>()
  const incl = new Map<string, number>()
  const calls = new Map<string, number>()
  const blockChildren = new Map<string, number>()
  const called = new Set<string>()
  let unit = 1e-5
  let cmd = ''
  let total = 0
  let creator = ''
  let fl = ''
  let fn = ''
  let cfn = ''
  let pendingCall = 0
  let firstCost = false

  const name = (map: Map<string, string>, v: string): string => {
    const m = /^\((\d+)\)(?:\s+(.*))?$/.exec(v.trim())
    if (!m) {
      // Files written without name compression use the plain name as its own id.
      map.set(v.trim(), v.trim())
      return v.trim()
    }
    if (m[2] !== undefined) map.set(m[1], m[2])
    return m[1]
  }
  const add = (m: Map<string, number>, k: string, v: number): void => void m.set(k, (m.get(k) ?? 0) + v)

  const feed = (raw: string): void => {
    const line = raw.trimEnd()
    if (!line) return
    const c = line.charCodeAt(0)
    if (c >= 48 && c <= 57) {
      // A cost line: "<line> <time> <memory>".
      const parts = line.split(' ')
      const time = Number(parts[1] ?? 0)
      if (pendingCall) {
        // Inclusive cost of a call made from fn.
        add(blockChildren, fn, time)
        if (cfn !== fn) add(incl, cfn, time)
        add(calls, cfn, pendingCall)
        called.add(cfn)
        pendingCall = 0
      } else {
        add(self, fn, time)
        add(selfMem, fn, Number(parts[2] ?? 0))
        if (firstCost && !fnLine.has(fn)) fnLine.set(fn, Number(parts[0]))
        firstCost = false
      }
      return
    }
    if (line.startsWith('fl=')) fl = name(fileNames, line.slice(3))
    else if (line.startsWith('fn=')) {
      fn = name(fnNames, line.slice(3))
      if (!fnFile.has(fn)) fnFile.set(fn, fl)
      firstCost = true
    } else if (line.startsWith('cfn=')) cfn = name(fnNames, line.slice(4))
    else if (line.startsWith('cfl=') || line.startsWith('cfi=')) name(fileNames, line.slice(4))
    else if (line.startsWith('fi=') || line.startsWith('fe=')) name(fileNames, line.slice(3))
    else if (line.startsWith('calls=')) pendingCall = Number(line.slice(6).split(' ')[0]) || 1
    else if (line.startsWith('events:')) unit = timeUnit(line.slice(7).trim())
    else if (line.startsWith('cmd:')) cmd = line.slice(4).trim()
    else if (line.startsWith('creator:')) creator = line.slice(8).trim()
    else if (line.startsWith('summary:')) total = Number(line.slice(8).trim().split(' ')[0]) || 0
  }

  const done = (): ProfileReport => {
    // Functions nobody called ({main}) have their whole block as inclusive time.
    for (const id of self.keys()) if (!called.has(id)) incl.set(id, (self.get(id) ?? 0) + (blockChildren.get(id) ?? 0))
    if (!total) total = Math.max(0, ...[...incl.values()])

    const functions: ProfileFunction[] = [...self.keys()].map((id) => {
      const p = pretty(fnNames.get(id) ?? id)
      const file = fileNames.get(fnFile.get(id) ?? '') ?? ''
      return {
        name: p.name,
        internal: p.internal || file === 'php:internal',
        file: file === 'php:internal' ? '' : file,
        line: fnLine.get(id) ?? 0,
        calls: calls.get(id) ?? 1,
        selfMs: round((self.get(id) ?? 0) * unit),
        inclMs: round((incl.get(id) ?? self.get(id) ?? 0) * unit),
        memoryKb: Math.round((selfMem.get(id) ?? 0) / 1024)
      }
    })
    functions.sort((a, b) => b.selfMs - a.selfMs)
    return {
      cmd,
      creator,
      totalMs: round(total * unit),
      functions: functions.slice(0, 80),
      count: functions.length
    }
  }
  return { feed, done }
}

const round = (n: number): number => Math.round(n * 1000) / 1000

/** Reads a profile from disk without loading it all at once. */
export async function readProfile(path: string): Promise<ProfileReport> {
  const p = cachegrindParser()
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of rl) p.feed(line)
  return p.done()
}

/** The host a profile belongs to, from its name: cachegrind.out.<host>.<sec>_<usec><path>. */
export function profileHost(file: string): { host: string; at: number; path: string } | null {
  const m = /^cachegrind\.out\.(.*?)\.(\d{9,})_(\d+)(.*)$/.exec(file)
  if (!m) return null
  return {
    host: m[1],
    at: Number(m[2]) * 1000 + Math.floor(Number(m[3]) / 1000),
    path: m[4] ? m[4].replace(/_/g, '/') : '/'
  }
}

/** Profiles of a site (by its addresses), newest first. Old ones beyond KEEP are removed. */
export function listProfiles(hosts: string[], dir = profilesDir()): ProfileListItem[] {
  if (!existsSync(dir)) return []
  const all = readdirSync(dir)
    .map((f) => ({ f, info: profileHost(f) }))
    .filter(
      (
        x
      ): x is {
        f: string
        info: NonNullable<ReturnType<typeof profileHost>>
      } => !!x.info
    )
    .sort((a, b) => b.info.at - a.info.at)
  for (const old of all.slice(KEEP * 4)) {
    try {
      unlinkSync(join(dir, old.f))
    } catch {
      /* in use */
    }
  }
  const want = new Set(hosts.map((h) => h.toLowerCase()))
  return all
    .filter((x) => want.has(x.info.host.toLowerCase().replace(/:\d+$/, '')))
    .slice(0, KEEP)
    .map((x) => ({
      file: x.f,
      at: x.info.at,
      path: x.info.path,
      size: safeSize(join(dir, x.f))
    }))
}
const safeSize = (p: string): number => {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

/** A file name from the list, checked so it can only name a profile in the profiles folder. */
export function profileFile(file: string, dir = profilesDir()): string | null {
  if (typeof file !== 'string' || !profileHost(file) || /[/\\]/.test(file)) return null
  const p = join(dir, file)
  return existsSync(p) ? p : null
}

const localAgent = new Agent({ connect: { rejectUnauthorized: false } })

/**
 * Loads one page of a site with the profiler's cookie and returns the new profile. Only the site's
 * own address is requested, and only GET: nothing on the page is changed.
 */
export async function profilePage(siteUrl: string, path: string, hosts: string[]): Promise<{ file: string; status: number } | null> {
  const base = new URL(siteUrl)
  const url = new URL(path || '/', base)
  if (url.host !== base.host) throw new Error('Only pages of this site can be profiled.')
  mkdirSync(profilesDir(), { recursive: true })
  const before = new Set(listProfiles(hosts).map((p) => p.file))
  const res = await ufetch(url, {
    method: 'GET',
    headers: { Cookie: 'XDEBUG_PROFILE=1', 'User-Agent': 'Laramac profiler' },
    redirect: 'manual',
    signal: AbortSignal.timeout(120_000),
    dispatcher: localAgent
  })
  await res.arrayBuffer().catch(() => null)
  // PHP writes the file as the request ends; give it a moment.
  for (let i = 0; i < 20; i++) {
    const fresh = listProfiles(hosts).find((p) => !before.has(p.file))
    if (fresh) return { file: fresh.file, status: res.status }
    await new Promise((r) => setTimeout(r, 150))
  }
  return { file: '', status: res.status }
}
