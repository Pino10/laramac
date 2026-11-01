import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { cancelImport, importSql, inspect, runImport } from './importer'
import * as dbadmin from './dbadmin'
import { cleanAlias, needsHostsEntry, syncHostsFile } from './hosts'
import { cleanRemotePath, deploy } from './deploy'
import { posix } from 'path'
import * as api from './apiclient'
import * as github from './github'
import { setDownloadToken } from './distribution'
import { readFileSync } from 'fs'
import { listPackages, removePackage } from './packages'
import * as snapshots from './snapshots'
import { MCP_PORT, mcpToken, mcpUrl, startMcpServer, type McpTool } from './mcp'
import { findCli } from './aitools'
import { execFile } from 'child_process'
import { readdirSync } from 'fs'
import { dirs } from './paths'
import { homedir } from 'os'
import { checkForUpdate, installUpdate, releaseNotes } from './updater'
import { installRuntime, latestVersions, listRuntimes, refreshRuntimeShims, RUNTIME_IDS } from './runtimes'
import { createFromStarter } from './starterrun'
import { devFromScript, devLogFile, devLogs, pickDevPort, startDev, stopAllDev, stopDev } from './devservers'
import { STARTERS, starterById } from '../shared/starters'
import { collectSiteLogs, explainSite } from './sitedoctor'
import * as models from './models'
import * as mailrelay from './mailrelay'
import * as review from './review'
import * as scan from './scan'
import * as audit from './audit'
import * as dumps from './dumps'
import * as project from './project'
import * as cli from './cli'
import { dbPassword, setSecret, setSecretsCrypto } from './secrets'
import { createPgDatabase } from './svc/postgres'
import { runQuiet } from './starterrun'
import { runtimeEnv } from './runtimes'
import { normalize } from 'path'
import { buildTrayMenu, type TrayAction, type TrayItem } from './traymenu'
import { resetLaramac } from './reset'
import { setupRecommended } from './setup'
import { installAiTool, launchAiTool, listAiTools, refreshLoginShellPaths } from './aitools'
import * as ssh from './ssh'
import { customIniPath, ensureCustomIni } from './php'
import { safeStorage } from 'electron'
import type { ApiRequest, ApiRunResult, ApiStore, GitPushOptions, KV, DatabaseInfo, McpStatus, ResetOptions, ServiceId, SshServerInput, UpdateInfo } from '../shared/types'
import { activeMysql, mysqlClientPath } from './svc/mysql'
import { mariadbClient } from './svc/mariadb'
import { runStreaming } from './creator'
import type { ImportAnswers } from '../shared/types'
import { watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { ChannelName, Channels, ChatMessage, Events, Material, ProjectKind, SiteConfig, SiteInfo } from '../shared/types'
import { ensureDirs } from './paths'
import { ensureWww, getSettings, setSettings } from './settings'
import { scanSites, setSiteConfig } from './sites'
import { services } from './services'
import { jobs } from './jobs'
import { activity } from './activity'
import { defaultMinor, installMinor, installedMinors, listVersions, phpBinary, phpIniPath, removeMinor, stopAllFpm } from './php'
import { DNS_PORT, installResolver, startDnsServer, stopDnsServer } from './dns'
import { ensureSiteCert, trustCa } from './ssl'
import {
  composerPhar,
  installAdminer,
  installCloudflared,
  installComposer,
  installNgrok,
  installPhpMyAdmin,
  refreshShims,
  toolsStatus,
  writePmaConfig
} from './tools'
import { shareSite, shareUrls, stopAllTunnels, unshareSite } from './share'
import { createProject } from './creator'
import { detectLlms, installClaudeCode, openClaudeCode, openInEditor, testLlm } from './integrations'
import { assistantChat } from './ai'
import { processEvents, tailFile } from './process'
import { phpmyadminInstalled } from './webconf'
import { macMajor } from './platform'
import { assertMinor, isWebUrl, sanitizeSettingsPatch, ValidationError } from './validate'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let watcher: FSWatcher | null = null
let quitting = false
let material: Material = 'none'

const isMac = process.platform === 'darwin'
const RENDERER_URL = process.env['ELECTRON_RENDERER_URL']
const RENDERER_FILE = join(__dirname, '../renderer/index.html')

function send<K extends keyof Events>(event: K, payload: Events[K]): void {
  mainWindow?.webContents.send(event, payload)
}

let versionCache: { at: number; data: Record<string, string> } | null = null

/** Newest version of each starter's setup tool, from npm, Packagist, PyPI, crates.io or GitHub. */
async function starterVersions(): Promise<Record<string, string>> {
  if (versionCache && Date.now() - versionCache.at < 30 * 60 * 1000) return versionCache.data
  const get = async (url: string): Promise<unknown> => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Laramac (+https://github.com/Pino10/laramac)', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }
  const data: Record<string, string> = {}
  await Promise.allSettled(
    STARTERS.map(async (s) => {
      const src = s.source
      if (!src) return
      let v: string | undefined
      if (src.npm) v = ((await get(`https://registry.npmjs.org/${src.npm.replace('/', '%2F')}/latest`)) as { version?: string }).version
      else if (src.packagist) {
        const list = ((await get(`https://repo.packagist.org/p2/${src.packagist}.json`)) as { packages: Record<string, { version: string }[]> }).packages[src.packagist]
        v = list?.find((x) => /^v?\d+\.\d+(\.\d+)?$/.test(x.version))?.version
      } else if (src.pypi) v = ((await get(`https://pypi.org/pypi/${src.pypi}/json`)) as { info: { version: string } }).info.version
      else if (src.crates) v = ((await get(`https://crates.io/api/v1/crates/${src.crates}`)) as { crate: { max_stable_version: string } }).crate.max_stable_version
      else if (src.github) v = ((await get(`https://api.github.com/repos/${src.github}/releases/latest`)) as { tag_name: string }).tag_name
      if (v) data[s.id] = v.replace(/^v/, '')
    })
  )
  versionCache = { at: Date.now(), data }
  return data
}

function listSites(): SiteInfo[] {
  const urls = shareUrls()
  return scanSites().map((s) => ({ ...s, shareUrl: urls[s.name] }))
}

let reloadTimer: NodeJS.Timeout | null = null
/** Tells the UI the site list changed and rebuilds web server configs (debounced). */
function notifySitesChanged(): void {
  send('sites:changed', listSites())
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => void services.reloadWeb(), 500)
}

function watchWww(): void {
  watcher?.close()
  try {
    watcher = watch(ensureWww(), { persistent: false }, () => notifySitesChanged())
  } catch {
    watcher = null
  }
}

// ------------------------------------------------------------------ Window

/** Loads the Liquid Glass module only on macOS 26+, where NSGlassEffectView exists. */
function liquidGlass(): { addView: (h: Buffer, o?: object) => number } | null {
  if (!isMac || !getSettings().glass || macMajor() < 26) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron-liquid-glass')
  } catch {
    return null
  }
}

function createWindow(): void {
  const glass = liquidGlass()
  material = glass ? 'liquid-glass' : isMac && getSettings().glass ? 'vibrancy' : 'none'

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Laramac',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 20, y: 20 },
    // Liquid Glass needs a transparent window and must not be combined with vibrancy.
    transparent: material === 'liquid-glass',
    vibrancy: material === 'vibrancy' ? 'sidebar' : undefined,
    visualEffectState: 'active',
    backgroundColor: material === 'none' ? '#0f1218' : '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  if (glass && mainWindow) {
    const win = mainWindow
    win.setWindowButtonVisibility(true)
    win.webContents.once('did-finish-load', () => {
      try {
        glass.addView(win.getNativeWindowHandle(), {})
      } catch {
        // Native effect unavailable: the CSS fallback still looks right.
      }
    })
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (RENDERER_URL) mainWindow.loadURL(RENDERER_URL)
  else mainWindow.loadFile(RENDERER_FILE)
}

function showWindow(): void {
  if (!mainWindow) createWindow()
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function isAppUrl(url: string): boolean {
  if (RENDERER_URL) return url.startsWith(RENDERER_URL)
  return url === pathToFileURL(RENDERER_FILE).href || url.startsWith(pathToFileURL(RENDERER_FILE).href + '#')
}

/** Locks every web contents down: no navigation away, no popups, no webviews, no permissions. */
function hardenWebContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')
}

