import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listPackages, removePackage } from '../src/main/packages'
import { dirs } from '../src/main/paths'
import { freshEnv } from './helpers'

describe('packages', () => {
  it('lists what is installed with sizes, and removes only what it listed', async () => {
    freshEnv()
    mkdirSync(join(dirs.php('8.4'), 'bin'), { recursive: true })
    writeFileSync(join(dirs.php('8.4'), 'VERSION'), '8.4.27\n')
    writeFileSync(join(dirs.php('8.4'), 'bin', 'php'), Buffer.alloc(300_000))
    mkdirSync(dirs.mysql('8.4.13'), { recursive: true })
    writeFileSync(join(dirs.mysql('8.4.13'), 'mysqld'), Buffer.alloc(100_000))
    writeFileSync(join(dirs.bin(), 'cloudflared'), Buffer.alloc(50_000))
    writeFileSync(join(dirs.downloads(), 'old.tar.gz'), Buffer.alloc(80_000))

    const list = await listPackages()
    const byId = Object.fromEntries(list.map((p) => [p.id, p]))
    expect(byId['php:8.4']).toMatchObject({ group: 'php', detail: '8.4.27' })
    expect(byId['php:8.4'].bytes).toBeGreaterThan(250_000)
    expect(byId['mysql:8.4.13']).toMatchObject({ group: 'database', name: 'MySQL' })
    expect(byId['bin:cloudflared']).toMatchObject({ group: 'tool' })
    expect(byId['cache:downloads'].bytes).toBeGreaterThan(70_000)

    const stopped: string[] = []
    const removedPhp: string[] = []
    const deps = { stopService: async (s: string) => void stopped.push(s), removePhp: async (m: string) => void removedPhp.push(m) }

    await removePackage('mysql:8.4.13', deps as never)
    expect(stopped).toEqual(['mysql'])
    expect(existsSync(dirs.mysql('8.4.13'))).toBe(false)

    await removePackage('cache:downloads', deps as never)
    expect(existsSync(dirs.downloads())).toBe(true)
    expect(readdirSync(dirs.downloads())).toEqual([])

    await removePackage('php:8.4', deps as never)
    expect(removedPhp).toEqual(['8.4'])

    await expect(removePackage('dir:../../etc', deps as never)).rejects.toThrow(/no longer installed/)
    await expect(removePackage('bin:sh', deps as never)).rejects.toThrow(/no longer installed/)
  })
})

describe('MCP server for AI tools', () => {
  it('speaks MCP over HTTP, only with the token and never to browsers', async () => {
    freshEnv()
    const { startMcpServer, mcpToken } = await import('../src/main/mcp')
    const calls: string[] = []
    const port = 53999
    const server = await startMcpServer({
      port,
      version: '0.9.0',
      onCall: (n) => calls.push(n),
      tools: [
        { name: 'list_sites', description: 'Sites', inputSchema: { type: 'object', properties: {} }, run: async () => [{ name: 'shop' }] },
        { name: 'fail', description: 'Fails', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new Error('nope') } }
      ]
    })
    const url = `http://127.0.0.1:${port}/mcp`
    const token = mcpToken()
    const post = (body: object, headers: Record<string, string> = {}): Promise<Response> =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) })
    try {
      const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json()
      expect(init.result.protocolVersion).toBe('2025-06-18')
      expect(init.result.serverInfo.name).toBe('laramac')
      expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

      const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
      expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['list_sites', 'fail'])

      const call = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_sites', arguments: {} } })).json()
      expect(JSON.parse(call.result.content[0].text)).toEqual([{ name: 'shop' }])
      const bad = await (await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fail', arguments: {} } })).json()
      expect(bad.result).toMatchObject({ isError: true, content: [{ text: 'nope' }] })
      expect(calls).toEqual(['list_sites', 'fail'])

      expect((await post({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, { Authorization: 'Bearer wrong' })).status).toBe(401)
      expect((await post({ jsonrpc: '2.0', id: 6, method: 'tools/list' }, { Origin: 'https://evil.example' })).status).toBe(401)
      const noAuth = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      expect(noAuth.status).toBe(401)
    } finally {
      server.close()
    }
  })
})

