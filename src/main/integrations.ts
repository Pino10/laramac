import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ChatMessage, LlmTest, LocalLlm } from '../shared/types'
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

interface LmStudioModel {
  id: string
  type?: string
  state?: string
}

/** Embedding models are listed beside chat models but cannot chat. */
export const isChatModel = (id: string, type?: string): boolean =>
  type ? type === 'llm' || type === 'vlm' : !/embed|embedding|rerank|whisper|bge-|e5-|nomic-embed/i.test(id)

/** Loaded models first, then the rest, in the server's order. */
export function orderModels(models: string[], loaded: string[]): string[] {
  return [...models.filter((m) => loaded.includes(m)), ...models.filter((m) => !loaded.includes(m))]
}

/** Looks for local model servers: Ollama, LM Studio, vMLX and MLX servers, and the configured custom endpoint. */
export async function detectLlms(): Promise<LocalLlm[]> {
  const found: LocalLlm[] = []
  const tasks: Promise<void>[] = []

  tasks.push(
    (async () => {
      const tags = await getJson<{ models: { name: string }[] }>('http://127.0.0.1:11434/api/tags')
      if (!tags) return
      const ps = await getJson<{ models: { name: string }[] }>('http://127.0.0.1:11434/api/ps')
      const loaded = (ps?.models ?? []).map((m) => m.name)
      const models = tags.models.map((m) => m.name).filter((m) => isChatModel(m))
      found.push({ provider: 'Ollama', toolId: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: orderModels(models, loaded), loaded })
    })()
  )

  tasks.push(
    (async () => {
      // LM Studio's own API says which models are chat models and which are loaded.
      const rich = await getJson<{ data: LmStudioModel[] }>('http://127.0.0.1:1234/api/v0/models')
      const plain = rich ? null : await getJson<{ data: LmStudioModel[] }>('http://127.0.0.1:1234/v1/models')
      const list = (rich ?? plain)?.data
      if (!list) return
      const chat = list.filter((m) => isChatModel(m.id, m.type))
      const loaded = chat.filter((m) => m.state === 'loaded').map((m) => m.id)
      found.push({ provider: 'LM Studio', toolId: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', models: orderModels(chat.map((m) => m.id), loaded), loaded })
    })()
  )

  // vMLX and mlx_lm.server speak the OpenAI API on these ports by default.
  for (const [port, provider, toolId] of [
    [8000, 'vMLX', 'vmlx'],
    [8080, 'MLX server', 'vmlx']
  ] as const) {
    tasks.push(
      (async () => {
        const data = await getJson<{ data: LmStudioModel[] }>(`http://127.0.0.1:${port}/v1/models`)
        if (!data?.data) return
        const models = data.data.map((m) => m.id).filter((m) => isChatModel(m))
        // A server here already holds its model in memory.
        found.push({ provider, toolId, baseUrl: `http://127.0.0.1:${port}/v1`, models, loaded: models })
      })()
    )
  }
  await Promise.all(tasks)

  const custom = getSettings().llm.baseUrl.replace(/\/$/, '')
  if (custom && !found.some((f) => f.baseUrl === custom)) {
    const data = await getJson<{ data: { id: string }[] }>(`${custom}/models`)
    if (data?.data) found.push({ provider: 'Custom', baseUrl: custom, models: data.data.map((m) => m.id).filter((m) => isChatModel(m)), loaded: [] })
  }
  const order = ['LM Studio', 'Ollama', 'vMLX', 'MLX server', 'Custom']
  return found.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider))
}

/** Turns a model server's error into something a person can act on. */
export function explainLlmError(status: number, body: string, model: string): string {
  let detail = body
  try {
    const j = JSON.parse(body) as { error?: string | { message?: string } }
    detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? body)
  } catch {
    /* plain text */
  }
  detail = detail.trim().slice(0, 300)
  const d = detail.toLowerCase()
  let hint = ''
  if (/embed/.test(d) || /embed/i.test(model)) hint = `${model} is an embedding model and cannot chat. Pick a chat model instead.`
  else if (/context|n_ctx|too long|token/.test(d)) hint = 'The conversation is longer than the model can hold. In LM Studio, load the model again with a larger context length, or start a new chat.'
  else if (/not (found|loaded)|no model|unknown model|does not exist/.test(d)) hint = `${model} is not loaded. Load it in your model app, or pick a loaded one.`
  else if (status === 401 || status === 403) hint = 'The server wants a key. Local servers usually do not; check the server settings.'
  return [hint, detail ? `The server said: ${detail}` : `The model server answered ${status}.`].filter(Boolean).join(' ')
}

/** Sends one short message to check that a server and model really answer. */
export async function testLlm(baseUrl: string, model: string): Promise<LlmTest> {
  const started = Date.now()
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 16, temperature: 0, stream: false }),
      signal: AbortSignal.timeout(120000)
    })
    const ms = Date.now() - started
    const text = await res.text()
    if (!res.ok) return { ok: false, ms, error: explainLlmError(res.status, text, model) }
    const data = JSON.parse(text) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] }
    const msg = data.choices?.[0]?.message
    return { ok: true, ms, reply: (msg?.content || msg?.reasoning_content || '').trim().slice(0, 120) }
  } catch (err) {
    const e = err as Error
    return { ok: false, ms: Date.now() - started, error: e.name === 'TimeoutError' ? 'No answer within 2 minutes. The model may still be loading.' : `Could not reach ${baseUrl}. Is the server on?` }
  }
}

/** Sends a chat to any OpenAI-compatible local server (Ollama, LM Studio, vMLX, llama.cpp, and so on). */
export async function chatWithLlm(messages: ChatMessage[]): Promise<string> {
  const { baseUrl, model } = getSettings().llm
  if (!model) throw new Error('Choose a model at the top of the Assistant first.')
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(180000)
  }).catch(() => {
    throw new Error(`Could not reach the model server at ${baseUrl}. Is it running?`)
  })
  if (!res.ok) throw new Error(explainLlmError(res.status, await res.text().catch(() => ''), model))
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export function hasBinary(path: string): boolean {
  return existsSync(path)
}

export const laramacBin = (name: string): string => join(dirs.bin(), name)
