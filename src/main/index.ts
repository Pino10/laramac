import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'fs'
import { cancelImport, importSql, inspect, runImport } from './importer'
import * as dbadmin from './dbadmin'
import { homedir } from 'os'
import { checkForUpdate, installUpdate } from './updater'
import { resetLaramac } from './reset'
import { setupRecommended } from './setup'
import { installAiTool, launchAiTool, listAiTools, refreshLoginShellPaths } from './aitools'
import * as ssh from './ssh'
import { customIniPath, ensureCustomIni } from './php'
import { safeStorage } from 'electron'
import type { DatabaseInfo, ResetOptions, SshServerInput, UpdateInfo } from '../shared/types'
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
  toolsStatus
} from './tools'
import { shareSite, shareUrls, stopAllTunnels, unshareSite } from './share'
import { createProject } from './creator'
import { detectLlms, installClaudeCode, openClaudeCode, openInEditor } from './integrations'
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
  const icon = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAACL0lEQVR4AeyWu0odURSGJwkkXSDkBZImL5EipEsTkiqQkECKFGly8Q30CbwWFlqJIKIo2thp40vY2NkqFqJ4/b593IetZ+bM4IygMvL/s9a+/WvNmllnfJzdsb82obIH0laorVBZBcrWH8Q7NMhdnifcwW8M96pCj7jtT/A71MfUghrfUPgIC9GvQsOcWoYz8Cesi18IzMIVOAJzUZSQh/8lJ3YT/6buXnJQbWMkUx03L6G3LE3CiHUc7wpTC4ucVgsTYAxjhUG8XE/oNQur8AkUW1w+wzNYF2qopaZaxjCWMR0Hpgk9Z2YNvoDCx/QBZx82BbXUVFtNYxnT2I6zmJDWF/hNmM2yU6zdsI1tGmqqbQy1jWlsc+gm9JWV9zDiN84mvC2obYyob+wvDkJWOP7yYgKOuB7D28YJAYyFCfAd61ZojqnYAc/wp2FPBzDXFNSeQsxYmMzYCzqxQmZX2gEeaIB2ld1llyln1xnbHLoVcqG0A9xUk3aTXWV3KWW32XXGdnwlISf6doAbcviSuY0Cpp8cn4bdZFexPb+T3eRiyrwO8KOY7kn9pwzeFfAV8xE/cOwmTIBdZqwwiJe8hFzzhRvTueTBpa1jDpPDo/jGwFxFUULu+s9F/sEuwbqYR+Av9MM6gM1Fv4T8bfJOJjipjwnwfRnCq0L3sjVAjXE8K6+P24t+CfXu7swYxH9jq9C9nVMVr1USqijVzLY2obI6thVqK1RWgbL1O/cOXQAAAP//w9eH2QAAAAZJREFUAwAE2mpJKQw2xgAAAABJRU5ErkJggg==', 'base64'), { scaleFactor: 2 })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Laramac')
  const rebuild = (): void => {
    const tld = getSettings().tld
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Laramac', click: showWindow },
        { type: 'separator' },
        { label: 'Start All', click: () => void services.startAll() },
        { label: 'Stop All', click: () => void services.stopAll() },
        { type: 'separator' },
        {
          label: 'Open phpMyAdmin',
          enabled: phpmyadminInstalled(),
          click: () => void shell.openExternal(`http://phpmyadmin.${tld}`)
        },
        { label: 'Open Mail Inbox', click: () => void shell.openExternal('http://127.0.0.1:8025') },
        { label: 'Open www Folder', click: () => void shell.openPath(ensureWww()) },
        { type: 'separator' },
        { label: 'Quit Laramac', role: 'quit' }
      ])
    )
  }
  rebuild()
  tray.on('mouse-enter', rebuild)
  jobs.on('finished', rebuild)
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
    if (next.allowLan !== before.allowLan || next.httpPort !== before.httpPort) void services.reloadWeb()
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
    setSiteConfig(site.name, clean)
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
    const res = await dialog.showOpenDialog(mainWindow, { title: 'Upload files', buttonLabel: 'Upload', properties: ['openFile', 'multiSelections'] })
    if (res.canceled || res.filePaths.length === 0) return 0
    const n = await ssh.upload(String(sid), res.filePaths, String(remoteDir))
    activity.push('success', `Uploaded ${n} ${n === 1 ? 'file' : 'files'}`, String(remoteDir))
    return n
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
  void Promise.allSettled([stopAllTunnels(), services.stopAll(), stopAllFpm()]).then(() => {
    stopDnsServer()
    app.exit(0)
  })
})
