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
import { BrowserWindow, WebContentsView, app, nativeTheme, session, shell, type WebContents } from 'electron'
import { execFile } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { createServer } from 'net'
import { join } from 'path'
import { dirs } from './paths'
import { downloadFile, extract, removeQuarantine, sha256File } from './download'
import { ManagedProcess } from './process'
import { runtimeEnv } from './runtimes'
import { githubApi } from './seckit/ghapi'
import { getSettings } from './settings'
import { defaultMinor, phpBinary } from './php'
import { IDE_EXTENSIONS, checksPackage, folderFor, ideSettings, macAsset, mergeSettings, openUrl, serverArgs, sha256Of, workbenchCss, type ReleaseAsset } from './idecore'
import { ensurePlugins } from './review'
import checksSource from './idext/extension.cjs?raw'
import { createRequire } from 'module'
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
  /** A hash of the Laramac Checks extension that is installed. */
  checksBuild?: string | null
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
  await ensureChecks(true).catch(() => undefined)
  return state.extensions
}

/** Zips a folder laid out as a VSIX and installs it into Laramac Code. */
async function installVsix(dir: string, name: string): Promise<void> {
  const vsix = join(home(), `${name}.vsix`)
  rmSync(vsix, { force: true })
  await new Promise<void>((resolve, reject) => execFile('/usr/bin/zip', ['-q', '-r', '-X', vsix, '.'], { cwd: dir }, (err) => (err ? reject(err) : resolve())))
  await run(bin(), ['--extensions-dir', extDir(), '--user-data-dir', dataDir(), '--install-extension', vsix, '--force'])
  rmSync(dir, { recursive: true, force: true })
}

/** Laramac Checks: the extension that runs the free checkers and AI reviews inside Laramac Code. */
async function ensureChecks(force = false): Promise<void> {
  const hash = createHash('sha256').update(checksSource).digest('hex').slice(0, 12)
  if (!force && readState().checksBuild === hash) return
  const version = `1.0.${parseInt(hash.slice(0, 6), 16) % 100000}`
  const dir = join(home(), 'checks-build')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'extension'), { recursive: true })
  writeFileSync(join(dir, 'extension', 'package.json'), JSON.stringify(checksPackage(version), null, 2))
  writeFileSync(join(dir, 'extension', 'extension.js'), checksSource)
  writeFileSync(join(dir, 'extension.vsixmanifest'), vsixManifest(version, { id: 'laramac-checks', name: 'Laramac Checks', description: 'Free checkers and AI reviews with Laramac skills.', category: 'Linters' }))
  writeFileSync(join(dir, '[Content_Types].xml'), VSIX_CONTENT_TYPES)
  await installVsix(dir, 'laramac-checks')
  writeState({ ...readState(), checksBuild: hash })
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
  await installVsix(dir, 'laramac-studio-theme')
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
  await ensureChecks().catch(() => undefined)
  port = await freePort()
  password = randomBytes(24).toString('hex')
  let skillDirs: string[] = []
  try {
    skillDirs = ensurePlugins()
  } catch {
    // Reviews in the editor then use Claude Code's own skills.
  }
  const env: NodeJS.ProcessEnv = { ...process.env, ...runtimeEnv(), PASSWORD: password, LARAMAC_CODE: '1', LARAMAC_SKILL_DIRS: skillDirs.join(':'), LARAMAC_COMPOSER_BIN: join(dirs.root(), 'composer', 'vendor', 'bin') }
  delete env.ELECTRON_RUN_AS_NODE
  mkdirSync(dirs.logs(), { recursive: true })
  await proc.start({ command: bin(), args: serverArgs({ port, dataDir: dataDir(), extDir: extDir() }), env, logFile: join(dirs.logs(), 'laramac-code.log') }, port, 40_000)
}

export async function stopIde(): Promise<void> {
  for (const w of windows) if (!w.isDestroyed()) w.close()
  ideUnembed(true)
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
  dress(win.webContents)
  void win.loadURL(url)
  return win
}

/** Poppins, from the copy Laramac ships, as data addresses for Laramac Code's interface. */
let poppins: { weight: number; url: string }[] | null = null
function poppinsFonts(): { weight: number; url: string }[] {
  if (poppins) return poppins
  try {
    const req = createRequire(__filename)
    poppins = [400, 500, 600].map((weight) => ({ weight, url: `data:font/woff2;base64,${readFileSync(req.resolve(`@fontsource/poppins/files/poppins-latin-${weight}-normal.woff2`)).toString('base64')}` }))
  } catch {
    poppins = []
  }
  return poppins
}

/** Signs in with this run's password (it never leaves this Mac) and adds Laramac's look. */
function dress(wc: WebContents): void {
  wc.on('did-finish-load', () => {
    if (new URL(wc.getURL()).pathname.endsWith('/login')) {
      void wc.executeJavaScript(`(() => { const i = document.querySelector('input[name=password]'); const f = document.querySelector('form'); if (i && f) { i.value = ${JSON.stringify(password)}; f.submit() } })()`)
      return
    }
    void wc.insertCSS(workbenchCss({ uiFont: getSettings().uiFont === 'poppins' ? 'poppins' : 'system', fonts: poppinsFonts() }))
  })
}

