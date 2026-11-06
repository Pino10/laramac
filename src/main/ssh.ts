import { createHash, randomBytes } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, posix } from 'path'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { Client as FtpClient } from 'basic-ftp'
import { ftpFs, sftpFs, type RemoteFs } from './remotefs'
import { StringDecoder } from 'string_decoder'
import type { HealthOpenResult, ServerHealth, SftpConnectResult, SftpEntry, SftpListing, SshServer, SshServerInput, SshShellResult } from '../shared/types'
import { dirs } from './paths'
import { HEALTH_COMMAND, parseHealth } from './serverhealth'
import { openTerminal, shellQuote } from './integrations'

/**
 * Saved SSH servers and an SFTP file browser.
 * - Passwords are encrypted with the macOS Keychain (Electron safeStorage) and never leave the main process.
 * - Host keys are pinned on first use: Laramac shows the fingerprint, you confirm it, and any later
 *   change is refused, which is how a man-in-the-middle would show up.
 */

export interface Crypto {
  available: () => boolean
  encrypt: (s: string) => string
  decrypt: (s: string) => string
}

interface Stored extends Omit<SshServer, 'hasPassword'> {
  passwordEnc?: string
}

const file = (): string => join(dirs.root(), 'servers.json')

function load(): Stored[] {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Stored[]) : []
  } catch {
    return []
  }
}

function save(list: Stored[]): void {
  mkdirSync(dirs.root(), { recursive: true, mode: 0o700 })
  writeFileSync(file(), JSON.stringify(list, null, 2), { mode: 0o600 })
  chmodSync(file(), 0o600)
}

const publicView = (s: Stored): SshServer => {
  const { passwordEnc, ...rest } = s
  return { ...rest, protocol: s.protocol ?? 'sftp', hasPassword: !!passwordEnc }
}

export function listServers(): SshServer[] {
  return load().map(publicView)
}

const HOST = /^[A-Za-z0-9.-]{1,253}$|^\[?[0-9a-fA-F:]+\]?$/
const USER = /^[A-Za-z0-9._-]{1,64}$/

export function validateServer(input: SshServerInput): void {
  if (!input.name?.trim() || input.name.length > 80) throw new Error('Give the server a name.')
  if (!HOST.test(input.host ?? '')) throw new Error('That host name is not valid.')
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('Ports are 1 to 65535.')
  if (!USER.test(input.user ?? '')) throw new Error('That user name is not valid.')
  if (!['agent', 'key', 'password'].includes(input.auth)) throw new Error('Choose how to sign in.')
  if (input.protocol !== undefined && !['sftp', 'ftp', 'ftps'].includes(input.protocol)) throw new Error('Choose SFTP, FTP or FTPS.')
  if ((input.protocol === 'ftp' || input.protocol === 'ftps') && input.auth !== 'password') throw new Error('FTP servers sign in with a password.')
  if (input.auth === 'key' && (!input.keyPath || input.keyPath.includes('\0'))) throw new Error('Choose a key file.')
}

export function saveServer(input: SshServerInput, crypto: Crypto): SshServer[] {
  validateServer(input)
  const list = load()
  const existing = input.id ? list.find((s) => s.id === input.id) : undefined
  const next: Stored = {
    id: existing?.id ?? randomBytes(6).toString('hex'),
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port,
    user: input.user.trim(),
    protocol: input.protocol ?? 'sftp',
    auth: input.auth,
    keyPath: input.auth === 'key' ? input.keyPath : undefined,
    // A different host or port is a different machine: forget the pinned key.
    hostKey: existing && existing.host === input.host.trim() && existing.port === input.port ? existing.hostKey : undefined,
    passwordEnc: input.auth === 'password' ? existing?.passwordEnc : undefined
  }
  if (input.auth === 'password' && input.password) {
    if (!crypto.available()) throw new Error('The macOS Keychain is not available, so the password cannot be stored safely.')
    next.passwordEnc = crypto.encrypt(input.password)
  }
  save(existing ? list.map((s) => (s.id === next.id ? next : s)) : [...list, next])
  return listServers()
}

