import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { join } from 'path'
import type { ChannelName, Channels, Events, SiteInfo } from '../shared/types'
import { ensureDirs } from './paths'
import { ensureWww, getSettings, setSettings } from './settings'
import { scanSites, setSiteConfig } from './sites'
import { services } from './services'
import { jobs } from './jobs'
import { installMinor, listVersions, removeMinor, installedMinors } from './php'
import { DNS_PORT, installResolver, startDnsServer, stopDnsServer } from './dns'
import { ensureSiteCert, trustCa } from './ssl'
import {
  installCloudflared,
  installAdminer,
  installComposer,
  installNgrok,
  installPhpMyAdmin,
  refreshShims,
  toolsStatus
} from './tools'
import { shareSite, shareUrls, stopAllTunnels, unshareSite } from './share'
import { createProject } from './creator'
import {
  detectLlms,
  installClaudeCode,
  openClaudeCode,
  openInEditor
} from './integrations'
import { assistantChat } from './ai'
import { stopAllFpm } from './php'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let watcher: FSWatcher | null = null
let quitting = false

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

/** Applies the macOS 26 Liquid Glass effect when available, else falls back to vibrancy. */
function applyGlass(win: BrowserWindow): void {
  if (process.platform !== 'darwin' || !getSettings().glass) return
  try {
    // Optional native module: only works on macOS 26+. Loaded lazily so older systems still run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const liquidGlass = require('electron-liquid-glass')
    win.webContents.once('did-finish-load', () => {
      liquidGlass.addView(win.getNativeWindowHandle(), { cornerRadius: 16 })
    })
  } catch {
    win.setVibrancy('under-window')
  }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Laramac',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    transparent: isMac,
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: 'active',
    backgroundColor: isMac ? '#00000000' : '#101014',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  applyGlass(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow(): void {
  if (!mainWindow) createWindow()
  else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray(): void {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="6" fill="black"/></svg>'
  const icon = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  )
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Laramac')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Laramac', click: showWindow },
      { type: 'separator' },
      { label: 'Start All', click: () => void services.startAll() },
      { label: 'Stop All', click: () => void services.stopAll() },
      { type: 'separator' },
      { label: 'Open www Folder', click: () => shell.openPath(ensureWww()) },
      { type: 'separator' },
      { label: 'Quit Laramac', role: 'quit' }
    ])
  )
}

/** Registers a typed IPC handler; the channel map in shared/types keeps both sides in sync. */
function handle<K extends ChannelName>(
  channel: K,
  fn: (...args: Channels[K]['args']) => Promise<Channels[K]['result']> | Channels[K]['result']
): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as Channels[K]['args'])))
}

function registerIpc(): void {
  handle('settings:get', () => getSettings())
  handle('settings:set', (patch) => {
    const before = getSettings().wwwPath
    const next = setSettings(patch)
    if (next.wwwPath !== before) watchWww()
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
    setSiteConfig(name, cfg)
    if (cfg.secure) {
      const site = scanSites().find((s) => s.name === name)
      if (site) await ensureSiteCert(site.domain)
    }
    notifySitesChanged()
    return listSites()
  })
  handle('sites:create', async (kind, name) => {
    await createProject(kind, name)
    notifySitesChanged()
    return listSites()
  })
  handle('sites:open-folder', async (path) => {
    await shell.openPath(path)
  })
  handle('sites:open-url', async (url) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })
  handle('sites:open-editor', (path) => openInEditor(getSettings().editor, path))
  handle('sites:open-claude', (path) => openClaudeCode(path))
  handle('sites:share', async (name) => {
    const site = scanSites().find((s) => s.name === name)
    if (!site) throw new Error('Site not found.')
    const url = await shareSite(site)
    notifySitesChanged()
    return url
  })
  handle('sites:unshare', async (name) => {
    await unshareSite(name)
    notifySitesChanged()
  })
  handle('www:reveal', async () => {
    await shell.openPath(ensureWww())
  })

  handle('php:list', () => listVersions())
  handle('php:install', async (minor) => {
    await installMinor(minor)
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })
  handle('php:remove', async (minor) => {
    await removeMinor(minor)
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })
  handle('php:set-default', async (minor) => {
    if (installedMinors().includes(minor)) setSettings({ defaultPhp: minor })
    refreshShims()
    notifySitesChanged()
    return listVersions()
  })

  handle('tools:status', () => toolsStatus())
  handle('tools:setup-dns', async () => {
    await installResolver(getSettings().tld)
    await startDnsServer(() => getSettings().tld)
    return toolsStatus()
  })
  handle('tools:trust-ca', async () => {
    await trustCa()
    return toolsStatus()
  })
  handle('tools:install', async (tool) => {
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
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })

  handle('ai:detect', () => detectLlms())
  handle('ai:chat', (messages) => assistantChat(messages))

  services.on('changed', (list) => send('services:changed', list))
  jobs.on('changed', (list) => send('jobs:changed', list))
}

app.whenReady().then(async () => {
  ensureDirs()
  ensureWww()
  refreshShims()
  registerIpc()
  watchWww()
  createWindow()
  createTray()

  // The built-in DNS server resolves *.test to this Mac. It listens on an unprivileged port.
  startDnsServer(() => getSettings().tld).catch((err) =>
    console.error(`DNS server could not start on port ${DNS_PORT}:`, err)
  )

  app.on('activate', showWindow)
})

app.on('window-all-closed', () => {
  // Keep running in the menu bar on macOS, like Laragon stays in the tray.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void Promise.allSettled([stopAllTunnels(), services.stopAll(), stopAllFpm()]).then(() => {
    stopDnsServer()
    app.exit(0)
  })
})
