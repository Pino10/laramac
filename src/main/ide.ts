/**
 * Laramac Code: its own Mac app (code-app/), with the editor Laramac sets up for it.
 *
 * Laramac installs and updates the parts, all checked before they run:
 *   - code-server (the open-source VS Code), from Coder's GitHub release, checked against
 *     GitHub's SHA-256 of the file;
 *   - the Laramac Code app, from Laramac's own release of the same version, checked against its
 *     SHA256SUMS.txt, its signature and its bundle id;
 *   - the extensions from Open VSX, the Studio theme and Laramac Checks (built here).
 * It then writes ~/.laramac/code/launch.json: how to start the editor (its folders, Laramac's
 * PATH, the look). The app reads it, runs the editor on 127.0.0.1 behind a password made for each
 * start, and shows it in its own windows. Laramac asks it to open a folder or a file at a line.
 * No secret is written anywhere.
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { dirs } from './paths'
import { downloadFile, extract, removeQuarantine, sha256File } from './download'
import { runtimeEnv } from './runtimes'
import { githubApi } from './seckit/ghapi'
import { getSettings } from './settings'
import { defaultMinor, phpBinary } from './php'
import { IDE_EXTENSIONS, aiLaunch, checksPackage, codeAppAsset, folderFor, ideSettings, launchEnv, macAsset, mergeSettings, openRequestUrl, serverArgs, sha256Of, workbenchCss, type ReleaseAsset } from './idecore'
import { ensurePlugins } from './review'
import { listServers } from './models'
import { FREELLM_DEFAULT_URL, FREELLM_MODELS, freeLlmUrl } from './seckit/freellm'
import { openAsset, releasesApi } from './distribution'
import { hashFor } from './versions'
import checksSource from './idext/extension.cjs?raw'
import { createRequire } from 'module'
import { isCodeLook, LOOK_BACKGROUND, LOOK_LAYOUT, type CodeLook } from './idelooks'
import { accentBuild, isAccent, themeJson, themePackage, vsixManifest, VSIX_CONTENT_TYPES, type Accent } from './idetheme'

const REPO = 'coder/code-server'
const home = (): string => join(dirs.root(), 'code')
const serverDir = (): string => join(home(), 'server')
const dataDir = (): string => join(home(), 'data')
const extDir = (): string => join(home(), 'extensions')
const bin = (): string => join(serverDir(), 'bin', 'code-server')
const versionFile = (): string => join(home(), 'version.txt')
const stateFile = (): string => join(home(), 'state.json')
/** The app, in your own Applications folder (no password needed to put it there). */
export const appPath = (): string => join(homedir(), 'Applications', 'Laramac Code.app')

interface IdeState {
  themeBuild: number | null
  /** A hash of the Laramac Checks extension that is installed. */
  checksBuild?: string | null
  /** The look whose arrangement (tool strip, minimap, side bar...) was last written to the editor's settings. */
  layoutLook?: string
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

/** The editor is installed (the app comes with it). */
export const ideInstalled = (): boolean => existsSync(bin())
export const ideVersion = (): string | null => {
  try {
    return readFileSync(versionFile(), 'utf8').trim() || null
  } catch {
    return null
  }
}

/** The version of the Laramac Code app in Applications, or null. */
export function appVersion(): string | null {
  try {
    const plist = readFileSync(join(appPath(), 'Contents', 'Info.plist'), 'utf8')
    return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null
  } catch {
    return null
  }
}

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
  rmSync(serverDir(), { recursive: true, force: true })
  mkdirSync(home(), { recursive: true })
  renameSync(join(staging, top), serverDir())
  rmSync(staging, { recursive: true, force: true })
  rmSync(file, { force: true })
  await removeQuarantine(serverDir())
  writeFileSync(versionFile(), latest.version)
  await installExtensions((p, l) => update(Math.round(72 + (p ?? 0) * 0.18), l))
  await installApp((p, l) => update(Math.round(90 + (p ?? 0) * 0.1), l))
  writeLaunch()
  update(100, 'Laramac Code is ready')
}


/**
 * Installs (or updates) the Laramac Code app from Laramac's release of this same version: the zip
 * for this Mac's chip, checked against the release's SHA256SUMS.txt, then its signature and that
 * it really is Laramac Code, before it replaces the copy in ~/Applications.
 */