function createTray(): void {
  // The Laramac mark for the menu bar: 36 px for Retina, black on clear so macOS can tint it.
  const icon = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACu0lEQVR4AeyXy6tNURzHj0deA0QpeZQBQkYm/AOiDAxIIgyUzEgxkDBgQAaMDCRiIJGBEHOPgYHyKBkoKUoeibwSn889Z2k5e+3H2fs6XXVvv89v/fY+6/fb37P3Or+97sjWEPsbFlT2QP6bO7SBb3IXPsCvhljjDjXWQaml7tBWss7DUpgETc0ayyhyATZBoaUE7etk3GBcDCMaYo1b1ND26oroFjSWybNBO4J7BHXML7GKRHnMeBS0ebhRkGvdgqZGM59Gca/hNhKudtjM+ASCTQtBauwWlJpT59zkKCmOo9PpsFvQ22ja/CjuNTxJwvYOpxkXQLB3IUiN3YK+Mek5aHtwC6GO+VNXlMyhwG7QnuG8BkPaugU567AOVoALsmkfekCd5aAd0hWREnSKhPVwDz5CU/tKgZdwBl5B6pqcblvehzYxO6sF2jPr+3GkzoQtcBMewgxIWp4gJ5/AubB95peJDzbEGt+p4bo8xpi0IkGuIZN24NbAgYZYYxc1tJW6FHmCbF52bXNC2zfulbkk3O9g7CPjsDURFzdhDtuWJ2h0++MB/2XA13PekSWkivFn4mBjQhCPeYJ+RJPGR3Gv4TkSXncwnkAczPUU4j9jnqA3zHAxM7RCDzHuldskTO9gHNblJ87FbwUO25YnyE+v6eA4XISmi/oKNcKv6zpx0ooE7STDN77Pei3x/oasJt9avvldTxxmrUjQC6YvAm+zO0i7bXiMnK5tNkXvuI03U6RIkJN/4mbBRrDbhlbAYW0r3NKWCfKqfd3SlgnyjvR1S1smKO6mLnDvWB0qb2nLBHnxwSDexsZxpnaZoLh5+ebPFKh4wp1jpS1tmSB/5n3d0pYJ8gb0dUtbRdBgb2nf8y3dHtv9zxL/ZVUEmeCW1v/PbWr+V9qEKRS01iXGjFUVlEn8VyeGnKDfAAAA//+jG3dEAAAABklEQVQDALBHwkkoCfJJAAAAAElFTkSuQmCC', 'base64'), { scaleFactor: 2 })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Laramac')
  const run = (a: TrayAction): void => {
    switch (a.kind) {
      case 'show':
        showWindow()
        if (a.page) send('app:navigate', a.page)
        break
      case 'service':
        void (a.on ? services.start(a.id) : services.stop(a.id)).then(rebuild)
        break
      case 'start-all':
        void services.startAll().then(rebuild)
        break
      case 'stop-all':
        void services.stopAll().then(rebuild)
        break
      case 'dev': {
        const site = scanSites().find((x) => x.name === a.site)
        const cfg = getSettings().siteConfig[a.site]?.dev
        if (!site || !cfg) break
        void (a.on ? startDev(site, cfg) : stopDev(site.name))
          .catch((err) => activity.push('error', `${site.name} dev server did not start`, (err as Error).message.slice(0, 300)))
          .finally(() => {
            notifySitesChanged()
            rebuild()
          })
        break
      }
      case 'open-url':
        if (isWebUrl(a.url)) void shell.openExternal(a.url)
        break
      case 'open-folder':
        void shell.openPath(a.path)
        break
      case 'editor':
        void openInEditor(getSettings().editor, a.path).catch(() => undefined)
        break
      case 'ai':
        void launchAiTool(getSettings().aiTool, a.path).catch(() => openClaudeCode(a.path))
        break
      case 'quit':
        app.quit()
        break
    }
  }
  const toNative = (items: TrayItem[]): Electron.MenuItemConstructorOptions[] =>
    items.map((i) =>
      i.separator
        ? { type: 'separator' }
        : {
            label: i.label,
            enabled: i.enabled ?? true,
            ...(i.checked !== undefined ? { type: 'checkbox' as const, checked: i.checked } : {}),
            ...(i.submenu ? { submenu: toNative(i.submenu) } : {}),
            ...(i.action ? { click: () => run(i.action!) } : {})
          }
    )
  const AI_LABEL: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini CLI', openclaw: 'OpenClaw' }
  function rebuild(): void {
    const st = getSettings()
    tray?.setContextMenu(
      Menu.buildFromTemplate(
        toNative(
          buildTrayMenu({
            services: services.list(),
            sites: listSites(),
            tld: st.tld,
            phpmyadmin: phpmyadminInstalled(),
            editor: st.editor === 'vscode' ? 'VS Code' : 'Cursor',
            aiName: AI_LABEL[st.aiTool] ?? 'AI tool'
          })
        )
      )
    )
  }
  rebuild()
  tray.on('mouse-enter', rebuild)
  jobs.on('finished', rebuild)
  let timer: ReturnType<typeof setTimeout> | null = null
  services.on('changed', () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(rebuild, 300)
  })
}

// ------------------------------------------------------------------ IPC

/**
 * Registers a typed IPC handler. Requests are refused unless they come from Laramac's own
 * page in the main window, so other content can never drive the app.
 */
function handle<K extends ChannelName>(
  channel: K,
  fn: (...args: Channels[K]['args']) => Promise<Channels[K]['result']> | Channels[K]['result']
): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args) => {
    const frame = e.senderFrame
    if (!mainWindow || !frame || frame !== mainWindow.webContents.mainFrame || !isAppUrl(frame.url)) {
      throw new Error('Request refused.')
    }
    return fn(...(args as Channels[K]['args']))
  })
}

/** A site the renderer refers to must be one of the scanned sites. */
function siteByName(name: unknown): SiteInfo {
  const site = typeof name === 'string' ? scanSites().find((s) => s.name === name) : undefined
  if (!site) throw new ValidationError('That site does not exist.')
  return site
}

/** Paths from the renderer may only be site folders or the www folder itself. */
function sitePath(path: unknown): string {
  if (typeof path === 'string' && path === ensureWww()) return path
  const site = typeof path === 'string' ? scanSites().find((s) => s.path === path) : undefined
  if (!site) throw new ValidationError('That folder is not one of your sites.')
  return site.path
}

function cleanSiteConfig(cfg: unknown): SiteConfig {
  if (!cfg || typeof cfg !== 'object') throw new ValidationError('Site settings are not valid.')
  const c = cfg as Record<string, unknown>
  const out: SiteConfig = {}
  for (const key of Object.keys(c)) {
    if (key === 'php') out.php = assertMinor(c.php)
    else if (key === 'secure') {
      if (typeof c.secure !== 'boolean') throw new ValidationError('HTTPS must be on or off.')
      out.secure = c.secure
    } else if (key === 'deploy') {
      const d = c.deploy as Record<string, unknown> | null
      if (!d || typeof d.serverId !== 'string' || !/^[a-f0-9]{12}$/.test(d.serverId)) throw new ValidationError('Choose a server.')
      const excludes = Array.isArray(d.excludes) ? d.excludes.filter((x): x is string => typeof x === 'string' && /^[\w.*\/ -]{1,80}$/.test(x)).slice(0, 30) : []
      try {
        out.deploy = { serverId: d.serverId, remotePath: cleanRemotePath(d.remotePath), excludes }
      } catch (err) {
        throw new ValidationError((err as Error).message)
      }
    } else if (key === 'aliases') {
      if (!Array.isArray(c.aliases) || c.aliases.length > 20) throw new ValidationError('Up to 20 extra names per site.')
      try {
        out.aliases = [...new Set(c.aliases.map(cleanAlias))]
      } catch (err) {
        throw new ValidationError((err as Error).message)
      }
    } else throw new ValidationError(`Unknown site setting: ${key}`)
  }
  return out
}

function cleanMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length > 100) throw new ValidationError('Too many messages.')
  return messages.map((m) => {
    const role = (m as ChatMessage)?.role
    const content = (m as ChatMessage)?.content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length > 20000) {
      throw new ValidationError('A message is not valid.')
    }
    return { role, content }
  })
}

function cleanAnswers(v: unknown): ImportAnswers {
  const a = (v ?? {}) as Record<string, unknown>
  const str = (k: string): string => {
    if (typeof a[k] !== 'string') throw new ValidationError('The import answers are not valid.')
    return a[k] as string
  }
  const flag = (k: string): boolean => a[k] === true
  if (a.engine !== 'mysql' && a.engine !== 'mariadb') throw new ValidationError('Choose MySQL or MariaDB.')
  return {
    name: str('name'),
    sqlFile: a.sqlFile === null ? null : str('sqlFile'),
    engine: a.engine,
    database: str('database'),
    updateConfig: flag('updateConfig'),
    replaceUrl: flag('replaceUrl'),
    composerInstall: flag('composerInstall')
  }
}

const PROJECT_KINDS: ProjectKind[] = ['blank', 'wordpress', 'laravel']
const TOOLS = ['phpmyadmin', 'adminer', 'cloudflared', 'ngrok', 'composer'] as const

