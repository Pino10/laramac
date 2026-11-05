import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import * as phpdev from './phpdev'
import { ideInstalled, ideLatest, ideLookChanged, ideOnStart, ideStatus, ideVersion, installApp, installExtensions, installIde, openIdeApp, openInIde } from './ide'
import { EDITORS, isAppBundle, isEditorChoice } from './seckit/editors'
import { latestRelease } from './seckit/ghapi'
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { cancelImport, importSql, inspect, inspectGit, runImport } from './importer'
import { runtimesFor } from './importsetup'
import { expandCommand } from './starterrun'
import { ensureRuntimes, locate } from './runtimes'
import * as dbadmin from './dbadmin'
import { cleanAlias, needsHostsEntry, syncHostsFile } from './hosts'
import { cleanRemotePath, deploy } from './deploy'
import { posix } from 'path'
import * as api from './apiclient'
import * as github from './github'
import { setDownloadToken } from './distribution'
import { readFileSync } from 'fs'
import { BREW, listPackages, removePackage } from './packages'
import { brew } from './brew'
import * as upd from './updates'
import * as azure from './azure'
import * as apiRoutes from './apiroutes'
import * as tools from './sitetools'
import { checkHookUrl, hookBody, raycastScripts, sendHook, type HookKind } from './webhooks'
import { startWorker, stopAllWorkers, stopWorker, workerLogs, workerRunning } from './workers'
import { claudeFreeConfigFor, claudeFreeInstalled, claudeLmConfigFor, claudeLmInstalled, installClaudeFree, installClaudeLm, readFreeKey, removeClaudeFree, storeFreeKey, storeLmToken } from './claudesetup'
import { checkFreeLlm, checkFreeLlmKey, FREELLM_DEFAULT_URL, FREELLM_MODELS, freeLlmModel, freeLlmUrl } from './seckit/freellm'
import { ensureLmContext } from './seckit/lmstudio'
import { brewPrefix } from './platform'
import * as snapshots from './snapshots'
import { MCP_PORT, mcpToken, mcpUrl, startMcpServer, type McpTool } from './mcp'
import { findCli } from './aitools'
import { execFile } from 'child_process'
import { readdirSync } from 'fs'
import { dirs } from './paths'
import { homedir } from 'os'
import { checkForUpdate, installUpdate, releaseNotes } from './updater'
import { installRuntime, latestVersions, listRuntimes, refreshRuntimeShims, RUNTIME_IDS } from './runtimes'
import { createFromStarter, prepareWeb, starterReadiness } from './starterrun'
import { backendStatus, setupFirebase, setupSupabase, startBackend, stopAllBackends, stopBackend } from './backends'
import { devFromScript, devLogFile, devLogs, isDevRunning, pickDevPort, startDev, stopAllDev, stopDev } from './devservers'
import * as nodes from './nodeversions'
import { STARTERS, starterById } from '../shared/starters'
import { collectSiteLogs, explainSite } from './sitedoctor'
import * as models from './models'
import * as mailrelay from './mailrelay'
import * as review from './review'
import * as recon from './recon'
import * as hub from './hub'
import { installForClaude, installedForClaude, installPackSkillsForClaude, removeFromClaude, removePackSkillsFromClaude, SKILLS } from './seckit/skills'
import { installPack, packSkillFolders, packState, removePack, SKILL_PACKS } from './seckit/skillpacks'
import { connectClaudeDesktop, desktopAppInstalled, desktopConnected, desktopConfigPath } from './desktop'
import * as scan from './scan'
import * as audit from './audit'
import * as dumps from './dumps'
import * as project from './project'
import * as cli from './cli'
import { dbPassword, getSecret, setSecret, setSecretsCrypto } from './secrets'
import { createPgDatabase } from './svc/postgres'
import { runQuiet } from './starterrun'
import { runtimeEnv } from './runtimes'
import { normalize } from 'path'
import { buildTrayMenu, type TrayAction, type TrayItem } from './traymenu'
import { resetLaramac } from './reset'
import { setupRecommended } from './setup'
import { installAiTool, launchAiTool, listAiTools, refreshLoginShellPaths } from './aitools'
import * as ssh from './ssh'
import { customIniPath, ensureCustomIni, ensureXdebug, importPhp, xdebugPath } from './php'
import { safeStorage } from 'electron'
import type { OverviewPulse, FreeLlmInfo, PhpQuick, PhpToolInfo, IntegrationsInfo, HostingConfig, WorkerConfig, SkillPackInfo, ApiEnvironment, AzureAccount, AzureRepo, ClaudeSetupStatus, UpdateItem, UpdatesReport, RuntimeId, NodeVersionsInfo, SiteNodeInfo, HealthIssue, ReviewFinding, ReviewInfo, ReconRequest, ReviewerKind, ReviewFocus, ApiRequest, ApiRunResult, ApiStore, GitPushOptions, KV, DatabaseInfo, McpStatus, ResetOptions, ServiceId, SshServerInput, UpdateInfo } from '../shared/types'
import { activeMysql, mysqlClientPath, createDatabase as createMysqlDb } from './svc/mysql'
import { mariadbClient } from './svc/mariadb'
import { runStreaming } from './creator'
import type { ImportAnswers } from '../shared/types'
import { watch, type FSWatcher } from 'fs'
import { dirname, join } from 'path'
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
  cloudflaredBinary,
  refreshShims,
  toolsStatus,
  writePmaConfig
} from './tools'
import { shareSite, shareUrls, stopAllTunnels, unshareSite } from './share'
import { createProject } from './creator'
import { detectLlms, installClaudeCode, openClaudeCode, openInEditor, openTerminal, projectRoots, shellQuote, testLlm } from './integrations'
import { assistantChat } from './ai'
import { processEvents, runningProcesses, tailFile } from './process'
import { phpmyadminInstalled } from './webconf'
import { findOnPath, macMajor } from './platform'
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
      else if (src.github) v = (await latestRelease(src.github)).tag
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
/** Tells the node, npm and npx commands in Terminal which version each site uses. */
function syncNodeMap(): void {
  try {
    const cfg = getSettings().siteConfig
    const entries: { path: string; major: string }[] = []
    for (const s of listSites()) {
      const c = nodes.siteNodeChoice(s.path, cfg[s.name]?.node)
      if (c.bin && c.want) entries.push({ path: s.path, major: c.want })
    }
    nodes.writeNodeMap(entries)
  } catch {
    // Terminal falls back to .nvmrc and the main Node.
  }
}

function notifySitesChanged(): void {
  send('sites:changed', listSites())
  setTimeout(syncNodeMap, 0)
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
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingIdeShow) {
      send('ide:show', pendingIdeShow)
      pendingIdeShow = null
    }
  })

  if (RENDERER_URL) mainWindow.loadURL(RENDERER_URL)
  else mainWindow.loadFile(RENDERER_FILE)
}