export async function installApp(update: (p: number | null, l?: string) => void): Promise<void> {
  const version = app.getVersion()
  if (appVersion() === version) return
  update(2, 'Getting the Laramac Code app')
  const release = await releasesApi<{ assets: { name: string; browser_download_url: string }[] }>(`releases/tags/v${version}`).catch(() => null)
  const zip = release ? codeAppAsset(release.assets, version, process.arch) : null
  const sums = release?.assets.find((a) => a.name === 'SHA256SUMS.txt')
  if (!zip || !sums) throw new Error(`Laramac ${version} has no Laramac Code app for this Mac in its release yet. Update Laramac, then try again.`)
  const file = join(dirs.downloads(), zip.name)
  mkdirSync(dirs.downloads(), { recursive: true })
  await downloadFile(zip.browser_download_url, file, (p) => update(p, 'Downloading the Laramac Code app'))
  update(null, 'Checking the download')
  const expected = hashFor(await (await openAsset(sums.browser_download_url)).text(), zip.name)
  if (!expected || (await sha256File(file)) !== expected) {
    rmSync(file, { force: true })
    throw new Error('The Laramac Code app did not match its published checksum and was deleted.')
  }
  const staging = mkdtempSync(join(tmpdir(), 'laramac-code-app-'))
  try {
    // ditto keeps the app's links and signature intact.
    await run('/usr/bin/ditto', ['-x', '-k', file, staging])
    const fresh = join(staging, 'Laramac Code.app')
    if (!existsSync(fresh)) throw new Error('The download does not contain Laramac Code.app.')
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', fresh])
    const id = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(fresh, 'Contents', 'Info.plist')])).trim()
    if (id !== 'dev.laramac.code') throw new Error('The download is not Laramac Code.')
    update(null, 'Putting Laramac Code in Applications')
    mkdirSync(join(homedir(), 'Applications'), { recursive: true })
    const target = appPath()
    const previous = `${target}.old`
    rmSync(previous, { recursive: true, force: true })
    if (existsSync(target)) renameSync(target, previous)
    try {
      await run('/usr/bin/ditto', [fresh, target])
    } catch (e) {
      if (existsSync(previous)) renameSync(previous, target)
      throw e
    }
    rmSync(previous, { recursive: true, force: true })
    await removeQuarantine(target)
    // So macOS knows it opens laramac-code:// addresses straight away.
    await run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', target]).catch(() => '')
  } finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(file, { force: true })
  }
  update(100, 'Laramac Code is in your Applications')
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
  const hash = createHash('sha256').update(checksSource).update(JSON.stringify(checksPackage('0'))).digest('hex').slice(0, 12)
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
  const look = currentLook()
  const build = accentBuild(accent, look)
  const state = readState()
  if (!force && state.themeBuild === build) return
  const dir = join(home(), 'theme-build')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'extension', 'themes'), { recursive: true })
  const pkg = themePackage(accent, build, look)
  writeFileSync(join(dir, 'extension', 'package.json'), JSON.stringify(pkg, null, 2))
  writeFileSync(join(dir, 'extension', 'themes', 'dark.json'), JSON.stringify(themeJson('dark', accent, look), null, 2))
  writeFileSync(join(dir, 'extension', 'themes', 'light.json'), JSON.stringify(themeJson('light', accent, look), null, 2))
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
    appearance: modeSetting() === 'system' ? 'auto' : (modeSetting() as 'dark' | 'light')
  })
  // Python's virtual-environment search runs in the background and shows "Initializing virtual environments" for a while.
  Object.assign(s.managed, { 'python.useEnvironmentsExtension': false, 'python-envs.terminal.autoActivationType': 'off' })
  mkdirSync(join(dataDir(), 'User'), { recursive: true })
  // The arrangement is written once per change of look, so a tweak of your own stays until then.
  const look = currentLook()
  const arrange = readState().layoutLook !== look
  const merged = mergeSettings(current, s)
  writeFileSync(file, JSON.stringify(arrange ? { ...merged, ...LOOK_LAYOUT[look] } : merged, null, 2) + '\n')
  if (arrange) writeState({ ...readState(), layoutLook: look })
}


/** Poppins, from the copy Laramac ships, for Laramac Code's interface (the app loads it into the page). */
let poppins: { family: string; weight: number; data: string }[] | null = null
function poppinsFonts(): { family: string; weight: number; data: string }[] {
  if (poppins) return poppins
  try {
    const req = createRequire(__filename)
    poppins = [400, 500, 600].map((weight) => ({ family: 'Laramac Poppins', weight, data: readFileSync(req.resolve(`@fontsource/poppins/files/poppins-latin-${weight}-normal.woff2`)).toString('base64') }))
  } catch {
    poppins = []
  }
  return poppins
}

/**
 * launch.json: how the Laramac Code app starts the editor. Laramac's PATH and folders, the look,
 * the skills for AI reviews. No password or token: the app makes a password for each start.
 */
const safeServers = (): ReturnType<typeof listServers> => {
  try {
    return listServers()
  } catch {
    return []
  }
}

/** Dark, light or the Mac's own, for Laramac Code: it follows Laramac unless you choose otherwise. */
export function modeSetting(): 'dark' | 'light' | 'system' {
  const st = getSettings()
  const pick = st.codeAppearance ?? 'follow'
  const from = pick === 'follow' ? (st.appearance ?? 'dark') : pick
  return from === 'light' ? 'light' : from === 'auto' ? 'system' : 'dark'
}

/** The look chosen in Laramac (Aurora until another is picked). */
export const currentLook = (): CodeLook => (isCodeLook(getSettings().codeLook) ? (getSettings().codeLook as CodeLook) : 'aurora')

