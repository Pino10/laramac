/**
 * Updates for the databases Laramac installed itself (MySQL, PostgreSQL, MongoDB).
 *
 * Only the same line is offered: a newer patch of MySQL 8.4, of PostgreSQL 17 or of MongoDB 9.
 * A bigger jump changes how data is stored on disk, so that stays your decision. Checking only
 * reads version numbers. An update installs the new build next to your data, restarts the
 * database if it was running, and never touches the data folders.
 */
import type { SwapChoice, UpdateItem } from '../shared/types'
import { getSettings, setSettings } from './settings'
import { compareVersions, fetchPostgresVersions, findMysqlBuilds, latestMongodb, minorOf } from './versions'
import { activeMysql, installedMysqlVersions, installMysqlBuild } from './svc/mysql'
import { activePostgres, installedPostgres, installPostgresVersion } from './svc/postgres'
import { mongodb } from './svc/mongodb'
import { isNewer, jumpOf, newestInLine } from './updates'

export type Progress = (pct: number | null, label?: string) => void
/** What the updater needs from the services, so this file does not depend on how they run. */
export interface Controller {
  running(id: 'mysql' | 'postgres' | 'mongodb'): boolean
  stop(id: 'mysql' | 'postgres' | 'mongodb'): Promise<void>
  start(id: 'mysql' | 'postgres' | 'mongodb'): Promise<void>
}

export async function checkDatabases(): Promise<{ items: UpdateItem[]; notes: string[] }> {
  const items: UpdateItem[] = []
  const notes: string[] = []
  const my = activeMysql()
  if (my) {
    try {
      // A newer build that is already installed (but not in use) counts as installed: it is switched to on Packages, not downloaded again.
      const have = newestInLine(my, installedMysqlVersions(), 2) ?? my
      const next = newestInLine(have, (await findMysqlBuilds()).map((b) => b.version), 2)
      if (next) items.push({ id: 'db:mysql', group: 'database', name: 'MySQL', current: my, latest: next, detail: `Newest ${minorOf(my)} release from Oracle. Your databases are not touched. MySQL restarts if it was running.`, jump: 'patch' })
    } catch {
      notes.push('MySQL could not be checked.')
    }
  }
  const pg = activePostgres()
  if (pg) {
    try {
      const major = pg.split('.')[0]
      const have = newestInLine(pg, installedPostgres(), 1) ?? pg
      const next = (await fetchPostgresVersions())[major]
      if (next && isNewer(have, next) && next.split('.')[0] === major) items.push({ id: 'db:postgres', group: 'database', name: 'PostgreSQL', current: pg, latest: next, detail: `Newest ${major}.x release. Your databases are not touched. PostgreSQL restarts if it was running.`, jump: jumpOf(pg, next) })
    } catch {
      notes.push('PostgreSQL could not be checked.')
    }
  }
  const mongo = mongodb.version()
  if (mongo) {
    try {
      const next = (await latestMongodb()).version
      if (next.split('.')[0] === mongo.split('.')[0] && isNewer(mongo, next)) items.push({ id: 'db:mongodb', group: 'database', name: 'MongoDB', current: mongo, latest: next, detail: 'Newest release of the same major version. Your data is not touched. MongoDB restarts if it was running.', jump: jumpOf(mongo, next) })
    } catch {
      notes.push('MongoDB could not be checked.')
    }
  }
  return { items, notes }
}

/**
 * Installs the newer build next to the one in use. What runs does not change: the person is asked
 * whether to switch, so an update never swaps a database under a running project. MongoDB keeps one
 * folder, so it is replaced in place and restarted.
 */
export async function updateDatabase(id: string, update: Progress, ctl: Controller): Promise<SwapChoice | null> {
  const name = id.slice(3) as 'mysql' | 'postgres' | 'mongodb'
  if (!['mysql', 'postgres', 'mongodb'].includes(name)) throw new Error('Laramac cannot update that database by itself.')
  if (name === 'mysql') {
    const cur = activeMysql()
    if (!cur) throw new Error('MySQL is not installed.')
    const builds = await findMysqlBuilds()
    const next = newestInLine(newestInLine(cur, installedMysqlVersions(), 2) ?? cur, builds.map((b) => b.version), 2)
    const build = builds.find((b) => b.version === next)
    if (!build) throw new Error('MySQL is already up to date.')
    // Keep running exactly what is running now, even when the setting was "newest".
    if (getSettings().mysqlVersion === 'latest') setSettings({ mysqlVersion: cur })
    await installMysqlBuild(build, update)
    return { id: `mysql:${build.version}`, name: 'MySQL', from: cur, to: build.version, sameData: minorOf(cur) === minorOf(build.version) }
  }
  if (name === 'postgres') {
    const cur = activePostgres()
    if (!cur) throw new Error('PostgreSQL is not installed.')
    const next = (await fetchPostgresVersions())[cur.split('.')[0]]
    if (!next || compareVersions(next, newestInLine(cur, installedPostgres(), 1) ?? cur) <= 0) throw new Error('PostgreSQL is already up to date.')
    if (getSettings().postgresMajor === 'latest' || !getSettings().postgresMajor.includes('.')) setSettings({ postgresMajor: cur })
    await installPostgresVersion(next, update)
    return { id: `postgres:${next}`, name: 'PostgreSQL', from: cur, to: next, sameData: cur.split('.')[0] === next.split('.')[0] }
  }
  const was = ctl.running('mongodb')
  if (was) await ctl.stop('mongodb')
  try {
    await mongodb.install()
  } finally {
    if (was) await ctl.start('mongodb')
  }
  return null
}
