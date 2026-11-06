/**
 * Claude desktop: connect it to Laramac's MCP server, so a chat or a Claude Code session in the
 * Claude app can see your sites, run a code review or a recon, and read the results.
 *
 * Claude desktop starts MCP servers as commands, so the entry runs a small script that passes the
 * conversation to Laramac's local server at 127.0.0.1 with its token. Only the "laramac" entry in
 * the app's config is added or changed; everything else in the file is kept.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { dirs } from './paths'
import { desktopBridge } from './seckit/desktopbridge'

export const desktopConfigPath = (): string => join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
export const desktopAppInstalled = (): boolean => existsSync('/Applications/Claude.app') || existsSync(join(homedir(), 'Applications', 'Claude.app'))

type Config = { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> } & Record<string, unknown>

/** The config file, or null when it exists but cannot be read: it is then left alone, never overwritten. */
function read(): Config | null {
  if (!existsSync(desktopConfigPath())) return {}
  try {
    return JSON.parse(readFileSync(desktopConfigPath(), 'utf8')) as Config
  } catch {
    return null
  }
}

/** The small command the Claude app starts. It lives in Laramac's bin folder. */
export const desktopBridgePath = (): string => join(dirs.bin(), 'laramac-mcp')

export function desktopEntry(): { command: string; args: string[] } {
  return { command: desktopBridgePath(), args: [] }
}

export function connectClaudeDesktop(url: string, tokenFile: string): { connected: boolean; path: string } {
  mkdirSync(dirs.bin(), { recursive: true })
  writeFileSync(desktopBridgePath(), desktopBridge(url, tokenFile, 'Laramac'))
  chmodSync(desktopBridgePath(), 0o755)
  const cfg = read()
  if (!cfg) throw new Error('The Claude app’s settings file could not be read, so it was left as it is. Open the Claude app once, then try again.')
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), laramac: desktopEntry() }
  mkdirSync(dirname(desktopConfigPath()), { recursive: true })
  writeFileSync(desktopConfigPath(), JSON.stringify(cfg, null, 2) + '\n')
  chmodSync(desktopConfigPath(), 0o600)
  return { connected: true, path: desktopConfigPath() }
}

/** An entry written by an older Laramac (npx and mcp-remote) is moved to the new command. */
export function repairClaudeDesktop(url: string, tokenFile: string): boolean {
  const e = read()?.mcpServers?.laramac
  if (!e || e.command === desktopBridgePath()) return false
  connectClaudeDesktop(url, tokenFile)
  return true
}

export const desktopConnected = (): boolean => !!read()?.mcpServers?.laramac
