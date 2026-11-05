import { execFile } from 'child_process'
import { installIde, ideInstalled, openInIde } from './ide'
import { jobs } from './jobs'
import { installedEditors, openInEditorOf } from './seckit/editors'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
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
  const withPath = `export PATH=${shellQuote(dirs.bin())}:${shellQuote(join(dirs.root(), 'composer', 'vendor', 'bin'))}:$PATH`
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
/** The project folders a file can belong to: each folder in www. */
export function projectRoots(): string[] {
  const www = getSettings().wwwPath
  try {
    return readdirSync(www, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(www, d.name))
  } catch {
    return []
  }
}

/**
 * Opens a folder, or a file at a line. 'auto' and 'laramac' use Laramac Code (installed on first
 * use when there is no other editor); any other choice is that editor or app.
 */
export async function openInEditor(editor: string, path: string, line?: number): Promise<void> {
  const found = await installedEditors()
  // Laramac Code is the default. A saved editor that is no longer on this Mac (Cursor removed,
  // a custom app moved) falls back to it too, instead of failing.
  const customApp = getSettings().editorApp
  const stillThere = editor === 'custom' ? !!customApp && existsSync(customApp) : found.some((f) => f.id === editor)
  const useIde = editor === 'laramac' || editor === 'auto' || !stillThere
  if (useIde) {
    if (!ideInstalled()) await jobs.run('Installing Laramac Code', (u) => installIde(u))
    await openInIde(path, line, projectRoots())
    return
  }
  await openInEditorOf({ choice: editor, customApp: getSettings().editorApp, path, line, found })
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

export { chatWithLlm, detectLlms, explainLlmError, isChatModel, orderModels, testLlm } from './models'

export function hasBinary(path: string): boolean {
  return existsSync(path)
}

export const laramacBin = (name: string): string => join(dirs.bin(), name)