function registerIpc(): void {
  handle('app:info', () => ({ material, platform: process.platform, version: app.getVersion() }))

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch) => {
    const clean = sanitizeSettingsPatch(patch)
    const before = getSettings()
    const next = setSettings(clean)
    if (next.wwwPath !== before.wwwPath) watchWww()
    if (
      next.allowLan !== before.allowLan ||
      next.httpPort !== before.httpPort ||
      next.hostLocalhostFolders !== before.hostLocalhostFolders ||
      next.hostDotLocalhost !== before.hostDotLocalhost
    )
      void services.reloadWeb()
    notifySitesChanged()
    return next
  })

  handle('services:list', () => services.list())
  handle('services:toggle', (id) => services.toggle(id))
  handle('services:install', async (id) => {
    await services.install(id)
    refreshShims()
    notifySitesChanged()
  })
  handle('services:start-all', () => services.startAll())
  handle('services:stop-all', () => services.stopAll())
  handle('jobs:list', () => jobs.list())

  handle('sites:list', () => listSites())
  handle('sites:set-config', async (name, cfg) => {
    const site = siteByName(name)
    const clean = cleanSiteConfig(cfg)
    if (clean.php && !installedMinors().includes(clean.php)) throw new ValidationError(`PHP ${clean.php} is not installed.`)
    if (clean.secure) await ensureSiteCert(site.domain)
    if (clean.aliases) {
      const others = scanSites().filter((x) => x.name !== site.name)
      const taken = clean.aliases.find((a) => others.some((o) => o.domain === a || o.aliases.includes(a)))
      if (taken) throw new ValidationError(`${taken} already belongs to another site.`)
    }
    setSiteConfig(site.name, clean)
    if (clean.aliases) {
      const { tld, siteConfig } = getSettings()
      const all = Object.values(siteConfig).flatMap((cfg) => cfg.aliases ?? [])
      await syncHostsFile(all.filter((n) => needsHostsEntry(n, tld)))
    }
    notifySitesChanged()
    return listSites()
  })
  handle('sites:create', async (kind, name) => {
    if (!PROJECT_KINDS.includes(kind)) throw new ValidationError('Unknown project type.')
    await createProject(kind, name)
    activity.push('success', `Created ${name}`, `New ${kind === 'blank' ? 'PHP' : kind} project in your www folder.`)
    notifySitesChanged()
    return listSites()
  })
  handle('runtimes:list', () => listRuntimes())
  handle('runtimes:latest', () => latestVersions())
  handle('runtimes:install', async (id) => {
    if (!RUNTIME_IDS.includes(id)) throw new ValidationError('Unknown runtime.')
    await installRuntime(id)
    activity.push('success', `Installed ${id === 'python' ? 'Python' : id}`, 'Ready for new projects.')
    return listRuntimes()
  })
  handle('starters:versions', () => starterVersions())
  handle('starters:create', async (req) => {
    if (!req || typeof req !== 'object' || typeof req.starter !== 'string' || typeof req.name !== 'string') throw new ValidationError('That request is not valid.')
    const starter = starterById(req.starter)
    if (!starter) throw new ValidationError('That starter does not exist.')
    const options: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.options ?? {})) if (typeof v === 'string') options[k] = v
    const name = req.name.trim()
    const { devPort } = await createFromStarter({ starter: starter.id, name, options, start: !!req.start, git: !!req.git })
    activity.push('success', `Created ${name}`, `New ${starter.name} project in your www folder.`)
    notifySitesChanged()
    if (devPort && req.start) {
      const site = siteByName(name)
      const cfg = getSettings().siteConfig[name]?.dev
      if (cfg) await startDev(site, cfg).catch((err) => activity.push('error', `${name} dev server did not start`, (err as Error).message.slice(0, 300)))
    }
    return listSites()
  })
  handle('dev:start', async (name) => {
    const site = siteByName(name)
    const cfg = getSettings().siteConfig[site.name]?.dev
    if (!cfg) throw new ValidationError('This site has no dev server set up.')
    await startDev(site, cfg)
    notifySitesChanged()
    return listSites()
  })
  handle('dev:stop', async (name) => {
    await stopDev(siteByName(name).name)
    notifySitesChanged()
    return listSites()
  })
  handle('dev:logs', (name) => devLogs(siteByName(name).name))
  handle('dev:setup', async (name, script) => {
    const site = siteByName(name)
    if (script === null) {
      await stopDev(site.name)
      setSiteConfig(site.name, { dev: undefined })
    } else {
      if (typeof script !== 'string' || !/^[\w:.-]{1,40}$/.test(script)) throw new ValidationError('That script name is not valid.')
      setSiteConfig(site.name, { dev: devFromScript(site.path, script, await pickDevPort()) })
    }
    notifySitesChanged()
    return listSites()
  })
  handle('sites:open-folder', async (path) => {
    await shell.openPath(sitePath(path))
  })
  handle('sites:open-url', async (url) => {
    if (!isWebUrl(url)) throw new ValidationError('Only web addresses can be opened.')
    await shell.openExternal(url)
  })
  handle('sites:open-editor', (path) => openInEditor(getSettings().editor, sitePath(path)))
  handle('sites:open-claude', (path) => launchAiTool(getSettings().aiTool, sitePath(path)).catch(() => openClaudeCode(sitePath(path))))
  handle('sites:share', async (name) => {
    const site = siteByName(name)
    const url = await shareSite(site)
    activity.push('success', `${site.name} is public`, url)
    notifySitesChanged()
    return url
  })
  handle('sites:unshare', async (name) => {
    await unshareSite(siteByName(name).name)
    notifySitesChanged()
  })
  handle('www:reveal', async () => {
    await shell.openPath(ensureWww())
  })

  handle('php:list', () => listVersions())
  handle('php:install', async (minor) => {
    await installMinor(assertMinor(minor))
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })
  handle('php:remove', async (minor) => {
    const m = assertMinor(minor)
    if (!installedMinors().includes(m)) throw new ValidationError(`PHP ${m} is not installed.`)
    await removeMinor(m)
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })
  handle('php:set-default', async (minor) => {
    const m = assertMinor(minor)
    if (!installedMinors().includes(m)) throw new ValidationError(`PHP ${m} is not installed.`)
    setSettings({ defaultPhp: m })
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })

  handle('tools:status', () => toolsStatus())
  handle('tools:setup-dns', async () => {
    await installResolver(getSettings().tld)
    await startDnsServer(() => getSettings().tld)
    activity.push('success', `.${getSettings().tld} domains are on`)
    return toolsStatus()
  })
  handle('tools:trust-ca', async () => {
    await trustCa()
    activity.push('success', 'Local HTTPS is trusted')
    return toolsStatus()
  })
  handle('tools:install', async (tool) => {
    if (!TOOLS.includes(tool)) throw new ValidationError('Unknown tool.')
    if (tool === 'phpmyadmin') await installPhpMyAdmin()
    else if (tool === 'adminer') await installAdminer()
    else if (tool === 'cloudflared') await installCloudflared()
    else if (tool === 'ngrok') await installNgrok()
    else await installComposer()
    notifySitesChanged()
    return toolsStatus()
  })
  handle('tools:install-claude', () => installClaudeCode())
  handle('tools:open-external', async (url) => {
    if (!isWebUrl(url)) throw new ValidationError('Only web addresses can be opened.')
    await shell.openExternal(url)
  })

  handle('ai:detect', () => detectLlms())
  handle('ai:chat', (messages) => assistantChat(cleanMessages(messages)))
  handle('sites:doctor', (name, history) => explainSite(siteByName(name), cleanMessages(history)))
  handle('sites:open-log', async (name, path) => {
    // Only a log Laramac itself listed for this site may be opened.
    const site = siteByName(name)
    if (!collectSiteLogs(site).some((l) => l.path === path) && !(site.dev && path === devLogFile(site.name))) throw new ValidationError('That log is not one of this site’s.')
    await shell.openPath(path)
  })
  handle('ai:test', (baseUrl, model) => {
    if (typeof baseUrl !== 'string' || !/^https?:\/\/[^\s]+$/.test(baseUrl) || typeof model !== 'string' || !model || model.length > 300) throw new ValidationError('Pick a server and a model first.')
    return testLlm(baseUrl, model)
  })

  // The file picker runs in the main process, so the page can never hand us an arbitrary path.
  handle('import:choose', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a project or database',
      buttonLabel: 'Import',
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Projects and database dumps', extensions: ['zip', 'gz', 'tgz', 'tar', 'sql'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const engines = services
      .list()
      .filter((s) => (s.id === 'mysql' || s.id === 'mariadb') && s.status !== 'not-installed')
      .map((s) => s.id as 'mysql' | 'mariadb')
    return inspect(res.filePaths[0], engines)
  })

  handle('import:run', async (id, answers) => {
    const a = cleanAnswers(answers)
    const result = await jobs.run(`Importing ${a.name}`, (update) =>
      runImport(String(id), a, {
        update,
        ensureRunning: async (engine) => {
          await services.start(engine)
          const s = services.list().find((x) => x.id === engine)
          if (s?.status !== 'running') throw new Error(s?.error ?? `${engine} did not start.`)
        },
        clientFor: (engine) => {
          if (engine === 'mariadb') return mariadbClient()
          const v = activeMysql()
          return v ? mysqlClientPath(v) : null
        },
        composerInstall: async (dir, onLine) => {
          const minor = defaultMinor()
          if (!minor) throw new Error('Install PHP first.')
          if (!existsSync(composerPhar())) await installComposer()
          await runStreaming(
            phpBinary(minor),
            ['-c', phpIniPath(minor), composerPhar(), 'install', '--no-interaction', '--prefer-dist'],
            dir,
            { COMPOSER_HOME: join(app.getPath('home'), '.laramac', 'composer') },
            onLine
          )
        }
      })
    )
    const parts = [result.site ? `Site ${result.site}` : null, result.database ? `database ${result.database}` : null].filter(Boolean)
    activity.push('success', `Imported ${a.name}`, `${parts.join(' and ')} ready.${result.skipped ? ` ${result.skipped} lines that change databases or users were skipped.` : ''}`)
    notifySitesChanged()
    return { ...result, sites: listSites() }
  })

  handle('import:cancel', (id) => cancelImport(String(id)))

  // ---- Updates, reset, setup
  handle('app:check-update', async () => {
    const info = await checkForUpdate()
    if (info) send('update:available', info)
    return info
  })
  handle('app:changelog', () => releaseNotes())
  handle('app:install-update', () => jobs.run('Updating Laramac', (update) => installUpdate(update)))
  handle('app:reset', async (opts) => {
    const o = (opts ?? {}) as ResetOptions
    const clean: ResetOptions = { settings: o.settings === true, software: o.software === true, data: o.data === true, system: o.system === true }
    if (!Object.values(clean).some(Boolean)) throw new ValidationError('Choose at least one thing to clear.')
    quitting = true
    ssh.disconnectAll()
    await Promise.allSettled([stopAllTunnels(), services.stopAll(), stopAllFpm()])
    stopDnsServer()
    await resetLaramac(clean)
    app.relaunch()
    app.exit(0)
  })
  handle('settings:choose-www', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose your projects folder',
      buttonLabel: 'Use this folder',
      defaultPath: getSettings().wwwPath,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const next = setSettings(sanitizeSettingsPatch({ wwwPath: res.filePaths[0] }))
    watchWww()
    notifySitesChanged()
    return next
  })
  handle('php:edit-ini', async (minor) => {
    const m = assertMinor(minor)
    const file = ensureCustomIni(m)
    await openInEditor(getSettings().editor, file).catch(() => shell.openPath(customIniPath(m)))
  })
  handle('setup:recommended', async () => {
    const report = await setupRecommended()
    activity.push(
      report.failed.length ? 'error' : 'success',
      report.failed.length ? 'Setup finished with problems' : 'Your stack is ready',
      report.failed.length ? report.failed.map((f) => `${f.step}: ${f.error}`).join('\n') : report.done.join(', ')
    )
    notifySitesChanged()
    return report
  })

  // ---- AI tools
  const toolKind = (k: unknown): 'cli' | 'app' => {
    if (k === 'app' || k === 'cli') return k
    throw new Error('Unknown kind.')
  }
  handle('ai:tools', async () => {
    await refreshLoginShellPaths()
    return listAiTools()
  })
  handle('ai:install-tool', (id, kind) => installAiTool(String(id), toolKind(kind)))
  handle('ai:launch-tool', (id, path, kind) => launchAiTool(String(id), path === null ? null : sitePath(path), kind === null ? undefined : toolKind(kind)))

  // ---- SSH and SFTP. Secrets are encrypted with the macOS Keychain and never sent to the page.
  const keychain: ssh.Crypto = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64'))
  }
  models.setModelCrypto(keychain)
  mailrelay.setMailCrypto(keychain)
  setSecretsCrypto(keychain)
  handle('cli:status', () => ({ installed: existsSync(cli.cliBin()), inPath: cli.cliInPath(), path: cli.cliBin() }))
  handle('cli:install', () => {
    cli.installCli(process.execPath)
    cli.addToPath()
    return { installed: true, inPath: cli.cliInPath(), path: cli.cliBin() }
  })
  // Previews for the gallery: each site rendered in a hidden, sandboxed window, cached for a while.
  const thumbQueue: (() => Promise<void>)[] = []
  let thumbBusy = false
  const runThumbs = async (): Promise<void> => {
    if (thumbBusy) return
    thumbBusy = true
    while (thumbQueue.length) await thumbQueue.shift()!().catch(() => undefined)
    thumbBusy = false
  }
  handle('sites:thumbnail', (name, refresh) => {
    const site = siteByName(name)
    const dir = join(dirs.root(), 'thumbs')
    const file = join(dir, `${site.name.replace(/[^\w.-]/g, '_')}.jpg`)
    if (!refresh && existsSync(file) && Date.now() - statSync(file).mtimeMs < 30 * 60 * 1000) return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
    return new Promise<string | null>((resolve) => {
      thumbQueue.push(async () => {
        const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { offscreen: true, sandbox: true, partition: 'laramac-thumbs', nodeIntegration: false, contextIsolation: true } })
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.webContents.setAudioMuted(true)
        try {
          await Promise.race([win.loadURL(site.secure ? site.httpsUrl : site.url), new Promise((r) => setTimeout(r, 12000))]).catch(() => undefined)
          await new Promise((r) => setTimeout(r, 1200))
          const img = (await win.webContents.capturePage()).resize({ width: 640 })
          const jpg = img.toJPEG(72)
          mkdirSync(dir, { recursive: true })
          writeFileSync(file, jpg)
          resolve(`data:image/jpeg;base64,${jpg.toString('base64')}`)
        } catch {
          resolve(null)
        } finally {
          win.destroy()
        }
      })
      void runThumbs()
    })
  })
  // Local certificates are trusted for previews, as they are in your browser once trusted.
  session.fromPartition('laramac-thumbs').setCertificateVerifyProc((req, cb) => cb(req.hostname.endsWith(`.${getSettings().tld}`) ? 0 : -3))
  handle('sites:logs', (name) => collectSiteLogs(siteByName(name), { lines: 400, redact: false }))
  handle('db:root-password', (engine) => ({ set: !!dbPassword(engine === 'mariadb' ? 'mariadb' : 'mysql') }))
  handle('db:set-root-password', async (engine, password) => {
    const e = engine === 'mariadb' ? 'mariadb' : 'mysql'
    if (typeof password !== 'string' || password.length > 128 || /[\0\n\r]/.test(password)) throw new ValidationError('Use a password up to 128 characters on one line.')
    await dbadmin.setRootPassword(dbTarget(e), password)
    setSecret(`${e}-root`, password)
    writePmaConfig()
    activity.push('success', `${e === 'mysql' ? 'MySQL' : 'MariaDB'} root password ${password ? 'changed' : 'removed'}`, 'phpMyAdmin, Laramac and new projects use it. Update DB_PASSWORD in projects you already made.')
    return { set: !!password }
  })
  handle('mail:relay', () => mailrelay.getRelay())
  handle('mail:save-relay', async (input) => {
    let r
    try {
      r = mailrelay.saveRelay(input)
    } catch (err) {
      throw new ValidationError((err as Error).message)
    }
    // Mailpit reads its relay settings when it starts.
    if (services.list().find((x) => x.id === 'mailpit')?.status === 'running') {
      await services.stop('mailpit')
      await services.start('mailpit')
    }
    return r
  })
  handle('mail:test', (to) => mailrelay.sendTestMail(String(to)))

  // ---- Code review and web scans. Everything stays read-only on your code.
  handle('review:run', async (req) => {
    if (!req || typeof req !== 'object' || !req.source) throw new ValidationError('That review request is not valid.')
    const reviewer = req.reviewer === 'claude' ? 'claude' : 'model'
    const focus = (['security', 'bugs', 'all'] as const).includes(req.focus) ? req.focus : 'security'
    const st = getSettings()
    if (reviewer === 'model' && !st.llm.model) throw new ValidationError('Pick a model on the Tools page or in the Assistant first.')
    const src = req.source
    const label = src.kind === 'site' ? src.site : src.kind === 'github' ? src.repo : src.url.replace(/^https:\/\//, '').replace(/\.git$/, '')
    const result = await jobs.run(`Reviewing ${label}`, async (update) => {
      let root: string
      let name: string
      if (src.kind === 'site') {
        const site = siteByName(src.site)
        root = site.path
        name = site.name
      } else if (src.kind === 'github') {
        if (typeof src.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(src.repo)) throw new ValidationError('Pick a repository.')
        update(null, `Downloading ${src.repo}`)
        let tok: string | null = null
        try {
          tok = github.account() ? ghTok() : null
        } catch {
          tok = null
        }
        root = await review.cloneForReview(`https://github.com/${src.repo}.git`, tok, src.repo.replace('/', '-'))
        name = src.repo
      } else {
        if (typeof src.url !== 'string') throw new ValidationError('Enter the repository address.')
        update(null, 'Downloading the repository')
        const nameFromUrl = src.url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? 'repo'
        root = await review.cloneForReview(src.url.trim(), typeof src.token === 'string' && src.token.trim() ? src.token.trim() : null, nameFromUrl)
        name = nameFromUrl
      }
      return review.runReview({ root, name, reviewer, focus, modelName: st.llm.model }, update)
    })
    activity.push('success', `Reviewed ${label}`, `${Object.values(result.counts).reduce((a, b) => a + b, 0)} findings, ${result.secrets.length} keys in files.`)
    return result
  })
  dumps.dumpEvents.on('dump', (d) => send('dumps:new', d))
  const restartPhp = async (): Promise<void> => {
    // PHP-FPM reads its environment when it starts.
    await stopAllFpm()
    if (services.list().find((x) => x.id === 'php')?.status !== 'not-installed') await services.start('php').catch(() => undefined)
  }
  handle('project:plan', (name) => {
    const site = siteByName(name)
    const read = project.readProjectFile(site)
    if (!read) throw new ValidationError('This site has no laramac.yml.')
    const svc = services.list().map((x) => ({ id: x.id, installed: x.status !== 'not-installed' }))
    return { file: read.file, plan: project.planProject(site, read.file, installedMinors(), svc) }
  })
  handle('project:export', (name) => {
    const site = siteByName(name)
    const existing = project.readProjectFile(site)
    const text = project.writeProjectFile(site, existing ? existing.file : project.inferProject(site))
    setSiteConfig(site.name, { projectHash: project.projectFileHash(text) })
    notifySitesChanged()
    return join(site.path, project.PROJECT_FILE)
  })
  handle('project:apply', async (name, runSetup) => {
    const site = siteByName(name)
    const read = project.readProjectFile(site)
    if (!read) throw new ValidationError('This site has no laramac.yml.')
    const f = read.file
    await jobs.run(`Setting up ${site.name} from laramac.yml`, async (update) => {
      if (f.php) {
        if (!installedMinors().includes(f.php)) {
          update(null, `Installing PHP ${f.php}`)
          await installMinor(f.php)
        }
        setSiteConfig(site.name, { php: f.php })
      }
      if (f.https !== undefined) {
        if (f.https) await ensureSiteCert(site.domain)
        setSiteConfig(site.name, { secure: f.https })
      }
      if (f.aliases?.length) {
        const others = scanSites().filter((x) => x.name !== site.name)
        const free = f.aliases.filter((a) => !others.some((o) => o.domain === a || o.aliases.includes(a)))
        const cur = getSettings().siteConfig[site.name]?.aliases ?? []
        setSiteConfig(site.name, { aliases: [...new Set([...cur, ...free])] })
        const { tld, siteConfig } = getSettings()
        await syncHostsFile(Object.values(siteConfig).flatMap((c) => c.aliases ?? []).filter((n) => needsHostsEntry(n, tld)))
      }
      for (const id of f.services ?? []) {
        update(null, `Starting ${id}`)
        if (services.list().find((x) => x.id === id)?.status === 'not-installed') await services.install(id)
        await services.start(id)
      }
      if (f.database) {
        update(null, `Creating the database ${f.database.name}`)
        if (f.database.engine === 'postgres') await createPgDatabase(f.database.name)
        else await dbadmin.createDatabase(dbTarget(f.database.engine), f.database.name).catch(() => undefined)
      }
      if (f.dev) {
        const port = getSettings().siteConfig[site.name]?.dev?.port ?? (await pickDevPort())
        const npmScript = /^npm run ([\w:.-]+)$/.exec(f.dev.command)?.[1]
        const dev = npmScript ? devFromScript(site.path, npmScript, port) : { command: f.dev.command.split(/\s+/), port, proxy: f.dev.proxy, env: { PORT: '{port}' } }
        setSiteConfig(site.name, { dev: { ...dev, proxy: f.dev.proxy } })
      }
      if (runSetup) {
        for (const [i, cmd] of (f.setup ?? []).entries()) {
          update(Math.round((i / (f.setup!.length || 1)) * 100), cmd)
          await runQuiet(['/bin/sh', '-c', cmd], site.path, runtimeEnv(), (l) => update(null, `${cmd}: ${l.slice(0, 60)}`))
        }
      }
      setSiteConfig(site.name, { projectHash: read.hash })
    })
    activity.push('success', `${site.name} is set up`, 'Applied its laramac.yml.')
    notifySitesChanged()
    return listSites()
  })
  handle('dumps:list', () => dumps.listDumps())
  handle('dumps:clear', () => dumps.clearDumps())
  handle('dumps:status', () => ({ enabled: getSettings().dumps, running: dumps.dumpServerRunning() }))
  handle('dumps:enable', async (on) => {
    if (on) {
      await jobs.run('Setting up the Dumps window', async (update) => {
        if (!dumps.dumperInstalled()) await dumps.installDumper((l) => update(null, `Dumps: ${l.slice(0, 60)}`))
        await dumps.startDumpServer()
      })
    } else dumps.stopDumpServer()
    setSettings({ dumps: !!on })
    await restartPhp()
    return { enabled: !!on, running: dumps.dumpServerRunning() }
  })
  handle('dumps:open-file', async (file, line) => {
    // Only files inside a site may be opened from a dump.
    const site = scanSites().find((s) => typeof file === 'string' && normalize(file).startsWith(s.path + '/'))
    if (!site) throw new ValidationError('That file is not inside one of your sites.')
    await openInEditor(getSettings().editor, file, typeof line === 'number' ? line : undefined).catch(() => shell.openPath(file))
  })
  handle('review:list', () => review.listReviews())
  handle('review:read', (id) => review.readReview(String(id)))
  handle('review:delete', (id) => {
    review.deleteReview(String(id))
    return review.listReviews()
  })
  handle('review:open', async (id, what) => {
    const info = review.listReviews().find((r) => r.id === id)
    if (!info) throw new ValidationError('That review is gone.')
    // Only folders Laramac itself reviewed: a site, or a copy in the reviews folder.
    const folder = normalize(info.folder)
    const allowed = folder.startsWith(normalize(review.reviewSourcesDir()) + '/') || scanSites().some((s) => s.path === folder)
    if (what === 'report') await shell.openPath(join(review.reviewsDir(), `${info.id}.md`))
    else if (!allowed || !existsSync(folder)) throw new ValidationError('The reviewed folder is no longer there.')
    else if (what === 'folder') await shell.openPath(folder)
    else {
      const prompt = `Read the code review in ${join(review.reviewsDir(), `${info.id}.md`)} and fix the findings, most severe first. Explain each change.`
      await launchAiTool(getSettings().aiTool, folder).catch(() => openClaudeCode(folder))
      clipboard.writeText(prompt)
      activity.push('info', 'Fix request copied', 'Paste it into your AI tool to start fixing the findings.')
    }
  })
  handle('audit:run', (name) => audit.auditProject(siteByName(name).path))
  handle('review:repos', async (provider, token, org) => {
    try {
      return await review.listRemoteRepos(provider === 'azure' ? 'azure' : 'github', String(token ?? ''), String(org ?? ''))
    } catch (err) {
      throw new ValidationError((err as Error).message)
    }
  })
  handle('sites:secret-check', async (name) => {
    const site = siteByName(name)
    return review.scanSecrets(site.path, await review.pushableFiles(site.path))
  })
  handle('scan:status', async () => ({ installed: existsSync(scan.nucleiBinary()), version: await scan.nucleiVersion() }))
  handle('scan:run', async (target, siteName) => {
    let opts: scan.ScanOptions
    if (siteName) {
      const site = siteByName(siteName)
      const { httpPort } = getSettings()
      opts = { url: `http://127.0.0.1:${httpPort}`, host: site.domain }
    } else {
      if (typeof target !== 'string' || !/^https?:\/\/[^\s]+$/.test(target)) throw new ValidationError('Enter a full address, like https://example.com.')
      opts = { url: target }
      const host = new URL(target).hostname
      const local = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) || host.endsWith(`.${getSettings().tld}`)
      if (!local) {
        const answer = await dialog.showMessageBox(mainWindow!, {
          type: 'warning',
          buttons: ['Cancel', 'I am allowed to test it'],
          defaultId: 0,
          cancelId: 0,
          message: `Scan ${host}?`,
          detail: 'Only scan sites you own or have written permission to test. Scanning other people’s sites can be against the law and their terms.'
        })
        if (answer.response !== 1) throw new ValidationError('Scan cancelled.')
      }
    }
    return jobs.run(`Scanning ${siteName ?? target}`, async (update) => {
      if (!existsSync(scan.nucleiBinary())) await scan.installNuclei(update)
      return scan.runNuclei(opts, update)
    })
  })
  handle('llm:servers', () => models.listServers())
  handle('llm:save', (input) => {
    if (!input || typeof input !== 'object') throw new ValidationError('That server is not valid.')
    try {
      return models.saveServer(input)
    } catch (err) {
      throw new ValidationError((err as Error).message)
    }
  })
  handle('llm:delete', (id) => models.deleteServer(String(id)))
  handle('ssh:list', () => ssh.listServers())
  handle('ssh:save', (input) => ssh.saveServer(input as SshServerInput, keychain))
  handle('ssh:delete', (id) => ssh.deleteServer(String(id)))
  handle('ssh:terminal', (id) => ssh.openSshTerminal(String(id)))
  handle('ssh:trust', (id, fp) => ssh.trustHostKey(String(id), String(fp)))
  handle('sftp:connect', (id, passphrase) => ssh.connectSftp(String(id), typeof passphrase === 'string' ? passphrase : null, keychain))
  handle('sftp:list', (sid, path) => ssh.listDir(String(sid), String(path)))
  handle('sftp:download', async (sid, paths) => {
    if (!mainWindow || !Array.isArray(paths)) return 0
    const res = await dialog.showOpenDialog(mainWindow, { title: 'Download to…', buttonLabel: 'Download here', properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return 0
    const n = await ssh.download(String(sid), paths.map(String), res.filePaths[0])
    activity.push('success', `Downloaded ${n} ${n === 1 ? 'file' : 'files'}`, res.filePaths[0])
    return n
  })
  handle('sftp:upload', async (sid, remoteDir) => {
    if (!mainWindow) return 0
    const res = await dialog.showOpenDialog(mainWindow, { title: 'Upload files', buttonLabel: 'Upload', defaultPath: ensureWww(), properties: ['openFile', 'multiSelections'] })
    if (res.canceled || res.filePaths.length === 0) return 0
    const n = await ssh.upload(String(sid), res.filePaths, String(remoteDir))
    activity.push('success', `Uploaded ${n} ${n === 1 ? 'file' : 'files'}`, String(remoteDir))
    return n
  })
  handle('sftp:upload-folder', async (sid, remoteDir) => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Upload a folder',
      message: 'Choose a project or any folder. It is uploaded with everything inside, leaving out node_modules, .git and .env.',
      buttonLabel: 'Upload folder',
      defaultPath: ensureWww(),
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const local = res.filePaths[0]
    const target = posix.join(String(remoteDir), local.split('/').pop()!)
    const result = await jobs.run(`Uploading ${local.split('/').pop()}`, (update) => deploy(ssh.sessionFs(String(sid)), local, target, {}, update))
    activity.push('success', `Uploaded ${local.split('/').pop()}`, `${result.uploaded} files to ${target}`)
    return result
  })
  handle('sftp:mkdir', (sid, dir, name) => ssh.mkdir(String(sid), String(dir), String(name)))
  handle('sftp:rename', (sid, from, to) => ssh.rename(String(sid), String(from), String(to)))
  handle('sftp:delete', (sid, path, isDir) => ssh.remove(String(sid), String(path), isDir === true))
  handle('sftp:disconnect', (sid) => ssh.disconnect(String(sid)))
  handle('shell:open', (id, passphrase, cols, rows) =>
    ssh.openShell(
      String(id),
      typeof passphrase === 'string' ? passphrase : null,
      keychain,
      { cols: Number(cols), rows: Number(rows) },
      (session, data) => send('shell:data', { session, data }),
      (session) => send('shell:exit', { session })
    )
  )
  handle('shell:write', (sid, data) => {
    if (typeof data !== 'string' || data.length > 1_000_000) throw new Error('Invalid input.')
    ssh.writeShell(String(sid), data)
  })
  handle('shell:resize', (sid, cols, rows) => ssh.resizeShell(String(sid), Number(cols), Number(rows)))
  handle('shell:close', (sid) => ssh.closeShell(String(sid)))
  // The page has no clipboard permission of its own; the terminal reads and writes through here.
  // ---- GitHub
  const ghTok = (): string => github.token(keychain)
  // While the project is private, updates and PHP builds are read with this sign-in.
  setDownloadToken(() => {
    try {
      return github.account() ? github.token(keychain) : null
    } catch {
      return null
    }
  })
  handle('github:account', () => ({ account: github.account(), cli: findCli(['gh']) !== null }))
  handle('github:sign-in', (tok) => github.signIn(String(tok), keychain))
  handle('github:sign-in-cli', async () => {
    const cli = findCli(['gh'])
    if (!cli) throw new Error('The GitHub CLI is not installed. Paste a token instead.')
    const tok = await new Promise<string>((resolve, reject) =>
      execFile(cli, ['auth', 'token'], { timeout: 10000 }, (err, out) => (err ? reject(new Error('Sign in to the GitHub CLI first with "gh auth login".')) : resolve(String(out).trim())))
    )
    return github.signIn(tok, keychain)
  })
  handle('github:sign-out', () => github.signOut())
  handle('github:repos', () => github.listRepos(ghTok()))
  handle('github:edit', (full, patch) => {
    const p = (patch ?? {}) as Record<string, unknown>
    const clean: { description?: string; private?: boolean; homepage?: string } = {}
    if (typeof p.description === 'string') clean.description = p.description.slice(0, 350)
    if (typeof p.private === 'boolean') clean.private = p.private
    if (typeof p.homepage === 'string') clean.homepage = p.homepage.slice(0, 255)
    return github.editRepo(ghTok(), String(full), clean)
  })
  handle('github:clone', async (full) => {
    const name = String(full)
    if (!github.REPO.test(name)) throw new ValidationError('Unknown repository.')
    const acc = github.storedAccount()!
    const tok = ghTok()
    const folder = name.split('/')[1]
    await jobs.run(`Cloning ${name}`, async (update) => {
      update(null, `Cloning ${name}`)
      await github.cloneRepo(`https://github.com/${name}.git`, join(ensureWww(), folder), github.authFor(tok, acc))
    })
    activity.push('success', `Cloned ${name}`, `It is in your projects folder as ${folder}.`)
    notifySitesChanged()
    return listSites()
  })
  handle('github:create', async (input) => {
    const i = (input ?? {}) as Record<string, unknown>
    const tok = ghTok()
    const repo = await github.createRepo(tok, String(i.name ?? '').trim(), i.private !== false, typeof i.description === 'string' ? i.description.slice(0, 350) : '', i.readme === true)
    activity.push('success', `Created ${repo.fullName} on GitHub`)
    if (i.clone !== true) return { repo, sites: null }
    const acc = github.storedAccount()!
    await jobs.run(`Cloning ${repo.fullName}`, async (update) => {
      update(null, `Cloning ${repo.fullName}`)
      await github.cloneRepo(`https://github.com/${repo.fullName}.git`, join(ensureWww(), repo.name), github.authFor(tok, acc))
    })
    notifySitesChanged()
    return { repo, sites: listSites() }
  })
  handle('github:delete', async (full) => {
    await github.deleteRepo(ghTok(), String(full))
    activity.push('info', `Deleted ${full} on GitHub`)
  })
  handle('github:details', (full) => github.repoDetails(ghTok(), String(full)))
  handle('github:download-zip', async (full) => {
    const name = String(full)
    if (!github.REPO.test(name)) throw new ValidationError('Unknown repository.')
    const res = await dialog.showSaveDialog(mainWindow!, { title: `Download ${name}`, defaultPath: join(homedir(), 'Downloads', `${name.split('/')[1]}.zip`), filters: [{ name: 'Zip', extensions: ['zip'] }] })
    if (res.canceled || !res.filePath) return null
    await jobs.run(`Downloading ${name}`, async (update) => {
      update(null, `Downloading ${name}`)
      await github.downloadZip(ghTok(), name, res.filePath!)
    })
    return res.filePath
  })
  handle('github:pull', async (path) => {
    const p = sitePath(path)
    const msg = await github.pull(p, github.authFor(ghTok(), github.storedAccount()!))
    notifySitesChanged()
    return msg
  })
  handle('github:site-status', async (path) => {
    const st = await github.siteStatus(sitePath(path))
    return { ...st, next: github.nextVersion(st.lastTag) }
  })
  handle('github:push', async (path, opts) => {
    const p = sitePath(path)
    const o = opts as GitPushOptions
    if (!['main', 'branch', 'tag', 'release'].includes(o?.mode)) throw new ValidationError('Choose how to push.')
    const tok = ghTok()
    const acc = github.storedAccount()!
    const st = await github.siteStatus(p)
    // A repository chosen in the dialog wins over the one the site is linked to.
    let repo: string | null = o.repo && github.REPO.test(o.repo) ? o.repo : null
    if (!repo && o.create) repo = (await github.createRepo(tok, o.create.name, o.create.private !== false)).fullName
    if (!repo && st.remote && github.REPO.test(st.remote)) repo = st.remote
    if (!repo) throw new ValidationError('Choose a repository or create a new one.')
    const name = p.split('/').pop()
    const result = await jobs.run(`Pushing ${name} to GitHub`, async (update) => {
      update(null, `Pushing ${name} to ${repo}`)
      const r = await github.publish(p, `https://github.com/${repo}.git`, o, github.authFor(tok, acc))
      if (o.mode === 'release') r.url = await github.createRelease(tok, repo!, r.ref, r.ref, o.notes ?? '')
      else if (o.mode === 'tag') r.url = `https://github.com/${repo}/releases/tag/${encodeURIComponent(r.ref)}`
      else if (o.mode === 'branch') r.url = `https://github.com/${repo}/compare/${encodeURIComponent(r.ref)}?expand=1`
      else r.url = `https://github.com/${repo}/tree/${encodeURIComponent(r.ref)}`
      return r
    })
    activity.push('success', `${name} pushed to GitHub`, `${repo} ${result.mode === 'main' ? result.ref : result.mode} ${result.mode === 'main' ? '' : result.ref}`.trim())
    return result
  })

  // ---- API client
  handle('api:load', () => api.loadStore())
  handle('api:save', (store) => api.saveStore(store as ApiStore))
  const apiVars = (store: ApiStore, envId: unknown, colId: unknown): KV[] =>
    api.mergeVars(store.collections.find((c) => c.id === colId)?.variables, store.environments.find((e) => e.id === envId)?.vars)
  /** Saved values from a response go into the active environment. */
  const keepSaved = (store: ApiStore, envId: unknown, saved: { key: string; value: string }[]): void => {
    if (!saved.length) return
    const env = store.environments.find((e) => e.id === envId)
    if (env) store.environments = store.environments.map((e) => (e.id === env.id ? api.applySaved(e, saved) : e))
  }
  handle('api:send', async (req, envId, colId) => {
    const store = api.loadStore()
    const res = await api.sendRequest(req as ApiRequest, apiVars(store, envId, colId))
    keepSaved(store, envId, res.saved)
    store.history = [{ at: Date.now(), method: (req as ApiRequest).method, url: res.url, status: res.status, ms: res.ms }, ...store.history].slice(0, 50)
    api.saveStore(store)
    return res
  })
  handle('api:run', async (colId, envId, folder) => {
    const store = api.loadStore()
    const col = store.collections.find((c) => c.id === colId)
    if (!col) throw new ValidationError('That collection is no longer there.')
    const list = col.requests.filter((r) => !folder || r.folder === folder || (r.folder ?? '').startsWith(`${folder}/`))
    const results: ApiRunResult[] = []
    await jobs.run(`Running ${col.name}`, async (update) => {
      for (const [i, r] of list.entries()) {
        update(Math.round((i / Math.max(1, list.length)) * 100), `${i + 1} of ${list.length}: ${r.name}`)
        try {
          const res = await api.sendRequest(r, apiVars(store, envId, colId))
          keepSaved(store, envId, res.saved)
          results.push({ id: r.id, name: r.name, status: res.status, ms: res.ms, tests: res.tests, error: null })
        } catch (err) {
          results.push({ id: r.id, name: r.name, status: null, ms: 0, tests: [], error: (err as Error).message })
        }
      }
    })
    api.saveStore(store)
    return results
  })
  handle('api:export', async (colId) => {
    const col = api.loadStore().collections.find((c) => c.id === colId)
    if (!col) throw new ValidationError('That collection is no longer there.')
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: `Export ${col.name}`,
      defaultPath: join(homedir(), 'Downloads', `${col.name.replace(/[^\w .-]/g, '')}.postman_collection.json`),
      filters: [{ name: 'Postman collection', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, JSON.stringify(api.toPostman(col), null, 2))
    return res.filePath
  })
  handle('api:code', (req, envId, colId, lang) => {
    if (!['curl', 'fetch', 'php', 'python'].includes(String(lang))) throw new ValidationError('Unknown language.')
    return api.toCode(req as ApiRequest, apiVars(api.loadStore(), envId, colId), lang as 'curl')
  })
  handle('api:import', (text) => {
    if (typeof text !== 'string' || text.length > 20_000_000) throw new ValidationError('That is too large to import.')
    return api.importText(text)
  })
  handle('api:import-file', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, { title: 'Import requests', properties: ['openFile'], filters: [{ name: 'Postman, Insomnia or OpenAPI', extensions: ['json'] }] })
    if (res.canceled || !res.filePaths[0]) return null
    return api.importText(readFileSync(res.filePaths[0], 'utf8'))
  })
  handle('deploy:run', async (path, target, force, passphrase) => {
    const p = sitePath(path)
    const site = scanSites().find((x) => x.path === p)!
    const clean = cleanSiteConfig({ deploy: target }).deploy!
    const srv = ssh.listServers().find((x) => x.id === clean.serverId)
    if (!srv) throw new ValidationError('That server is no longer saved.')
    setSiteConfig(site.name, { deploy: clean })
    const result = await jobs.run(`Deploying ${site.name} to ${srv.name}`, async (update) => {
      update(null, `Connecting to ${srv.name}`)
      const fs = await ssh.openFs(srv.id, typeof passphrase === 'string' ? passphrase : null, keychain)
      try {
        return await deploy(fs, p, clean.remotePath, { force: force === true, excludes: clean.excludes }, update)
      } finally {
        fs.close()
      }
    })
    activity.push('success', `${site.name} deployed to ${srv.name}`, `${result.uploaded} files sent, ${result.skipped} already up to date`)
    return result
  })
  handle('clipboard:read', async () => String(await clipboard.readText()).slice(0, 1_000_000))
  handle('clipboard:write', (text) => {
    if (typeof text !== 'string' || text.length > 1_000_000) throw new ValidationError('Invalid text.')
    clipboard.writeText(text)
  })

  // ---- MCP: Claude Code and other agents
  const serviceIds = services.list().map((x) => x.id)
  const str = (v: unknown, what: string): string => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${what} is required.`)
    return v.trim()
  }
  const siteNamed = (name: unknown): SiteInfo => {
    const n = str(name, 'site')
    const site = scanSites().find((x) => x.name === n || x.domain === n)
    if (!site) throw new Error(`No site called ${n}. Use list_sites to see them.`)
    return site
  }
  const svcId = (v: unknown): ServiceId => {
    const id = str(v, 'service') as ServiceId
    if (!serviceIds.includes(id)) throw new Error(`Unknown service. Use one of: ${serviceIds.join(', ')}.`)
    return id
  }
  const engineArg = (v: unknown): 'mysql' | 'mariadb' => (v === 'mariadb' ? 'mariadb' : 'mysql')
  const mcpTools: McpTool[] = [
    {
      name: 'list_sites',
      description: 'Lists the local sites: name, URL, folder, project type, PHP version and the database each one uses.',
      inputSchema: { type: 'object', properties: {} },
      run: async () =>
        scanSites().map((x) => ({
          name: x.name,
          url: x.secure ? x.httpsUrl : x.url,
          path: x.path,
          kind: x.kind,
          php: x.php,
          database: snapshots.detectSiteDatabase(x.path),
          publicUrl: x.shareUrl ?? null
        }))
    },
    {
      name: 'list_services',
      description: 'Lists Apache, Nginx, PHP, MySQL, MariaDB, PostgreSQL, Redis and the other services with their status, port and version.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => services.list().map(({ id, name, status, port, version, error, connection }) => ({ id, name, status, port, version, connection, error }))
    },
    {
      name: 'start_service',
      description: 'Starts a service, for example mysql or apache.',
      inputSchema: { type: 'object', properties: { service: { type: 'string', description: 'Service id from list_services' } }, required: ['service'] },
      writes: true,
      run: async (a) => {
        const id = svcId(a.service)
        await services.start(id)
        send('services:changed', services.list())
        return services.list().find((x) => x.id === id)
      }
    },
    {
      name: 'stop_service',
      description: 'Stops a service.',
      inputSchema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] },
      writes: true,
      run: async (a) => {
        const id = svcId(a.service)
        await services.stop(id)
        send('services:changed', services.list())
        return services.list().find((x) => x.id === id)
      }
    },
    {
      name: 'set_site_php',
      description: 'Sets the PHP version a site runs on. Use list_php_versions to see what is installed.',
      inputSchema: { type: 'object', properties: { site: { type: 'string' }, version: { type: 'string', description: 'Minor version such as 8.4' } }, required: ['site', 'version'] },
      writes: true,
      run: async (a) => {
        const site = siteNamed(a.site)
        const php = assertMinor(str(a.version, 'version'))
        if (!installedMinors().includes(php)) throw new Error(`PHP ${php} is not installed. Installed: ${installedMinors().join(', ')}.`)
        setSiteConfig(site.name, { php })
        notifySitesChanged()
        return `${site.name} now runs on PHP ${php}.`
      }
    },
    {
      name: 'list_php_versions',
      description: 'Lists installed PHP versions and the default.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => ({ installed: installedMinors(), default: defaultMinor() })
    },
    {
      name: 'list_databases',
      description: 'Lists MySQL and MariaDB databases with their tables, rows and size.',
      inputSchema: { type: 'object', properties: {} },
      run: () => listAllDbs()
    },
    {
      name: 'create_database',
      description: 'Creates an empty database (utf8mb4).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, engine: { type: 'string', enum: ['mysql', 'mariadb'] } }, required: ['name'] },
      writes: true,
      run: async (a) => {
        await dbadmin.createDatabase(dbTarget(engineArg(a.engine)), dbadmin.checkName(str(a.name, 'name')))
        return `Created ${a.name}. Connect as root with no password on 127.0.0.1:${engineArg(a.engine) === 'mysql' ? 3306 : 3307}.`
      }
    },
    {
      name: 'query_database',
      description: 'Runs one read-only SQL statement (SELECT, SHOW, DESCRIBE or EXPLAIN) and returns up to 200 rows.',
      inputSchema: {
        type: 'object',
        properties: { database: { type: 'string' }, sql: { type: 'string' }, engine: { type: 'string', enum: ['mysql', 'mariadb'] } },
        required: ['database', 'sql']
      },
      run: (a) => dbadmin.readOnlyQuery(dbTarget(engineArg(a.engine)), str(a.database, 'database'), str(a.sql, 'sql'))
    },
    {
      name: 'snapshot_site',
      description: "Saves a snapshot of a site's files and database, to come back to later.",
      inputSchema: { type: 'object', properties: { site: { type: 'string' }, note: { type: 'string' } }, required: ['site'] },
      writes: true,
      run: async (a) => {
        const site = siteNamed(a.site)
        const snap = await snapshots.createSnapshot(site.path, typeof a.note === 'string' ? a.note : 'Saved by an AI tool', snapDeps)
        activity.push('success', `Snapshot of ${site.name} saved`, snap.note)
        return snap
      }
    },
    {
      name: 'list_snapshots',
      description: 'Lists the snapshots of a site.',
      inputSchema: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] },
      run: async (a) => snapshots.listSnapshots(siteNamed(a.site).path)
    },
    {
      name: 'start_dev_server',
      description: "Starts a site's own dev server (Vite, Next.js, Django, dotnet watch...) so it answers at its .test address.",
      inputSchema: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] },
      run: async (a) => {
        const site = siteByName(str(a.site, 'site'))
        const cfg = getSettings().siteConfig[site.name]?.dev
        if (!cfg) throw new Error(`${site.name} has no dev server set up.`)
        await startDev(site, cfg)
        notifySitesChanged()
        return `${site.name} dev server is running at ${site.url} (port ${cfg.port}).`
      }
    },
    {
      name: 'stop_dev_server',
      description: "Stops a site's dev server.",
      inputSchema: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] },
      run: async (a) => {
        const site = siteByName(str(a.site, 'site'))
        await stopDev(site.name)
        notifySitesChanged()
        return `${site.name} dev server stopped.`
      }
    },
    {
      name: 'read_log',
      description: 'Returns the last lines of a log, such as apache-error.log, php-8.4-error.log or mysql-error.log. Call with no name to list the logs.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, lines: { type: 'number' } } },
      run: async (a) => {
        const logs = readdirSync(dirs.logs()).filter((n) => /^[A-Za-z0-9._-]+\.log$/.test(n))
        if (!a.name) return { logs }
        const name = str(a.name, 'name')
        if (!logs.includes(name)) throw new Error(`No log called ${name}. Available: ${logs.join(', ')}.`)
        const n = Math.min(500, Math.max(1, Number(a.lines) || 100))
        return tailFile(join(dirs.logs(), name), n)
      }
    }
  ]

  let mcpServer: import('http').Server | null = null
  let mcpError: string | null = null
  const startMcp = async (): Promise<void> => {
    if (mcpServer) return
    try {
      mcpServer = await startMcpServer({ tools: mcpTools, version: app.getVersion(), onCall: (name) => activity.push('info', `AI tool used ${name.replace(/_/g, ' ')}`) })
      mcpError = null
    } catch (err) {
      mcpError = `Could not listen on port ${MCP_PORT}: ${(err as Error).message}`
    }
  }
  const stopMcp = (): void => {
    mcpServer?.close()
    mcpServer = null
  }
  const claudeMcp = async (): Promise<McpStatus['claude']> => {
    const claude = findCli(['claude'])
    if (!claude) return 'not-installed'
    return new Promise((resolve) =>
      execFile(claude, ['mcp', 'get', 'laramac'], { timeout: 10000 }, (err, out) => resolve(!err && /127\.0\.0\.1:\d+\/mcp/.test(String(out)) ? 'connected' : 'not-connected'))
    )
  }
  const mcpStatus = async (): Promise<McpStatus> => ({
    enabled: getSettings().mcpEnabled,
    running: !!mcpServer,
    url: mcpUrl(),
    command: `claude mcp add --transport http --scope user laramac ${mcpUrl()} --header "Authorization: Bearer ${mcpToken()}"`,
    claude: await claudeMcp(),
    error: mcpError
  })
  if (getSettings().mcpEnabled) void startMcp()
  handle('mcp:status', () => mcpStatus())
  handle('mcp:enable', async (on) => {
    setSettings({ mcpEnabled: on === true })
    if (on === true) await startMcp()
    else stopMcp()
    return mcpStatus()
  })
  handle('mcp:connect', async () => {
    const claude = findCli(['claude'])
    if (!claude) throw new Error('Install Claude Code first. It is under AI tools.')
    setSettings({ mcpEnabled: true })
    await startMcp()
    const run = (args: string[]): Promise<void> =>
      new Promise((resolve, reject) => execFile(claude, args, { timeout: 20000 }, (err, _o, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve())))
    await run(['mcp', 'remove', 'laramac', '--scope', 'user']).catch(() => undefined)
    await run(['mcp', 'add', '--transport', 'http', '--scope', 'user', 'laramac', mcpUrl(), '--header', `Authorization: Bearer ${mcpToken()}`])
    activity.push('success', 'Claude Code is connected to Laramac', 'Ask it to start services, create databases or take snapshots.')
    return mcpStatus()
  })

  // ---- Snapshots
  const snapDeps: snapshots.SnapshotDeps = {
    target: (engine) => {
      try {
        return dbTarget(engine)
      } catch {
        return null
      }
    }
  }
  const snapId = (id: unknown): string => {
    if (typeof id !== 'string' || !/^\d{8}-\d{6}-[a-z0-9]{4}$/.test(id)) throw new ValidationError('Unknown snapshot.')
    return id
  }
  handle('snapshots:list', (path) => snapshots.listSnapshots(sitePath(path)))
  handle('snapshots:create', async (path, note) => {
    const p = sitePath(path)
    const name = p.split('/').pop()
    const snap = await jobs.run(`Saving a snapshot of ${name}`, async (update) => {
      update(null, `Saving ${name}`)
      return snapshots.createSnapshot(p, typeof note === 'string' ? note : '', snapDeps)
    })
    activity.push('success', `Snapshot of ${name} saved`, snap.databaseSkipped ?? (snap.database ? `Files and the ${snap.database.name} database` : 'Files'))
    return snapshots.listSnapshots(p)
  })
  handle('snapshots:restore', async (path, id) => {
    const p = sitePath(path)
    const name = p.split('/').pop()
    await jobs.run(`Restoring ${name}`, async (update) => {
      update(null, `Restoring ${name}`)
      await snapshots.restoreSnapshot(p, snapId(id), snapDeps)
    })
    activity.push('success', `${name} restored`, 'A snapshot of how it was just before is in the list, in case you want it back.')
    return snapshots.listSnapshots(p)
  })
  handle('snapshots:export', async (path, id) => {
    const p = sitePath(path)
    const sid = snapId(id)
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export snapshot',
      defaultPath: join(homedir(), 'Downloads', snapshots.snapshotFileName(p, sid)),
      filters: [{ name: 'Laramac snapshot', extensions: ['gz'] }]
    })
    if (res.canceled || !res.filePath) return null
    snapshots.exportSnapshot(p, sid, res.filePath)
    return res.filePath
  })
  handle('snapshots:delete', (path, id) => {
    const p = sitePath(path)
    snapshots.deleteSnapshot(p, snapId(id))
    return snapshots.listSnapshots(p)
  })

  // ---- Packages
  handle('packages:list', () => listPackages())
  handle('packages:remove', async (id) => {
    const pid = String(id)
    if (!/^(php|mysql|postgres|dir|bin|brew|cache):[A-Za-z0-9._-]{1,40}$/.test(pid)) throw new ValidationError('Unknown package.')
    await jobs.run('Removing a package', async (update) => {
      update(null, 'Removing')
      await removePackage(pid, {
        stopService: async (sid) => {
          await services.stop(sid)
        },
        removePhp: (minor) => removeMinor(assertMinor(minor))
      })
    })
    activity.push('info', 'Removed a package', pid.replace(':', ' '))
    send('services:changed', services.list())
    return listPackages()
  })

  // ---- Databases (MySQL and MariaDB)
  const dbEngine = (e: unknown): 'mysql' | 'mariadb' => {
    if (e === 'mysql' || e === 'mariadb') return e
    throw new ValidationError('Unknown database engine.')
  }
  const dbTarget = (engine: 'mysql' | 'mariadb'): dbadmin.DbTarget => {
    const client = engine === 'mariadb' ? mariadbClient() : activeMysql() ? mysqlClientPath(activeMysql()!) : null
    if (!client) throw new Error(`${engine === 'mysql' ? 'MySQL' : 'MariaDB'} is not installed.`)
    const s = services.list().find((x) => x.id === engine)
    if (s?.status !== 'running') throw new Error(`Start ${s?.name ?? engine} first.`)
    return { engine, client, port: engine === 'mysql' ? 3306 : 3307 }
  }
  const listAllDbs = async (): Promise<DatabaseInfo[]> => {
    const out: DatabaseInfo[] = []
    for (const engine of ['mysql', 'mariadb'] as const) {
      const s = services.list().find((x) => x.id === engine)
      if (s?.status !== 'running') continue
      try {
        out.push(...(await dbadmin.listDatabases(dbTarget(engine))))
      } catch {
        /* server still starting */
      }
    }
    return out
  }
  handle('db:list', () => listAllDbs())
  handle('db:create', async (engine, name) => {
    await dbadmin.createDatabase(dbTarget(dbEngine(engine)), dbadmin.checkName(String(name)))
    activity.push('success', `Created database ${name}`)
    return listAllDbs()
  })
  handle('db:drop', async (engine, name) => {
    await dbadmin.dropDatabase(dbTarget(dbEngine(engine)), dbadmin.checkName(String(name)))
    activity.push('info', `Deleted database ${name}`)
    return listAllDbs()
  })
  handle('db:export', async (engine, name) => {
    const t = dbTarget(dbEngine(engine))
    const db = dbadmin.checkName(String(name))
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: `Back up ${db}`,
      defaultPath: join(homedir(), 'Downloads', `${db}-${stamp}.sql.gz`),
      filters: [
        { name: 'Compressed SQL', extensions: ['gz'] },
        { name: 'SQL', extensions: ['sql'] }
      ]
    })
    if (res.canceled || !res.filePath) return null
    await jobs.run(`Backing up ${db}`, async (update) => {
      update(null, `Backing up ${db}`)
      await dbadmin.exportDatabase(t, db, res.filePath!)
    })
    activity.push('success', `Backed up ${db}`, res.filePath)
    return res.filePath
  })
  handle('db:import', async (engine, name) => {
    const t = dbTarget(dbEngine(engine))
    const db = dbadmin.checkName(String(name))
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: `Import into ${db}`,
      buttonLabel: 'Import',
      properties: ['openFile'],
      filters: [{ name: 'SQL dump', extensions: ['sql', 'gz'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    await jobs.run(`Importing into ${db}`, (update) =>
      importSql(file, { client: t.client, engine: t.engine, port: t.port, database: db }, (p) => update(p, `Importing ${file.split('/').pop()}`))
    )
    activity.push('success', `Imported into ${db}`)
    return listAllDbs()
  })
  handle('db:open', async (engine, name) => {
    const db = dbadmin.checkName(String(name))
    const server = dbEngine(engine) === 'mysql' ? 1 : 2
    await shell.openExternal(`http://phpmyadmin.${getSettings().tld}/index.php?route=/database/structure&server=${server}&db=${encodeURIComponent(db)}`)
  })

  handle('activity:list', () => activity.list())
  handle('activity:clear', () => activity.clear())

  services.on('changed', (list) => send('services:changed', list))
  services.on('failed', (name: string, message: string) => activity.push('error', `${name} could not start`, message))
  jobs.on('changed', (list) => send('jobs:changed', list))
  jobs.on('finished', (job: { status: string; label: string; error?: string }) => {
    if (job.status === 'done') activity.push('success', job.label.replace(/^Installing/, 'Installed'))
    else activity.push('error', `${job.label} failed`, job.error)
  })
  activity.on('changed', (items) => send('activity:changed', items))
  processEvents.on('crashed', (name: string, code: number | null, logFile: string) => {
    activity.push('error', `${name} stopped unexpectedly`, tailFile(logFile, 3) || `Exit code ${code}`)
    services.refresh()
  })
}

