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
  mailpit: (): string => join(ROOT, 'mailpit')
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
    dirs.mailpit()
  ]) {
    mkdirSync(d, { recursive: true })
  }
}
