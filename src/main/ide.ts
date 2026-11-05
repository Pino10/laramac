/**
 * Laramac Code: code-server (the open-source VS Code) in a Laramac window.
 *
 *   - Downloaded from Coder's GitHub release and checked against GitHub's SHA-256 of the file.
 *   - Runs only on 127.0.0.1, on a free port, behind a random password that only this run of
 *     Laramac knows; Laramac signs in for you. Its window has its own session, can only show that
 *     address, and opens every other link in your browser.
 *   - Its own folders (settings, extensions) inside Laramac's folder.
 *   - Its terminal has Laramac's PATH: php, composer and node follow each site, and claude,
 *     claudelm, claudefree and laramac are there.
 */
import { BrowserWindow, nativeTheme, session, shell, type WebContents } from 'electron'
import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { createServer } from 'net'
import { join } from 'path'
import { dirs } from './paths'
import { downloadFile, extract, removeQuarantine, sha256File } from './download'
import { ManagedProcess } from './process'
import { runtimeEnv } from './runtimes'
import { githubApi } from './seckit/ghapi'
import { getSettings } from './settings'
import { defaultMinor, phpBinary } from './php'
import { IDE_EXTENSIONS, folderFor, ideSettings, macAsset, mergeSettings, openUrl, serverArgs, sha256Of, type ReleaseAsset } from './idecore'
import { accentBuild, isAccent, themeJson, themePackage, vsixManifest, VSIX_CONTENT_TYPES, type Accent } from './idetheme'

const REPO = 'coder/code-server'
const PARTITION = 'persist:laramac-code'
const home = (): string => join(dirs.root(), 'code')
const serverDir = (): string => join(home(), 'server')
const dataDir = (): string => join(home(), 'data')
const extDir = (): string => join(home(), 'extensions')
const bin = (): string => join(serverDir(), 'bin', 'code-server')
const versionFile = (): string => join(home(), 'version.txt')
const stateFile = (): string => join(home(), 'state.json')

const proc = new ManagedProcess('Laramac Code')
let port = 0
let password = ''
const windows = new Set<BrowserWindow>()

interface IdeState {
  themeBuild: number | null
  extensions: Record<string, 'installed' | 'failed'>
}
const readState = (): IdeState => {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as IdeState
  } catch {
    return { themeBuild: null, extensions: {} }
  }
}
const writeState = (s: IdeState): void => {
  mkdirSync(home(), { recursive: true })
  writeFileSync(stateFile(), JSON.stringify(s, null, 2))
}

export const ideInstalled = (): boolean => existsSync(bin())
export const ideVersion = (): string | null => {
  try {
    return readFileSync(versionFile(), 'utf8').trim() || null
  } catch {
    return null
  }
}

/** Every window of Laramac Code: the only windows allowed to show its address. */
export function isIdeContents(wc: WebContents): boolean {
  return wc.session === session.fromPartition(PARTITION)
}
export const ideOrigin = (): string | null => (port ? `http://127.0.0.1:${port}` : null)

export interface IdeLatest {
  version: string
  asset: ReleaseAsset
}

export async function ideLatest(): Promise<IdeLatest> {
  const r = await githubApi<{ tag_name: string; assets: { name: string; browser_download_url: string; digest?: string | null }[] }>(`/repos/${REPO}/releases/latest`)
  const asset = macAsset(
    r.assets.map((a) => ({ name: a.name, url: a.browser_download_url, digest: a.digest })),
    r.tag_name
  )
  if (!asset) throw new Error('code-server has no build for this Mac in its latest release.')
  return { version: r.tag_name.replace(/^v/, ''), asset }
}

function run(cmd: string, args: string[], timeout = 300_000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...runtimeEnv() } }, (err, out, errOut) =>
      err ? reject(new Error(String(errOut || err.message).trim().split('\n').slice(-2).join(' '))) : resolve(String(out))
    )
  )
}