// ---------------------------------------------------------------- Inside Laramac's own window

let view: WebContentsView | null = null
let viewHost: BrowserWindow | null = null
let viewUrl = ''
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
const clean = (r: Rect): Rect => ({ x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) })

/** The address to open: a folder or file, or the www folder when there is nothing yet. */
export async function ideUrl(path: string | null, line: number | undefined, roots: string[], fallback: string): Promise<string> {
  if (!ideInstalled()) throw new Error('Laramac Code is not installed yet.')
  await start()
  const target = path ?? fallback
  const isDir = existsSync(target) && statSync(target).isDirectory()
  return openUrl(port, folderFor(target, roots, isDir), isDir ? undefined : target, line)
}

/** Shows Laramac Code inside Laramac's window, over the Laramac Code page. */
export async function ideEmbed(host: BrowserWindow, url: string | null, rect: Rect, fallback: string): Promise<{ url: string }> {
  const target = url && ideNavigationAllowed(url) ? url : viewUrl || (await ideUrl(null, undefined, [], fallback))
  if (!view || view.webContents.isDestroyed()) {
    view = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, session: ideSession() } })
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0e15' : '#f5f7fb')
    view.setBorderRadius?.(14)
    dress(view.webContents)
    viewUrl = ''
  }
  if (viewHost !== host) {
    if (viewHost && !viewHost.isDestroyed()) viewHost.contentView.removeChildView(view)
    host.contentView.addChildView(view)
    viewHost = host
  }
  view.setBounds(clean(rect))
  view.setVisible(true)
  if (target !== viewUrl) {
    viewUrl = target
    void view.webContents.loadURL(target)
  }
  view.webContents.focus()
  return { url: viewUrl }
}

export function ideEmbedBounds(rect: Rect): void {
  if (view && !view.webContents.isDestroyed()) view.setBounds(clean(rect))
}

/** Hides it (leaving the page) or closes it (stopping Laramac Code). */
export function ideUnembed(close = false): void {
  if (!view) return
  if (close) {
    if (viewHost && !viewHost.isDestroyed()) viewHost.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
    view = null
    viewHost = null
    viewUrl = ''
  } else view.setVisible(false)
}

/** The page shown inside Laramac, to open in its own window instead. */
export function ideDetach(): void {
  const url = viewUrl
  ideUnembed(true)
  if (url) openWindow(url, 'Laramac Code')
}

// ---------------------------------------------------------------- A Laramac Code app in Applications

export const shortcutPath = (): string => join(homedir(), 'Applications', 'Laramac Code.app')
export const hasShortcut = (): boolean => existsSync(shortcutPath())

/**
 * A small app in ~/Applications (for Spotlight, Launchpad and the Dock) that opens Laramac Code
 * in Laramac. It only runs: open laramac://code.
 */
export function addShortcut(): string {
  const appDir = shortcutPath()
  rmSync(appDir, { recursive: true, force: true })
  mkdirSync(join(appDir, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(appDir, 'Contents', 'Resources'), { recursive: true })
  const icon = join(process.resourcesPath ?? '', 'icon.icns')
  const hasIcon = existsSync(icon)
  if (hasIcon) copyFileSync(icon, join(appDir, 'Contents', 'Resources', 'icon.icns'))
  writeFileSync(
    join(appDir, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Laramac Code</string>
<key>CFBundleDisplayName</key><string>Laramac Code</string>
<key>CFBundleIdentifier</key><string>dev.laramac.code</string>
<key>CFBundleExecutable</key><string>launch</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>${app.getVersion()}</string>
<key>CFBundleShortVersionString</key><string>${app.getVersion()}</string>
${hasIcon ? '<key>CFBundleIconFile</key><string>icon</string>' : ''}
<key>LSUIElement</key><true/>
</dict></plist>
`
  )
  const launcher = join(appDir, 'Contents', 'MacOS', 'launch')
  writeFileSync(launcher, '#!/bin/sh\nexec /usr/bin/open "laramac://code"\n')
  chmodSync(launcher, 0o755)
  return appDir
}

export function removeShortcut(): void {
  rmSync(shortcutPath(), { recursive: true, force: true })
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
let showInApp: ((url: string) => void) | null = null
/** Laramac's window registers here, so "Open in editor" shows Laramac Code inside it. */
export function setIdeHost(fn: (url: string) => void): void {
  showInApp = fn
}

export async function openInIde(path: string, line: number | undefined, roots: string[]): Promise<void> {
  if (!ideInstalled()) throw new Error('Laramac Code is not installed yet.')
  if (showInApp) {
    showInApp(await ideUrl(path, line, roots, path))
    return
  }
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
  shortcut: boolean
  extensions: { id: string; name: string; why: string; state: 'installed' | 'failed' | 'missing' }[]
}

export function ideStatus(): IdeStatus {
  const st = readState()
  return {
    installed: ideInstalled(),
    version: ideVersion(),
    running: proc.running,
    shortcut: hasShortcut(),
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
