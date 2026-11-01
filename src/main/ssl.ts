import { execFile } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { dirs } from './paths'
import { isMac } from './platform'
import { getSettings } from './settings'

function openssl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('openssl', args, (err, _out, stderr) => {
      if (err) reject(new Error(`openssl failed: ${stderr || err.message}`))
      else resolve()
    })
  })
}

const caKey = (): string => join(dirs.certs(), 'laramac-ca.key')
export const caCertPath = (): string => join(dirs.certs(), 'laramac-ca.pem')

const caTldFile = (): string => join(dirs.certs(), 'laramac-ca.tld')

/**
 * Creates the local certificate authority. It carries a name constraint, so even if its key
 * leaked it could only vouch for names under the local suffix (for example *.test), never for
 * real websites. Changing the suffix creates a new authority and new site certificates.
 */
export async function ensureCa(tld: string = getSettings().tld): Promise<void> {
  const current = existsSync(caTldFile()) ? readFileSync(caTldFile(), 'utf8').trim() : null
  if (existsSync(caKey()) && existsSync(caCertPath()) && current === tld) return

  mkdirSync(dirs.certs(), { recursive: true, mode: 0o700 })
  chmodSync(dirs.certs(), 0o700)
  // Old certificates were signed by the old authority, so they go too.
  for (const f of readdirSync(dirs.certs())) rmSync(join(dirs.certs(), f), { force: true })

  const cnf = join(dirs.certs(), 'ca.cnf')
  writeFileSync(
    cnf,
    [
      '[req]',
      'distinguished_name = req_dn',
      'prompt = no',
      '[req_dn]',
      `CN = Laramac Local CA (.${tld} only)`,
      'O = Laramac',
      '[v3_ca]',
      'basicConstraints = critical,CA:TRUE,pathlen:0',
      'keyUsage = critical,keyCertSign,cRLSign',
      'subjectKeyIdentifier = hash',
      `nameConstraints = critical,permitted;DNS:${tld}`,
      ''
    ].join('\n')
  )
  await openssl(['genrsa', '-out', caKey(), '2048'])
  chmodSync(caKey(), 0o600)
  await openssl([
    'req',
    '-x509',
    '-new',
    '-nodes',
    '-key',
    caKey(),
    '-sha256',
    '-days',
    '3650',
    '-out',
    caCertPath(),
    '-config',
    cnf,
    '-extensions',
    'v3_ca'
  ])
  writeFileSync(caTldFile(), tld)
}

export function certFor(domain: string): { cert: string; key: string } | undefined {
  const cert = join(dirs.certs(), `${domain}.crt`)
  const key = join(dirs.certs(), `${domain}.key`)
  return existsSync(cert) && existsSync(key) ? { cert, key } : undefined
}

/** Issues a certificate for `domain` and `*.domain`, signed by the local CA. */
export async function ensureSiteCert(domain: string): Promise<{ cert: string; key: string }> {
  const tld = getSettings().tld
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(domain) || !domain.endsWith(`.${tld}`)) {
    throw new Error(`Certificates are only issued for .${tld} names.`)
  }
  await ensureCa(tld)
  const existing = certFor(domain)
  if (existing) return existing

  const key = join(dirs.certs(), `${domain}.key`)
  const csr = join(dirs.certs(), `${domain}.csr`)
  const cert = join(dirs.certs(), `${domain}.crt`)
  const ext = join(dirs.certs(), `${domain}.ext`)

  writeFileSync(
    ext,
    [
      'basicConstraints = CA:FALSE',
      'keyUsage = digitalSignature,keyEncipherment',
      'extendedKeyUsage = serverAuth',
      `subjectAltName = DNS:${domain},DNS:*.${domain}`,
      ''
    ].join('\n')
  )
  await openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', `/CN=${domain}`])
  chmodSync(key, 0o600)
  await openssl([
    'x509',
    '-req',
    '-in',
    csr,
    '-CA',
    caCertPath(),
    '-CAkey',
    caKey(),
    '-CAcreateserial',
    '-out',
    cert,
    '-days',
    '825',
    '-sha256',
    '-extfile',
    ext
  ])
  return { cert, key }
}

export function isCaTrusted(): Promise<boolean> {
  if (!isMac || !existsSync(caCertPath())) return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile('security', ['verify-cert', '-c', caCertPath(), '-p', 'basic'], (err) => resolve(!err))
  })
}

/** Adds the CA to the user's login keychain as trusted. macOS asks for the password. */
export async function trustCa(): Promise<void> {
  await ensureCa()
  if (!isMac) return
  const keychain = join(homedir(), 'Library', 'Keychains', 'login.keychain-db')
  await new Promise<void>((resolve, reject) => {
    execFile(
      'security',
      ['add-trusted-cert', '-r', 'trustRoot', '-k', keychain, caCertPath()],
      (err, _out, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message))
        else resolve()
      }
    )
  })
}
