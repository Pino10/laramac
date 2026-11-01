import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { getSettings } from '../settings'
import { downloadFile, extract, removeQuarantine, urlExists } from '../download'
import { jobs } from '../jobs'
import { brewPrefix, goArch } from '../platform'
import { brew } from '../brew'
import { bundledBinaryUrl } from '../versions'
import { fastcgiParams, generateApacheConf, generateNginxConf } from '../configgen'
import { ManagedProcess, isPortOpen } from '../process'
import { buildHostConfs } from '../webconf'
import { ensurePhpRunning } from './php'

/** The main server gets the standard ports; the other one runs beside it on its own ports. */
export function portsFor(server: 'apache' | 'nginx'): { http: number; https: number } {
  const s = getSettings()
  return s.primaryServer === server
    ? { http: s.httpPort, https: s.httpsPort }
    : { http: s.secondaryHttpPort, https: s.secondaryHttpsPort }
}

async function assertPortFree(port: number): Promise<void> {
  if (await isPortOpen(port)) {
    throw new Error(`Port ${port} is already in use by another program. Quit it, or change the port in Settings.`)
  }
}

// ---------------------------------------------------------------- Nginx

const nginxProc = new ManagedProcess('Nginx')
const nginxConf = (): string => join(dirs.conf(), 'nginx.conf')

export function nginxBinary(): string | null {
  const own = join(dirs.bin(), 'nginx')
  if (existsSync(own)) return own
  const prefix = brewPrefix()
  if (prefix && existsSync(join(prefix, 'bin', 'nginx'))) return join(prefix, 'bin', 'nginx')
  return null
}

async function writeNginxConf(): Promise<void> {
  const settings = getSettings()
  const hosts = await buildHostConfs()
  const tmp = join(dirs.run(), 'nginx-tmp')
  for (const d of ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) {
    mkdirSync(join(tmp, d), { recursive: true })
  }
  const paramsFile = join(dirs.conf(), 'fastcgi_params')
  writeFileSync(paramsFile, fastcgiParams())
  writeFileSync(
    nginxConf(),
    generateNginxConf({
      sites: hosts.sites,
      extras: hosts.extras,
      httpPort: portsFor('nginx').http,
      httpsPort: portsFor('nginx').https,
      pidFile: join(dirs.run(), 'nginx.pid'),
      errorLog: join(dirs.logs(), 'nginx-error.log'),
      accessLog: join(dirs.logs(), 'nginx-access.log'),
      fastcgiParamsFile: paramsFile,
      tempDir: tmp,
      allowLan: settings.allowLan
    })
  )
}

