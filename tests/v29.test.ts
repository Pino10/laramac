import { execFile, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { dirs } from '../src/main/paths'

describe('the Claude app connection', () => {
  it('writes a command that needs no Node.js and keeps the token out of the config', async () => {
    const home = freshEnv().root
    process.env.HOME = home
    const { connectClaudeDesktop, desktopBridgePath, desktopConfigPath, repairClaudeDesktop } = await import('../src/main/desktop')
    mkdirSync(join(home, 'Library', 'Application Support', 'Claude'), { recursive: true })
    writeFileSync(desktopConfigPath(), JSON.stringify({ mcpServers: { other: { command: 'x' }, laramac: { command: 'npx', args: ['-y', 'mcp-remote'], env: { LARAMAC_AUTH: 'Bearer secret' } } }, theme: 'dark' }))
    expect(repairClaudeDesktop('http://127.0.0.1:53536/mcp', join(dirs.root(), 'mcp-token'))).toBe(true)
    const cfg = JSON.parse(readFileSync(desktopConfigPath(), 'utf8'))
    expect(cfg.mcpServers.laramac).toEqual({ command: desktopBridgePath(), args: [] })
    expect(cfg.mcpServers.other.command).toBe('x')
    expect(cfg.theme).toBe('dark')
    expect(JSON.stringify(cfg)).not.toContain('secret')
    expect(repairClaudeDesktop('http://127.0.0.1:53536/mcp', join(dirs.root(), 'mcp-token'))).toBe(false)
    expect(connectClaudeDesktop('http://127.0.0.1:53536/mcp', join(dirs.root(), 'mcp-token')).connected).toBe(true)
  })

  it('leaves a settings file it cannot read exactly as it is', async () => {
    const home = freshEnv().root
    process.env.HOME = home
    const { connectClaudeDesktop, desktopConfigPath, repairClaudeDesktop } = await import('../src/main/desktop')
    mkdirSync(join(home, 'Library', 'Application Support', 'Claude'), { recursive: true })
    writeFileSync(desktopConfigPath(), '{ "mcpServers": { "mine": { "command": "x" } ,, }')
    expect(() => connectClaudeDesktop('http://127.0.0.1:53536/mcp', join(dirs.root(), 'mcp-token'))).toThrow(/left as it is/)
    expect(repairClaudeDesktop('http://127.0.0.1:53536/mcp', join(dirs.root(), 'mcp-token'))).toBe(false)
    expect(readFileSync(desktopConfigPath(), 'utf8')).toBe('{ "mcpServers": { "mine": { "command": "x" } ,, }')
  })

  it('talks to the real server through the script, with a short PATH', async () => {
    process.env.HOME = freshEnv().root
    const { startMcpServer, mcpToken } = await import('../src/main/mcp')
    const { connectClaudeDesktop, desktopBridgePath } = await import('../src/main/desktop')
    mcpToken()
    const port = 53611
    const server = await startMcpServer({
      port,
      version: '0.29.0',
      tools: [{ name: 'list_sites', description: 'Sites', inputSchema: { type: 'object', properties: {} }, run: async () => [{ name: 'shop' }] }]
    })
    try {
      connectClaudeDesktop(`http://127.0.0.1:${port}/mcp`, join(dirs.root(), 'mcp-token'))
      const child = spawn(desktopBridgePath(), [], { env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME }, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (d) => (out += String(d)))
      const send = (o: object): void => void child.stdin.write(JSON.stringify(o) + '\n')
      send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '0' } } })
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_sites', arguments: {} } })
      await new Promise((r) => setTimeout(r, 2500))
      child.stdin.end()
      const lines = out.trim().split('\n').map((l) => JSON.parse(l))
      expect(lines).toHaveLength(3)
      expect(lines[0].result.serverInfo.name).toBe('laramac')
      expect(lines[1].result.tools[0].name).toBe('list_sites')
      expect(lines[2].result.content[0].text).toContain('shop')
    } finally {
      server.close()
    }
  })

  it('answers with a plain message when Laramac is not running', async () => {
    process.env.HOME = freshEnv().root
    const { mcpToken } = await import('../src/main/mcp')
    const { connectClaudeDesktop, desktopBridgePath } = await import('../src/main/desktop')
    mcpToken()
    connectClaudeDesktop('http://127.0.0.1:53612/mcp', join(dirs.root(), 'mcp-token'))
    const out = await new Promise<string>((resolve) => {
      const child = execFile(desktopBridgePath(), [], { env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME }, timeout: 15000 }, (_e, o) => resolve(String(o)))
      child.stdin!.end(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) + '\n')
    })
    const msg = JSON.parse(out.trim())
    expect(msg.id).toBe(7)
    expect(msg.error.message).toContain('Open Laramac')
  })
})

describe('the commands that need Node', () => {
  it('look for a real Node each time, because the app cannot run as Node', async () => {
    freshEnv()
    const { nodeWrapper } = await import('../src/main/nodewrap')
    const host = '/Applications/Laramac.app/Contents/MacOS/Laramac'
    const was = process.versions.electron
    Object.defineProperty(process.versions, 'electron', { value: '45.0.0', configurable: true })
    let packaged: string
    try {
      packaged = nodeWrapper('/tmp/x.js', 'test', host)
    } finally {
      if (was === undefined) delete (process.versions as Record<string, unknown>).electron
      else Object.defineProperty(process.versions, 'electron', { value: was, configurable: true })
    }
    expect(packaged).toContain('runtimes/node/bin/node')
    expect(packaged).toContain('command -v node')
    expect(packaged).toContain('needs Node.js')
    // The packaged app is never used as Node: its run-as-Node switch is off.
    expect(packaged).not.toContain('Laramac.app')
    expect(packaged).not.toContain('ELECTRON_RUN_AS_NODE')
    // While developing, the app's own binary is the last resort.
    expect(nodeWrapper('/tmp/x.js', 'test', host)).toContain('ELECTRON_RUN_AS_NODE=1')
  })

  it('runs with the Node it finds', async () => {
    freshEnv()
    const { installCli, cliScript } = await import('../src/main/cli')
    installCli(process.execPath)
    const { cliBin } = await import('../src/main/cli')
    expect(existsSync(cliBin())).toBe(true)
    const out = await new Promise<string>((resolve) => execFile(cliBin(), ['--version'], { env: { PATH: `${join(process.execPath, '..')}:/usr/bin:/bin`, HOME: process.env.HOME }, timeout: 15000 }, (_e, o, e) => resolve(String(o) + String(e))))
    expect(out).not.toContain('needs Node.js')
    expect(existsSync(cliScript())).toBe(true)
  })
})