/** A newer Laramac, shown inside Laramac Code as a quiet banner. */
let pendingUpdate: { version: string; current: string } | null = null
export function ideNoteUpdate(info: { version: string } | null): void {
  const next = info ? { version: info.version, current: app.getVersion() } : null
  if (next?.version === pendingUpdate?.version) return
  pendingUpdate = next
  try {
    writeLaunch()
  } catch {
    // The banner is a courtesy: never break an update check over it.
  }
}

export function writeLaunch(): void {
  if (!ideInstalled()) return
  writeSettings()
  let skillDirs: string[] = []
  try {
    skillDirs = ensurePlugins()
  } catch {
    // Reviews in the editor then use Claude Code's own skills.
  }
  const launch = {
    version: 1,
    laramac: app.getVersion(),
    bin: bin(),
    args: serverArgs({ port: '{port}', dataDir: dataDir(), extDir: extDir() }),
    env: launchEnv({ ...process.env, ...runtimeEnv() }, { LARAMAC_SKILL_DIRS: skillDirs.join(':'), LARAMAC_COMPOSER_BIN: join(dirs.root(), 'composer', 'vendor', 'bin') }),
    look: currentLook(),
    appearance: modeSetting(),
    theme: accentBuild(isAccent(getSettings().accent) ? (getSettings().accent as Accent) : 'blue', currentLook()),
    update: pendingUpdate,
    css: workbenchCss({ uiFont: (getSettings().uiFont ?? 'poppins'), look: currentLook() }),
    fonts: (getSettings().uiFont ?? 'poppins') === 'poppins' ? poppinsFonts() : [],
    home: getSettings().wwwPath,
    background: LOOK_BACKGROUND[currentLook()],
    ai: aiLaunch({ llm: getSettings().llm, servers: safeServers(), freellm: { baseUrl: freeLlmUrl(getSettings().freellm?.baseUrl ?? FREELLM_DEFAULT_URL) }, freeModels: FREELLM_MODELS })
  }
  mkdirSync(home(), { recursive: true })
  writeFileSync(join(home(), 'launch.json'), JSON.stringify(launch), { mode: 0o600 })
}

/** Gets everything ready: the theme and checks built, the app in Applications, launch.json written. */
async function prepare(): Promise<void> {
  await ensureTheme().catch(() => undefined)
  await ensureChecks().catch(() => undefined)
  writeLaunch()
}

/**
 * Opens a folder, or a file at a line, in the Laramac Code app. `roots` are the site and project
 * folders, so a file opens inside its project with the file tree and terminal there.
 */
export async function openInIde(path: string | null, line: number | undefined, roots: string[], fallback: string): Promise<void> {
  if (!ideInstalled()) throw new Error('Laramac Code is not installed yet.')
  if (appVersion() !== app.getVersion()) await installApp(() => undefined)
  await prepare()
  const target = path ?? fallback
  const isDir = existsSync(target) && statSync(target).isDirectory()
  const folder = folderFor(target, roots, isDir)
  const request = { folder, file: isDir ? undefined : target, line: isDir ? undefined : line }
  // The request file reaches the app when it is already running; the address when it starts.
  writeFileSync(join(home(), 'open.json'), JSON.stringify({ ...request, at: Date.now() }), { mode: 0o600 })
  await run('/usr/bin/open', ['-a', appPath(), openRequestUrl(request)], 20_000)
}

/** Opens the app without a folder: it shows the last one, or your www folder. */
export async function openIdeApp(): Promise<void> {
  if (!ideInstalled()) throw new Error('Laramac Code is not installed yet.')
  if (appVersion() !== app.getVersion()) await installApp(() => undefined)
  await prepare()
  await run('/usr/bin/open', ['-a', appPath()], 20_000)
}

export interface IdeStatus {
  installed: boolean
  version: string | null
  appInstalled: boolean
  appVersion: string | null
  extensions: { id: string; name: string; why: string; state: 'installed' | 'failed' | 'missing' }[]
}

export function ideStatus(): IdeStatus {
  const st = readState()
  return {
    installed: ideInstalled(),
    version: ideVersion(),
    appInstalled: existsSync(appPath()),
    appVersion: appVersion(),
    extensions: IDE_EXTENSIONS.map((e) => ({ ...e, state: st.extensions[e.id] ?? 'missing' }))
  }
}

/** Font, size, accent or interface font changed in Laramac: Laramac Code follows (it reads its settings live). */
export async function ideLookChanged(accentChanged: boolean): Promise<void> {
  if (!ideInstalled()) return
  if (accentChanged) writeState({ ...readState(), themeBuild: null })
  await prepare()
}

/** When Laramac starts: a Laramac Code app from an older Laramac is replaced, and the new extensions are added. */
export async function ideOnStart(update: (p: number | null, l?: string) => void): Promise<void> {
  if (!ideInstalled()) return
  const st = readState()
  const missing = IDE_EXTENSIONS.filter((e) => !st.extensions[e.id]).map((e) => e.id)
  if (missing.length) await installExtensions(update, missing)
  if (existsSync(appPath()) && appVersion() !== app.getVersion()) await installApp(update).catch(() => undefined)
  await prepare()
}
