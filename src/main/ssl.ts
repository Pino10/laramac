import { execFile } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { dirs } from './paths'
import { isMac } from './platform'

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

/** Creates the local certificate authority once. Browsers trust it after trustCa(). */
export async function ensureCa(): Promise<void> {
  if (existsSync(caKey()) && existsSync(caCertPath())) return
  mkdirSync(dirs.certs(), { recursive: true })
  const cnf = join(dirs.certs(), 'ca.cnf')
  writeFileSync(
    cnf,
    [
      '[req]',
      'distinguished_name = req_dn',
      'prompt = no',
      '[req_dn]',
      'CN = Laramac Local CA',
      'O = Laramac',
      '[v3_ca]',
      'basicConstraints = critical,CA:TRUE',
      'keyUsage = critical,keyCertSign,cRLSign',
      'subjectKeyIdentifier = hash',
      ''
    ].join('\n')
  )
  await openssl(['genrsa', '-out', caKey(), '2048'])
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
}

export function certFor(domain: string): { cert: string; key: string } | undefined {
  const cert = join(dirs.certs(), `${domain}.crt`)
  const key = join(dirs.certs(), `${domain}.key`)
  return existsSync(cert) && existsSync(key) ? { cert, key } : undefined
}

/** Issues a certificate for `domain` and `*.domain`, signed by the local CA. */
export async function ensureSiteCert(domain: string): Promise<{ cert: string; key: string }> {
  const existing = certFor(domain)
  if (existing) return existing

  await ensureCa()
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
