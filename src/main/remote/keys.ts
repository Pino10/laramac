import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { utils } from 'ssh2'
import type { GeneratedKey } from '../../shared/types'
import { q } from './ops'

/** Makes a new key pair in ~/.ssh. The private key is written once, readable only by you, and never overwrites another. */
export function generateKey(name: string, passphrase: string | null, home = homedir()): GeneratedKey {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  if (!slug) throw new Error('Give the key a name first.')
  const dir = join(home, '.ssh')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const keyPath = join(dir, `laramac_${slug}`)
  if (existsSync(keyPath) || existsSync(`${keyPath}.pub`)) throw new Error(`A key called laramac_${slug} already exists in ~/.ssh. Choose another name.`)
  const pair = utils.generateKeyPairSync('ed25519', { comment: `laramac-${slug}`, ...(passphrase ? { passphrase, cipher: 'aes256-ctr', rounds: 16 } : {}) })
  writeFileSync(keyPath, pair.private, { mode: 0o600, flag: 'wx' })
  chmodSync(keyPath, 0o600)
  writeFileSync(`${keyPath}.pub`, pair.public.trim() + '\n', { mode: 0o644, flag: 'wx' })
  return { keyPath, publicKey: pair.public.trim() }
}

/** The command that puts a public key in a server's authorized_keys without adding it twice. */
export function installKeyCommand(publicKey: string): string {
  if (!/^ssh-(ed25519|rsa) [A-Za-z0-9+/=]+( [^\r\n\0]*)?$/.test(publicKey.trim())) throw new Error('That is not a public key.')
  const k = q(publicKey.trim())
  return `umask 077 && mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF ${k} ~/.ssh/authorized_keys || printf '%s\\n' ${k} >> ~/.ssh/authorized_keys) && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`
}
