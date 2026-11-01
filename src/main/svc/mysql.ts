import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { getSettings } from '../settings'
import { downloadFile, extract, removeQuarantine } from '../download'
import { jobs } from '../jobs'
import { chooseMysqlBuild, compareVersions, findMysqlBuilds, minorOf } from '../versions'
import { generateMyCnf } from '../configgen'
import { ManagedProcess, tailFile } from '../process'

const proc = new ManagedProcess('MySQL')

const baseDir = (version: string): string => dirs.mysql(version)
export const mysqldPath = (version: string): string => join(baseDir(version), 'bin', 'mysqld')
export const mysqlClientPath = (version: string): string => join(baseDir(version), 'bin', 'mysql')
const myCnf = (): string => join(dirs.conf(), 'my.cnf')
const socketPath = (): string => join(dirs.run(), 'mysql.sock')

export function installedMysqlVersions(): string[] {
  if (!existsSync(dirs.mysql())) return []
  return readdirSync(dirs.mysql())
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && existsSync(mysqldPath(v)))
    .sort((a, b) => compareVersions(b, a))
}

/** The version we run: the configured one if installed, otherwise the newest installed. */
export function activeMysql(): string | null {
  const installed = installedMysqlVersions()
  const wanted = getSettings().mysqlVersion
  return wanted !== 'latest' && installed.includes(wanted) ? wanted : (installed[0] ?? null)
}

function runOnce(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 16 }, (err, _o, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}

/** Creates a database if MySQL is running. Used by the project creator. */
export async function createDatabase(name: string): Promise<boolean> {
  const version = activeMysql()
  if (!version || !proc.running) return false
  const safe = name.replace(/[^a-zA-Z0-9_]/g, '_')
  try {
    await runOnce(mysqlClientPath(version), [
      '-h127.0.0.1',
      '-uroot',
      '-e',
      `CREATE DATABASE IF NOT EXISTS \`${safe}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    ])
    return true
  } catch {
    return false
  }
}

export const mysql: ServiceImpl = {
  id: 'mysql',
  name: 'MySQL',
  description: 'Database server (user root, no password)',
  port: () => 3306,
  installed: () => activeMysql() !== null,
  version: () => activeMysql() ?? undefined,
  running: () => proc.running,

  async install() {
    const wanted = getSettings().mysqlVersion
    await jobs.run('Installing MySQL', async (update) => {
      update(null, 'Finding the newest MySQL for this Mac')
      const build = chooseMysqlBuild(await findMysqlBuilds(), wanted)
      if (!build) {
        throw new Error(`Oracle has no MySQL 8.4 build for this Mac (${process.arch}). Try MariaDB instead.`)
      }
      const { version, url } = build

      const archive = join(dirs.downloads(), `mysql-${version}.tar.gz`)
      const staging = join(dirs.downloads(), `mysql-${version}-staging`)
      rmSync(staging, { recursive: true, force: true })
      await downloadFile(url, archive, (p) => update(p, `Downloading MySQL ${version}`))
      update(null, `Unpacking MySQL ${version}`)
      await extract(archive, staging)

      // The tarball holds one top-level folder named after the build.
      const inner = readdirSync(staging).find((d) => d.startsWith('mysql-'))
      if (!inner) throw new Error('Unexpected MySQL archive layout.')
      mkdirSync(dirs.mysql(), { recursive: true })
      rmSync(baseDir(version), { recursive: true, force: true })
      renameSync(join(staging, inner), baseDir(version))
      for (const bin of ['mysqld', 'mysql', 'mysqldump', 'mysqladmin']) {
        const p = join(baseDir(version), 'bin', bin)
        if (existsSync(p)) chmodSync(p, 0o755)
      }
      await removeQuarantine(baseDir(version))
      rmSync(staging, { recursive: true, force: true })
      rmSync(archive, { force: true })
    })
  },

  async start() {
    const version = activeMysql()
    if (!version) throw new Error('MySQL is not installed.')
    const series = minorOf(version)
    const dataDir = dirs.mysqlData(series)
    mkdirSync(dirs.run(), { recursive: true })
    mkdirSync(dirs.conf(), { recursive: true })

    writeFileSync(
      myCnf(),
      generateMyCnf({
        baseDir: baseDir(version),
        dataDir,
        socket: socketPath(),
        pidFile: join(dirs.run(), 'mysql.pid'),
        errorLog: join(dirs.logs(), 'mysql-error.log'),
        port: 3306,
        nativePassword: compareVersions(series, '8.4') >= 0
      })
    )

    // First run: create the data directory with an empty root password.
    if (!existsSync(join(dataDir, 'mysql'))) {
      mkdirSync(dataDir, { recursive: true })
      try {
        await runOnce(mysqldPath(version), [
          `--defaults-file=${myCnf()}`,
          '--initialize-insecure',
          '--user=' + (process.env.USER ?? 'root')
        ])
      } catch (err) {
        throw new Error(
          `MySQL could not initialise its data folder.\n${tailFile(join(dirs.logs(), 'mysql-error.log'))}\n${err instanceof Error ? err.message : ''}`
        )
      }
    }

    await proc.start(
      {
        command: mysqldPath(version),
        args: [`--defaults-file=${myCnf()}`],
        logFile: join(dirs.logs(), 'mysql.log')
      },
      3306,
      60000
    )
  },

  stop: () => proc.stop(12000)
}
