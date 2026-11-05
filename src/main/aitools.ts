import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { shell } from 'electron'
import type { AiTool } from '../shared/types'
import { openTerminal, shellQuote } from './integrations'

/**
 * AI coding tools and local model apps. Many come both as a Mac app and as a
 * command-line tool, and Laramac finds either. Install commands are each
 * project's official one and run visibly in Terminal, never silently.
 */
interface ToolDef {
  id: string
  name: string
  description: string
  /** Executable names (command-line version). */
  cli?: {
    find: string[]
    install: string
    launch?: string
    needsNode?: boolean
  }
  /** App bundle names, matched case-insensitively, and where to get the app. */
  app?: { names: string[]; url: string; /** Also match any app whose name starts with this (versions, editions). */ prefix?: string }
  appleSiliconOnly?: boolean
}

export const AI_TOOLS: ToolDef[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: "Anthropic's coding agent, in Terminal and in the Claude app",
    cli: {
      find: ['claude'],
      install: 'curl -fsSL https://claude.ai/install.sh | bash'
    },
    app: { names: ['Claude.app'], url: 'https://claude.ai/download' }
  },
  {
    id: 'codex',
    name: 'Codex',
    description: "OpenAI's coding agent, in Terminal and as a Mac app",
    cli: {
      find: ['codex'],
      install: 'npm install -g @openai/codex',
      needsNode: true
    },
    app: { names: ['Codex.app'], url: 'https://openai.com/codex/' }
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Open-source coding agent for any model, in Terminal or on the desktop',
    cli: {
      find: ['opencode'],
      install: 'curl -fsSL https://opencode.ai/install | bash'
    },
    app: {
      names: ['OpenCode.app', 'OpenCode Desktop.app', 'opencode-desktop.app'],
      url: 'https://opencode.ai/download'
    }
  },
  {
    id: 'vmlx',
    name: 'vMLX',
    description: 'Run MLX models on Apple Silicon with an OpenAI and Anthropic compatible server',
    cli: {
      find: ['vmlx'],
      install: 'brew install uv && uv tool install vmlx',
      launch: 'vmlx --help'
    },
    app: {
      names: ['vMLX.app', 'MLX Studio.app'],
      url: 'https://github.com/jjang-ai/mlxstudio/releases/latest'
    },
    appleSiliconOnly: true
  },
  {
    id: 'omlx',
    name: 'oMLX',
    description: 'Fast MLX model server for Apple Silicon, run from the menu bar',
    cli: {
      find: ['omlx'],
      install: 'brew tap jundot/omlx https://github.com/jundot/omlx && brew install omlx',
      launch: 'omlx serve'
    },
    app: { names: ['oMLX.app'], url: 'https://github.com/jundot/omlx/releases/latest' },
    appleSiliconOnly: true
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    description: 'Download, chat with and serve local models',
    cli: {
      find: ['lms'],
      install: '~/.lmstudio/bin/lms bootstrap',
      launch: 'lms status'
    },
    app: { names: ['LM Studio.app'], url: 'https://lmstudio.ai/download' }
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run open models locally with one command',
    cli: {
      find: ['ollama'],
      install: 'brew install ollama',
      launch: 'ollama list'
    },
    app: { names: ['Ollama.app'], url: 'https://ollama.com/download' }
  },
  {
    id: 'burp',
    name: 'Burp Suite',
    description: 'Web security testing, including logged-in scans, with its own AI',
    app: { names: ['Burp Suite Professional.app', 'Burp Suite Pro.app', 'Burp Suite Community Edition.app', 'Burp Suite.app'], prefix: 'burp suite', url: 'https://portswigger.net/burp/releases' }
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Open-source personal AI agent',
    cli: {
      find: ['openclaw'],
      install: 'curl -fsSL https://openclaw.ai/install.sh | bash'
    }
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: "Google's coding agent in your terminal",
    cli: {
      find: ['gemini'],
      install: 'npm install -g @google/gemini-cli',
      needsNode: true
    }
  }
]