export function deleteServer(id: string): SshServer[] {
  save(load().filter((s) => s.id !== id))
  return listServers()
}

export function trustHostKey(id: string, fingerprint: string): SshServer[] {
  if (!/^SHA256:[A-Za-z0-9+/=]{20,}$/.test(fingerprint)) throw new Error('That fingerprint is not valid.')
  save(load().map((s) => (s.id === id ? { ...s, hostKey: fingerprint } : s)))
  return listServers()
}

function server(id: string): Stored {
  const s = load().find((x) => x.id === id)
  if (!s) throw new Error('That server is not saved.')
  return s
}

/** Uses your system ssh in Terminal, so your ~/.ssh/config, keys and known_hosts all apply. */
export function openSshTerminal(id: string): Promise<void> {
  const s = server(id)
  const parts = ['ssh', '-p', String(s.port)]
  if (s.auth === 'key' && s.keyPath) parts.push('-i', shellQuote(s.keyPath))
  parts.push(shellQuote(`${s.user}@${s.host}`))
  return openTerminal(homedir(), parts.join(' '))
}

export function fingerprintOf(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
}

// ---------------------------------------------------------------- SFTP sessions

interface Session {
  fs: RemoteFs
}
const sessions = new Map<string, Session>()

function session(id: string): Session {
  const s = sessions.get(id)
  if (!s) throw new Error('The connection was closed. Open the server again.')
  return s
}

type Opened = { client: Client } | { status: 'unknown-host'; fingerprint: string }

/** Signs in to a saved server, refusing unknown or changed host keys. */
async function openClient(id: string, passphrase: string | null, crypto: Crypto): Promise<Opened> {
  const s = server(id)
  let seen = ''
  const config: ConnectConfig = {
    host: s.host,
    port: s.port,
    username: s.user,
    readyTimeout: 20000,
    keepaliveInterval: 30000,
    hostVerifier: (key: Buffer) => {
      seen = fingerprintOf(key)
      return !!s.hostKey && s.hostKey === seen
    }
  }
  if (s.auth === 'agent') {
    if (!process.env.SSH_AUTH_SOCK) throw new Error('No SSH agent is running. Choose a key file or a password instead.')
    config.agent = process.env.SSH_AUTH_SOCK
  } else if (s.auth === 'key') {
    config.privateKey = readFileSync(s.keyPath!)
    if (passphrase) config.passphrase = passphrase
  } else {
    if (!s.passwordEnc) throw new Error('No password is saved for this server.')
    config.password = crypto.decrypt(s.passwordEnc)
  }

  const client = new Client()
  const outcome = await new Promise<Opened | Error>((resolve) => {
    client.once('ready', () => resolve({ client }))
    client.once('error', (err) => {
      if (seen && s.hostKey && s.hostKey !== seen) {
        resolve(new Error(`The server's identity changed (now ${seen}). This can mean someone is intercepting the connection. Laramac refused to connect.`))
      } else if (seen && !s.hostKey) {
        resolve({ status: 'unknown-host', fingerprint: seen })
      } else {
        resolve(err)
      }
    })
    client.connect(config)
  })
  if (outcome instanceof Error) {
    client.end()
    throw new Error(outcome.message.replace(/^All configured authentication methods failed$/, 'The server refused the sign-in.'))
  }
  if (!('client' in outcome)) client.end()
  return outcome
}

