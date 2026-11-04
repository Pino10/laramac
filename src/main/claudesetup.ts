/**
 * Claude, set up everywhere in one go:
 *
 *   claude      Claude Code as you installed it, signed in to your account. Untouched.
 *   claudelm   The same Claude Code, talking to your model in LM Studio instead. Laramac writes
 *               this command into its bin folder. Every argument passes through, so
 *               `claudelm --resume` and `claudelm -p "..."` work as with claude. Before it
 *               starts, it makes sure the model is loaded with enough context for Claude Code.
 *
 * Both get Laramac's MCP connection and security skills; the Claude desktop app gets them too.
 * No secret is written in a file: an LM Studio API token, when you use one, stays in the macOS
 * Keychain and claudelm reads it from there each time.
 */
import { execFile } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dirs } from './paths'
import { localModelEnv } from './seckit/reviewers'
import { CLAUDE_CODE_GOOD_CONTEXT, CLAUDE_CODE_MIN_CONTEXT } from './seckit/lmstudio'

export const claudeLmBin = (): string => join(dirs.bin(), 'claudelm')
export const claudeLmScript = (): string => join(dirs.root(), 'cli', 'claudelm.js')
export const claudeLmConfig = (): string => join(dirs.root(), 'claudelm.json')
export const KEYCHAIN_SERVICE = 'Laramac LM Studio'

export interface ClaudeLmConfig {
  claude: string
  baseUrl: string
  model: string
  env: Record<string, string>
  plugins: string[]
}

/** The settings claudelm reads. The token is never part of it. */
export function claudeLmConfigFor(o: { claude: string; baseUrl: string; model: string; plugins: string[] }): ClaudeLmConfig {
  const env = localModelEnv({ baseUrl: o.baseUrl, model: o.model })
  delete env.ANTHROPIC_AUTH_TOKEN
  return { claude: o.claude, baseUrl: o.baseUrl, model: o.model, env, plugins: o.plugins }
}

const SCRIPT = (configFile: string): string => `// Written by Laramac. claudelm: Claude Code on your model in LM Studio.
const fs = require('fs')
const { spawn, execFileSync } = require('child_process')
const MIN = ${CLAUDE_CODE_MIN_CONTEXT}, GOOD = ${CLAUDE_CODE_GOOD_CONTEXT}
let cfg
try { cfg = JSON.parse(fs.readFileSync(${JSON.stringify(configFile)}, 'utf8')) } catch { fail('Set it up first: in Laramac, Tools, "Set up Claude everywhere".') }
let args = process.argv.slice(2)
let model = cfg.model
const i = args.indexOf('--lm-model')
if (i >= 0) { model = args[i + 1]; args.splice(i, 2) }
let token = ''
try { token = execFileSync('/usr/bin/security', ['find-generic-password', '-s', ${JSON.stringify(KEYCHAIN_SERVICE)}, '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
const root = cfg.baseUrl.replace(/\\/+$/, '').replace(/\\/v1$/, '').replace('://localhost', '://127.0.0.1')
const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
function fail(m) { console.error('claudelm: ' + m); process.exit(1) }
async function get(path) { const r = await fetch(root + path, { headers, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status); return r.json() }
async function post(path, body, ms) { const r = await fetch(root + path, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200)); return r.json().catch(() => ({})) }
;(async () => {
  if (args[0] === '--lm-help') {
    console.log('claudelm: Claude Code on your model in LM Studio\\n\\n  claudelm                    start a session\\n  claudelm --resume           pick a past session\\n  claudelm --lm-model <key>   use another LM Studio model this time\\n  claudelm --lm-models        list the models LM Studio has\\n\\nEverything else is passed to claude. Model: ' + model)
    return
  }
  let list
  try { list = (await get('/api/v1/models')).models || [] } catch (e) {
    fail('LM Studio is not answering at ' + root + '. Open LM Studio and start the server (Developer, Start server). LM Studio 0.4.1 or newer is needed.')
  }
  if (args[0] === '--lm-models') { for (const m of list.filter((x) => x.type !== 'embedding')) console.log((m.loaded_instances && m.loaded_instances.length ? '● ' : '  ') + m.key + (m.max_context_length ? '  (' + m.max_context_length.toLocaleString('en') + ' tokens)' : '')); return }
  const e = list.find((x) => x.key === model) || list.find((x) => (x.loaded_instances || []).some((y) => y.id === model))
  if (!e) fail('LM Studio does not have ' + model + '. See claudelm --lm-models.')
  const max = e.max_context_length || GOOD
  if (max < MIN) fail(e.key + ' holds at most ' + max + ' tokens; Claude Code needs ' + MIN + '. Choose another model with --lm-model.')
  const cur = (e.loaded_instances || []).reduce((a, x) => Math.max(a, (x.config && x.config.context_length) || 0), 0)
  if (cur < MIN) {
    const want = Math.min(max, GOOD)
    process.stderr.write('claudelm: loading ' + e.key + ' with ' + want.toLocaleString('en') + ' tokens of context' + (cur ? ' (it had ' + cur.toLocaleString('en') + ')' : '') + '…\\n')
    for (const x of e.loaded_instances || []) await post('/api/v1/models/unload', { instance_id: x.id }, 60000).catch(() => {})
    try { await post('/api/v1/models/load', { model: e.key, context_length: want }, 600000) } catch (err) { fail('LM Studio could not load it: ' + err.message) }
  }
  const env = { ...process.env, ...cfg.env, ANTHROPIC_MODEL: e.key, ANTHROPIC_DEFAULT_SONNET_MODEL: e.key, ANTHROPIC_DEFAULT_OPUS_MODEL: e.key, ANTHROPIC_DEFAULT_HAIKU_MODEL: e.key, ANTHROPIC_SMALL_FAST_MODEL: e.key, CLAUDE_CODE_SUBAGENT_MODEL: e.key, ANTHROPIC_AUTH_TOKEN: token || 'lmstudio' }
  const plugins = (cfg.plugins || []).filter((p) => fs.existsSync(p)).flatMap((p) => ['--plugin-dir', p])
  const child = spawn(cfg.claude, ['--model', e.key, ...plugins, ...args], { stdio: 'inherit', env })
  child.on('exit', (c, s) => process.exit(s ? 1 : (c ?? 0)))
  child.on('error', () => fail('Claude Code was not found at ' + cfg.claude + '. Install it again from Laramac, Tools.'))
})()
`

