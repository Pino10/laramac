/**
 * Small secrets Laramac keeps for you (database root passwords), encrypted with the Keychain.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dirs } from './paths'

interface Crypto {
  available: () => boolean
  encrypt: (s: string) => string
  decrypt: (s: string) => string
}
let crypto: Crypto | null = null
export function setSecretsCrypto(c: Crypto | null): void {
  crypto = c
}

const file = (): string => join(dirs.root(), 'secrets.json')
function load(): Record<string, string> {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function getSecret(name: string): string {
  const v = load()[name]
  if (!v || !crypto) return ''
  try {
    return crypto.decrypt(v)
  } catch {
    return ''
  }
}

export function setSecret(name: string, value: string): void {
  const all = load()
  if (!value) delete all[name]
  else {
    if (!crypto?.available()) throw new Error('The Keychain is not available, so the password cannot be stored safely.')
    all[name] = crypto.encrypt(value)
  }
  writeFileSync(file(), JSON.stringify(all, null, 2), { mode: 0o600 })
}

/** The root password Laramac uses for MySQL (port 3306) or MariaDB (3307), or '' for none. */
export const dbPassword = (engine: 'mysql' | 'mariadb'): string => getSecret(`${engine}-root`)

/** Environment for mysql and mysqldump, so the password never appears in the process list. */
export function dbEnv(engine: 'mysql' | 'mariadb'): NodeJS.ProcessEnv {
  const pw = dbPassword(engine)
  return pw ? { ...process.env, MYSQL_PWD: pw } : { ...process.env }
}