/** Downloads (or updates) code-server, checked against GitHub's SHA-256, then its extensions and theme. */
export async function installIde(update: (p: number | null, l?: string) => void): Promise<void> {
  update(2, 'Looking for the newest Laramac Code')
  const latest = await ideLatest()
  const want = sha256Of(latest.asset.digest)
  if (!want) throw new Error('GitHub did not give a checksum for Laramac Code’s download, so it was not installed. Try again in a few minutes.')
  const file = join(dirs.downloads(), latest.asset.name)
  await downloadFile(latest.asset.url, file, (p) => update(p === null ? null : Math.round(5 + p * 0.6), `Downloading Laramac Code ${latest.version}`))
  update(66, 'Checking the download')
  if ((await sha256File(file)) !== want) {
    rmSync(file, { force: true })
    throw new Error('The download did not match its checksum and was deleted.')
  }
  update(70, 'Unpacking')
  const staging = join(home(), 'staging')
  rmSync(staging, { recursive: true, force: true })
  await extract(file, staging)
  const top = readdirSync(staging).find((n) => statSync(join(staging, n)).isDirectory())
  if (!top || !existsSync(join(staging, top, 'bin', 'code-server'))) throw new Error('The download did not contain code-server.')
  await proc.stop().catch(() => undefined)
  rmSync(serverDir(), { recursive: true, force: true })
  mkdirSync(home(), { recursive: true })
  renameSync(join(staging, top), serverDir())
  rmSync(staging, { recursive: true, force: true })
  rmSync(file, { force: true })
  await removeQuarantine(serverDir())
  writeFileSync(versionFile(), latest.version)
  await installExtensions((p, l) => update(Math.round(75 + (p ?? 0) * 0.25), l))
  update(100, 'Laramac Code is ready')
}

/** The PHP and front-end extensions, from Open VSX. One that fails does not stop the others. */
export async function installExtensions(update: (p: number | null, l?: string) => void, only?: string[]): Promise<IdeState['extensions']> {
  const state = readState()
  const list = IDE_EXTENSIONS.filter((e) => !only || only.includes(e.id))
  for (const [i, e] of list.entries()) {
    update(Math.round((i / Math.max(1, list.length)) * 100), `Adding ${e.name}`)
    try {
      await run(bin(), ['--extensions-dir', extDir(), '--user-data-dir', dataDir(), '--install-extension', e.id, '--force'])
      state.extensions[e.id] = 'installed'
    } catch {
      state.extensions[e.id] = 'failed'
    }
  }
  writeState(state)
  await ensureTheme(true)
  return state.extensions
}

/** Builds the Laramac Studio theme for the chosen accent and installs it when it changed. */
async function ensureTheme(force = false): Promise<void> {
  const st = getSettings()
  const accent: Accent = isAccent(st.accent) ? st.accent : 'blue'
  const build = accentBuild(accent)
  const state = readState()
  if (!force && state.themeBuild === build) return
  const dir = join(home(), 'theme-build')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'extension', 'themes'), { recursive: true })
  const pkg = themePackage(accent, build)
  writeFileSync(join(dir, 'extension', 'package.json'), JSON.stringify(pkg, null, 2))
  writeFileSync(join(dir, 'extension', 'themes', 'dark.json'), JSON.stringify(themeJson('dark', accent), null, 2))
  writeFileSync(join(dir, 'extension', 'themes', 'light.json'), JSON.stringify(themeJson('light', accent), null, 2))
  writeFileSync(join(dir, 'extension.vsixmanifest'), vsixManifest(String(pkg.version)))
  writeFileSync(join(dir, '[Content_Types].xml'), VSIX_CONTENT_TYPES)
  const vsix = join(home(), 'laramac-studio-theme.vsix')
  rmSync(vsix, { force: true })
  await new Promise<void>((resolve, reject) => execFile('/usr/bin/zip', ['-q', '-r', '-X', vsix, '.'], { cwd: dir }, (err) => (err ? reject(err) : resolve())))
  await run(bin(), ['--extensions-dir', extDir(), '--user-data-dir', dataDir(), '--install-extension', vsix, '--force'])
  rmSync(dir, { recursive: true, force: true })
  writeState({ ...readState(), themeBuild: build })
}

