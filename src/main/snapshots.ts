import { execFile } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { SnapshotInfo } from '../shared/types'
import { dirs } from './paths'
import { createDatabase, DB_NAME, dropDatabase, exportDatabase, type DbTarget } from './dbadmin'
import { importSql } from './importer'

/**
 * Snapshots of a site: its files and its database, saved together as one
 * archive (`<site>/` plus `<site>.sql.gz`). The same archive can be exported
 * and brought into Laramac on another Mac through Import.
 */
export interface SiteDb {
  engine: 'mysql' | 'mariadb'
  name: string
}

export interface SnapshotDeps {
  /** A running database server for this engine, or null when it is off or missing. */
  target: (engine: 'mysql' | 'mariadb') => DbTarget | null
}

const ID = /^\d{8}-\d{6}-[a-z0-9]{4}$/
const root = (): string => join(dirs.root(), 'snapshots')
const siteDir = (site: string): string => join(root(), site)

/** Reads the database a site uses from wp-config.php or a Laravel-style .env. */
export function detectSiteDatabase(path: string): SiteDb | null {
  const read = (f: string): string | null => {
    try {
      return readFileSync(join(path, f), 'utf8')
    } catch {
      return null
    }
  }
  const wp = read('wp-config.php')
  if (wp) {
    const get = (k: string): string | undefined => new RegExp(`define\\(\\s*['"]${k}['"]\\s*,\\s*['"]([^'"]*)['"]`).exec(wp)?.[1]
    const name = get('DB_NAME')
    if (name && DB_NAME.test(name)) return { engine: /:3307\b/.test(get('DB_HOST') ?? '') ? 'mariadb' : 'mysql', name }
  }
  const env = read('.env')
  if (env) {
    const get = (k: string): string | undefined => new RegExp(`^${k}=["']?([^"'\\r\\n]*)`, 'm').exec(env)?.[1]?.trim()
    const conn = get('DB_CONNECTION') ?? 'mysql'
    const name = get('DB_DATABASE')
    if ((conn === 'mysql' || conn === 'mariadb') && name && DB_NAME.test(name)) {
      return { engine: get('DB_PORT') === '3307' || conn === 'mariadb' ? 'mariadb' : 'mysql', name }
    }
  }
  return null
}

function tar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile('tar', args, { maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) =>
      err ? reject(new Error(`The archive could not be written: ${String(stderr || err.message).trim().split('\n').pop()}`)) : resolve()
    )
  )
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`
}

function readMeta(site: string, id: string): SnapshotInfo | null {
  try {
    return JSON.parse(readFileSync(join(siteDir(site), id, 'meta.json'), 'utf8')) as SnapshotInfo
  } catch {
    return null
  }
}

export function listSnapshots(sitePath: string): SnapshotInfo[] {
  const site = basename(sitePath)
  if (!existsSync(siteDir(site))) return []
  return readdirSync(siteDir(site))
    .filter((id) => ID.test(id))
    .map((id) => readMeta(site, id))
    .filter((m): m is SnapshotInfo => m !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function createSnapshot(sitePath: string, note: string, deps: SnapshotDeps): Promise<SnapshotInfo> {
  const site = basename(sitePath)
  const id = stamp()
  const dir = join(siteDir(site), id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    const db = detectSiteDatabase(sitePath)
    let dbSaved: SiteDb | null = null
    const staging = join(dir, 'staging')
    mkdirSync(staging)
    if (db) {
      const t = deps.target(db.engine)
      if (t) {
        await exportDatabase(t, db.name, join(staging, `${site}.sql.gz`))
        dbSaved = db
      }
    }
    const bundle = join(dir, `${site}-${id}.tar.gz`)
    await tar([
      '-czf',
      bundle,
      '--exclude',
      'node_modules',
      '--exclude',
      '.DS_Store',
      '-C',
      dirname(sitePath),
      site,
      ...(dbSaved ? ['-C', staging, `${site}.sql.gz`] : [])
    ])
    rmSync(staging, { recursive: true, force: true })
    const meta: SnapshotInfo = {
      id,
      site,
      note: note.trim().slice(0, 120),
      createdAt: Date.now(),
      bytes: statSync(bundle).size,
      database: dbSaved,
      databaseSkipped: db && !dbSaved ? `${db.engine === 'mysql' ? 'MySQL' : 'MariaDB'} was not running, so ${db.name} was not saved.` : null
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), { mode: 0o600 })
    return meta
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    throw err
  }
}

function bundlePath(site: string, id: string): string {
  if (!ID.test(id)) throw new Error('Unknown snapshot.')
  const p = join(siteDir(site), id, `${site}-${id}.tar.gz`)
  if (!existsSync(p)) throw new Error('That snapshot is no longer on this Mac.')
  return p
}

/**
 * Puts a site back exactly as it was in the snapshot. A snapshot of the
 * current state is taken first, so a restore can always be undone.
 */
export async function restoreSnapshot(sitePath: string, id: string, deps: SnapshotDeps): Promise<SnapshotInfo> {
  const site = basename(sitePath)
  const bundle = bundlePath(site, id)
  const meta = readMeta(site, id)
  if (meta?.database && !deps.target(meta.database.engine)) {
    throw new Error(`Start ${meta.database.engine === 'mysql' ? 'MySQL' : 'MariaDB'} first so ${meta.database.name} can be restored.`)
  }
  const safety = await createSnapshot(sitePath, `Before restoring ${new Date(meta?.createdAt ?? Date.now()).toLocaleString()}`, deps)

  const work = mkdtempSync(join(dirname(sitePath), `.${site}-restore-`))
  try {
    await tar(['-xzf', bundle, '-C', work])
    const files = join(work, site)
    if (!existsSync(files)) throw new Error('The snapshot does not contain the site files.')
    const old = join(work, 'previous')
    renameSync(sitePath, old)
    try {
      renameSync(files, sitePath)
    } catch (err) {
      renameSync(old, sitePath)
      throw err
    }
    const dump = join(work, `${site}.sql.gz`)
    if (meta?.database && existsSync(dump)) {
      const t = deps.target(meta.database.engine)!
      await dropDatabase(t, meta.database.name).catch(() => undefined)
      await createDatabase(t, meta.database.name)
      await importSql(dump, { client: t.client, engine: t.engine, port: t.port, database: meta.database.name })
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  return safety
}

export function exportSnapshot(sitePath: string, id: string, dest: string): void {
  copyFileSync(bundlePath(basename(sitePath), id), dest)
}

export function deleteSnapshot(sitePath: string, id: string): void {
  const site = basename(sitePath)
  bundlePath(site, id)
  rmSync(join(siteDir(site), id), { recursive: true, force: true })
}

export const snapshotFileName = (sitePath: string, id: string): string => basename(bundlePath(basename(sitePath), id))
