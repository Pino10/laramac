import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { getSettings } from '../settings'
import { downloadFile, extract, removeQuarantine, verifySha256 } from '../download'
import { jobs } from '../jobs'
import { compareVersions, fetchPostgresVersions, postgresJarUrl } from '../versions'
import { ManagedProcess, tailFile } from '../process'

const proc = new ManagedProcess('PostgreSQL')
const PORT = 5432

const bin = (version: string, name: string): string => join(dirs.postgres(version), 'bin', name)

export function installedPostgres(): string[] {
  if (!existsSync(dirs.postgres())) return []
  return readdirSync(dirs.postgres())
    .filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v) && existsSync(bin(v, 'postgres')))
    .sort((a, b) => compareVersions(b, a))
}

/** The installed build matching the chosen major version, else the newest installed. */
export function activePostgres(): string | null {
  const installed = installedPostgres()
  const major = getSettings().postgresMajor
  return installed.find((v) => v.split('.')[0] === major) ?? installed[0] ?? null
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 16 }, (err, _o, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve()
    )
  })
}

export const postgres: ServiceImpl = {
  id: 'postgres',
  name: 'PostgreSQL',
  description: 'Relational database',
  port: () => PORT,
  installed: () => activePostgres() !== null,
  version: () => activePostgres() ?? undefined,
  running: () => proc.running,

  async install() {
    const major = getSettings().postgresMajor
    const versions = await fetchPostgresVersions()
    const version = versions[major]
    if (!version) {
      throw new Error(`PostgreSQL ${major} is not available. Available: ${Object.keys(versions).join(', ')}.`)
    }

    await jobs.run(`Installing PostgreSQL ${version}`, async (update) => {
      const jar = join(dirs.downloads(), `postgres-${version}.jar`)
      const staging = join(dirs.downloads(), `postgres-${version}-staging`)
      rmSync(staging, { recursive: true, force: true })
      await downloadFile(postgresJarUrl(version), jar, (p) => update(p, `Downloading PostgreSQL ${version}`))
      update(null, 'Checking the download')
      await verifySha256(jar, `${postgresJarUrl(version)}.sha256`)

      // The jar is a zip holding one .txz archive with the real binaries.
      update(null, `Unpacking PostgreSQL ${version}`)
      await extract(jar, staging)
      const txz = readdirSync(staging).find((f) => f.endsWith('.txz'))
      if (!txz) throw new Error('Unexpected PostgreSQL archive layout.')

      const target = dirs.postgres(version)
      rmSync(target, { recursive: true, force: true })
      mkdirSync(target, { recursive: true })
      await run('tar', ['-xJf', join(staging, txz), '-C', target])
      for (const name of ['postgres', 'initdb', 'pg_ctl']) {
        if (existsSync(bin(version, name))) chmodSync(bin(version, name), 0o755)
      }
      await removeQuarantine(target)
      rmSync(staging, { recursive: true, force: true })
      rmSync(jar, { force: true })
    })
  },

  async start() {
    const version = activePostgres()
    if (!version) throw new Error('PostgreSQL is not installed.')
    const major = version.split('.')[0]
    const data = dirs.postgresData(major)
    mkdirSync(dirs.run(), { recursive: true })

    // First run: create the cluster. Trust auth on localhost, superuser "postgres", no password.
    if (!existsSync(join(data, 'PG_VERSION'))) {
      mkdirSync(data, { recursive: true })
      chmodSync(data, 0o700)
      try {
        await run(bin(version, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'])
      } catch (err) {
        throw new Error(`PostgreSQL could not create its data folder.\n${err instanceof Error ? err.message : ''}`)
      }
    }

    await proc.start(
      {
        command: bin(version, 'postgres'),
        args: [
          '-D',
          data,
          '-p',
          String(PORT),
          '-c',
          'listen_addresses=127.0.0.1',
          '-c',
          `unix_socket_directories=${dirs.run()}`
        ],
        logFile: join(dirs.logs(), 'postgres.log')
      },
      PORT,
      30000
    ).catch((err) => {
      throw new Error(`${err instanceof Error ? err.message : err}\n${tailFile(join(dirs.logs(), 'postgres.log'))}`)
    })
  },

  // SIGINT is PostgreSQL's "fast shutdown": it disconnects clients and exits cleanly.
  stop: () => proc.stop(15000, 'SIGINT')
}
