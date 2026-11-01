import { execFile } from 'child_process'
import http from 'http'
import net from 'net'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { SiteInfo } from '../shared/types'
import { dirs } from './paths'
import { getSettings } from './settings'
import { ManagedProcess, isPortOpen } from './process'
import { cloudflaredBinary, installCloudflared, installNgrok, ngrokBinary } from './tools'

interface Tunnel {
  proc: ManagedProcess
  url: string
  /** The relay in front of SSH tunnels, closed with them. */
  relay?: { close: () => void }
}

const tunnels = new Map<string, Tunnel>()

export function shareUrls(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, t] of tunnels) out[name] = t.url
  return out
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitForUrl(read: () => Promise<string | null>, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const url = await read()
    if (url) return url
    await sleep(500)
  }
  throw new Error('The sharing tunnel did not produce a public link in time.')
}

async function startCloudflare(site: SiteInfo, port: number): Promise<Tunnel> {
  if (!existsSync(cloudflaredBinary())) await installCloudflared()
  const logFile = join(dirs.logs(), `tunnel-${site.name}.log`)
  rmSync(logFile, { force: true })
  const proc = new ManagedProcess(`Tunnel ${site.name}`)
  await proc.start({
    command: cloudflaredBinary(),
    args: [
      'tunnel',
      '--no-autoupdate',
      '--url',
      `http://127.0.0.1:${port}`,
      '--http-host-header',
      site.domain
    ],
    logFile
  })
  const url = await waitForUrl(async () => {
    if (!existsSync(logFile)) return null
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(readFileSync(logFile, 'utf8'))
    return m ? m[0] : null
  }, 40000).catch(async (err) => {
    await proc.stop()
    throw err
  })
  return { proc, url }
}

function ngrokConfigureToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ngrokBinary(), ['config', 'add-authtoken', token], (err, _o, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve()
    )
  })
}

async function startNgrok(site: SiteInfo, port: number): Promise<Tunnel> {
  const { ngrokToken } = getSettings()
  if (!ngrokToken) throw new Error('Add your ngrok authtoken in Settings first.')
  if (!existsSync(ngrokBinary())) await installNgrok()
  await ngrokConfigureToken(ngrokToken)

  const logFile = join(dirs.logs(), `tunnel-${site.name}.log`)
  rmSync(logFile, { force: true })
  const proc = new ManagedProcess(`Tunnel ${site.name}`)
  await proc.start({
    command: ngrokBinary(),
    args: ['http', String(port), `--host-header=${site.domain}`, '--log=stdout'],
    logFile
  })
  const url = await waitForUrl(async () => {
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels')
      const data = (await res.json()) as { tunnels: { public_url: string }[] }
      return data.tunnels.find((t) => t.public_url.startsWith('https://'))?.public_url ?? null
    } catch {
      return null
    }
  }, 30000).catch(async (err) => {
    await proc.stop()
    throw err
  })
  return { proc, url }
}

/**
 * A tiny relay for tunnels that cannot set the Host header themselves. It sends every request
 * to the web server as this one site, so a tunnel can never reach any other site or the
 * folder listing at localhost. WebSockets pass through too.
 */
export function startHostRelay(domain: string, targetPort: number): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const headers = { ...req.headers, host: domain, 'x-forwarded-host': req.headers.host ?? '', 'x-forwarded-proto': 'https' }
      const up = http.request({ host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers)
        r.pipe(res)
      })
      up.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
        res.end('The site is not answering. Is the web server running in Laramac?')
      })
      req.pipe(up)
    })
    server.on('upgrade', (req, socket, head) => {
      const up = net.connect(targetPort, '127.0.0.1', () => {
        const lines = [`${req.method} ${req.url} HTTP/1.1`]
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === 'host') continue
          for (const val of Array.isArray(v) ? v : [v]) if (val !== undefined) lines.push(`${k}: ${val}`)
        }
        lines.push(`host: ${domain}`)
        up.write(`${lines.join('\r\n')}\r\n\r\n`)
        if (head.length) up.write(head)
        up.pipe(socket)
        socket.pipe(up)
      })
      up.on('error', () => socket.destroy())
      socket.on('error', () => up.destroy())
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve({ port: typeof addr === 'object' && addr ? addr.port : 0, close: () => server.close() })
    })
  })
}

/** The public link in an SSH tunnel's output. */
export function findTunnelUrl(provider: 'localhostrun' | 'pinggy', text: string): string | null {
  const re = provider === 'localhostrun' ? /https:\/\/[a-z0-9-]+\.lhr\.(?:life|pro)/i : /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pinggy\.(?:link|online|io)/i
  return re.exec(text)?.[0] ?? null
}

/** localhost.run and Pinggy: free public links over SSH, no account or download. */
async function startSshTunnel(site: SiteInfo, port: number, provider: 'localhostrun' | 'pinggy'): Promise<Tunnel> {
  const relay = await startHostRelay(site.domain, port)
  const logFile = join(dirs.logs(), `tunnel-${site.name}.log`)
  rmSync(logFile, { force: true })
  const common = [
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${join(dirs.conf(), 'tunnel_known_hosts')}`,
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'IdentityFile=/dev/null',
    '-T'
  ]
  const args =
    provider === 'localhostrun'
      ? [...common, '-R', `80:127.0.0.1:${relay.port}`, 'nokey@localhost.run']
      : [...common, '-p', '443', '-R', `0:127.0.0.1:${relay.port}`, 'a.pinggy.io']
  const proc = new ManagedProcess(`Tunnel ${site.name}`)
  await proc.start({ command: '/usr/bin/ssh', args, logFile })
  try {
    const url = await waitForUrl(async () => (existsSync(logFile) ? findTunnelUrl(provider, readFileSync(logFile, 'utf8')) : null), 30000)
    return { proc, url, relay }
  } catch (err) {
    await proc.stop()
    relay.close()
    throw err
  }
}

/** Opens a public link to a local site. Needs the web server to be running. */
export async function shareSite(site: SiteInfo): Promise<string> {
  const existing = tunnels.get(site.name)
  if (existing?.proc.running) return existing.url

  const { httpPort, shareProvider } = getSettings()
  if (!(await isPortOpen(httpPort))) {
    throw new Error('Start the web server first so there is something to share.')
  }
  const tunnel =
    shareProvider === 'ngrok'
      ? await startNgrok(site, httpPort)
      : shareProvider === 'localhostrun' || shareProvider === 'pinggy'
        ? await startSshTunnel(site, httpPort, shareProvider)
        : await startCloudflare(site, httpPort)
  tunnels.set(site.name, tunnel)
  tunnel.proc.on('crashed', () => {
    tunnels.delete(site.name)
    tunnel.relay?.close()
  })
  return tunnel.url
}

export async function unshareSite(name: string): Promise<void> {
  const t = tunnels.get(name)
  tunnels.delete(name)
  await t?.proc.stop()
  t?.relay?.close()
}

export async function stopAllTunnels(): Promise<void> {
  await Promise.all([...tunnels.keys()].map(unshareSite))
}
