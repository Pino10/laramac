import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { shell } from 'electron'
import type { AiTool } from '../shared/types'
import { openTerminal, shellQuote } from './integrations'

/**
 * AI coding tools and local model apps Laramac can install and launch.
 * Install commands are each project's official one; they run visibly in Terminal so you can see
 * exactly what happens. Laramac never runs them silently.
 */
interface ToolDef {
  id: string
  name: string
  kind: 'cli' | 'app'
  description: string
  /** Executable names to look for (CLI tools) or app bundle names (apps). */
  find: string[]
  install: { command?: string; url?: string }
  /** Command typed in a site folder to start the tool. */
  launch?: string
  appleSiliconOnly?: boolean
  needsNode?: boolean
}

export const AI_TOOLS: ToolDef[] = [
  { id: 'claude', name: 'Claude Code', kind: 'cli', description: "Anthropic's coding agent in your terminal", find: ['claude'], install: { command: 'curl -fsSL https://claude.ai/install.sh | bash' }, launch: 'claude' },
  { id: 'opencode', name: 'OpenCode', kind: 'cli', description: 'Open-source coding agent that works with many models', find: ['opencode'], install: { command: 'curl -fsSL https://opencode.ai/install | bash' }, launch: 'opencode' },
  { id: 'openclaw', name: 'OpenClaw', kind: 'cli', description: 'Open-source personal AI agent', find: ['openclaw'], install: { command: 'curl -fsSL https://openclaw.ai/install.sh | bash' }, launch: 'openclaw' },
  { id: 'codex', name: 'Codex CLI', kind: 'cli', description: "OpenAI's coding agent", find: ['codex'], install: { command: 'npm install -g @openai/codex' }, launch: 'codex', needsNode: true },
  { id: 'gemini', name: 'Gemini CLI', kind: 'cli', description: "Google's coding agent", find: ['gemini'], install: { command: 'npm install -g @google/gemini-cli' }, launch: 'gemini', needsNode: true },
  { id: 'vmlx', name: 'vMLX', kind: 'cli', description: 'Fast MLX model server with an OpenAI-compatible API', find: ['vmlx'], install: { command: 'brew install uv && uv tool install vmlx' }, launch: 'vmlx --help', appleSiliconOnly: true },
  { id: 'mlx-lm', name: 'MLX LM', kind: 'cli', description: "Apple's MLX tools for running and fine-tuning models", find: ['mlx_lm.generate', 'mlx_lm.server'], install: { command: 'brew install uv && uv tool install mlx-lm' }, launch: 'mlx_lm.generate --help', appleSiliconOnly: true },
  { id: 'ollama', name: 'Ollama', kind: 'app', description: 'Run open models locally with one command', find: ['Ollama.app'], install: { url: 'https://ollama.com/download' } },
  { id: 'lmstudio', name: 'LM Studio', kind: 'app', description: 'Download and chat with local models', find: ['LM Studio.app'], install: { url: 'https://lmstudio.ai/download' } }
]

/** Where installers put CLI tools; apps launched from Finder do not get your shell's PATH. */
function binDirs(): string[] {
  const h = homedir()
  return [
    join(h, '.local', 'bin'),
    join(h, '.claude', 'local'),
    join(h, '.opencode', 'bin'),
    join(h, '.npm-global', 'bin'),
    join(h, '.bun', 'bin'),
    join(h, '.volta', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

export function findTool(t: ToolDef): string | null {
  if (t.kind === 'app') {
    for (const name of t.find) {
      for (const dir of ['/Applications', join(homedir(), 'Applications')]) {
        if (existsSync(join(dir, name))) return join(dir, name)
      }
    }
    return null
  }
  for (const name of t.find) for (const dir of binDirs()) if (existsSync(join(dir, name))) return join(dir, name)
  return null
}

const hasNode = (): boolean => binDirs().some((d) => existsSync(join(d, 'node')))

export function listAiTools(): AiTool[] {
  return AI_TOOLS.map((t) => {
    const unsupported = t.appleSiliconOnly && process.arch !== 'arm64'
    const note = unsupported ? 'Needs an Apple Silicon Mac' : t.needsNode && !hasNode() ? 'Needs Node.js (brew install node)' : undefined
    return { id: t.id, name: t.name, kind: t.kind, description: t.description, installed: findTool(t) !== null, note, available: !unsupported }
  })
}

function tool(id: string): ToolDef {
  const t = AI_TOOLS.find((x) => x.id === id)
  if (!t) throw new Error('Unknown tool.')
  return t
}

export async function installAiTool(id: string): Promise<void> {
  const t = tool(id)
  if (t.install.url) {
    await shell.openExternal(t.install.url)
    return
  }
  await openTerminal(homedir(), t.install.command)
}

/** Opens a CLI tool in a site folder (or your home folder), or opens an app. */
export async function launchAiTool(id: string, cwd: string | null): Promise<void> {
  const t = tool(id)
  const where = findTool(t)
  if (!where) throw new Error(`${t.name} is not installed yet.`)
  if (t.kind === 'app') {
    await new Promise<void>((res, rej) => execFile('open', [where], (err) => (err ? rej(err) : res())))
    return
  }
  const [cmd, ...rest] = (t.launch ?? t.find[0]).split(' ')
  const resolved = join(where, '..', cmd)
  await openTerminal(cwd ?? homedir(), [shellQuote(existsSync(resolved) ? resolved : cmd), ...rest].join(' '))
}