export const nginx: ServiceImpl = {
  id: 'nginx',
  name: 'Nginx',
  description: 'Fast web server, runs beside Apache',
  port: () => portsFor('nginx').http,
  installed: () => nginxBinary() !== null,
  version: () => undefined,
  running: () => nginxProc.running,

  async install() {
    await jobs.run('Installing Nginx', async (update) => {
      const url = bundledBinaryUrl('nginx', goArch())
      if (await urlExists(url)) {
        const archive = join(dirs.downloads(), 'nginx.tar.gz')
        await downloadFile(url, archive, (p) => update(p, 'Downloading Nginx'))
        await extract(archive, dirs.bin())
        chmodSync(join(dirs.bin(), 'nginx'), 0o755)
        await removeQuarantine(join(dirs.bin(), 'nginx'))
        rmSync(archive, { force: true })
        return
      }
      update(null, 'Installing Nginx with Homebrew')
      await brew(['install', 'nginx'], (line) => update(null, `Nginx: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const bin = nginxBinary()
    if (!bin) throw new Error('Nginx is not installed.')
    const port = portsFor('nginx').http
    await assertPortFree(port)
    await ensurePhpRunning().catch(() => undefined)
    await writeNginxConf()
    await nginxProc.start(
      {
        command: bin,
        args: ['-c', nginxConf(), '-p', dirs.run(), '-e', join(dirs.logs(), 'nginx-error.log')],
        logFile: join(dirs.logs(), 'nginx.log')
      },
      port
    )
  },

  stop: () => nginxProc.stop(),

  async reload() {
    if (!nginxProc.running) return
    await writeNginxConf()
    nginxProc.signal('SIGHUP')
  }
}

// ---------------------------------------------------------------- Apache

const apacheProc = new ManagedProcess('Apache')
const apacheConf = (): string => join(dirs.conf(), 'httpd.conf')
const ownApache = (): string => join(dirs.root(), 'apache')

interface ApacheLayout {
  bin: string
  modulesDir: string
  mimeTypesFile?: string
  serverRoot: string
}

export function apacheLayout(): ApacheLayout | null {
  const own = join(ownApache(), 'bin', 'httpd')
  if (existsSync(own)) {
    return { bin: own, modulesDir: join(ownApache(), 'modules'), serverRoot: ownApache() }
  }
  const prefix = brewPrefix()
  if (!prefix) return null
  const link = join(prefix, 'bin', 'httpd')
  if (!existsSync(link)) return null
  const real = realpathSync(link)
  const cellar = dirname(dirname(real))
  const modulesDir = join(cellar, 'lib', 'httpd', 'modules')
  const mime = join(prefix, 'etc', 'httpd', 'mime.types')
  return {
    bin: link,
    modulesDir,
    mimeTypesFile: existsSync(mime) ? mime : undefined,
    serverRoot: cellar
  }
}

async function writeApacheConf(layout: ApacheLayout): Promise<void> {
  const settings = getSettings()
  const hosts = await buildHostConfs()
  writeFileSync(
    apacheConf(),
    generateApacheConf({
      sites: hosts.sites,
      extras: hosts.extras,
      port: portsFor('apache').http,
      httpsPort: portsFor('apache').https,
      modulesDir: layout.modulesDir,
      mimeTypesFile: layout.mimeTypesFile,
      pidFile: join(dirs.run(), 'httpd.pid'),
      errorLog: join(dirs.logs(), 'apache-error.log'),
      accessLog: join(dirs.logs(), 'apache-access.log'),
      serverRoot: layout.serverRoot,
      allowLan: settings.allowLan
    })
  )
}

export const apache: ServiceImpl = {
  id: 'apache',
  name: 'Apache',
  description: 'Web server for your sites, with .htaccess support',
  port: () => portsFor('apache').http,
  installed: () => apacheLayout() !== null,
  version: () => undefined,
  running: () => apacheProc.running,

  async install() {
    await jobs.run('Installing Apache', async (update) => {
      const url = bundledBinaryUrl('httpd', goArch())
      if (await urlExists(url)) {
        const archive = join(dirs.downloads(), 'httpd.tar.gz')
        const staging = join(dirs.downloads(), 'httpd-staging')
        rmSync(staging, { recursive: true, force: true })
        await downloadFile(url, archive, (p) => update(p, 'Downloading Apache'))
        await extract(archive, staging)
        const inner = readdirSync(staging)[0]
        rmSync(ownApache(), { recursive: true, force: true })
        renameSync(join(staging, inner), ownApache())
        chmodSync(join(ownApache(), 'bin', 'httpd'), 0o755)
        await removeQuarantine(ownApache())
        rmSync(staging, { recursive: true, force: true })
        rmSync(archive, { force: true })
        return
      }
      update(null, 'Installing Apache with Homebrew')
      await brew(['install', 'httpd'], (line) => update(null, `Apache: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const layout = apacheLayout()
    if (!layout) throw new Error('Apache is not installed.')
    const port = portsFor('apache').http
    await assertPortFree(port)
    await ensurePhpRunning().catch(() => undefined)
    await writeApacheConf(layout)
    await apacheProc.start(
      {
        command: layout.bin,
        args: ['-f', apacheConf(), '-D', 'FOREGROUND'],
        logFile: join(dirs.logs(), 'apache.log')
      },
      port
    )
  },

  stop: () => apacheProc.stop(),

  async reload() {
    const layout = apacheLayout()
    if (!layout || !apacheProc.running) return
    await apacheProc.stop()
    await apache.start()
  }
}