/** Writes Laramac's part of the settings. Your own settings stay; a file that cannot be read is left alone. */
function writeSettings(): void {
  const st = getSettings()
  const file = join(dataDir(), 'User', 'settings.json')
  let current: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    } catch {
      // Comments or a typo: your file wins, Laramac does not overwrite it.
      return
    }
  }
  const minor = defaultMinor()
  const php = minor ? phpBinary(minor) : null
  const s = ideSettings({
    font: st.editorFont ?? 'system',
    fontSize: st.editorFontSize ?? 14,
    phpPath: php && existsSync(php) ? php : null,
    phpVersion: minor ? `${minor}.0` : null,
    appearance: 'auto'
  })
  mkdirSync(join(dataDir(), 'User'), { recursive: true })
  writeFileSync(file, JSON.stringify(mergeSettings(current, s), null, 2) + '\n')
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as { port: number }).port
      srv.close(() => resolve(p))
    })
  })
}

async function start(): Promise<void> {
  if (proc.running && port) return
  writeSettings()
  await ensureTheme().catch(() => undefined)
  port = await freePort()
  password = randomBytes(24).toString('hex')
  const env: NodeJS.ProcessEnv = { ...process.env, ...runtimeEnv(), PASSWORD: password, LARAMAC_CODE: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  mkdirSync(dirs.logs(), { recursive: true })
  await proc.start({ command: bin(), args: serverArgs({ port, dataDir: dataDir(), extDir: extDir() }), env, logFile: join(dirs.logs(), 'laramac-code.log') }, port, 40_000)
}

export async function stopIde(): Promise<void> {
  for (const w of windows) if (!w.isDestroyed()) w.close()
  await proc.stop().catch(() => undefined)
  port = 0
}

let sessionReady = false
function ideSession(): Electron.Session {
  const s = session.fromPartition(PARTITION)
  if (!sessionReady) {
    sessionReady = true
    // Copy and paste work in the editor; nothing else is granted.
    s.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'))
    s.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
  }
  return s
}

function openWindow(url: string, title: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 760,
    minHeight: 480,
    title,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0e15' : '#f5f7fb',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, session: ideSession() }
  })
  windows.add(win)
  win.on('closed', () => windows.delete(win))
  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (e) => {
    e.preventDefault()
    win.setTitle(title)
  })
  win.webContents.on('did-finish-load', () => {
    // Sign in with this run's password. It never leaves this Mac or this window.
    if (new URL(win.webContents.getURL()).pathname.endsWith('/login')) {
      void win.webContents.executeJavaScript(`(() => { const i = document.querySelector('input[name=password]'); const f = document.querySelector('form'); if (i && f) { i.value = ${JSON.stringify(password)}; f.submit() } })()`)
    }
  })
  void win.loadURL(url)
  return win
}

/** The window rules for Laramac Code's windows, used by the app's general hardening. */
export function ideNavigationAllowed(url: string): boolean {
  const origin = ideOrigin()
  return !!origin && (url === origin || url.startsWith(`${origin}/`))
}
export function ideOpenWindow(url: string): void {
  if (ideNavigationAllowed(url)) openWindow(url, 'Laramac Code')
  else if (/^https?:\/\//.test(url)) void shell.openExternal(url)
}

/**
 * Opens a folder, or a file at a line, in Laramac Code. `roots` are the site and project folders,
 * so a file opens inside its project with the file tree and terminal there.
 */
export async function openInIde(path: string, line: number | undefined, roots: string[]): Promise<void> {
  if (!ideInstalled()) throw new Error('Laramac Code is not installed yet.')
  await start()
  const isDir = existsSync(path) && statSync(path).isDirectory()
  const folder = folderFor(path, roots, isDir)
  const name = folder.split('/').pop() || folder
  openWindow(openUrl(port, folder, isDir ? undefined : path, line), `Laramac Code: ${name}`)
}

export interface IdeStatus {
  installed: boolean
  version: string | null
  running: boolean
  extensions: { id: string; name: string; why: string; state: 'installed' | 'failed' | 'missing' }[]
}

export function ideStatus(): IdeStatus {
  const st = readState()
  return {
    installed: ideInstalled(),
    version: ideVersion(),
    running: proc.running,
    extensions: IDE_EXTENSIONS.map((e) => ({ ...e, state: st.extensions[e.id] ?? 'missing' }))
  }
}

/** Font, size or accent changed in Laramac: Laramac Code follows straight away (it reads its settings live). */
export async function ideLookChanged(accentChanged: boolean): Promise<void> {
  if (!ideInstalled()) return
  writeSettings()
  if (accentChanged) {
    writeState({ ...readState(), themeBuild: null })
    if (proc.running) await ensureTheme(true).catch(() => undefined)
  }
}
