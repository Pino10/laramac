import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ChatMessage, LocalLlm } from '../shared/types'
import { dirs } from './paths'
import { getSettings } from './settings'
import { claudePath } from './tools'

/** Escapes text for use inside an AppleScript string literal. */
const applescriptString = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** Escapes text for use inside single quotes in a shell command. */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

function osascript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, _o, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve()
    )
  })
}

/** Opens a new Terminal window running a command, with Laramac's tools first on PATH. */
export function openTerminal(cwd: string, command?: string): Promise<void> {
  const withPath = `export PATH=${shellQuote(dirs.bin())}:$PATH`
  const parts = [withPath, `cd ${shellQuote(cwd)}`]
  if (command) parts.push(command)
  const line = applescriptString(parts.join(' && '))
  return osascript(`tell application "Terminal"\nactivate\ndo script "${line}"\nend tell`)
}

/**
 * Opens a site as a project folder in a new editor window, so the file tree
 * is there on the side. Uses the editor's own command-line launcher, which
 * opens folders reliably even when the editor is already running.
 */
export function openInEditor(editor: 'cursor' | 'vscode', path: string): Promise<void> {
  const app = editor === 'cursor' ? 'Cursor' : 'Visual Studio Code'
  const cliName = editor === 'cursor' ? 'cursor' : 'code'
  const bundles = [join('/Applications', `${app}.app`), join(homedir(), 'Applications', `${app}.app`)]
  const cli = bundles.map((b) => join(b, 'Contents', 'Resources', 'app', 'bin', cliName)).find((p) => existsSync(p))
  return new Promise((resolve, reject) => {
    const fallback = (): void => {
      execFile('open', ['-n', '-a', app, '--args', path], (err) => (err ? reject(new Error(`${app} is not installed.`)) : resolve()))
    }
    if (!cli) return fallback()
    execFile(cli, ['--new-window', path], { timeout: 15000 }, (err) => (err ? fallback() : resolve()))
  })
}

export function openClaudeCode(cwd: string): Promise<void> {
  const claude = claudePath()
  if (!claude) return Promise.reject(new Error('Claude Code is not installed yet.'))
  return openTerminal(cwd, shellQuote(claude))
}

/** Opens Terminal running Anthropic's official Claude Code installer. */
export function installClaudeCode(): Promise<void> {
  return openTerminal(process.env.HOME ?? '/', 'curl -fsSL https://claude.ai/install.sh | bash')
}

async function getJson<T>(url: string, timeoutMs = 1500): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Looks for local model servers: Ollama, LM Studio, and the configured custom endpoint. */
export async function detectLlms(): Promise<LocalLlm[]> {
  const found: LocalLlm[] = []

  const ollama = await getJson<{ models: { name: string }[] }>('http://127.0.0.1:11434/api/tags')
  if (ollama) {
    found.push({
      provider: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      models: ollama.models.map((m) => m.name)
    })
  }

  const lm = await getJson<{ data: { id: string }[] }>('http://127.0.0.1:1234/v1/models')
  if (lm) {
    found.push({ provider: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', models: lm.data.map((m) => m.id) })
  }

  const custom = getSettings().llm.baseUrl.replace(/\/$/, '')
  if (custom && !found.some((f) => f.baseUrl === custom)) {
    const data = await getJson<{ data: { id: string }[] }>(`${custom}/models`)
    if (data) found.push({ provider: 'Custom', baseUrl: custom, models: data.data.map((m) => m.id) })
  }
  return found
}

/** Sends a chat to any OpenAI-compatible local server (Ollama, LM Studio, llama.cpp, and so on). */
export async function chatWithLlm(messages: ChatMessage[]): Promise<string> {
  const { baseUrl, model } = getSettings().llm
  if (!model) throw new Error('Choose a model in the Assistant settings first.')
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(180000)
  }).catch(() => {
    throw new Error(`Could not reach the model server at ${baseUrl}. Is it running?`)
  })
  if (!res.ok) throw new Error(`The model server answered ${res.status}.`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export function hasBinary(path: string): boolean {
  return existsSync(path)
}

export const laramacBin = (name: string): string => join(dirs.bin(), name)
