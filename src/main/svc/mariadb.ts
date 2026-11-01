import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { jobs } from '../jobs'
import { brewPrefix } from '../platform'
import { brew } from '../brew'
import { ManagedProcess, tailFile } from '../process'

const proc = new ManagedProcess('MariaDB')
// MySQL owns 3306, so MariaDB runs beside it on 3307.
const PORT = 3307

function binDir(): string | null {
  const prefix = brewPrefix()
  if (!prefix) return null
  return existsSync(join(prefix, 'bin', 'mariadbd')) ? join(prefix, 'bin') : null
}

const baseDir = (): string => join(brewPrefix() ?? '/opt/homebrew', 'opt', 'mariadb')

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 16 }, (err, _o, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve()
    )
  })
}

export const mariadb: ServiceImpl = {
  id: 'mariadb',
  name: 'MariaDB',
  description: 'MySQL-compatible database, runs beside MySQL',
  port: () => PORT,
  installed: () => binDir() !== null,
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing MariaDB with Homebrew', async (update) => {
      await brew(['install', 'mariadb'], (line) => update(null, `MariaDB: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const dir = binDir()
    if (!dir) throw new Error('MariaDB is not installed.')
    const data = dirs.mariadbData()
    mkdirSync(dirs.run(), { recursive: true })

    if (!existsSync(join(data, 'mysql'))) {
      mkdirSync(data, { recursive: true })
      await run(join(dir, 'mariadb-install-db'), [
        `--datadir=${data}`,
        `--basedir=${baseDir()}`,
        '--auth-root-authentication-method=normal',
        '--skip-test-db'
      ]).catch((err) => {
        throw new Error(`MariaDB could not create its data folder.\n${err instanceof Error ? err.message : ''}`)
      })
    }

    await proc.start(
      {
        command: join(dir, 'mariadbd'),
        args: [
          `--basedir=${baseDir()}`,
          `--datadir=${data}`,
          `--port=${PORT}`,
          '--bind-address=127.0.0.1',
          `--socket=${join(dirs.run(), 'mariadb.sock')}`,
          `--pid-file=${join(dirs.run(), 'mariadb.pid')}`,
          '--skip-name-resolve'
        ],
        logFile: join(dirs.logs(), 'mariadb.log')
      },
      PORT,
      60000
    ).catch((err) => {
      throw new Error(`${err instanceof Error ? err.message : err}\n${tailFile(join(dirs.logs(), 'mariadb.log'))}`)
    })
  },

  stop: () => proc.stop(12000)
}
