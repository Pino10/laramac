import { execFile } from 'child_process'
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

/** Opens a public link to a local site. Needs the web server to be running. */
export async function shareSite(site: SiteInfo): Promise<string> {
  const existing = tunnels.get(site.name)
  if (existing?.proc.running) return existing.url

  const { httpPort, shareProvider } = getSettings()
  if (!(await isPortOpen(httpPort))) {
    throw new Error('Start Nginx first so there is something to share.')
  }
  const tunnel =
    shareProvider === 'ngrok' ? await startNgrok(site, httpPort) : await startCloudflare(site, httpPort)
  tunnels.set(site.name, tunnel)
  tunnel.proc.on('crashed', () => tunnels.delete(site.name))
  return tunnel.url
}

export async function unshareSite(name: string): Promise<void> {
  const t = tunnels.get(name)
  tunnels.delete(name)
  await t?.proc.stop()
}

export async function stopAllTunnels(): Promise<void> {
  await Promise.all([...tunnels.keys()].map(unshareSite))
}