/** laramac://code (from the Laramac Code app's setup screen): Laramac opens on its Laramac Code page. */
let pendingIdeShow: { url: string | null } | null = null
function showIde(url: string | null): void {
  const loading = !mainWindow || mainWindow.webContents.isLoading()
  showWindow()
  if (loading) pendingIdeShow = { url }
  else send('ide:show', { url })
}
// Nothing else is accepted.
app.on('open-url', (e, url) => {
  e.preventDefault()
  if (!/^laramac:\/\/code\/?$/.test(url)) return
  if (app.isReady()) showIde(null)
  else pendingIdeShow = { url: null }
})

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
            editor: st.editor === 'custom' && st.editorApp ? st.editorApp.split('/').pop()!.replace(/\.app$/, '') : (EDITORS.find((e) => e.id === st.editor)?.name ?? 'Laramac Code'),
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
    setup: Array.isArray(a.setup) ? a.setup.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
    startDev: flag('startDev')
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
    if (next.accent !== before.accent || next.editorFont !== before.editorFont || next.editorFontSize !== before.editorFontSize || next.uiFont !== before.uiFont || next.wwwPath !== before.wwwPath) void ideLookChanged(next.accent !== before.accent).catch(() => undefined)
    if (next.appearance !== before.appearance) nativeTheme.themeSource = next.appearance === 'light' || next.appearance === 'dark' ? next.appearance : 'system'
    // claudelm follows the model chosen in the Assistant.
    if ((next.llm.model !== before.llm.model || next.llm.baseUrl !== before.llm.baseUrl) && claudeLmInstalled().installed) {
      const claude = findCli(['claude'])
      if (claude && next.llm.model) installClaudeLm(claudeLmConfigFor({ claude, baseUrl: next.llm.baseUrl, model: next.llm.model, plugins: review.ensurePlugins() }), process.execPath, true)
    }
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
    const { devPort, warning } = await createFromStarter({ starter: starter.id, name, options, start: !!req.start, git: !!req.git, web: req.web === 'nginx' ? 'nginx' : req.web === 'apache' ? 'apache' : undefined })
    activity.push('success', `Created ${name}`, `New ${starter.name} project in your www folder.`)
    if (warning) activity.push('error', `${name}: database not ready`, warning)
    notifySitesChanged()
    if (devPort && req.start) {
      const site = siteByName(name)
      const cfg = getSettings().siteConfig[name]?.dev
      const backend = getSettings().siteConfig[name]?.backend
      if (backend) await startBackend(name, site.path, backend).catch((err) => activity.push('error', `${name}: ${backend.kind === 'supabase' ? 'Supabase' : 'Firebase'} did not start`, (err as Error).message.slice(0, 300)))
      if (cfg) await startDev(site, cfg).catch((err) => activity.push('error', `${name} dev server did not start`, (err as Error).message.slice(0, 300)))
      // The web server picks up the new address before you open it.
      await services.reloadWeb()
    }
    return listSites()
  })
  handle('starters:readiness', () => starterReadiness())
  handle('backends:status', () => backendStatus())
  handle('backends:add', async (name, kind) => {
    const site = siteByName(name)
    if (kind !== 'supabase' && kind !== 'firebase') throw new ValidationError('Choose Supabase or Firebase.')
    const starterId = existsSync(join(site.path, 'next.config.ts')) || existsSync(join(site.path, 'next.config.mjs')) || existsSync(join(site.path, 'next.config.js')) ? 'nextjs' : existsSync(join(site.path, 'nuxt.config.ts')) ? 'nuxt' : existsSync(join(site.path, 'svelte.config.js')) ? 'sveltekit' : existsSync(join(site.path, 'astro.config.mjs')) ? 'astro' : existsSync(join(site.path, 'vite.config.ts')) || existsSync(join(site.path, 'vite.config.js')) ? 'vite' : 'node'
    const backend = await jobs.run(`Adding ${kind === 'supabase' ? 'Supabase' : 'Firebase'} to ${site.name}`, (u) => (kind === 'supabase' ? setupSupabase : setupFirebase)(site.path, site.name, starterId, (l) => u(null, l.slice(0, 80))))
    setSiteConfig(site.name, { backend })
    activity.push('success', `${kind === 'supabase' ? 'Supabase' : 'Firebase'} is ready for ${site.name}`, `Its keys are in the project's .env file. ${backend.studioUrl ? `Open ${backend.studioUrl} to manage it.` : ''}`)
    notifySitesChanged()
    return listSites()
  })
  handle('backends:start', async (name) => {
    const site = siteByName(name)
    const b = getSettings().siteConfig[site.name]?.backend
    if (!b) throw new ValidationError('This site has no Supabase or Firebase.')
    await jobs.run(`Starting ${b.kind === 'supabase' ? 'Supabase' : 'Firebase'} for ${site.name}`, (u) => startBackend(site.name, site.path, b, (l) => u(null, l.slice(0, 80))))
    notifySitesChanged()
    return listSites()
  })
  handle('backends:stop', async (name) => {
    const site = siteByName(name)
    const b = getSettings().siteConfig[site.name]?.backend
    if (b) await stopBackend(site.name, site.path, b)
    notifySitesChanged()
    return listSites()
  })
  handle('dev:start', async (name) => {
    const site = siteByName(name)
    const cfg = getSettings().siteConfig[site.name]?.dev
    if (!cfg) throw new ValidationError('This site has no dev server set up.')
    const backend = getSettings().siteConfig[site.name]?.backend
    if (backend) await startBackend(site.name, site.path, backend).catch((err) => activity.push('error', `${site.name}: ${backend.kind === 'supabase' ? 'Supabase' : 'Firebase'} did not start`, (err as Error).message.slice(0, 300)))
    if (!services.anyRunning()) await prepareWeb().catch((err) => activity.push('error', 'The web server is not running', (err as Error).message.slice(0, 300)))
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
  handle('sites:open-with', (path, editor) => {
    if (typeof editor !== 'string' || !(isEditorChoice(editor) || editor === 'laramac')) throw new ValidationError('Choose an editor from the list.')
    return openInEditor(editor, sitePath(path))
  })
  // ---- Laramac Code
  handle('ide:status', () => ideStatus())
  handle('ide:install', async () => {
    await jobs.run(ideInstalled() ? 'Updating Laramac Code' : 'Installing Laramac Code', (u) => installIde(u))
    activity.push('success', 'Laramac Code is ready', 'PHP Intelephense, PHP Debug, Blade, Prettier, ESLint and Tailwind are in.')
    return ideStatus()
  })
  handle('ide:extensions', async () => {
    if (!ideInstalled()) throw new ValidationError('Install Laramac Code first.')
    await jobs.run('Adding extensions to Laramac Code', (u) => installExtensions(u))
    return ideStatus()
  })
  handle('ide:open', async (path) => {
    if (!ideInstalled()) await jobs.run('Installing Laramac Code', (u) => installIde(u))
    if (typeof path === 'string' && path) await openInIde(sitePath(path), undefined, projectRoots(), getSettings().wwwPath)
    else await openIdeApp()
  })
  handle('ide:install-app', async () => {
    if (!ideInstalled()) throw new ValidationError('Install Laramac Code first.')
    await jobs.run('Getting the Laramac Code app', (u) => installApp(u))
    return ideStatus()
  })
  handle('macsec:status', () => ({ installed: existsSync('/Applications/MacSec.app') || existsSync(join(homedir(), 'Applications', 'MacSec.app')) || review.hasMacsec() }))
  handle('editors:choose-app', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Choose the app to open your code with', buttonLabel: 'Use this app', defaultPath: '/Applications', properties: ['openFile'], filters: [{ name: 'Apps', extensions: ['app'] }] })
    const app = r.canceled ? null : r.filePaths[0]
    if (!app || !isAppBundle(app)) return null
    setSettings({ editor: 'custom', editorApp: app.replace(/\/$/, '') })
    return { app, name: app.split('/').pop()!.replace(/\.app$/, '') }
  })
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
  handle('import:git', async (url, token) => {
    const engines = services
      .list()
      .filter((s) => (s.id === 'mysql' || s.id === 'mariadb') && s.status !== 'not-installed')
      .map((s) => s.id as 'mysql' | 'mariadb')
    try {
      return await inspectGit(String(url ?? ''), String(token ?? ''), engines)
    } catch (err) {
      throw new ValidationError((err as Error).message)
    }
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
        dbPassword: (engine) => dbPassword(engine),
        createDb: async (name) => {
          if (!services.list().some((x) => x.id === 'mysql' && x.status !== 'not-installed')) return false
          await services.start('mysql')
          return createMysqlDb(name)
        },
        runStep: async (argv, dir, onLine) => {
          // Runtimes the command needs (Node.js, Python, Go...) are installed first, like Starters does.
          const needs = runtimesFor([{ id: 'node', label: '', detail: '', command: argv, runsCode: true }], null).filter((r) => r !== 'php')
          if (needs.length) await ensureRuntimes(needs)
          let php: { bin: string; ini: string; composer: string } | null = null
          if (argv[0] === 'php' || argv[0] === 'composer') {
            const minor = defaultMinor()
            if (!minor) throw new Error('Install PHP on the PHP page first.')
            if (!existsSync(composerPhar())) await installComposer()
            php = { bin: phpBinary(minor), ini: phpIniPath(minor), composer: composerPhar() }
          }
          await runQuiet(expandCommand(argv, php), dir, { ...nodes.siteRuntimeEnv(dir), COMPOSER_HOME: join(app.getPath('home'), '.laramac', 'composer') }, onLine)
        }
      })
    )
    const parts = [result.site ? `Site ${result.site}` : null, result.database ? `database ${result.database}` : null].filter(Boolean)
    activity.push('success', `Imported ${a.name}`, `${parts.join(' and ')} ready.${result.skipped ? ` ${result.skipped} lines that change databases or users were skipped.` : ''}`)
    for (const f of result.failed) activity.push('error', `${a.name}: ${f.label} did not finish`, f.error)
    let url: string | null = result.site ? siteByName(result.site).url : null
    if (result.site && result.dev) {
      const port = await pickDevPort()
      setSiteConfig(result.site, { dev: { ...result.dev, port } })
      const site = siteByName(result.site)
      await startDev(site, { ...result.dev, port }).catch((err) => activity.push('error', `${a.name} dev server did not start`, (err as Error).message.slice(0, 300)))
      url = site.url
    }
    notifySitesChanged()
    const { dev: _dev, ...rest } = result
    return { ...rest, url, sites: listSites() }
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
  /** The server Claude Code talks to: LM Studio for claude-local, Free LLM API for claude-free. */
  const reviewServer = async (reviewer: ReviewerKind): Promise<{ baseUrl: string; model: string; token?: string }> => {
    const st = getSettings()
    if (reviewer !== 'claude-free') return { baseUrl: st.llm.baseUrl, model: st.llm.model }
    const key = await readFreeKey()
    if (!key) throw new ValidationError('Paste your Free LLM API key on the AI tools page first.')
    return { baseUrl: freeLlmUrl(st.freellm?.baseUrl ?? FREELLM_DEFAULT_URL), model: st.freellm?.model || 'auto', token: key }
  }
  handle('review:run', async (req) => {
    if (!req || typeof req !== 'object' || !req.source) throw new ValidationError('That review request is not valid.')
    const reviewer = (['claude', 'claude-local', 'claude-free', 'codex', 'gemini', 'coderabbit', 'model'] as const).includes(req.reviewer) ? req.reviewer : 'claude'
    const focus = (['security', 'bugs', 'all'] as const).includes(req.focus) ? req.focus : 'security'
    const st = getSettings()
    if ((reviewer === 'model' || reviewer === 'claude-local') && !st.llm.model) throw new ValidationError('Pick a model (LM Studio) in the Assistant first.')
    const server = await reviewServer(reviewer)
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
        root = await review.cloneForReview(`https://github.com/${src.repo}.git`, tok)
        name = src.repo
      } else {
        if (typeof src.url !== 'string') throw new ValidationError('Enter the repository address.')
        update(null, 'Downloading the repository')
        const nameFromUrl = src.url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? 'repo'
        root = await review.cloneForReview(src.url.trim(), typeof src.token === 'string' && src.token.trim() ? src.token.trim() : null)
        name = nameFromUrl
      }
      const remote = src.kind !== 'site'
      try {
        const skills = Array.isArray(req.skills) ? req.skills.filter((x): x is string => typeof x === 'string' && /^(own|mine|pack):[\w:.-]{1,120}$/.test(x)).slice(0, 200) : undefined
        return await review.runReview({ root, name, reviewer, focus, modelName: st.llm.model, local: server, remote, scanners: req.scanners !== false, skills }, update)
      } finally {
        // The downloaded code exists only for this review: it vanishes as soon as the review ends.
        if (remote) review.endReviewSession(root)
      }
    })
    activity.push('success', `Reviewed ${label}`, `${Object.values(result.counts).reduce((a, b) => a + b, 0)} findings, ${result.secrets.length} keys in files.`)
    return result
  })
  const skillsStatus = (): { names: string[]; installed: boolean; desktop: boolean } => ({ names: review.skillList(), installed: installedForClaude('laramac'), desktop: desktopAppInstalled() })
  const desktopStatus = (): { app: boolean; connected: boolean; path: string } => ({ app: desktopAppInstalled(), connected: desktopConnected(), path: desktopConfigPath() })
  review.ensurePlugins()
  handle('review:skill-plan', (site) => {
    const root = typeof site === 'string' && site ? siteByName(site).path : null
    const p = review.skillPlan(root)
    return { stack: p.stack, recommended: p.recommended, files: p.files, items: p.items.map(({ id, name, source, about, guides }) => ({ id, name, source, about, guides })) }
  })
  handle('review:reviewers', () => review.reviewerOptions(getSettings().llm.model, claudeFreeInstalled()))
  handle('review:continue', async (id, where) => {
    const info = review.listReviews().find((r) => r.id === id)
    if (!info) throw new ValidationError('That review is gone.')
    if (where === 'desktop') {
      if (!existsSync('/Applications/Claude.app')) throw new ValidationError('The Claude desktop app is not installed. Get it at claude.ai/download.')
      await shell.openPath('/Applications/Claude.app')
      return
    }
    if (!info.folder || !existsSync(info.folder)) throw new ValidationError('The code for this review is no longer on this Mac.')
    const report = join(review.reviewsDir(), `${info.id}.md`)
    const ask = `Read the code review in ${report}. Go through the findings, most severe first, and help me fix them one by one.`
    const line = info.session && /^[0-9a-f-]{36}$/.test(info.session) ? `claude --resume ${info.session} || claude ${shellQuote(ask)}` : `claude ${shellQuote(ask)}`
    await openTerminal(info.folder, line)
  })
  handle('recon:start', (req) => {
    const r = (req ?? {}) as Partial<ReconRequest>
    if (typeof r.target !== 'string') throw new ValidationError('Enter a domain, such as example.com.')
    const depth = (['passive', 'standard', 'deep'] as const).includes(r.depth as never) ? (r.depth as ReconRequest['depth']) : 'standard'
    const reviewer = (['none', 'claude', 'claude-local', 'codex', 'gemini', 'model'] as const).includes(r.reviewer as never) ? (r.reviewer as ReconRequest['reviewer']) : 'none'
    try {
      const info = recon.startRecon({ target: r.target, depth, reviewer, authorized: r.authorized === true }, (i) => send('recon:changed', i), (id, text) => send('recon:line', { id, text: text.slice(0, 300) }))
      activity.push('info', `Recon of ${info.domain} started`, depth === 'passive' ? 'Passive: nothing is sent to the site itself.' : 'Read-only: ordinary requests at a gentle rate.')
      return info
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
  })
  handle('recon:list', () => recon.listRecon())
  handle('recon:get', (id) => {
    try {
      return recon.reconDetail(String(id))
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
  })
  handle('recon:cancel', (id) => recon.cancelRecon(String(id)))
  handle('recon:delete', (id) => {
    recon.deleteRecon(String(id))
    return recon.listRecon()
  })
  handle('recon:tools', () => ({ subfinder: recon.hasSubfinder() }))
  handle('recon:install-subfinder', async () => {
    await jobs.run('Installing subfinder', (u) => recon.installSubfinder(u))
    return { subfinder: recon.hasSubfinder() }
  })
  // ---- Doctor: what is wrong right now, and fixing it
  let nodeMajor: string | null | undefined
  const health = async (): Promise<HealthIssue[]> => {
    const st = getSettings()
    const sites = listSites()
    const svcs = services.list()
    const webUp = svcs.some((s) => (s.id === 'apache' || s.id === 'nginx') && s.status === 'running')
    const probes: Record<string, number | null> = {}
    if (webUp) await Promise.all(sites.slice(0, 40).map(async (s) => (probes[s.name] = await hub.probeSite(st.httpPort, s.domain))))
    if (nodeMajor === undefined) {
      const n = locate('node')
      nodeMajor = n ? await new Promise<string | null>((r) => execFile(n.path, ['--version'], { timeout: 5000 }, (_e, out) => r(/v(\d+)/.exec(String(out))?.[1] ?? null))) : null
    }
    const nodeFor: Record<string, { want: string | null; source: string; installed: boolean }> = {}
    for (const s of sites) if (['node'].includes(s.kind) || existsSync(join(s.path, 'package.json'))) nodeFor[s.name] = nodes.siteNodeChoice(s.path, st.siteConfig[s.name]?.node)
    return hub.healthIssues({ services: svcs, sites, dnsReady: (await toolsStatus()).dnsReady, httpPort: st.httpPort, nodeMajor, probes, nodeFor })
  }
  handle('health:check', () => health())
  handle('health:fix', async (id) => {
    const fix = String(id)
    if (fix === 'start-web') await prepareWeb()
    else if (fix === 'setup-dns') await jobs.run(`Setting up .${getSettings().tld} addresses`, async () => {
      await installResolver(getSettings().tld)
      await startDnsServer(() => getSettings().tld)
    })
    else if (fix.startsWith('restart:')) {
      const svc = fix.slice(8) as ServiceId
      if (!services.list().some((s) => s.id === svc)) throw new ValidationError('Unknown service.')
      await services.start(svc)
    } else if (fix.startsWith('start-dev:')) {
      const site = siteByName(fix.slice(10))
      const cfg = getSettings().siteConfig[site.name]?.dev
      if (cfg) await startDev(site, cfg)
    } else if (fix.startsWith('node-install:')) {
      const major = fix.slice(13)
      if (!/^\d{1,3}$/.test(major)) throw new ValidationError('That is not a Node.js version.')
      await jobs.run(`Installing Node.js ${major}`, (u) => nodes.installNodeMajor(major, u))
      refreshRuntimeShims()
      activity.push('success', `Node.js ${major} is installed`, 'Projects that ask for it use it on their own.')
    } else throw new ValidationError('Laramac cannot fix that by itself.')
    notifySitesChanged()
    return health()
  })

  // ---- The site page
  const siteNodeInfo = (site: SiteInfo): SiteNodeInfo => {
    const chosen = getSettings().siteConfig[site.name]?.node ?? null
    const c = nodes.siteNodeChoice(site.path, chosen ?? undefined)
    return { want: c.want, source: c.source, installed: c.installed, chosen, main: nodes.mainNodeVersion()?.split('.')[0] ?? null }
  }
  const nodeVersions = async (): Promise<NodeVersionsInfo> => ({
    installed: nodes.installedNodes().map(({ major, version, main }) => ({ major, version, main })),
    available: await nodes.availableNodes().catch(() => [])
  })
  handle('node:versions', () => nodeVersions())
  handle('node:install', async (major) => {
    if (typeof major !== 'string' || !/^\d{1,3}$/.test(major)) throw new ValidationError('That is not a Node.js version.')
    await jobs.run(`Installing Node.js ${major}`, (u) => nodes.installNodeMajor(major, u))
    refreshRuntimeShims()
    syncNodeMap()
    activity.push('success', `Node.js ${major} is installed`, 'Choose it on a site\'s page, or projects that ask for it use it on their own.')
    return nodeVersions()
  })
  handle('node:remove', async (major) => {
    if (typeof major !== 'string' || !/^\d{1,3}$/.test(major)) throw new ValidationError('That is not a Node.js version.')
    const using = Object.entries(getSettings().siteConfig).filter(([, c]) => c.node === major).map(([n]) => n)
    if (using.length) throw new ValidationError(`${using.join(', ')} ${using.length === 1 ? 'uses' : 'use'} Node ${major}. Choose another version for ${using.length === 1 ? 'it' : 'them'} first.`)
    nodes.removeNodeMajor(major)
    return nodeVersions()
  })
  handle('site:node', async (name, major) => {
    const site = siteByName(name)
    if (major !== null && (typeof major !== 'string' || !/^\d{1,3}$/.test(major))) throw new ValidationError('That is not a Node.js version.')
    const main = nodes.mainNodeVersion()?.split('.')[0]
    if (major && major !== main && !nodes.nodeBinFor(major)) {
      await jobs.run(`Installing Node.js ${major}`, (u) => nodes.installNodeMajor(major, u))
      refreshRuntimeShims()
    }
    setSiteConfig(site.name, { node: major ?? undefined })
    syncNodeMap()
    const running = isDevRunning(site.name)
    const cfg = getSettings().siteConfig[site.name]?.dev
    if (running && cfg) {
      await stopDev(site.name)
      await startDev(site, cfg)
    }
    activity.push('info', `${site.name} uses Node ${major ?? 'as the project asks'}`, running ? 'Its dev server restarted with it.' : 'Its dev server and Terminal use it from now on.')
    notifySitesChanged()
    return siteNodeInfo(site)
  })
  handle('site:facts', async (name) => {
    const site = siteByName(name)
    const db = snapshots.detectSiteDatabase(site.path)
    const webUp = services.list().some((s) => (s.id === 'apache' || s.id === 'nginx') && s.status === 'running')
    return {
      database: db ? { engine: db.engine, name: db.name } : null,
      node: hub.wantedNode(site.path),
      nodeInfo: siteNodeInfo(site),
      git: existsSync(join(site.path, '.git')),
      envFiles: hub.envFiles(site),
      reviews: review.listReviews().filter((r) => r.folder === site.path),
      answers: webUp ? await hub.probeSite(getSettings().httpPort, site.domain) : null
    }
  })
  handle('site:env-read', (name, file) => hub.readEnv(siteByName(name), String(file)))
  handle('site:env-write', (name, file, text) => {
    if (typeof text !== 'string') throw new ValidationError('Nothing to save.')
    hub.writeEnvFile(siteByName(name), String(file), text)
    activity.push('info', `Saved ${file} for ${name}`)
  })
  handle('site:outdated', async (name) => {
    const site = siteByName(name)
    const minor = defaultMinor()
    const composer = minor && existsSync(composerPhar()) ? [phpBinary(minor), composerPhar()] : findOnPath('composer') ? [findOnPath('composer')!] : null
    return jobs.run(`Checking ${site.name}'s packages`, () => hub.outdated(site, composer))
  })
  // ---- Updates for everything
  const composerCmd = (): string[] | null => {
    const minor = defaultMinor()
    return minor && existsSync(composerPhar()) ? [phpBinary(minor), composerPhar()] : findOnPath('composer') ? [findOnPath('composer')!] : null
  }
  let lastReport: UpdatesReport | null = null
  const collectUpdates = async (deep: boolean): Promise<UpdatesReport> => {
    const items: UpdateItem[] = []
    const notes: string[] = []
    const env = runtimeEnv()
    const tasks: Promise<void>[] = []
    // Laramac itself
    tasks.push(
      checkForUpdate()
        .then((u) => {
          if (u) items.push({ id: 'laramac', group: 'laramac', name: 'Laramac', current: app.getVersion(), latest: u.version, detail: 'The app itself. It restarts to finish.', jump: upd.jumpOf(app.getVersion(), u.version) })
        })
        .catch(() => void notes.push('Laramac could not check for its own update.'))
    )
    // PHP
    tasks.push(
      listVersions()
        .then((list) => {
          for (const v of list) if (v.installed && v.updateAvailable) items.push({ id: `php:${v.minor}`, group: 'php', name: `PHP ${v.minor}`, current: v.installed, latest: v.latest, detail: 'Security and bug fixes. Sites on this version restart with it.', jump: 'patch' })
        })
        .catch(() => void notes.push('PHP versions could not be checked.'))
    )
    // Node.js lines
    tasks.push(
      nodes
        .availableNodes()
        .then((avail) => {
          for (const n of nodes.installedNodes()) {
            const a = avail.find((x) => x.major === n.major)
            if (!a || !upd.isNewer(n.version, a.version)) continue
            if (n.main && !nodes.mainNodeManaged()) continue
            items.push({ id: n.main ? 'node:main' : `node:${n.major}`, group: 'node', name: `Node.js ${n.major}${n.main ? ' (main)' : ''}`, current: n.version, latest: a.version, detail: 'Newest release of the same line, so projects keep working.', jump: upd.jumpOf(n.version, a.version) })
          }
        })
        .catch(() => void notes.push('Node.js releases could not be checked.'))
    )
    // Other languages Laramac installed
    tasks.push(
      Promise.all([listRuntimes(), latestVersions()])
        .then(([rts, latest]) => {
          for (const r of rts) {
            if (!r.managed || !r.version || ['php', 'node', 'python', 'swift'].includes(r.id)) continue
            const l = latest[r.id]
            if (upd.isNewer(r.version, l)) items.push({ id: `runtime:${r.id}`, group: 'runtime', name: r.name, current: r.version, latest: l!, detail: 'Laramac\'s own copy. Projects use it the next time they start.', jump: upd.jumpOf(r.version, l!) })
          }
        })
        .catch(() => void notes.push('Languages could not be checked.'))
    )
    // Composer
    const comp = composerCmd()
    if (comp && existsSync(composerPhar())) {
      tasks.push(
        Promise.all([upd.run(comp[0], [...comp.slice(1), '--version', '--no-ansi'], { env }), upd.getJson<{ stable?: { version: string }[] }>('https://getcomposer.org/versions')]).then(([out, v]) => {
          const cur = upd.parseComposerVersion(out)
          const l = v?.stable?.[0]?.version
          if (cur && upd.isNewer(cur, l)) items.push({ id: 'tool:composer', group: 'tool', name: 'Composer', current: cur, latest: l!, detail: 'PHP package manager, checked against its published checksum.', jump: upd.jumpOf(cur, l!) })
        })
      )
    }
    // phpMyAdmin
    if (existsSync(dirs.phpmyadmin())) {
      tasks.push(
        upd.getJson<{ version?: string }>('https://www.phpmyadmin.net/home_page/version.json').then((v) => {
          let cur: string | null = null
          try {
            cur = readdirSync(dirs.phpmyadmin()).map((f) => /^RELEASE-DATE-(\d+\.\d+\.\d+)/.exec(f)?.[1]).find(Boolean) ?? null
          } catch {
            cur = null
          }
          if (cur && upd.isNewer(cur, v?.version)) items.push({ id: 'tool:phpmyadmin', group: 'tool', name: 'phpMyAdmin', current: cur, latest: v!.version!, detail: 'Database manager in your browser.', jump: upd.jumpOf(cur, v!.version!) })
        })
      )
    }
    // Cloudflare Tunnel
    if (existsSync(cloudflaredBinary())) {
      tasks.push(
        Promise.all([upd.run(cloudflaredBinary(), ['--version']), upd.getJson<{ tag_name?: string }>('https://api.github.com/repos/cloudflare/cloudflared/releases/latest')]).then(([out, rel]) => {
          const cur = upd.parseCloudflaredVersion(out)
          const l = rel?.tag_name?.replace(/^v/, '')
          if (cur && upd.isNewer(cur, l)) items.push({ id: 'tool:cloudflared', group: 'tool', name: 'Cloudflare Tunnel', current: cur, latest: l!, detail: 'Public links for your sites.', jump: upd.jumpOf(cur, l!) })
        })
      )
    }
    // Laramac Code
    if (ideInstalled()) {
      tasks.push(
        ideLatest()
          .then((l) => {
            const cur = ideVersion()
            if (cur && upd.isNewer(cur, l.version)) items.push({ id: 'tool:laramac-code', group: 'tool', name: 'Laramac Code', current: cur, latest: l.version, detail: 'The editor inside the Laramac Code app (code-server). Your settings and extensions stay.', jump: upd.jumpOf(cur, l.version) })
          })
          .catch(() => undefined)
      )
    }
    // Claude Code
    const claude = findCli(['claude'])
    if (claude) {
      tasks.push(
        Promise.all([upd.run(claude, ['--version'], { env }), upd.getJson<{ version?: string }>('https://registry.npmjs.org/@anthropic-ai/claude-code/latest')]).then(([out, v]) => {
          const cur = upd.parseClaudeVersion(out)
          if (cur && upd.isNewer(cur, v?.version)) items.push({ id: 'tool:claude', group: 'tool', name: 'Claude Code', current: cur, latest: v!.version!, detail: 'Updated with its own updater (claude update).', jump: upd.jumpOf(cur, v!.version!) })
        })
      )
    }
    // Homebrew services Laramac set up
    const prefix = brewPrefix()
    if (prefix) {
      tasks.push(
        (async () => {
          const bin = join(prefix, 'bin', 'brew')
          const benv = { ...process.env, HOMEBREW_NO_AUTO_UPDATE: deep ? '' : '1', HOMEBREW_NO_ENV_HINTS: '1' }
          if (deep) await upd.run(bin, ['update', '--quiet'], { env: benv, timeout: 180000 })
          const out = await upd.run(bin, ['outdated', '--json=v2'], { env: { ...benv, HOMEBREW_NO_AUTO_UPDATE: '1' }, timeout: 60000 })
          for (const o of upd.parseBrewOutdated(out.slice(out.indexOf('{')), BREW.map((b) => b.formula))) {
            const b = BREW.find((x) => x.formula === o.formula)!
            items.push({ id: `brew:${o.formula}`, group: 'service', name: b.name, current: o.current, latest: o.latest, detail: 'From Homebrew. Laramac restarts it if it was running.', jump: upd.jumpOf(o.current, o.latest) })
          }
        })().catch(() => void notes.push('Homebrew could not be checked.'))
      )
    }
    // Each site's packages
    tasks.push(
      (async () => {
        const sites = listSites().filter((x) => (existsSync(join(x.path, 'package.json')) && existsSync(join(x.path, 'node_modules'))) || (existsSync(join(x.path, 'composer.json')) && existsSync(join(x.path, 'vendor'))))
        const comp2 = composerCmd()
        for (let i = 0; i < sites.length; i += 3) {
          await Promise.all(
            sites.slice(i, i + 3).map(async (site) => {
              const item = upd.siteItem(site.name, await hub.outdated(site, comp2).catch(() => []))
              if (item) items.push(item)
            })
          )
        }
      })()
    )
    await Promise.all(tasks)
    lastReport = { items: upd.sortItems(items), checkedAt: Date.now(), notes }
    send('updates:changed', lastReport)
    return lastReport
  }
  const updateSitePackages = async (site: SiteInfo, o: { names?: string[]; latest?: boolean }, update: (p: number | null, l?: string) => void): Promise<void> => {
    const env = nodes.siteRuntimeEnv(site.path, getSettings().siteConfig[site.name]?.node)
    const names = (o.names ?? []).filter((n) => /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(n) || /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(n)).slice(0, 200)
    update(null, `Saving a snapshot of ${site.name} first`)
    await snapshots.createSnapshot(site.path, 'Before updating packages', snapDeps)
    const pkgs = await hub.outdated(site, composerCmd())
    const npmNames = names.length ? names.filter((n) => pkgs.some((p) => p.name === n && p.manager === 'npm')) : []
    const compNames = names.length ? names.filter((n) => pkgs.some((p) => p.name === n && p.manager === 'composer')) : []
    const line = (l: string): void => update(null, `${site.name}: ${l.slice(0, 70)}`)
    if (existsSync(join(site.path, 'package.json')) && (!names.length || npmNames.length)) {
      if (o.latest && npmNames.length) await runQuiet(['npm', 'install', ...npmNames.map((n) => `${n}@latest`)], site.path, env, line, 15 * 60_000)
      else await runQuiet(['npm', 'update', ...npmNames], site.path, env, line, 15 * 60_000)
    }
    const comp = composerCmd()
    if (comp && existsSync(join(site.path, 'composer.json')) && (!names.length || compNames.length)) {
      const args = o.latest && compNames.length ? ['require', ...compNames.map((n) => `${n}:^${(pkgs.find((p) => p.name === n)?.latest ?? '').replace(/^v/, '')}`), '--update-with-dependencies'] : ['update', ...compNames, '--with-dependencies']
      await runQuiet([...comp, ...args, '--no-interaction', '--no-progress'], site.path, env, line, 15 * 60_000)
    }
  }
  const applyOne = async (id: string, consent: boolean, update: (p: number | null, l?: string) => void): Promise<void> => {
    if (id.startsWith('php:')) {
      await installMinor(assertMinor(id.slice(4)))
      refreshShims()
    } else if (id === 'node:main') {
      await nodes.updateMainNode(update)
      refreshRuntimeShims()
    } else if (id.startsWith('node:')) {
      const m = id.slice(5)
      if (!/^\d{1,3}$/.test(m)) throw new ValidationError('That is not a Node.js version.')
      await nodes.installNodeMajor(m, update)
      refreshRuntimeShims()
    } else if (id.startsWith('runtime:')) {
      const r = id.slice(8) as RuntimeId
      if (!RUNTIME_IDS.includes(r)) throw new ValidationError('Unknown language.')
      await installRuntime(r)
    } else if (id === 'tool:composer') await installComposer()
    else if (id === 'tool:phpmyadmin') {
      await installPhpMyAdmin()
      writePmaConfig()
    } else if (id === 'tool:cloudflared') await installCloudflared()
    else if (id === 'tool:laramac-code') await installIde(update)
    else if (id === 'tool:claude') {
      const claude = findCli(['claude'])
      if (!claude) throw new ValidationError('Claude Code is not installed.')
      await runQuiet([claude, 'update'], dirs.root(), runtimeEnv(), (l) => update(null, `Claude Code: ${l.slice(0, 60)}`), 5 * 60_000)
    } else if (id.startsWith('brew:')) {
      const b = BREW.find((x) => x.formula === id.slice(5))
      if (!b) throw new ValidationError('Unknown service.')
      const wasRunning = services.list().find((x) => x.id === b.service)?.status === 'running'
      await brew(['upgrade', b.formula], (l) => update(null, `${b.name}: ${l.slice(0, 60)}`))
      if (wasRunning) {
        await services.stop(b.service)
        await services.start(b.service)
      }
    } else if (id.startsWith('site:')) {
      if (!consent) throw new ValidationError('Updating a site\'s packages runs its own install scripts. Agree to that first.')
      await updateSitePackages(siteByName(id.slice(5)), {}, update)
    } else throw new ValidationError('Laramac cannot update that by itself.')
  }
  handle('updates:last', () => lastReport)
  // A quiet look once a day, so the Updates page and the sidebar know before you open them.
  const quietCheck = (): void => {
    if (getSettings().autoUpdateCheck) void collectUpdates(false).catch(() => undefined)
  }
  setTimeout(quietCheck, 90_000)
  setInterval(quietCheck, 24 * 3600_000)
  handle('updates:check', (deep) => jobs.run('Checking for updates', () => collectUpdates(deep === true)))
  handle('updates:apply', async (ids, consent) => {
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((i) => typeof i !== 'string')) throw new ValidationError('Choose what to update.')
    const done: string[] = []
    const failed: { id: string; error: string }[] = []
    const list = ids.filter((i) => i !== 'laramac')
    await jobs.run(`Updating ${list.length} ${list.length === 1 ? 'thing' : 'things'}`, async (update) => {
      for (const [n, id] of list.entries()) {
        update(Math.round((n / list.length) * 100), `Updating ${lastReport?.items.find((x) => x.id === id)?.name ?? id}`)
        try {
          await applyOne(id, consent === true, update)
          done.push(id)
        } catch (e) {
          failed.push({ id, error: (e as Error).message })
        }
      }
    })
    if (done.length) activity.push('success', `Updated ${done.length} ${done.length === 1 ? 'thing' : 'things'}`, failed.length ? `${failed.length} could not be updated.` : 'Everything you chose is up to date.')
    if (failed.length) activity.push('error', `${failed.length} ${failed.length === 1 ? 'update' : 'updates'} failed`, failed.map((f) => `${f.id}: ${f.error}`).join('\n').slice(0, 400))
    notifySitesChanged()
    const report = await collectUpdates(false)
    return { done, failed, report }
  })
  handle('site:update-packages', async (name, o) => {
    const site = siteByName(name)
    const opts = (o ?? {}) as { names?: unknown; latest?: unknown }
    if (opts.names !== undefined && (!Array.isArray(opts.names) || opts.names.some((n) => typeof n !== 'string'))) throw new ValidationError('Choose packages by name.')
    await jobs.run(`Updating ${site.name}'s packages`, (u) => updateSitePackages(site, { names: opts.names as string[] | undefined, latest: opts.latest === true }, u))
    activity.push('success', `Updated ${site.name}'s packages`, 'A snapshot was saved first, on its page under Snapshots.')
    return hub.outdated(site, composerCmd())
  })
  handle('db:tables', async (engine, name) => {
    const r = await dbadmin.readOnlyQuery(dbTarget(dbEngine(engine)), dbadmin.checkName(String(name)), `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = '${dbadmin.checkName(String(name))}' ORDER BY table_name`, 500)
    return r.rows.map((x) => ({ name: x[0], rows: x[1] }))
  })
  handle('db:query', (engine, name, sql) => {
    if (typeof sql !== 'string' || sql.length > 20000) throw new ValidationError('Write one query.')
    return dbadmin.readOnlyQuery(dbTarget(dbEngine(engine)), dbadmin.checkName(String(name)), sql, 500).catch((e) => {
      throw new ValidationError((e as Error).message)
    })
  })

  // ---- Review findings you can act on one by one
  const reviewInfo = (id: string): ReviewInfo => {
    const r = review.listReviews().find((x) => x.id === id)
    if (!r) throw new ValidationError('That review is gone.')
    return r
  }
  const findingsOf = (id: string): ReviewFinding[] => {
    const info = reviewInfo(id)
    return hub.reviewFindings(review.readReview(id)).map((f) => ({ ...f, triage: info.triage?.[f.index] }))
  }
  handle('review:findings', (id) => findingsOf(String(id)))
  handle('review:triage', (id, index, t) => {
    const info = reviewInfo(String(id))
    const triage = { ...(info.triage ?? {}) }
    if (t === 'fixed' || t === 'accepted' || t === 'not-a-problem') triage[Number(index)] = t
    else delete triage[Number(index)]
    review.saveReviewInfo({ ...info, triage })
    return findingsOf(String(id))
  })
  handle('review:fix-one', async (id, index) => {
    const info = reviewInfo(String(id))
    const f = hub.reviewFindings(review.readReview(info.id)).find((x) => x.index === Number(index))
    if (!f) throw new ValidationError('That finding is not in the review.')
    if (!info.folder || !existsSync(info.folder)) throw new ValidationError('The code for this review is no longer on this Mac.')
    const ask = `Fix this ${f.severity} finding from a security review, then explain the change: ${f.title}.${f.file ? ` It is in ${f.file}${f.line ? ` around line ${f.line}` : ''}.` : ''} ${f.what ?? ''} Suggested fix: ${f.fix ?? 'your judgement'}.`
    await openTerminal(info.folder, `claude ${shellQuote(ask.replace(/\s+/g, ' ').slice(0, 2000))}`)
  })

  // ---- Recon: compare and export
  handle('recon:diff', (id) => {
    const d = recon.reconDetail(String(id))
    const prev = recon.listRecon().find((r) => r.domain === d.domain && r.id !== d.id && r.createdAt < d.createdAt && r.status === 'done')
    return hub.reconDiff(d, prev ? recon.reconDetail(prev.id) : null, prev?.createdAt)
  })
  handle('recon:export', async (id, kind) => {
    const d = recon.reconDetail(String(id))
    const ext = kind === 'csv' ? 'csv' : kind === 'urls' ? 'txt' : 'md'
    const r = await dialog.showSaveDialog(mainWindow!, { title: 'Export the recon', defaultPath: join(app.getPath('downloads'), `recon-${d.domain}${kind === 'urls' ? '-urls' : ''}.${ext}`) })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, kind === 'csv' ? hub.reconCsv(d) : kind === 'urls' ? hub.reconUrls(d) : (d.report ?? `# Recon of ${d.domain}\n\n${d.findings.map((f) => `- [${f.severity}] ${f.title}${f.url ? ` (${f.url})` : ''}`).join('\n')}\n`))
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })

  const packList = (): SkillPackInfo[] => {
    const items = review.skillPlan(null).items
    return SKILL_PACKS.map((p) => {
      const st = packState(review.packsRoot(), p.id)
      const mine = items.filter((i) => i.id.startsWith(`pack:${p.id}:`))
      return { name: p.name, repo: p.repo, license: p.license, about: p.about, ...st, id: p.id, guides: mine.reduce((n, i) => n + i.guides, 0) }
    })
  }
  handle('packs:list', () => packList())
  handle('packs:install', async (id) => {
    if (!SKILL_PACKS.some((p) => p.id === id)) throw new ValidationError('That skill pack is not on the list.')
    setSettings({ packsDeclined: (getSettings().packsDeclined ?? []).filter((x) => x !== id) })
    const st = await jobs.run(`Getting the ${SKILL_PACKS.find((p) => p.id === id)!.name} skills`, () => installPack(review.packsRoot(), String(id)))
    if (installedForClaude('laramac')) installPackSkillsForClaude('laramac', packSkillFolders(review.packsRoot()))
    activity.push('success', `${st.loaded.length} skills from ${SKILL_PACKS.find((p) => p.id === id)!.name} are ready`, `Every Claude Code review loads them. Commit ${st.commit?.slice(0, 7)}.`)
    return packList()
  })
  handle('packs:remove', (id) => {
    removePack(review.packsRoot(), String(id))
    // Removed on purpose: it is not added back by itself.
    setSettings({ packsDeclined: [...new Set([...(getSettings().packsDeclined ?? []), String(id)])] })
    if (installedForClaude('laramac')) {
      removePackSkillsFromClaude('laramac')
      installPackSkillsForClaude('laramac', packSkillFolders(review.packsRoot()))
    }
    return packList()
  })
  handle('skills:status', () => skillsStatus())
  handle('skills:install', (on) => {
    if (on === true) {
      installForClaude('laramac')
      installPackSkillsForClaude('laramac', packSkillFolders(review.packsRoot()))
    } else {
      removeFromClaude('laramac')
      removePackSkillsFromClaude('laramac')
    }
    activity.push('success', on === true ? 'Security skills installed for Claude' : 'Security skills removed from Claude', on === true ? 'Claude Code in Terminal and in the Claude desktop app can use them now.' : '')
    return skillsStatus()
  })
  handle('desktop:status', () => desktopStatus())
  handle('desktop:connect', () => {
    setSettings({ mcpEnabled: true })
    void startMcp()
    const r = connectClaudeDesktop(mcpUrl(), mcpToken(), nodeBinDir())
    activity.push('success', 'Claude desktop is connected to Laramac', 'Restart the Claude app, then ask it to review a site or run recon.')
    return r
  })
  // Review sessions never outlive the app: anything left from a crash is removed at start.
  review.cleanReviewSessions()
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
          await runQuiet(['/bin/sh', '-c', cmd], site.path, nodes.siteRuntimeEnv(site.path, getSettings().siteConfig[site.name]?.node), (l) => update(null, `${cmd}: ${l.slice(0, 60)}`))
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
  handle('php:import', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Add a PHP version',
      message: 'Choose the PHP download for macOS: the cli and fpm files together, or a folder with both.',
      buttonLabel: 'Add',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      filters: [{ name: 'PHP builds', extensions: ['gz', 'tgz', 'xz', 'tar', 'zip'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const version = await jobs.run('Adding PHP', () => importPhp(res.filePaths.slice(0, 4))).catch((err) => {
      throw new ValidationError((err as Error).message)
    })
    activity.push('success', `PHP ${version} added`, 'Pick it for a site on the Sites page.')
    return listVersions()
  })
  handle('php:xdebug', async (on) => {
    if (on) {
      // Versions installed before Xdebug was available get it by updating to the newest build.
      const missing = installedMinors().filter((m) => !existsSync(xdebugPath(m)))
      for (const m of missing) await ensureXdebug(m).catch((err) => activity.push('error', `Xdebug for PHP ${m}`, (err as Error).message.slice(0, 200)))
      if (!installedMinors().some((m) => existsSync(xdebugPath(m)))) {
        throw new ValidationError('Xdebug is not ready for your PHP versions yet. Laramac’s PHP builds add it within a day; try again tomorrow.')
      }
    }
    setSettings({ xdebug: !!on })
    await restartPhp()
    activity.push('info', on ? 'Xdebug is on' : 'Xdebug is off', on ? 'PHP pauses at your breakpoints when your editor listens on port 9003.' : 'PHP runs at full speed again.')
    return listVersions()
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
    if (info.remote && what !== 'report') throw new ValidationError('The downloaded copy was deleted when the review finished. Import the project (Sites › Import) to work on it.')
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
  // ---- Azure DevOps
  const azTok = (): string => azure.token(keychain)
  const azAcc = (): AzureAccount => {
    const a = azure.account()
    if (!a) throw new ValidationError('Connect Azure DevOps first.')
    return a
  }
  const azRepoById = async (id: string): Promise<AzureRepo> => {
    if (!azure.GUID.test(String(id))) throw new ValidationError('Unknown repository.')
    const r = (await azure.listRepos(azAcc().org, azTok())).find((x) => x.id === id)
    if (!r) throw new ValidationError('That repository is gone.')
    return r
  }
  const azFolder = (name: string): string => {
    const f = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    if (!f) throw new ValidationError('That repository name cannot be a folder name.')
    return f
  }
  handle('azure:account', () => azure.account())
  handle('azure:sign-in', async (org, pat) => {
    if (typeof org !== 'string' || typeof pat !== 'string') throw new ValidationError('Enter your organization and a token.')
    try {
      const a = await azure.signIn(org, pat, keychain)
      activity.push('success', `Connected to Azure DevOps as ${a.name}`, a.org)
      return a
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
  })
  handle('azure:sign-out', () => azure.signOut())
  handle('azure:projects', () => azure.listProjects(azAcc().org, azTok()))
  handle('azure:repos', () => azure.listRepos(azAcc().org, azTok()))
  handle('azure:details', async (projectId, repoId) => azure.repoDetails(azAcc().org, azTok(), String(projectId), String(repoId)))
  handle('azure:clone', async (id) => {
    const r = await azRepoById(String(id))
    if (r.empty) throw new ValidationError('This repository is empty. Push a site to it first.')
    const folder = azFolder(r.name)
    await jobs.run(`Cloning ${r.name}`, async (update) => {
      update(null, `Cloning ${r.project}/${r.name}`)
      await github.cloneRepo(r.cloneUrl, join(ensureWww(), folder), azure.authFor(azTok(), azAcc()))
    })
    activity.push('success', `Cloned ${r.name} from Azure DevOps`, `It is in your projects folder as ${folder}.`)
    notifySitesChanged()
    return listSites()
  })
  handle('azure:create', async (input) => {
    const i = (input ?? {}) as Record<string, unknown>
    const acc = azAcc()
    const repo = await azure.createRepo(acc.org, azTok(), String(i.projectId ?? ''), String(i.name ?? '')).catch((e) => {
      throw new ValidationError((e as Error).message)
    })
    activity.push('success', `Created ${repo.name} in ${repo.project} on Azure DevOps`)
    return { repo, sites: null }
  })
  handle('azure:pull-request', async (id, o) => {
    const r = await azRepoById(String(id))
    const x = (o ?? {}) as { from?: unknown; to?: unknown; title?: unknown; description?: unknown }
    const pr = await azure.createPullRequest(azAcc().org, azTok(), r.projectId, r.id, { from: String(x.from ?? ''), to: String(x.to ?? r.defaultBranch), title: String(x.title ?? ''), description: String(x.description ?? '') }).catch((e) => {
      throw new ValidationError((e as Error).message)
    })
    activity.push('success', `Opened pull request ${pr.id} in ${r.name}`)
    return pr
  })
  handle('azure:push', async (path, opts) => {
    const p = sitePath(path)
    const o = opts as GitPushOptions & { azureRepo?: string; azureCreate?: { projectId: string; name: string } }
    if (!['main', 'branch', 'tag'].includes(o?.mode)) throw new ValidationError('Choose how to push: main, a branch or a version tag.')
    const acc = azAcc()
    const tok = azTok()
    let repo: AzureRepo | null = null
    if (o.azureRepo) repo = await azRepoById(o.azureRepo)
    else if (o.azureCreate) repo = await azure.createRepo(acc.org, tok, o.azureCreate.projectId, o.azureCreate.name)
    else {
      const st = await github.siteStatus(p)
      if (st.remote && azure.isAzureRemote(st.remote)) repo = (await azure.listRepos(acc.org, tok)).find((r) => r.cloneUrl === st.remote) ?? null
    }
    if (!repo) throw new ValidationError('Choose a repository or create a new one.')
    const name = p.split('/').pop()
    const r = await jobs.run(`Pushing ${name} to Azure DevOps`, async (update) => {
      update(null, `Pushing ${name} to ${repo!.project}/${repo!.name}`)
      return github.publish(p, repo!.cloneUrl, { ...o, base: o.base || repo!.empty ? o.base || 'main' : repo!.defaultBranch }, azure.authFor(tok, acc), 'Azure DevOps')
    })
    r.url = o.mode === 'branch' ? `${repo.url}?version=GB${encodeURIComponent(r.ref)}` : o.mode === 'tag' ? `${repo.url}?version=GT${encodeURIComponent(r.ref)}` : `${repo.url}?version=GB${encodeURIComponent(r.ref)}`
    activity.push('success', `${name} pushed to Azure DevOps`, `${repo.project}/${repo.name} ${r.ref}`)
    return r
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
  /** Each site is an environment of its own, made from its address and .env, named site:<name>. */
  const siteEnv = (site: SiteInfo, store: ApiStore): ApiEnvironment => {
    const base = hub.siteApiVars(site, hub.readEnv(site, '.env'))
    const own = store.siteVars?.[site.name] ?? []
    return { id: `site:${site.name}`, name: site.name, vars: [...base.filter((b) => !own.some((o) => o.key === b.key)), ...own] }
  }
  const envFor = (store: ApiStore, envId: unknown): ApiEnvironment | undefined => {
    if (typeof envId === 'string' && envId.startsWith('site:')) {
      const site = listSites().find((x) => x.name === envId.slice(5))
      return site ? siteEnv(site, store) : undefined
    }
    return store.environments.find((e) => e.id === envId)
  }
  const apiVars = (store: ApiStore, envId: unknown, colId: unknown): KV[] => api.mergeVars(store.collections.find((c) => c.id === colId)?.variables, envFor(store, envId)?.vars)
  /** Saved values from a response go into the active environment. */
  const keepSaved = (store: ApiStore, envId: unknown, saved: { key: string; value: string }[]): void => {
    if (!saved.length) return
    if (typeof envId === 'string' && envId.startsWith('site:')) {
      const name = envId.slice(5)
      const cur = { id: envId, name, vars: store.siteVars?.[name] ?? [] }
      store.siteVars = { ...(store.siteVars ?? {}), [name]: api.applySaved(cur, saved).vars }
      return
    }
    const env = store.environments.find((e) => e.id === envId)
    if (env) store.environments = store.environments.map((e) => (e.id === env.id ? api.applySaved(e, saved) : e))
  }
  handle('api:send', async (req, envId, colId) => {
    const store = api.loadStore()
    const res = await api.sendRequest(req as ApiRequest, apiVars(store, envId, colId), { cookies: store.cookies !== false })
    keepSaved(store, envId, res.saved)
    store.history = [{ at: Date.now(), method: (req as ApiRequest).method, url: res.url, status: res.status, ms: res.ms, request: req as ApiRequest }, ...store.history].slice(0, 50)
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
  handle('api:site-envs', () => {
    const store = api.loadStore()
    return listSites().map((x) => siteEnv(x, store))
  })
  handle('api:from-site', (name) => {
    const site = siteByName(name)
    const routes = apiRoutes.findRoutes(site.path)
    const fromSpec = apiRoutes.openApiInProject(site.path)
    if (!routes.length && !fromSpec) throw new ValidationError(`No routes were found in ${site.name}'s code. Laramac reads Laravel, Next.js, Express, Fastify, Hono, NestJS, FastAPI and Flask routes, and OpenAPI files.`)
    const col = fromSpec && fromSpec.requests.length >= routes.length ? { ...fromSpec, name: `${site.name} (OpenAPI)` } : apiRoutes.collectionFromRoutes(`${site.name} routes`, routes)
    const store = api.loadStore()
    store.collections = [...store.collections, col]
    store.activeEnv = `site:${site.name}`
    api.saveStore(store)
    activity.push('success', `Made ${col.name}`, `${col.requests.length} requests from the code. Its environment is ${site.name}.`)
    return col
  })
  handle('api:cookies', () => api.cookieList())
  handle('api:clear-cookies', () => api.clearCookies())
  handle('api:code', (req, envId, colId, lang) => {
    if (!['curl', 'fetch', 'axios', 'php', 'laravel', 'python', 'go', 'httpie'].includes(String(lang))) throw new ValidationError('Unknown language.')
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
      name: 'start_code_review',
      description: 'Starts a read-only security code review of a local site with Laramac (Claude Code, Claude Code on the local model, Claude Code on Free LLM API, Codex, Gemini CLI, CodeRabbit or the local model), with MacSec scanners when installed. Returns when the report is ready; read it with read_code_review.',
      inputSchema: { type: 'object', properties: { site: { type: 'string' }, reviewer: { type: 'string', enum: ['claude', 'claude-local', 'claude-free', 'codex', 'gemini', 'coderabbit', 'model'] }, focus: { type: 'string', enum: ['security', 'bugs', 'all'] } }, required: ['site'] },
      writes: true,
      run: async (a) => {
        const site = siteByName(String(a.site))
        const st = getSettings()
        const reviewer = (['claude', 'claude-local', 'claude-free', 'codex', 'gemini', 'coderabbit', 'model'] as const).includes(a.reviewer as never) ? (a.reviewer as ReviewerKind) : 'claude-local'
        const focus = (['security', 'bugs', 'all'] as const).includes(a.focus as never) ? (a.focus as ReviewFocus) : 'security'
        const server = await reviewServer(reviewer)
        const r = await jobs.run(`Reviewing ${site.name}`, (u) => review.runReview({ root: site.path, name: site.name, reviewer, focus, modelName: st.llm.model, local: server, scanners: true }, u))
        return { id: r.id, counts: r.counts, keysInFiles: r.secrets.length, report: r.markdown.slice(0, 60000) }
      }
    },
    {
      name: 'list_code_reviews',
      description: 'Lists the code reviews Laramac has kept, newest first, with their findings by severity.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => review.listReviews()
    },
    {
      name: 'read_code_review',
      description: 'Reads one code review report (Markdown) by its id.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async (a) => review.readReview(String(a.id)).slice(0, 80000)
    },
    {
      name: 'start_recon',
      description: 'Starts read-only recon of a domain the user owns or may assess: subdomains (certificate logs, subfinder, Wayback), DNS and takeover hints, live hosts and technologies, JavaScript source maps, endpoints and keys, and exposed files. Nothing is attacked. The user must have confirmed permission for domains that are not local. Returns the recon id; read it with read_recon.',
      inputSchema: { type: 'object', properties: { domain: { type: 'string' }, depth: { type: 'string', enum: ['passive', 'standard', 'deep'] }, authorized: { type: 'boolean', description: 'The user confirmed they own the domain or have written permission.' } }, required: ['domain', 'authorized'] },
      writes: true,
      run: async (a) => recon.startRecon({ target: String(a.domain), depth: (['passive', 'standard', 'deep'] as const).includes(a.depth as never) ? (a.depth as ReconRequest['depth']) : 'standard', reviewer: 'none', authorized: a.authorized === true }, (i) => send('recon:changed', i), (id, text) => send('recon:line', { id, text })).id
    },
    {
      name: 'list_recon',
      description: 'Lists the recon sessions Laramac has kept, with their status and findings by severity.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => recon.listRecon()
    },
    {
      name: 'read_recon',
      description: 'Reads one recon session: steps, hosts, JavaScript (source maps, endpoints, masked keys), parameters and findings.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async (a) => {
        const d = recon.reconDetail(String(a.id))
        return { ...d, hosts: d.hosts.slice(0, 300), js: d.js.slice(0, 200), endpoints: d.endpoints.slice(0, 500) }
      }
    },
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

  // ---- Claude everywhere: Claude Code, claudelm, the Claude app, skills
  const nodeBinDir = (): string | undefined => {
    const n = locate('node')
    return n ? dirname(n.path) : undefined
  }
  let lastContext: ClaudeSetupStatus['context'] = null
  const claudeStatus = async (notes: string[] = []): Promise<ClaudeSetupStatus> => ({
    claudeCode: !!findCli(['claude']),
    mcpClaudeCode: await claudeMcp(),
    desktopApp: desktopAppInstalled(),
    desktopConnected: desktopConnected(),
    skills: installedForClaude('laramac'),
    claudeLm: claudeLmInstalled(),
    model: getSettings().llm.model || null,
    inPath: cli.cliInPath(),
    context: lastContext,
    notes
  })
  const writeClaudeLm = (): boolean => {
    const st = getSettings()
    const claude = findCli(['claude'])
    if (!claude || !st.llm.model || !st.llm.baseUrl) return false
    installClaudeLm(claudeLmConfigFor({ claude, baseUrl: st.llm.baseUrl, model: st.llm.model, plugins: review.ensurePlugins() }), process.execPath, true)
    return true
  }
  const checkContext = async (): Promise<void> => {
    const st = getSettings()
    if (!st.llm.model || !st.llm.baseUrl) return
    const r = await ensureLmContext(st.llm.baseUrl, st.llm.model)
    lastContext = { ok: r.ok, after: r.after, max: r.max, note: r.note }
  }
  // 0.21 wrote claude-lm; move people to claudelm on their own.
  if (existsSync(join(dirs.bin(), 'claude-lm'))) {
    try {
      writeClaudeLm()
    } catch {
      // Set up Claude everywhere again fixes it.
    }
  }
  handle('claude:status', () => claudeStatus())
  handle('claude:lm-context', async () => {
    await jobs.run('Checking the model in LM Studio', () => checkContext())
    return claudeStatus()
  })
  handle('claude:setup', async (o) => {
    const notes: string[] = []
    const opts = (o ?? {}) as { lmToken?: unknown }
    await jobs.run('Setting up Claude everywhere', async (update) => {
      if (!findCli(['claude'])) {
        update(5, 'Installing Claude Code')
        await installClaudeCode()
        await refreshLoginShellPaths(true)
      }
      const claude = findCli(['claude'])
      if (!claude) throw new Error('Claude Code could not be installed. Install it from claude.com/claude-code, then try again.')
      update(20, 'Letting Claude use Laramac')
      setSettings({ mcpEnabled: true })
      await startMcp()
      const run = (args: string[]): Promise<void> =>
        new Promise((resolve, reject) => execFile(claude, args, { timeout: 20000, env: { ...process.env, ...runtimeEnv() } }, (err, _o, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve())))
      await run(['mcp', 'remove', 'laramac', '--scope', 'user']).catch(() => undefined)
      await run(['mcp', 'add', '--transport', 'http', '--scope', 'user', 'laramac', mcpUrl(), '--header', `Authorization: Bearer ${mcpToken()}`]).catch((e) => void notes.push(`Claude Code: ${(e as Error).message}`))
      update(40, 'Installing the security skills')
      installForClaude('laramac')
      if (desktopAppInstalled()) {
        update(55, 'Connecting the Claude app')
        connectClaudeDesktop(mcpUrl(), mcpToken(), nodeBinDir())
        if (!nodeBinDir()) notes.push('The Claude app needs Node.js to reach Laramac. Install Node.js on the Languages page, then run this again.')
      } else notes.push('The Claude desktop app is not installed, so it was skipped. Get it at claude.ai/download.')
      update(70, 'Adding the commands to Terminal')
      cli.installCli(process.execPath)
      cli.addToPath()
      if (typeof opts.lmToken === 'string') await storeLmToken(opts.lmToken.trim())
      if (writeClaudeLm()) {
        update(85, 'Checking the model in LM Studio')
        await checkContext().catch(() => undefined)
      } else notes.push('claudelm needs a model: choose one from LM Studio in the Assistant, then run this again.')
    })
    activity.push('success', 'Claude is set up everywhere', 'claude, claudelm and the Claude app can use Laramac and its skills. Restart the Claude app to see it.')
    return claudeStatus(notes)
  })
  handle('claude:open-lm', async (name) => {
    if (!claudeLmInstalled().installed) throw new ValidationError('Set up Claude everywhere first, in AI tools.')
    const dir = typeof name === 'string' && name ? siteByName(name).path : getSettings().wwwPath
    await openTerminal(dir, 'claudelm')
  })
  // ---- Free LLM API: your free keys behind one address, for claudefree, reviews and the Assistant
  let freeCheck: { ok: boolean | null; note: string; models: string[] } = { ok: null, note: '', models: [...FREELLM_MODELS] }
  const freeInfo = async (): Promise<FreeLlmInfo> => {
    const st = getSettings()
    return { baseUrl: st.freellm?.baseUrl ?? FREELLM_DEFAULT_URL, model: st.freellm?.model ?? 'auto', hasKey: !!(await readFreeKey()), claudefree: claudeFreeInstalled(), claudeCode: !!findCli(['claude']), ...freeCheck }
  }
  const writeClaudeFree = (): void => {
    const claude = findCli(['claude'])
    const st = getSettings()
    if (claude) installClaudeFree(claudeFreeConfigFor({ claude, baseUrl: st.freellm?.baseUrl ?? FREELLM_DEFAULT_URL, model: st.freellm?.model ?? 'auto', plugins: review.ensurePlugins() }), process.execPath, true)
  }
  const runFreeCheck = async (): Promise<void> => {
    const key = await readFreeKey()
    if (!key) {
      freeCheck = { ok: false, note: 'Paste the unified key from Free LLM API’s Keys page.', models: [...FREELLM_MODELS] }
      return
    }
    const r = await checkFreeLlm(getSettings().freellm?.baseUrl ?? FREELLM_DEFAULT_URL, key)
    freeCheck = { ok: r.ok, note: r.note, models: r.ok ? r.models : [...FREELLM_MODELS] }
  }
  handle('freellm:get', () => freeInfo())
  handle('freellm:check', async () => {
    await runFreeCheck()
    return freeInfo()
  })
  handle('freellm:save', async (o) => {
    if (!o || typeof o !== 'object') throw new ValidationError('That is not a Free LLM API setting.')
    let baseUrl: string
    let model: string
    let key: string | null | undefined
    try {
      baseUrl = freeLlmUrl(String(o.baseUrl ?? ''))
      model = freeLlmModel(String(o.model ?? ''))
      key = o.key === null ? null : typeof o.key === 'string' && o.key.trim() ? checkFreeLlmKey(o.key) : undefined
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
    if (key === null) await storeFreeKey('')
    else if (key) await storeFreeKey(key)
    setSettings({ freellm: { baseUrl, model } })
    const saved = await readFreeKey()
    // The Assistant and "Your model" reviews can use it as a saved server too.
    const existing = models.listServers().find((x) => x.name === 'Free LLM API')
    if (saved) models.saveServer({ id: existing?.id, name: 'Free LLM API', baseUrl, api: 'openai', key: saved })
    else if (existing) models.deleteServer(existing.id)
    if (saved) writeClaudeFree()
    else removeClaudeFree()
    await runFreeCheck()
    if (freeCheck.ok) activity.push('success', 'Free LLM API is connected', 'claudefree, code reviews and the Assistant can use it.')
    return freeInfo()
  })
  handle('claude:open-free', async (name) => {
    if (!claudeFreeInstalled()) throw new ValidationError('Connect Free LLM API first, on the AI tools page.')
    const dir = typeof name === 'string' && name ? siteByName(name).path : getSettings().wwwPath
    await openTerminal(dir, 'claudefree')
  })
  // ---- Site tools: requests, workers, tests, Compose, debugging, other devices, hosting
  const siteCmdEnv = (site: SiteInfo): NodeJS.ProcessEnv => {
    const minor = site.php ?? defaultMinor()
    const env = nodes.siteRuntimeEnv(site.path, getSettings().siteConfig[site.name]?.node)
    // php and composer in commands resolve to the site's own PHP.
    if (minor) env.PATH = `${dirname(phpBinary(minor))}:${env.PATH ?? ''}`
    return env
  }
  handle('site:requests', (name) => {
    const site = siteByName(name)
    const logs = [join(dirs.logs(), 'nginx-access.log'), join(dirs.logs(), 'apache-access.log')]
    const text = logs.filter((f) => existsSync(f)).map((f) => tailFile(f, 20000)).join('\n')
    return tools.siteRequests(text, [site.domain, ...site.aliases])
  })
  handle('site:cors', async (name, on) => {
    const site = siteByName(name)
    setSiteConfig(site.name, { cors: on === true ? true : undefined })
    await services.reloadWeb()
    activity.push('info', on === true ? `${site.name} answers cross-origin requests` : `${site.name} no longer answers cross-origin requests`, on === true ? `Pages on localhost and .${getSettings().tld} addresses may call it, with cookies. Nothing on the internet can.` : '')
    notifySitesChanged()
    return on === true
  })
  handle('site:lan', (name) => {
    const site = siteByName(name)
    const st = getSettings()
    const folder = site.path.split('/').pop()!
    const port = st.httpPort === 80 ? '' : `:${st.httpPort}`
    const urls = st.allowLan && st.hostLocalhostFolders ? tools.lanAddresses().map((ip) => `http://${ip}${port}/${encodeURIComponent(folder)}/`) : []
    return { urls, allowLan: st.allowLan, folders: st.hostLocalhostFolders, share: site.shareUrl ?? null }
  })
  // Workers
  const workerList = (site: SiteInfo): { suggested: WorkerConfig[]; configured: WorkerConfig[]; running: string[] } => {
    const configured = getSettings().siteConfig[site.name]?.workers ?? []
    const suggested = tools.suggestWorkers(site).filter((w) => !configured.some((c) => c.id === w.id))
    return { suggested, configured, running: configured.filter((w) => workerRunning(site.name, w.id)).map((w) => w.id) }
  }
  handle('workers:list', (name) => workerList(siteByName(name)))
  handle('workers:save', (name, list) => {
    const site = siteByName(name)
    if (!Array.isArray(list) || list.length > 20) throw new ValidationError('Up to 20 workers per site.')
    const clean: WorkerConfig[] = list.map((w) => {
      const x = w as Partial<WorkerConfig>
      if (typeof x.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(x.id) || typeof x.name !== 'string') throw new ValidationError('Each worker needs a name.')
      try {
        return { id: x.id, name: x.name.slice(0, 60), command: tools.checkCommand(x.command), auto: x.auto === true }
      } catch (e) {
        throw new ValidationError((e as Error).message)
      }
    })
    setSiteConfig(site.name, { workers: clean })
    return workerList(site)
  })
  handle('workers:start', async (name, id) => {
    const site = siteByName(name)
    const w = (getSettings().siteConfig[site.name]?.workers ?? []).find((x) => x.id === id)
    if (!w) throw new ValidationError('Add the worker first.')
    await startWorker(site, w, siteCmdEnv(site)).catch((e) => {
      throw new ValidationError(`${w.name} stopped: ${(e as Error).message}. Its log says more.`)
    })
    activity.push('success', `${w.name} is running for ${site.name}`)
    return workerList(site)
  })
  handle('workers:stop', async (name, id) => {
    const site = siteByName(name)
    await stopWorker(site.name, String(id))
    return workerList(site)
  })
  handle('workers:logs', (name, id) => workerLogs(siteByName(name).name, String(id)))
  // Tests
  handle('tests:runners', (name) => tools.findTestRunners(siteByName(name)))
  handle('tests:run', async (name, id) => {
    const site = siteByName(name)
    const runner = tools.findTestRunners(site).find((r) => r.id === id)
    if (!runner) throw new ValidationError('That test runner was not found in this project.')
    const started = Date.now()
    let out = ''
    await jobs.run(`Running ${runner.name} for ${site.name}`, (update) =>
      runQuiet(runner.command, site.path, { ...siteCmdEnv(site), CI: '1', NO_COLOR: '1' }, (l) => {
        out += `${l}\n`
        if (out.length > 400_000) out = out.slice(-300_000)
        update(null, `${runner.name}: ${l.slice(0, 70)}`)
      }, 30 * 60_000).catch(() => undefined)
    )
    const summary = tools.summariseTests(out)
    activity.push(summary.failed ? 'error' : 'success', `${runner.name} for ${site.name}: ${summary.passed} passed${summary.failed ? `, ${summary.failed} failed` : ''}`)
    return { summary, output: out.slice(-60_000), ms: Date.now() - started }
  })
  // Docker Compose
  const dockerBin = (): string | null => findOnPath('docker', ['/usr/local/bin', '/opt/homebrew/bin', join(app.getPath('home'), '.orbstack', 'bin'), '/Applications/Docker.app/Contents/Resources/bin'])
  const compose = (site: SiteInfo, args: string[], timeout = 20 * 60_000): Promise<string> => {
    const docker = dockerBin()
    if (!docker) throw new ValidationError('Docker is not installed. Install OrbStack, Docker Desktop or Colima first.')
    return new Promise((resolve, reject) => execFile(docker, ['compose', ...args], { cwd: site.path, timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...runtimeEnv() } }, (err, out, errOut) => (err ? reject(new ValidationError(String(errOut || err.message).trim().split('\n').slice(-2).join(' '))) : resolve(String(out)))))
  }
  handle('compose:status', async (name) => {
    const site = siteByName(name)
    const file = tools.composeFile(site.path)
    if (!file) return { file: null, docker: !!dockerBin(), services: [] }
    const services = dockerBin() ? tools.parseComposePs(await compose(site, ['ps', '--all', '--format', 'json'], 30000).catch(() => '')) : []
    return { file: file.split('/').pop()!, docker: !!dockerBin(), services }
  })
  handle('compose:up', async (name) => {
    const site = siteByName(name)
    await jobs.run(`Starting ${site.name}'s containers`, () => compose(site, ['up', '-d', '--remove-orphans']))
    activity.push('success', `${site.name}'s containers are up`)
  })
  handle('compose:down', async (name) => {
    const site = siteByName(name)
    await jobs.run(`Stopping ${site.name}'s containers`, () => compose(site, ['down']))
  })
  handle('compose:logs', (name) => compose(siteByName(name), ['logs', '--no-color', '--tail', '300'], 30000))
  // Debugging in the editor
  handle('site:debug-setup', async (name) => {
    const site = siteByName(name)
    if (!getSettings().xdebug) {
      for (const m of installedMinors()) await ensureXdebug(m).catch(() => false)
      if (!installedMinors().some((m) => existsSync(xdebugPath(m)))) throw new ValidationError('Xdebug is not ready for your PHP versions yet. Try again tomorrow, when Laramac’s PHP builds include it.')
      setSettings({ xdebug: true })
      await restartPhp()
    }
    const dir = join(site.path, '.vscode')
    const file = join(dir, 'launch.json')
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(file, tools.mergeLaunchJson(existsSync(file) ? readFileSync(file, 'utf8') : null))
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
    activity.push('success', `Debugging is ready for ${site.name}`, 'Xdebug is on, and .vscode/launch.json has "Listen for Xdebug (Laramac)". In VS Code or Cursor, press F5, then load the page.')
  })
  // Hosting
  handle('hosting:set', (name, cfg, hook) => {
    const site = siteByName(name)
    const c = (cfg ?? {}) as HostingConfig
    if (!['forge', 'ploi', 'vercel', 'netlify', 'azure'].includes(c.kind)) throw new ValidationError('Choose where it is hosted.')
    if (c.kind === 'forge' || c.kind === 'ploi') {
      if (typeof hook === 'string' && hook.trim()) {
        try {
          setSecret(`deploy-hook-${site.name}`, tools.checkDeployHook(c.kind, hook))
        } catch (e) {
          throw new ValidationError((e as Error).message)
        }
      }
      if (!getSecret(`deploy-hook-${site.name}`)) throw new ValidationError('Paste the deploy hook address.')
    }
    const hosting: HostingConfig = { kind: c.kind, hookSaved: c.kind === 'forge' || c.kind === 'ploi', ...(c.kind === 'azure' ? { app: String(c.app ?? '').slice(0, 60), group: String(c.group ?? '').slice(0, 90) } : {}) }
    setSiteConfig(site.name, { hosting })
    return hosting
  })
  handle('hosting:deploy', async (name, prod) => {
    const site = siteByName(name)
    const h = getSettings().siteConfig[site.name]?.hosting
    if (!h) throw new ValidationError('Choose where it is hosted first.')
    if (h.kind === 'forge' || h.kind === 'ploi') {
      const hook = getSecret(`deploy-hook-${site.name}`)
      if (!hook) throw new ValidationError('Paste the deploy hook address again.')
      const res = await fetch(tools.checkDeployHook(h.kind, hook), { method: 'POST', signal: AbortSignal.timeout(30000) }).catch(() => null)
      if (!res || !res.ok) throw new ValidationError(`${h.kind === 'forge' ? 'Forge' : 'Ploi'} did not accept the deploy (${res?.status ?? 'no answer'}).`)
      activity.push('success', `${h.kind === 'forge' ? 'Forge' : 'Ploi'} is deploying ${site.name}`, 'Follow it on their site.')
      return 'started'
    }
    let cmd: string
    try {
      cmd = tools.hostingCommand(h.kind, { app: h.app, group: h.group, prod: prod === true })
    } catch (e) {
      throw new ValidationError((e as Error).message)
    }
    await openTerminal(site.path, cmd)
    return 'terminal'
  })
  // Database extras
  handle('db:scramble-plan', async (engine, name) => {
    const t = dbTarget(dbEngine(engine))
    const db = dbadmin.checkName(String(name))
    const cols = await dbadmin.readOnlyQuery(t, db, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = '${db}'`, 20000)
    const ids = await dbadmin.readOnlyQuery(t, db, `SELECT table_name FROM information_schema.columns WHERE table_schema = '${db}' AND column_name = 'id'`, 5000)
    return tools.scramblePlan(cols.rows.map((r) => ({ table: r[0], column: r[1] })), new Set(ids.rows.map((r) => r[0])))
  })
  handle('db:scramble', async (engine, name, typed) => {
    const eng = dbEngine(engine)
    const db = dbadmin.checkName(String(name))
    if (typed !== db) throw new ValidationError(`Type ${db} to confirm.`)
    const t = dbTarget(eng)
    const cols = await dbadmin.readOnlyQuery(t, db, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = '${db}'`, 20000)
    const ids = await dbadmin.readOnlyQuery(t, db, `SELECT table_name FROM information_schema.columns WHERE table_schema = '${db}' AND column_name = 'id'`, 5000)
    const plan = tools.scramblePlan(cols.rows.map((r) => ({ table: r[0], column: r[1] })), new Set(ids.rows.map((r) => r[0])))
    if (!plan.length) return 0
    await jobs.run(`Scrambling personal data in ${db}`, async (update) => {
      update(null, `Saving a backup of ${db} first`)
      await backupDatabase(eng, db)
      await dbadmin.execSql(t, db, plan.map((p) => p.sql).join('\n'))
    })
    activity.push('success', `Scrambled ${plan.length} columns in ${db}`, 'A backup was saved first, under Databases, Backups.')
    return plan.length
  })
  handle('db:schema-diff', async (engine, a, b) => {
    const t = dbTarget(dbEngine(engine))
    const read = async (db: string): Promise<Map<string, Map<string, string>>> => {
      const r = await dbadmin.readOnlyQuery(t, dbadmin.checkName(db), `SELECT table_name, column_name, column_type, is_nullable FROM information_schema.columns WHERE table_schema = '${dbadmin.checkName(db)}' ORDER BY table_name, ordinal_position`, 50000)
      const m = new Map<string, Map<string, string>>()
      for (const [tb, c, ty, n] of r.rows) {
        if (!m.has(tb)) m.set(tb, new Map())
        m.get(tb)!.set(c, `${ty}${n === 'YES' ? ' null' : ''}`)
      }
      return m
    }
    return tools.schemaDiff(await read(String(a)), await read(String(b)))
  })
  const backupsDir = (): string => join(dirs.root(), 'backups')
  const backupDatabase = async (engine: 'mysql' | 'mariadb', db: string): Promise<string> => {
    const dir = join(backupsDir(), `${engine}-${db}`)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz`)
    await dbadmin.exportDatabase(dbTarget(engine), db, file)
    // Keep the newest few.
    const keep = getSettings().dbBackupKeep ?? 7
    const all = readdirSync(dir).filter((f) => f.endsWith('.sql.gz')).sort()
    for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old), { force: true })
    return file
  }
  // ---- For PHP developers: quick php.ini settings, global tools and Artisan
  const quickNow = (): PhpQuick => {
    const m = defaultMinor()
    const text = m && existsSync(customIniPath(m)) ? readFileSync(customIniPath(m), 'utf8') : ''
    const v = phpdev.readQuick(text)
    return { settings: phpdev.QUICK_SETTINGS.map((q) => ({ key: q.key, label: q.label, hint: q.hint, options: q.options, fallback: q.fallback, value: v[q.key] })) }
  }
  handle('php:quick', () => quickNow())
  handle('php:quick-set', async (key, value) => {
    const q = phpdev.QUICK_SETTINGS.find((x) => x.key === key)
    if (!q || typeof value !== 'string' || !q.options.some((o) => o.value === value)) throw new ValidationError('Choose one of the values on the list.')
    // The same quick settings for every PHP version, so switching versions keeps them.
    for (const m of installedMinors()) {
      const file = ensureCustomIni(m)
      const current = phpdev.readQuick(readFileSync(file, 'utf8'))
      writeFileSync(file, phpdev.writeQuick(readFileSync(file, 'utf8'), { ...current, [key]: value }))
    }
    await restartPhp()
    activity.push('info', `${q.label}: ${q.options.find((o) => o.value === value)!.label}`, 'PHP restarted with the new setting.')
    return quickNow()
  })
  const composerHome = (): string => join(dirs.root(), 'composer')
  const toolList = (): PhpToolInfo[] => {
    const inst = phpdev.installedGlobals(composerHome())
    return phpdev.PHP_TOOLS.map((t) => ({ id: t.id, name: t.name, command: t.command, about: t.about, version: inst[t.pkg] ?? null }))
  }
  const composerGlobal = async (args: string[], label: string): Promise<void> => {
    const m = defaultMinor()
    if (!m) throw new ValidationError('Install PHP first.')
    if (!existsSync(composerPhar())) await installComposer()
    await jobs.run(label, (u) => runQuiet([phpBinary(m), composerPhar(), 'global', ...args, '--no-interaction', '--no-progress'], dirs.root(), runtimeEnv(), (l) => u(null, `${label}: ${l.slice(0, 70)}`), 10 * 60_000))
  }
  handle('phptools:list', () => toolList())
  handle('phptools:install', async (id) => {
    const t = phpdev.PHP_TOOLS.find((x) => x.id === id)
    if (!t) throw new ValidationError('That tool is not on the list.')
    await composerGlobal(['require', t.pkg, '-W'], `Installing ${t.name}`)
    activity.push('success', `${t.name} is ready`, `Type ${t.command} in Laramac Code’s terminal or a Terminal window Laramac opens.`)
    return toolList()
  })
  handle('phptools:remove', async (id) => {
    const t = phpdev.PHP_TOOLS.find((x) => x.id === id)
    if (!t) throw new ValidationError('That tool is not on the list.')
    await composerGlobal(['remove', t.pkg], `Removing ${t.name}`)
    return toolList()
  })
  handle('site:artisan', async (name, action) => {
    const site = siteByName(name)
    if (!existsSync(join(site.path, 'artisan'))) throw new ValidationError('This site is not a Laravel project.')
    const a = phpdev.ARTISAN.find((x) => x.id === action)
    if (!a) throw new ValidationError('That command is not on the list.')
    // Runs the project's own code: you pressed the button for exactly this command.
    await openTerminal(site.path, ['php', 'artisan', ...a.args].map((x) => (/^[\w:.-]+$/.test(x) ? x : shellQuote(x))).join(' '))
  })
  handle('overview:pulse', async () => {
    const logs = [join(dirs.logs(), 'nginx-access.log'), join(dirs.logs(), 'apache-access.log')]
    const text = logs.filter((f) => existsSync(f)).map((f) => tailFile(f, 20000)).join('\n')
    const now = Date.now()
    const p = tools.pulseFrom(text, now)
    const bySite = tools.pulseBySite(text, now)
    // What each running service and dev server uses right now, like Activity Monitor.
    const roots = runningProcesses()
    let processes: OverviewPulse['processes'] = []
    if (roots.length) {
      const ps = await new Promise<string>((resolve) => execFile('/bin/ps', ['-axo', 'pid=,ppid=,pcpu=,rss='], { timeout: 4000, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => resolve(String(out ?? ''))))
      processes = tools.processUsage(ps, roots, now)
    }
    let mail: number | null = null
    try {
      const r = await fetch('http://127.0.0.1:8025/api/v1/messages?limit=1', { signal: AbortSignal.timeout(1200) })
      if (r.ok) mail = Number(((await r.json()) as { total?: number }).total ?? 0)
    } catch {
      mail = null
    }
    let lastBackup: string | null = null
    if (existsSync(backupsDir())) {
      for (const d of readdirSync(backupsDir())) {
        if (!/^(mysql|mariadb)-[A-Za-z0-9_]+$/.test(d)) continue
        for (const f of readdirSync(join(backupsDir(), d))) {
          if (!f.endsWith('.sql.gz')) continue
          const at = statSync(join(backupsDir(), d, f)).mtime.toISOString()
          if (!lastBackup || at > lastBackup) lastBackup = at
        }
      }
    }
    const r = review.listReviews()[0]
    const c = (r?.counts ?? {}) as Record<string, number>
    return { ...p, bySite, processes, mail, lastBackup, review: r ? { title: r.title, at: r.at, critical: c.critical ?? 0, high: c.high ?? 0, medium: c.medium ?? 0, low: c.low ?? 0 } : null }
  })
  handle('db:backups', () => {
    const out: { engine: string; name: string; files: { file: string; bytes: number; at: string }[] }[] = []
    if (!existsSync(backupsDir())) return { list: out, scheduled: getSettings().dbBackups ?? [] }
    for (const d of readdirSync(backupsDir())) {
      const m = /^(mysql|mariadb)-([A-Za-z0-9_]+)$/.exec(d)
      if (!m) continue
      const files = readdirSync(join(backupsDir(), d)).filter((f) => f.endsWith('.sql.gz')).sort().reverse().map((f) => ({ file: f, bytes: statSync(join(backupsDir(), d, f)).size, at: f.replace('.sql.gz', '') }))
      out.push({ engine: m[1], name: m[2], files })
    }
    return { list: out, scheduled: getSettings().dbBackups ?? [] }
  })
  handle('db:backup-now', async (engine, name) => {
    const eng = dbEngine(engine)
    const db = dbadmin.checkName(String(name))
    const file = await jobs.run(`Backing up ${db}`, () => backupDatabase(eng, db))
    activity.push('success', `Backed up ${db}`, file.replace(app.getPath('home'), '~'))
  })
  handle('db:backup-schedule', (engine, name, on) => {
    const eng = dbEngine(engine)
    const db = dbadmin.checkName(String(name))
    const list = (getSettings().dbBackups ?? []).filter((x) => !(x.engine === eng && x.name === db))
    if (on === true) list.push({ engine: eng, name: db })
    setSettings({ dbBackups: list })
    return list
  })
  handle('db:backup-reveal', () => {
    mkdirSync(backupsDir(), { recursive: true })
    void shell.openPath(backupsDir())
  })
  // Daily backups, at most once a day each, checked every hour.
  setInterval(() => {
    for (const b of getSettings().dbBackups ?? []) {
      const dir = join(backupsDir(), `${b.engine}-${b.name}`)
      const last = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql.gz')).sort().pop() : undefined
      const lastAt = last ? Date.parse(last.replace('.sql.gz', '').replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z')) : 0
      if (Date.now() - lastAt < 23 * 3600_000) continue
      if (services.list().find((x) => x.id === b.engine)?.status !== 'running') continue
      void backupDatabase(b.engine, b.name).catch((e) => activity.push('error', `Daily backup of ${b.name} failed`, (e as Error).message.slice(0, 200)))
    }
  }, 3600_000)

  // ---- Integrations: webhooks, Raycast, Apple Shortcuts
  const raycastDir = (): string => join(dirs.root(), 'raycast')
  const integrations = (): IntegrationsInfo => {
    const w = getSettings().webhook
    return {
      webhook: w ? { ...w, saved: !!getSecret('webhook-url') } : null,
      raycastDir: raycastDir(),
      raycastInstalled: existsSync(join(raycastDir(), 'laramac-status.sh')),
      cli: cli.cliBin(),
      shortcuts: [
        { title: 'Start everything', command: `"${cli.cliBin()}" start apache; "${cli.cliBin()}" start mysql` },
        { title: 'Your sites as JSON', command: `"${cli.cliBin()}" sites --json` },
        { title: 'Open a site', command: `"${cli.cliBin()}" open shop` },
        { title: 'Start a dev server', command: `"${cli.cliBin()}" dev shop` }
      ]
    }
  }
  handle('integrations:get', () => integrations())
  handle('webhook:set', (cfg, url) => {
    if (cfg === null) {
      setSettings({ webhook: undefined })
      setSecret('webhook-url', '')
      return integrations()
    }
    const c = cfg as { kind: HookKind; events: 'errors' | 'all' }
    if (!['slack', 'teams', 'discord', 'generic'].includes(c.kind)) throw new ValidationError('Choose Slack, Teams, Discord or another address.')
    if (typeof url === 'string' && url.trim()) {
      try {
        setSecret('webhook-url', checkHookUrl(c.kind, url))
      } catch (e) {
        throw new ValidationError((e as Error).message)
      }
    }
    if (!getSecret('webhook-url')) throw new ValidationError('Paste the webhook address.')
    setSettings({ webhook: { kind: c.kind, events: c.events === 'all' ? 'all' : 'errors' } })
    return integrations()
  })
  handle('webhook:test', async () => {
    const w = getSettings().webhook
    const url = getSecret('webhook-url')
    if (!w || !url) throw new ValidationError('Save a webhook first.')
    await sendHook(w.kind, url, hookBody(w.kind, 'Laramac', 'info', 'Test message', 'Laramac can post here.')).catch((e) => {
      throw new ValidationError((e as Error).message)
    })
  })
  handle('raycast:install', () => {
    cli.installCli(process.execPath)
    mkdirSync(raycastDir(), { recursive: true })
    for (const f of raycastScripts(cli.cliBin(), 'Laramac')) {
      writeFileSync(join(raycastDir(), f.file), f.text)
      chmodSync(join(raycastDir(), f.file), 0o755)
    }
    void shell.openPath(raycastDir())
    return integrations()
  })
  let hookSentAt = 0
  let lastHookId = ''
  activity.on('changed', (items: { id: string; kind: 'error' | 'success' | 'info'; title: string; body?: string }[]) => {
    const w = getSettings().webhook
    const it = items[0]
    if (!w || !it || it.id === lastHookId) return
    lastHookId = it.id
    if (it.kind !== 'error' && !(w.events === 'all' && it.kind === 'success')) return
    if (Date.now() - hookSentAt < 3000) return
    hookSentAt = Date.now()
    const url = getSecret('webhook-url')
    if (url) void sendHook(w.kind, url, hookBody(w.kind, 'Laramac', it.kind, it.title, it.body?.slice(0, 500))).catch(() => undefined)
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
  // The security teams' skill packs are part of every review by default: fetched quietly once, kept up to date with each app version.
  // Laramac Code: the app follows Laramac's version, new extensions (Claude Code, Cline) are added once.
  setTimeout(() => void ideOnStart(() => undefined).catch(() => undefined), 40_000)
  setTimeout(() => {
    void (async () => {
      const declined = new Set(getSettings().packsDeclined ?? [])
      for (const p of SKILL_PACKS) {
        if (declined.has(p.id) || packState(review.packsRoot(), p.id).installed) continue
        await jobs.run(`Getting the ${p.name} skills`, () => installPack(review.packsRoot(), p.id)).catch(() => undefined)
      }
    })()
  }, 25_000)
  // 0.23 brings the Studio look as the default; it reaches everyone once, and Settings, Look switches back.
  if ((getSettings().lookVersion ?? 0) < 23) setSettings({ glassStyle: 'studio', lookVersion: 23 })
  // Light, dark or the Mac's own: for the window, its glass and Laramac Code.
  nativeTheme.themeSource = getSettings().appearance === 'light' || getSettings().appearance === 'dark' ? (getSettings().appearance as 'light' | 'dark') : 'system'
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
  void Promise.allSettled([stopAllTunnels(), services.stopAll(), stopAllFpm(), stopAllDev(), stopAllWorkers(), stopAllBackends()]).then(() => {
    stopDnsServer()
    app.exit(0)
  })
})