describe('host names', () => {
  it('cleans extra site names and rewrites only its own block of /etc/hosts', async () => {
    const { cleanAlias, needsHostsEntry, withHostsBlock } = await import('../src/main/hosts')
    expect(cleanAlias(' Shop.Local. ')).toBe('shop.local')
    for (const bad of ['localhost', 'shop', '-a.test', 'a b.test', 'x.test;rm', '1.2.3.4', 'evil.test\n127.0.0.1 bank.com']) {
      expect(() => cleanAlias(bad)).toThrow()
    }
    expect(needsHostsEntry('shop.local', 'test')).toBe(true)
    expect(needsHostsEntry('api.shop.test', 'test')).toBe(false)
    expect(needsHostsEntry('shop.localhost', 'test')).toBe(false)

    const original = '127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n::1 localhost\n'
    const once = withHostsBlock(original, ['shop.local', 'radio.dev.internal'])
    expect(once).toContain('127.0.0.1 shop.local\n::1 shop.local')
    expect(once.startsWith(original.trimEnd())).toBe(true)
    // Rewriting replaces the block instead of adding another, and removing all names removes it.
    expect(withHostsBlock(once, ['shop.local', 'radio.dev.internal'])).toBe(once)
    expect(withHostsBlock(once, [])).toBe(original)
  })

  it('links /tmp/mysql.sock to Laramac only when nobody else owns it', async () => {
    const { mkdtempSync, symlinkSync, writeFileSync, readlinkSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { linkSharedSocket } = await import('../src/main/svc/mysql')
    const dir = mkdtempSync(join(tmpdir(), 'lm-sock-'))
    const ours = join(dir, '.laramac-run-mysql.sock')
    writeFileSync(ours, '')
    expect(linkSharedSocket(ours, join(dir, 'a.sock'))).toBe('linked')
    expect(readlinkSync(join(dir, 'a.sock'))).toBe(ours)
    expect(linkSharedSocket(ours, join(dir, 'a.sock'))).toBe('kept')
    writeFileSync(join(dir, 'real.sock'), '')
    expect(linkSharedSocket(ours, join(dir, 'real.sock'))).toBe('taken')
    const other = join(dir, 'homebrew-mysql.sock')
    writeFileSync(other, '')
    symlinkSync(other, join(dir, 'b.sock'))
    expect(linkSharedSocket(ours, join(dir, 'b.sock'))).toBe('taken')
    symlinkSync(join(dir, 'gone.sock'), join(dir, 'c.sock'))
    expect(linkSharedSocket(ours, join(dir, 'c.sock'))).toBe('linked')
  })
})

const PYFTP = (await import('child_process')).spawnSync('python3', ['-c', 'import pyftpdlib']).status === 0
describe.skipIf(!PYFTP)('FTP servers', () => {
  it('browses and deploys over FTP with a Keychain password', async () => {
    const { spawn } = await import('child_process')
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('fs')
    const { tmpdir } = await import('os')
    const ssh = await import('../src/main/ssh')
    const { deploy, cleanRemotePath } = await import('../src/main/deploy')
    const { waitForPort } = await import('../src/main/process')
    freshEnv()
    const home = mkdtempSync(join(tmpdir(), 'lm-ftp-'))
    const port = 2121
    const server = spawn('python3', ['-m', 'pyftpdlib', '-p', String(port), '-u', 'deploy', '-P', 'hunter2-long', '-d', home, '-w', '-i', '127.0.0.1'], { stdio: 'ignore' })
    try {
      expect(await waitForPort(port, 10000)).toBe(true)
      const crypto = { available: () => true, encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }
      const id = ssh.saveServer({ name: 'Shared host', host: '127.0.0.1', port, user: 'deploy', auth: 'password', password: 'hunter2-long', protocol: 'ftp' }, crypto)[0].id
      expect(ssh.listServers()[0]).toMatchObject({ protocol: 'ftp', hasPassword: true })

      const site = mkdtempSync(join(tmpdir(), 'lm-ftp-site-'))
      mkdirSync(join(site, 'assets'))
      writeFileSync(join(site, 'index.php'), 'hello ftp')
      writeFileSync(join(site, 'assets', 'app.css'), 'body{}')
      writeFileSync(join(site, '.env'), 'x')
      const fs = await ssh.openFs(id, null, crypto)
      try {
        const res = await deploy(fs, site, cleanRemotePath('public_html/'), {}, () => undefined)
        expect(res.uploaded).toBe(2)
        expect(readFileSync(join(home, 'public_html', 'assets', 'app.css'), 'utf8')).toBe('body{}')
        expect(existsSync(join(home, 'public_html', '.env'))).toBe(false)
        expect((await deploy(fs, site, 'public_html', {}, () => undefined)).uploaded).toBe(0)
      } finally {
        fs.close()
      }

      const conn = await ssh.connectSftp(id, null, crypto)
      expect(conn.status).toBe('connected')
      if (conn.status === 'connected') {
        const listing = await ssh.listDir(conn.session, 'public_html')
        expect(listing.entries.map((e) => `${e.type}:${e.name}`)).toEqual(['dir:assets', 'file:index.php'])
        ssh.disconnect(conn.session)
      }
      expect(() => cleanRemotePath('/')).toThrow()
      expect(() => cleanRemotePath('www/../../etc')).toThrow()
    } finally {
      server.kill()
    }
  })
})