export async function connectSftp(id: string, passphrase: string | null, crypto: Crypto): Promise<SftpConnectResult> {
  if (server(id).protocol === 'ftp' || server(id).protocol === 'ftps') {
    const fs = await connectFtp(id, crypto)
    const sid = randomBytes(8).toString('hex')
    sessions.set(sid, { fs })
    return { status: 'connected', session: sid, home: await fs.realpath('.') }
  }
  const opened = await openClient(id, passphrase, crypto)
  if (!('client' in opened)) return opened
  const { client } = opened
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) {
        client.end()
        return reject(err)
      }
      const sid = randomBytes(8).toString('hex')
      sessions.set(sid, { fs: sftpFs(sftp, () => client.end()) })
      sftp.realpath('.', (e, home) => resolve({ status: 'connected', session: sid, home: e ? '/' : home }))
    })
  })
}

// ------------------------------------------------------------ health

const healthClients = new Map<string, Client>()

/** One quiet connection kept open for a Health tab, so it does not log in again every few seconds. */
export async function openHealth(id: string, passphrase: string | null, crypto: Crypto): Promise<HealthOpenResult> {
  // Servers saved by older versions have no protocol: they are SSH (SFTP) servers.
  if ((server(id).protocol ?? 'sftp') !== 'sftp') throw new Error('Health needs a server you connect to with SSH.')
  const opened = await openClient(id, passphrase, crypto)
  if (!('client' in opened)) return opened
  const sid = randomBytes(8).toString('hex')
  healthClients.set(sid, opened.client)
  opened.client.once('close', () => healthClients.delete(sid))
  return { status: 'connected', session: sid }
}

export function sampleHealth(sid: string): Promise<ServerHealth> {
  const client = healthClients.get(sid)
  if (!client) return Promise.reject(new Error('The connection was closed. Open the server again.'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The server took too long to answer.')), 15000)
    client.exec(HEALTH_COMMAND, (err, stream) => {
      if (err) {
        clearTimeout(timer)
        return reject(err)
      }
      let out = ''
      stream.on('data', (d: Buffer) => {
        if (out.length < 200_000) out += d.toString('utf8')
      })
      stream.stderr.on('data', () => undefined)
      stream.on('close', () => {
        clearTimeout(timer)
        if (!out.includes('#up')) return reject(new Error('This server did not answer like a Linux machine, so its health cannot be read.'))
        resolve(parseHealth(out))
      })
    })
  })
}

export function closeHealth(sid: string): void {
  const c = healthClients.get(sid)
  healthClients.delete(sid)
  c?.end()
}

// ------------------------------------------------------------ terminal

interface Shell {
  client: Client
  stream: ClientChannel
}
const shells = new Map<string, Shell>()

/** Opens an interactive shell; output and the end of the session come back through the callbacks. */
export async function openShell(
  id: string,
  passphrase: string | null,
  crypto: Crypto,
  size: { cols: number; rows: number },
  onData: (sid: string, data: string) => void,
  onExit: (sid: string) => void
): Promise<SshShellResult> {
  const opened = await openClient(id, passphrase, crypto)
  if (!('client' in opened)) return opened
  const { client } = opened
  const cols = clampSize(size.cols, 20, 500, 80)
  const rows = clampSize(size.rows, 5, 200, 24)
  return new Promise((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) {
        client.end()
        return reject(new Error(`The server would not open a shell: ${err.message}`))
      }
      const sid = randomBytes(8).toString('hex')
      shells.set(sid, { client, stream })
      const decoder = new StringDecoder('utf8')
      const errDecoder = new StringDecoder('utf8')
      stream.on('data', (d: Buffer) => onData(sid, decoder.write(d)))
      stream.stderr.on('data', (d: Buffer) => onData(sid, errDecoder.write(d)))
      const finish = (): void => {
        if (!shells.has(sid)) return
        shells.delete(sid)
        client.end()
        onExit(sid)
      }
      stream.on('close', finish)
      client.on('close', finish)
      resolve({ status: 'connected', session: sid })
    })
  })
}

