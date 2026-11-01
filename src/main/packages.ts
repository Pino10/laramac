import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import type { PackageInfo, ServiceId } from '../shared/types'
import { dirs } from './paths'
import { brewPrefix } from './platform'
import { brew } from './brew'

/**
 * Everything Laramac has downloaded or installed, with its size, and a way to
 * remove each piece. The page only ever sends back an id from this list, never
 * a path, so nothing outside these folders can be deleted.
 */
interface Entry extends PackageInfo {
  path: string
  /** Service to stop before removing. */
  stops?: ServiceId
  remove?: () => Promise<void>
}

const BREW: { formula: string; name: string; service: ServiceId }[] = [
  { formula: 'httpd', name: 'Apache', service: 'apache' },
  { formula: 'nginx', name: 'Nginx', service: 'nginx' },
  { formula: 'mariadb', name: 'MariaDB', service: 'mariadb' },
  { formula: 'redis', name: 'Redis', service: 'redis' },
  { formula: 'memcached', name: 'Memcached', service: 'memcached' }
]

const BINS: { file: string; name: string; desc: string; service?: ServiceId }[] = [
  { file: 'cloudflared', name: 'Cloudflare Tunnel', desc: 'Public links for your sites' },
  { file: 'ngrok', name: 'ngrok', desc: 'Public links for your sites' },
  { file: 'composer.phar', name: 'Composer', desc: 'PHP package manager' },
  { file: 'meilisearch', name: 'Meilisearch', desc: 'Search engine', service: 'meilisearch' },
  { file: 'nginx', name: 'Nginx (Laramac build)', desc: 'Web server', service: 'nginx' },
  { file: 'redis-server', name: 'Redis (Laramac build)', desc: 'Cache and queue', service: 'redis' }
]

function list(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith('.'))
  } catch {
    return []
  }
}

function readVersion(dir: string): string | undefined {
  try {
    return readFileSync(join(dir, 'VERSION'), 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}

/** Sizes in bytes, measured by du so large folders stay fast. */
function sizes(paths: string[]): Promise<Map<string, number>> {
  const present = paths.filter((p) => existsSync(p))
  if (present.length === 0) return Promise.resolve(new Map())
  return new Promise((resolve) => {
    execFile('du', ['-sk', ...present], { maxBuffer: 4 * 1024 * 1024 }, (_err, out) => {
      const m = new Map<string, number>()
      for (const line of String(out ?? '').split('\n')) {
        const tab = line.indexOf('\t')
        if (tab > 0) m.set(line.slice(tab + 1), Number(line.slice(0, tab)) * 1024)
      }
      for (const p of present) if (!m.has(p)) m.set(p, statSync(p).size)
      resolve(m)
    })
  })
}

function entries(): Entry[] {
  const out: Entry[] = []
  for (const minor of list(dirs.php())) {
    const p = dirs.php(minor)
    out.push({ id: `php:${minor}`, group: 'php', name: `PHP ${minor}`, detail: readVersion(p) ?? minor, bytes: 0, path: p })
  }
  for (const v of list(dirs.mysql())) {
    out.push({ id: `mysql:${v}`, group: 'database', name: 'MySQL', detail: v, bytes: 0, path: dirs.mysql(v), stops: 'mysql' })
  }
  for (const v of list(dirs.postgres())) {
    out.push({ id: `postgres:${v}`, group: 'database', name: 'PostgreSQL', detail: v, bytes: 0, path: dirs.postgres(v), stops: 'postgres' })
  }
  if (existsSync(dirs.mongodb())) {
    out.push({ id: 'dir:mongodb', group: 'database', name: 'MongoDB', detail: readVersion(dirs.mongodb()) ?? 'Community', bytes: 0, path: dirs.mongodb(), stops: 'mongodb' })
  }
  if (existsSync(dirs.mailpit()) && list(dirs.mailpit()).length) {
    out.push({ id: 'dir:mailpit', group: 'tool', name: 'Mailpit', detail: 'Catches outgoing mail', bytes: 0, path: dirs.mailpit(), stops: 'mailpit' })
  }
  if (existsSync(dirs.phpmyadmin())) {
    out.push({ id: 'dir:phpmyadmin', group: 'tool', name: 'phpMyAdmin', detail: 'Database admin', bytes: 0, path: dirs.phpmyadmin() })
  }
  if (existsSync(dirs.adminer())) {
    out.push({ id: 'dir:adminer', group: 'tool', name: 'Adminer', detail: 'Database admin', bytes: 0, path: dirs.adminer() })
  }
  for (const b of BINS) {
    const p = join(dirs.bin(), b.file)
    if (existsSync(p)) out.push({ id: `bin:${b.file}`, group: 'tool', name: b.name, detail: b.desc, bytes: 0, path: p, stops: b.service })
  }
  const prefix = brewPrefix()
  if (prefix) {
    for (const f of BREW) {
      const cellar = join(prefix, 'Cellar', f.formula)
      if (!existsSync(cellar)) continue
      out.push({
        id: `brew:${f.formula}`,
        group: 'brew',
        name: f.name,
        detail: `Homebrew ${f.formula} ${list(cellar).sort().pop() ?? ''}`.trim(),
        bytes: 0,
        path: cellar,
        stops: f.service,
        remove: () => brew(['uninstall', '--ignore-dependencies', f.formula], () => undefined)
      })
    }
  }
  if (list(dirs.downloads()).length) {
    out.push({ id: 'cache:downloads', group: 'cache', name: 'Download cache', detail: 'Leftover installer files, safe to clear', bytes: 0, path: dirs.downloads() })
  }
  if (list(dirs.logs()).length) {
    out.push({ id: 'cache:logs', group: 'cache', name: 'Logs', detail: 'Server and PHP logs', bytes: 0, path: dirs.logs() })
  }
  return out
}

export async function listPackages(): Promise<PackageInfo[]> {
  const all = entries()
  const sz = await sizes(all.map((e) => e.path))
  return all.map(({ id, group, name, detail, path }) => ({ id, group, name, detail, bytes: sz.get(path) ?? 0 }))
}

export interface RemoveDeps {
  stopService: (id: ServiceId) => Promise<void>
  removePhp: (minor: string) => Promise<void>
}

export async function removePackage(id: string, deps: RemoveDeps): Promise<void> {
  const e = entries().find((x) => x.id === id)
  if (!e) throw new Error('That package is no longer installed.')
  if (e.group === 'php') return deps.removePhp(id.slice(4))
  if (e.stops) await deps.stopService(e.stops).catch(() => undefined)
  if (e.remove) return e.remove()
  if (e.group === 'cache') {
    for (const n of list(e.path)) rmSync(join(e.path, n), { recursive: true, force: true })
    return
  }
  // Every path comes from the fixed folders above; check once more before deleting.
  if (!e.path.startsWith(dirs.root() + '/')) throw new Error('Refusing to remove a path outside Laramac.')
  rmSync(e.path, { recursive: true, force: true })
}
