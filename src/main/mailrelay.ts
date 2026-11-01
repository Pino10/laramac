/**
 * Real mail delivery through Mailpit's relay. Apps keep sending to 127.0.0.1:1025 and Mailpit
 * keeps a copy of everything; it can also pass mail on to a real provider, either every message
 * or only the ones you release from the inbox. The password is encrypted with the Keychain.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { connect } from 'net'
import { join } from 'path'
import type { MailRelay, MailRelayInput } from '../shared/types'
import { dirs } from './paths'
import { MAIL_PRESETS } from '../shared/mail'

interface Stored extends Omit<MailRelay, 'hasPassword'> {
  password?: string
}
interface Crypto {
  available: () => boolean
  encrypt: (s: string) => string
  decrypt: (s: string) => string
}
let crypto: Crypto | null = null
export function setMailCrypto(c: Crypto | null): void {
  crypto = c
}

const file = (): string => join(dirs.root(), 'mail-relay.json')
export const relayConfigFile = (): string => join(dirs.conf(), 'mailpit-relay.yaml')

const DEFAULT: Stored = { mode: 'catch', preset: 'resend', host: '', port: 587, security: 'starttls', username: '', from: '' }

function load(): Stored {
  try {
    return existsSync(file()) ? { ...DEFAULT, ...(JSON.parse(readFileSync(file(), 'utf8')) as Stored) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function getRelay(): MailRelay {
  const { password, ...rest } = load()
  return { ...rest, hasPassword: !!password }
}

export function saveRelay(input: MailRelayInput): MailRelay {
  const cur = load()
  const mode = (['catch', 'release', 'all'] as const).includes(input.mode) ? input.mode : 'catch'
  const host = String(input.host ?? '').trim()
  if (mode !== 'catch' && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error('Enter the SMTP server, like smtp.resend.com.')
  const port = Number(input.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The port must be a number like 587.')
  const security = (['starttls', 'tls', 'none'] as const).includes(input.security) ? input.security : 'starttls'
  const username = String(input.username ?? '').trim().slice(0, 200)
  const from = String(input.from ?? '').trim().slice(0, 200)
  if (from && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(from)) throw new Error('The sender must be an email address, or left empty.')
  let password = cur.password
  if (input.password === null) password = undefined
  else if (typeof input.password === 'string' && input.password) {
    if (!crypto?.available()) throw new Error('The Keychain is not available, so the password cannot be stored safely.')
    password = crypto.encrypt(input.password)
  }
  const preset = MAIL_PRESETS.some((p) => p.id === input.preset) ? input.preset : 'custom'
  const next: Stored = { mode, preset, host, port, security, username, from, ...(password ? { password } : {}) }
  writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 })
  return getRelay()
}

const yamlString = (s: string): string => JSON.stringify(s)

/** Mailpit's relay settings. Written only while relaying, readable only by you. */
export function relayYaml(r: Stored, password: string): string {
  return [
    `host: ${yamlString(r.host)}`,
    `port: ${r.port}`,
    `starttls: ${r.security === 'starttls'}`,
    `tls: ${r.security === 'tls'}`,
    'allow-insecure: false',
    `auth: ${r.username ? 'plain' : 'none'}`,
    ...(r.username ? [`username: ${yamlString(r.username)}`, `password: ${yamlString(password)}`] : []),
    ...(r.from ? [`override-from: ${yamlString(r.from)}`] : [])
  ].join('\n')
}

/** Extra Mailpit arguments for the current mode; also writes or removes the relay file. */
export function mailpitRelayArgs(): string[] {
  const r = load()
  if (r.mode === 'catch' || !r.host) {
    rmSync(relayConfigFile(), { force: true })
    return []
  }
  let password = ''
  try {
    password = r.password && crypto ? crypto.decrypt(r.password) : ''
  } catch {
    password = ''
  }
  writeFileSync(relayConfigFile(), `${relayYaml(r, password)}\n`, { mode: 0o600 })
  return ['--smtp-relay-config', relayConfigFile(), ...(r.mode === 'all' ? ['--smtp-relay-all'] : [])]
}

/** Sends a short test email to Mailpit over plain SMTP on this Mac. */
export function sendTestMail(to: string, port = 1025): Promise<void> {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(to)) return Promise.reject(new Error('Enter an email address.'))
  const from = load().from || 'laramac@localhost'
  const date = new Date().toUTCString()
  const lines = [
    `EHLO laramac`,
    `MAIL FROM:<${from}>`,
    `RCPT TO:<${to}>`,
    'DATA',
    `From: Laramac <${from}>\r\nTo: <${to}>\r\nSubject: Laramac test email\r\nDate: ${date}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis came from Laramac through Mailpit. If it reached your real inbox, delivery works.\r\n.`,
    'QUIT'
  ]
  return new Promise((resolve, reject) => {
    const sock = connect({ host: '127.0.0.1', port })
    let step = -1
    let buf = ''
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error('Mailpit did not answer. Is it running?'))
    }, 10000)
    sock.on('data', (d) => {
      buf += d.toString()
      // Wait for a complete reply (the last line has a space after the code).
      if (!buf.endsWith('\r\n')) return
      const last = buf.trimEnd().split('\r\n').pop() ?? ''
      if (!/^\d{3} /.test(last)) return
      const code = Number(last.slice(0, 3))
      const ok = step === 3 ? code === 354 : code >= 200 && code < 400
      buf = ''
      if (!ok) {
        clearTimeout(timer)
        sock.destroy()
        return reject(new Error(`Mailpit refused the test email (${code}).`))
      }
      step++
      if (step < lines.length) sock.write(`${lines[step]}\r\n`)
      else {
        clearTimeout(timer)
        sock.end()
        resolve()
      }
    })
    sock.on('error', () => {
      clearTimeout(timer)
      reject(new Error('Mailpit is not running.'))
    })
  })
}