/** Writes claudelm. `node` is a Node or Electron binary; Electron runs it as plain Node. */
export function installClaudeLm(cfg: ClaudeLmConfig, node: string, electron: boolean): void {
  // The command was called claude-lm in 0.21; it is claudelm now.
  for (const old of [join(dirs.bin(), 'claude-lm'), join(dirs.root(), 'cli', 'claude-lm.js')]) rmSync(old, { force: true })
  mkdirSync(join(dirs.root(), 'cli'), { recursive: true })
  mkdirSync(dirs.bin(), { recursive: true })
  writeFileSync(claudeLmConfig(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
  writeFileSync(claudeLmScript(), SCRIPT(claudeLmConfig()))
  writeFileSync(claudeLmBin(), `#!/bin/sh\n# Written by Laramac: Claude Code on your LM Studio model. claudelm --lm-help\n${electron ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}exec "${node}" "${claudeLmScript()}" "$@"\n`)
  chmodSync(claudeLmBin(), 0o755)
}

export function removeClaudeLm(): void {
  for (const f of [claudeLmBin(), claudeLmScript(), claudeLmConfig()]) rmSync(f, { force: true })
}

export function claudeLmInstalled(): { installed: boolean; model: string | null } {
  if (!existsSync(claudeLmBin())) return { installed: false, model: null }
  try {
    return { installed: true, model: (JSON.parse(readFileSync(claudeLmConfig(), 'utf8')) as ClaudeLmConfig).model }
  } catch {
    return { installed: true, model: null }
  }
}

/**
 * Keeps an LM Studio API token in the macOS Keychain. The token goes in through security's
 * interactive mode on stdin, so it never appears in a process list. An empty token removes it.
 */
export function storeLmToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!token) {
      execFile('/usr/bin/security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE], () => resolve())
      return
    }
    if (/[\s"\\]/.test(token)) return reject(new Error('That token has characters LM Studio tokens do not use.'))
    const child = execFile('/usr/bin/security', ['-i'], (err) => (err ? reject(new Error('The Keychain did not accept the token.')) : resolve()))
    child.stdin?.end(`add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a lmstudio -w "${token}"\n`)
  })
}
