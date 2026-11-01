import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

let ROOT = join(homedir(), '.laramac')

/** The app calls this once at startup with Electron's userData directory. */
export function setRoot(path: string): void {
  ROOT = path
}

export const dirs = {
  root: (): string => ROOT,
  bin: (): string => join(ROOT, 'bin'),
  downloads: (): string => join(ROOT, 'downloads'),
  php: (minor?: string): string => (minor ? join(ROOT, 'php', minor) : join(ROOT, 'php')),
  mysql: (version?: string): string =>
    version ? join(ROOT, 'mysql', version) : join(ROOT, 'mysql'),
  mysqlData: (series: string): string => join(ROOT, 'data', `mysql-${series}`),
  conf: (): string => join(ROOT, 'conf'),
  logs: (): string => join(ROOT, 'logs'),
  run: (): string => join(ROOT, 'run'),
  certs: (): string => join(ROOT, 'certs'),
  phpmyadmin: (): string => join(ROOT, 'phpmyadmin'),
  mailpit: (): string => join(ROOT, 'mailpit'),
  adminer: (): string => join(ROOT, 'adminer'),
  postgres: (version?: string): string =>
    version ? join(ROOT, 'postgres', version) : join(ROOT, 'postgres'),
  postgresData: (major: string): string => join(ROOT, 'data', `postgres-${major}`),
  mariadbData: (): string => join(ROOT, 'data', 'mariadb'),
  redisData: (): string => join(ROOT, 'data', 'redis'),
  mongodb: (): string => join(ROOT, 'mongodb'),
  mongoData: (): string => join(ROOT, 'data', 'mongodb')
}

export function ensureDirs(): void {
  for (const d of [
    dirs.bin(),
    dirs.downloads(),
    dirs.php(),
    dirs.mysql(),
    dirs.conf(),
    dirs.logs(),
    dirs.run(),
    dirs.certs(),
    dirs.mailpit(),
    dirs.postgres(),
    dirs.redisData(),
    dirs.mongoData()
  ]) {
    mkdirSync(d, { recursive: true })
  }
}
