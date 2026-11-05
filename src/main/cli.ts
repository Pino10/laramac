/**
 * The laramac command for Terminal. It talks to the running app over the same private,
 * token-protected connection Claude Code uses, so it can only be used on this Mac.
 * "Add to PATH" also puts Laramac's PHP, Composer, Node.js and the other tools in Terminal.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { dirs } from './paths'
import { MCP_PORT } from './mcp'

export const cliScript = (): string => join(dirs.root(), 'cli', 'laramac.js')
export const cliBin = (): string => join(dirs.bin(), 'laramac')

const MARK = '# Added by Laramac'

const JS = (tokenFile: string, port: number): string => `// Written by Laramac. Usage: laramac help
const fs = require('fs')
const { execFileSync } = require('child_process')
const JSON_OUT = process.argv.includes('--json')
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--json')
const HELP = \`laramac: control Laramac from Terminal

  laramac status                 services and whether they run
  laramac sites                  your sites and their addresses
  laramac start <service>        start mysql, redis, apache, php...
  laramac stop <service>         stop a service
  laramac restart <service>      stop, then start
  laramac open <site>            open a site in your browser
  laramac php <site> <version>   use another PHP version for a site
  laramac dev <site> [stop]      start or stop a site's dev server
  laramac db                     list MySQL databases
  laramac db create <name>       create a MySQL database
  laramac logs [name] [lines]    list logs, or show the end of one
  laramac tool <name> [k=v ...]  call any Laramac tool (what Claude uses), as JSON

Add --json to status, sites and db for machine-readable output (for scripts,
Raycast and Apple Shortcuts).

Laramac must be open, with "Let AI tools use Laramac" on in AI tools.\`

async function call(name, a = {}) {
  let token
  try { token = fs.readFileSync(${JSON.stringify(tokenFile)}, 'utf8').trim() } catch { fail('Open Laramac first.') }
  let res
  try {
    res = await fetch('http://127.0.0.1:${port}/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: a } })
    })
  } catch { fail('Laramac is not answering. Open it, and turn on "Let AI tools use Laramac" in AI tools.') }
  if (res.status === 401) fail('Laramac refused the key. Turn the AI tools switch off and on in AI tools.')
  const body = await res.json()
  const r = body.result
  if (!r) fail(body.error?.message || 'Laramac could not do that.')
  const text = r.content?.[0]?.text ?? ''
  if (r.isError) fail(text)
  try { return JSON.parse(text) } catch { return text }
}
function fail(msg) { console.error('laramac: ' + msg); process.exit(1) }
const pad = (s, n) => String(s ?? '').padEnd(n)
const dot = (s) => s === 'running' ? '\\x1b[32m●\\x1b[0m' : s === 'error' ? '\\x1b[31m●\\x1b[0m' : '\\x1b[2m○\\x1b[0m'

;(async () => {
  switch (cmd) {
    case undefined: case 'help': case '-h': case '--help': console.log(HELP); break
    case 'tool': {
      if (!args[0]) fail('Usage: laramac tool <name> [key=value ...]')
      const a = Object.fromEntries(args.slice(1).map((kv) => { const i = kv.indexOf('='); const v = kv.slice(i + 1); return [kv.slice(0, i), v === 'true' ? true : v === 'false' ? false : /^\\d+$/.test(v) ? Number(v) : v] }))
      console.log(JSON.stringify(await call(args[0], a), null, 2)); break
    }
    case 'status': {
      if (JSON_OUT) { console.log(JSON.stringify(await call('list_services'), null, 2)); break }
      for (const s of await call('list_services')) if (s.status !== 'not-installed') console.log(dot(s.status), pad(s.name, 14), pad(s.status, 9), s.port ? ':' + s.port : '')
      break
    }
    case 'sites': {
      if (JSON_OUT) { console.log(JSON.stringify(await call('list_sites'), null, 2)); break }
      for (const s of await call('list_sites')) console.log(pad(s.name, 22), pad(s.url, 34), s.kind + (s.php ? ' · PHP ' + s.php : ''))
      break
    }
    case 'start': case 'stop': case 'restart': {
      if (!args[0]) fail('Which service? Try: laramac status')
      if (cmd !== 'start') await call('stop_service', { id: args[0] })
      if (cmd !== 'stop') await call('start_service', { id: args[0] })
      console.log((cmd === 'stop' ? 'Stopped ' : cmd === 'start' ? 'Started ' : 'Restarted ') + args[0])
      break
    }
    case 'open': {
      const site = (await call('list_sites')).find((s) => s.name === args[0])
      if (!site) fail('No site called ' + (args[0] || '(none)') + '. Try: laramac sites')
      execFileSync('open', [site.url]); break
    }
    case 'php': {
      if (!args[0] || !args[1]) fail('Usage: laramac php <site> <version>')
      await call('set_site_php', { site: args[0], version: args[1] })
      console.log(args[0] + ' now uses PHP ' + args[1]); break
    }
    case 'dev': {
      if (!args[0]) fail('Usage: laramac dev <site> [stop]')
      const r = await call(args[1] === 'stop' ? 'stop_dev_server' : 'start_dev_server', { site: args[0] })
      console.log(typeof r === 'string' ? r : JSON.stringify(r)); break
    }
    case 'db': {
      if (args[0] === 'create') { await call('create_database', { engine: 'mysql', name: args[1] }); console.log('Created ' + args[1]); break }
      if (JSON_OUT) { console.log(JSON.stringify(await call('list_databases', { engine: 'mysql' }), null, 2)); break }
      for (const d of await call('list_databases', { engine: 'mysql' })) console.log(pad(d.name, 30), d.size ?? '')
      break
    }
    case 'logs': {
      const r = await call('read_log', args[0] ? { name: args[0], lines: Number(args[1]) || 60 } : {})
      console.log(typeof r === 'string' ? r : r.logs.join('\\n')); break
    }
    default: fail('Unknown command "' + cmd + '". Try: laramac help')
  }
})()
`

/** Writes the command. `electron` is the app's own binary, run as plain Node. */
export function installCli(electron: string): void {
  mkdirSync(join(dirs.root(), 'cli'), { recursive: true })
  mkdirSync(dirs.bin(), { recursive: true })
  writeFileSync(cliScript(), JS(join(dirs.root(), 'mcp-token'), MCP_PORT))
  writeFileSync(cliBin(), `#!/bin/sh\n# Written by Laramac.\nELECTRON_RUN_AS_NODE=1 exec "${electron}" "${cliScript()}" "$@"\n`)
  chmodSync(cliBin(), 0o755)
}

const rcFiles = (): string[] => [join(homedir(), '.zshrc'), join(homedir(), '.bash_profile')]

export function cliInPath(): boolean {
  return rcFiles().some((f) => existsSync(f) && readFileSync(f, 'utf8').includes(MARK)) || (process.env.PATH ?? '').split(':').includes(dirs.bin())
}

/** Adds Laramac's bin folder to your shell, once, marked so it can be found and removed. */
export function addToPath(): void {
  const line = `\n${MARK}: its PHP, Composer, Node.js and the laramac command\nexport PATH="${dirs.bin()}:$PATH"\n`
  const shell = process.env.SHELL ?? '/bin/zsh'
  const targets = shell.endsWith('bash') ? [join(homedir(), '.bash_profile')] : [join(homedir(), '.zshrc')]
  for (const f of targets) {
    const cur = existsSync(f) ? readFileSync(f, 'utf8') : ''
    if (!cur.includes(MARK)) writeFileSync(f, cur + line)
  }
}