// ------------------------------------------------------------------ Lifecycle

app.whenReady().then(() => {
  ensureDirs()
  ensureWww()
  refreshShims()
  refreshRuntimeShims()
  if (existsSync(cli.cliBin())) cli.installCli(process.execPath)
  hardenWebContents()
  registerIpc()
  watchWww()
  createWindow()
  createTray()

  activity.isFocused = () => BrowserWindow.getFocusedWindow() !== null
  activity.onNotificationClick = showWindow

  // The built-in DNS server resolves *.test to this Mac. It listens on 127.0.0.1 only.
  startDnsServer(() => getSettings().tld).catch((err) =>
    activity.push('error', 'Domain lookups could not start', `Port ${DNS_PORT} is busy: ${err instanceof Error ? err.message : err}`)
  )

  if (getSettings().dumps) dumps.startDumpServer().catch((err) => activity.push('error', 'The Dumps window could not start', (err as Error).message))
  app.on('activate', showWindow)
  void refreshLoginShellPaths()
  setTimeout(() => void backgroundChecks(), 8000)
  setInterval(() => void backgroundChecks(), 6 * 60 * 60 * 1000)
})

const announced = new Set<string>()
/** Looks for a newer Laramac and newer PHP builds, and says so once per version. */
async function backgroundChecks(): Promise<void> {
  if (!getSettings().autoUpdateCheck) return
  try {
    const info: UpdateInfo | null = await checkForUpdate()
    if (info && !announced.has(`app-${info.version}`)) {
      announced.add(`app-${info.version}`)
      activity.push('info', `Laramac ${info.version} is available`, 'Update from the banner on the Overview or in Settings.')
      send('update:available', info)
    }
  } catch {
    // Offline: try again later.
  }
  try {
    for (const v of await listVersions()) {
      if (v.updateAvailable && !announced.has(`php-${v.latest}`)) {
        announced.add(`php-${v.latest}`)
        activity.push('info', `PHP ${v.latest} is available`, `You have ${v.installed}. Update it on the PHP page.`)
      }
    }
  } catch {
    // Offline.
  }
}

app.on('window-all-closed', () => {
  // Keep running in the menu bar on macOS, like Laragon stays in the tray.
  if (!isMac) app.quit()
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  ssh.disconnectAll()
  dumps.stopDumpServer()
  void Promise.allSettled([stopAllTunnels(), services.stopAll(), stopAllFpm(), stopAllDev()]).then(() => {
    stopDnsServer()
    app.exit(0)
  })
})
