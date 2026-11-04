/**
 * Claude desktop: connect it to Laramac's MCP server, so a chat or a Claude Code session in the
 * Claude app can see your sites, run a code review or a recon, and read the results.
 *
 * Claude desktop starts MCP servers as commands, so the entry runs mcp-remote, which passes the
 * conversation to Laramac's local server at 127.0.0.1 with its token. Only the "laramac" entry in
 * the app's config is added or changed; everything else in the file is kept.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export const desktopConfigPath = (): string => join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
export const desktopAppInstalled = (): boolean => existsSync('/Applications/Claude.app') || existsSync(join(homedir(), 'Applications', 'Claude.app'))

type Config = { mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }> } & Record<string, unknown>

function read(): Config {
  try {
    return JSON.parse(readFileSync(desktopConfigPath(), 'utf8')) as Config
  } catch {
    return {}
  }
}

/**
 * The Claude app starts servers with a short PATH that usually has no Node, so the entry names
 * npx by its full path and gives it Node's folder. `nodeBin` is the folder holding node and npx.
 */
export function desktopEntry(url: string, token: string, nodeBin?: string): { command: string; args: string[]; env: Record<string, string> } {
  // The header is passed through an environment variable, so the token never appears in a process list.
  const env: Record<string, string> = { LARAMAC_AUTH: `Bearer ${token}` }
  if (nodeBin) env.PATH = `${nodeBin}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`
  return { command: nodeBin ? join(nodeBin, 'npx') : 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${LARAMAC_AUTH}'], env }
}

export function connectClaudeDesktop(url: string, token: string, nodeBin?: string): { connected: boolean; path: string } {
  const cfg = read()
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), laramac: desktopEntry(url, token, nodeBin) }
  mkdirSync(dirname(desktopConfigPath()), { recursive: true })
  writeFileSync(desktopConfigPath(), JSON.stringify(cfg, null, 2) + '\n')
  chmodSync(desktopConfigPath(), 0o600)
  return { connected: true, path: desktopConfigPath() }
}

export const desktopConnected = (): boolean => !!read().mcpServers?.laramac