/** Where installers put command-line tools; apps launched from Finder do not get your shell's PATH. */
function binDirs(): string[] {
  const h = homedir()
  const dirs = [
    join(h, '.local', 'bin'),
    join(h, '.claude', 'local'),
    join(h, '.opencode', 'bin'),
    join(h, '.lmstudio', 'bin'),
    join(h, '.npm-global', 'bin'),
    join(h, '.bun', 'bin'),
    join(h, '.volta', 'bin'),
    join(h, '.cargo', 'bin'),
    join(h, 'Library', 'pnpm'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
  // nvm and fnm keep a bin folder per Node version.
  for (const base of [join(h, '.nvm', 'versions', 'node'), join(h, '.local', 'state', 'fnm_multishells')]) {
    try {
      for (const v of readdirSync(base)) dirs.push(join(base, v, 'bin'))
    } catch {
      /* not installed */
    }
  }
  return dirs
}

const appDirs = (): string[] => ['/Applications', join(homedir(), 'Applications'), '/Applications/Setapp']

// Your login shell knows PATH entries no fixed list can, so ask it once a minute.
let shellPaths: { at: number; found: Map<string, string> } | null = null
function fromLoginShell(): Map<string, string> {
  if (shellPaths && Date.now() - shellPaths.at < 60_000) return shellPaths.found
  return shellPaths?.found ?? new Map()
}

export function refreshLoginShellPaths(force = false): Promise<void> {
  if (!force && shellPaths && Date.now() - shellPaths.at < 60_000) return Promise.resolve()
  const names = AI_TOOLS.flatMap((t) => t.cli?.find ?? []).concat('node')
  const sh = process.env.SHELL && /^\/[\w/.-]+$/.test(process.env.SHELL) ? process.env.SHELL : '/bin/zsh'
  return new Promise((resolve) => {
    execFile(
      sh,
      ['-ilc', `for c in ${names.join(' ')}; do p=$(command -v "$c" 2>/dev/null) && printf '%s\\t%s\\n' "$c" "$p"; done`],
      { timeout: 5000 },
      (_e, out) => {
        const found = new Map<string, string>()
        for (const line of String(out ?? '').split('\n')) {
          const [name, path] = line.split('\t')
          if (name && path?.startsWith('/') && existsSync(path)) found.set(name, path)
        }
        shellPaths = { at: Date.now(), found }
        resolve()
      }
    )
  })
}

export function findCli(names: string[]): string | null {
  for (const name of names) for (const dir of binDirs()) if (existsSync(join(dir, name))) return join(dir, name)
  const shellFound = fromLoginShell()
  for (const name of names) if (shellFound.has(name)) return shellFound.get(name) ?? null
  return null
}

function findApp(names: string[], prefix?: string): string | null {
  const wanted = names.map((n) => n.toLowerCase())
  let loose: string | null = null
  for (const dir of appDirs()) {
    try {
      const entries = readdirSync(dir)
      // The first name on the list wins (Burp Suite Professional before Community).
      for (const w of wanted) {
        const hit = entries.find((e) => e.toLowerCase() === w)
        if (hit) return join(dir, hit)
      }
      if (prefix && !loose) {
        const hit = entries.find((e) => e.toLowerCase().startsWith(prefix) && e.endsWith('.app'))
        if (hit) loose = join(dir, hit)
      }
    } catch {
      /* folder missing */
    }
  }
  return loose
}

/** The edition in the app's name, such as Professional or Community Edition. */
export function appEdition(toolName: string, appPath: string | null): string {
  if (!appPath) return toolName
  const base = appPath.split('/').pop()!.replace(/\.app$/i, '')
  return /professional|\bpro\b/i.test(base) && !/professional|\bpro\b/i.test(toolName) ? `${toolName} Professional` : /community/i.test(base) ? `${toolName} Community` : toolName
}

const hasNode = (): boolean => findCli(['node']) !== null

export function listAiTools(): AiTool[] {
  return AI_TOOLS.map((t) => {
    const unsupported = !!t.appleSiliconOnly && process.arch !== 'arm64'
    const cliPath = t.cli ? findCli(t.cli.find) : null
    const appPath = t.app ? findApp(t.app.names, t.app.prefix) : null
    const note = unsupported
      ? 'Needs an Apple Silicon Mac'
      : t.cli?.needsNode && !cliPath && !appPath && !hasNode()
        ? 'Needs Node.js (brew install node)'
        : undefined
    return {
      id: t.id,
      name: appEdition(t.name, appPath),
      description: t.description,
      cli: t.cli ? { installed: cliPath !== null } : null,
      app: t.app ? { installed: appPath !== null } : null,
      installed: cliPath !== null || appPath !== null,
      note,
      available: !unsupported
    }
  })
}

function tool(id: string): ToolDef {
  const t = AI_TOOLS.find((x) => x.id === id)
  if (!t) throw new Error('Unknown tool.')
  return t
}

export async function installAiTool(id: string, kind: 'cli' | 'app'): Promise<void> {
  const t = tool(id)
  if (kind === 'app' && t.app) return shell.openExternal(t.app.url)
  // LM Studio's lms command ships inside the app.
  if (kind === 'cli' && t.id === 'lmstudio' && t.app && !findApp(t.app.names, t.app.prefix)) return shell.openExternal(t.app.url)
  if (kind === 'cli' && t.cli) return openTerminal(homedir(), t.cli.install)
  throw new Error(`${t.name} has no ${kind === 'app' ? 'Mac app' : 'command-line version'}.`)
}

const openApp = (path: string, folder?: string): Promise<void> =>
  new Promise((res, rej) => execFile('open', folder ? ['-a', path, folder] : [path], (err) => (err ? rej(err) : res())))

/**
 * Opens a tool. In a site folder the command-line version starts there in Terminal;
 * with only the app installed, the app opens with the folder.
 */
export async function launchAiTool(id: string, cwd: string | null, kind?: 'cli' | 'app'): Promise<void> {
  const t = tool(id)
  const cliPath = t.cli ? findCli(t.cli.find) : null
  const appPath = t.app ? findApp(t.app.names, t.app.prefix) : null
  const useApp = kind === 'app' || (!kind && !cliPath) || (!kind && !cwd && !!appPath)
  if (useApp) {
    if (!appPath) throw new Error(`The ${t.name} app is not installed yet.`)
    return openApp(appPath, cwd ?? undefined)
  }
  if (!cliPath || !t.cli) throw new Error(`${t.name} is not installed yet.`)
  const [cmd, ...rest] = (t.cli.launch ?? t.cli.find[0]).split(' ')
  const resolved = join(cliPath, '..', cmd)
  await openTerminal(cwd ?? homedir(), [shellQuote(existsSync(resolved) ? resolved : cmd), ...rest].join(' '))
}