function clampSize(n: unknown, min: number, max: number, fallback: number): number {
  return typeof n === 'number' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function writeShell(sid: string, data: string): void {
  shells.get(sid)?.stream.write(data)
}

export function resizeShell(sid: string, cols: number, rows: number): void {
  shells.get(sid)?.stream.setWindow(clampSize(rows, 5, 200, 24), clampSize(cols, 20, 500, 80), 0, 0)
}

export function closeShell(sid: string): void {
  const sh = shells.get(sid)
  if (!sh) return
  shells.delete(sid)
  sh.stream.end()
  sh.client.end()
}

export async function listDir(sid: string, path: string): Promise<SftpListing> {
  const { fs } = session(sid)
  const real = await fs.realpath(path)
  return { path: real, entries: await fs.list(real) }
}

/** Downloads files into `localDir`. Remote names are reduced to a plain file name so nothing lands outside it. */
export async function download(sid: string, remotePaths: string[], localDir: string): Promise<number> {
  const { fs } = session(sid)
  let n = 0
  for (const remote of remotePaths) {
    const name = basename(posix.basename(remote)).replace(/^\.+$/, '')
    if (!name) continue
    await fs.get(remote, join(localDir, name))
    n++
  }
  return n
}

export async function upload(sid: string, localFiles: string[], remoteDir: string): Promise<number> {
  const { fs } = session(sid)
  for (const local of localFiles) await fs.put(local, posix.join(remoteDir, basename(local)))
  return localFiles.length
}

const safeName = (name: string): string => {
  if (!name || name.includes('/') || name === '.' || name === '..') throw new Error('Use a plain name without slashes.')
  return name
}

export const mkdir = async (sid: string, dir: string, name: string): Promise<void> => session(sid).fs.mkdir(posix.join(dir, safeName(name)))

export const rename = async (sid: string, from: string, toName: string): Promise<void> => session(sid).fs.rename(from, posix.join(posix.dirname(from), safeName(toName)))

export const remove = async (sid: string, path: string, isDir: boolean): Promise<void> => session(sid).fs.remove(path, isDir)

/** The open file connection of a browser session. */
export const sessionFs = (sid: string): RemoteFs => session(sid).fs

/** Opens a server's files for Deploy, over SFTP or FTP. */
export async function openFs(id: string, passphrase: string | null, crypto: Crypto): Promise<RemoteFs> {
  const s = server(id)
  if (s.protocol === 'ftp' || s.protocol === 'ftps') return connectFtp(id, crypto)
  const opened = await openClient(id, passphrase, crypto)
  if (!('client' in opened)) throw new Error(`Open ${s.name} under Servers once to confirm its identity, then deploy again.`)
  const { client } = opened
  return new Promise((resolve, reject) =>
    client.sftp((err, sftp) => {
      if (err) {
        client.end()
        return reject(err)
      }
      resolve(sftpFs(sftp, () => client.end()))
    })
  )
}

async function connectFtp(id: string, crypto: Crypto): Promise<RemoteFs> {
  const s = server(id)
  if (!s.passwordEnc) throw new Error('No password is saved for this server.')
  const client = new FtpClient(30000)
  try {
    await client.access({
      host: s.host,
      port: s.port,
      user: s.user,
      password: crypto.decrypt(s.passwordEnc),
      secure: s.protocol === 'ftps'
    })
  } catch (err) {
    client.close()
    const msg = (err as Error).message
    throw new Error(/530/.test(msg) ? 'The server refused the sign-in.' : /TLS|SSL|AUTH/i.test(msg) && s.protocol === 'ftps' ? `This server does not offer FTPS: ${msg}` : msg)
  }
  return ftpFs(client)
}

export function disconnect(sid: string): void {
  sessions.get(sid)?.fs.close()
  sessions.delete(sid)
}

export function disconnectAll(): void {
  for (const sid of [...healthClients.keys()]) closeHealth(sid)
  for (const sid of [...sessions.keys()]) disconnect(sid)
  for (const sid of [...shells.keys()]) closeShell(sid)
}
