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

export const desktopConfigPath = (): string => join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
export const desktopAppInstalled = (): boolean => existsSync('/Applications/Claude.app') || existsSync(join(homedir(), 'Applications', 'Claude.app'))

type Config = { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> } & Record<string, unknown>

function read(): Config {
  try {
    return JSON.parse(readFileSync(desktopConfigPath(), 'utf8')) as Config
  } catch {
    return {}
  }
}

/** The small command the Claude app starts. It lives in Laramac's bin folder. */
export const desktopBridgePath = (): string => join(dirs.bin(), 'laramac-mcp')

/**
 * The Claude app starts MCP servers as commands, with a short PATH that has no Node. So the
 * command is a tiny shell script that only needs curl, which every Mac has: it reads each message
 * from the app, sends it to Laramac's local server at 127.0.0.1 and prints the answer. It reads the
 * token from Laramac's own token file each time, so the token is never copied into the app's config.
 */
export function desktopBridge(url: string, tokenFile: string): string {
  const q = (v: string): string => `'${v.replace(/'/g, `'\\''`)}'`
  return `#!/bin/sh
# Written by Laramac: lets the Claude app talk to Laramac. It needs no Node.js.
URL=${q(url)}
TOKEN_FILE=${q(tokenFile)}
umask 077
H="$(mktemp)" || exit 1
trap 'rm -f "$H"' EXIT INT TERM HUP
printf 'Authorization: Bearer %s\\n' "$(tr -d '[:space:]' < "$TOKEN_FILE")" > "$H"
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  out="$(printf '%s' "$line" | /usr/bin/curl -sS --max-time 600 -X POST -H @"$H" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' --data-binary @- "$URL" 2>/dev/null)"
  if [ $? -ne 0 ]; then
    id="$(printf '%s' "$line" | sed -n 's/^{"jsonrpc":"2.0","id":\\([0-9][0-9]*\\),.*/\\1/p')"
    [ -n "$id" ] && printf '{"jsonrpc":"2.0","id":%s,"error":{"code":-32000,"message":"Laramac is not running. Open Laramac and try again."}}\\n' "$id"
    continue
  fi
  [ -n "$out" ] && printf '%s\\n' "$out"
done
`
}

export function desktopEntry(): { command: string; args: string[] } {
  return { command: desktopBridgePath(), args: [] }
}

export function connectClaudeDesktop(url: string, tokenFile: string): { connected: boolean; path: string } {
  mkdirSync(dirs.bin(), { recursive: true })
  writeFileSync(desktopBridgePath(), desktopBridge(url, tokenFile))
  chmodSync(desktopBridgePath(), 0o755)
  const cfg = read()
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), laramac: desktopEntry() }
  mkdirSync(dirname(desktopConfigPath()), { recursive: true })
  writeFileSync(desktopConfigPath(), JSON.stringify(cfg, null, 2) + '\n')
  chmodSync(desktopConfigPath(), 0o600)
  return { connected: true, path: desktopConfigPath() }
}

/** An entry written by an older Laramac (npx and mcp-remote) is moved to the new command. */
export function repairClaudeDesktop(url: string, tokenFile: string): boolean {
  const e = read().mcpServers?.laramac
  if (!e || e.command === desktopBridgePath()) return false
  connectClaudeDesktop(url, tokenFile)
  return true
}

export const desktopConnected = (): boolean => !!read().mcpServers?.laramac
