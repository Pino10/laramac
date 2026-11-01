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
