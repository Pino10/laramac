/*
 * Laramac Code: its own Mac app, with its own icon in the Dock.
 *
 * Laramac sets it up (code-server, the extensions, Laramac's settings and look) and writes
 * ~/.laramac/code/launch.json. This app starts the editor from it on 127.0.0.1, behind a password
 * made for each start that never leaves this Mac, and shows it in its own windows: no browser,
 * no address bar. Each window may only show the editor's own address; links open in your browser.
 */
'use strict'

const { app, BrowserWindow, Menu, dialog, nativeTheme, session, shell } = require('electron')
const { spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const net = require('net')
const os = require('os')
const path = require('path')
const { editorUrl, validOpen, parseOpenUrl, readLaunch, withPort, remember, fontScript, WINDOW_CSS } = require('./lib')

const HOME = path.join(os.homedir(), '.laramac', 'code')
const LAUNCH = path.join(HOME, 'launch.json')
const REQUEST = path.join(HOME, 'open.json')
const LOG = path.join(HOME, 'app.log')
const PARTITION = 'persist:laramac-code'
const recentFile = () => path.join(app.getPath('userData'), 'recent.json')

app.setName('Laramac Code')
if (!app.requestSingleInstanceLock()) app.quit()

let server = null
let starting = null
let port = 0
let password = ''
let origin = ''
let launch = null
let quitting = false
const pending = []

// ---------------------------------------------------------------- The editor server

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })

function healthy(p, ms) {
  const until = Date.now() + ms
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port: p, path: '/healthz', timeout: 1500 }, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
      req.on('timeout', () => req.destroy())
    }
    const retry = () => (Date.now() > until ? reject(new Error('Laramac Code did not start in time. Its log is in ~/.laramac/code/app.log.')) : setTimeout(tick, 300))
    tick()
  })
}

function startServer() {
  if (server && origin) return Promise.resolve()
  if (starting) return starting
  starting = (async () => {
    launch = readLaunch(fs.existsSync(LAUNCH) ? fs.readFileSync(LAUNCH, 'utf8') : '')
    if (!launch) throw Object.assign(new Error('setup'), { setup: true })
    port = await freePort()
    password = crypto.randomBytes(24).toString('hex')
    fs.mkdirSync(HOME, { recursive: true })
    const log = fs.openSync(LOG, 'a')
    const env = { ...process.env, ...launch.env, PASSWORD: password, LARAMAC_CODE: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    server = spawn(launch.bin, withPort(launch.args, port), { env, stdio: ['ignore', log, log] })
    server.on('exit', () => {
      server = null
      origin = ''
      // It stopped by itself: start it again and bring every open window back to its folder.
      if (!quitting && BrowserWindow.getAllWindows().length) void restart()
    })
    await healthy(port, 45000)
    origin = `http://127.0.0.1:${port}`
  })()
  return starting.finally(() => {
    starting = null
  })
}

let restarts = 0
async function restart() {
  if (++restarts > 3) return
  const folders = BrowserWindow.getAllWindows().map((w) => {
    try {
      return [w, new URL(w.webContents.getURL()).searchParams.get('folder')]
    } catch {
      return [w, null]
    }
  })
  try {
    await startServer()
    for (const [w, folder] of folders) if (folder && !w.isDestroyed()) void w.loadURL(editorUrl(origin, port, { folder }))
    restarts = 0
  } catch {
    // The log says why; the windows stay as they are.
  }
}

function stopServer() {
  if (server) {
    try {
      server.kill('SIGTERM')
    } catch {
      // Already gone.
    }
  }
  server = null
  origin = ''
}

// ---------------------------------------------------------------- Windows

let sessionReady = false
function editorSession() {
  const s = session.fromPartition(PARTITION)
  if (!sessionReady) {
    sessionReady = true
    // Copy and paste work in the editor; nothing else is granted.
    s.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'))
    s.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
  }
  return s
}

const ours = (url) => !!origin && (url === origin || url.startsWith(`${origin}/`))

function newWindow(url) {
  const dark = nativeTheme.shouldUseDarkColors
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Laramac Code',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 13 },
    backgroundColor: dark ? launch?.background.dark ?? '#0d1017' : launch?.background.light ?? '#f6f7fb',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, session: editorSession() }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.on('will-navigate', (e, to) => {
    if (ours(to)) return
    e.preventDefault()
    if (/^https?:\/\//.test(to)) void shell.openExternal(to)
  })
  win.webContents.setWindowOpenHandler(({ url: to }) => {
    if (ours(to)) newWindow(to)
    else if (/^https?:\/\//.test(to)) void shell.openExternal(to)
    return { action: 'deny' }
  })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
  win.webContents.on('did-finish-load', () => {
    const at = win.webContents.getURL()
    if (!ours(at)) return
    if (new URL(at).pathname.endsWith('/login')) {
      // Signs in with this start's password, which never leaves this Mac.
      void win.webContents.executeJavaScript(`(() => { const i = document.querySelector('input[name=password]'); const f = document.querySelector('form'); if (i && f) { i.value = ${JSON.stringify(password)}; f.submit() } })()`)
      return
    }
    void win.webContents.insertCSS(`${launch?.css ?? ''}\n${WINDOW_CSS}`)
    if (launch?.fonts.length) void win.webContents.executeJavaScript(fontScript(launch.fonts)).catch(() => undefined)
  })
  win.on('enter-full-screen', () => void win.webContents.executeJavaScript("document.querySelector('.monaco-workbench')?.classList.add('fullscreen')").catch(() => undefined))
  win.on('leave-full-screen', () => void win.webContents.executeJavaScript("document.querySelector('.monaco-workbench')?.classList.remove('fullscreen')").catch(() => undefined))
  void win.loadURL(url)
  return win
}

/** Shown when Laramac has not set Laramac Code up yet. */
function setupWindow() {
  const win = new BrowserWindow({ width: 560, height: 400, resizable: false, title: 'Laramac Code', titleBarStyle: 'hiddenInset', backgroundColor: '#0d1017', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false } })
  win.webContents.on('will-navigate', (e, to) => {
    e.preventDefault()
    if (to.startsWith('laramac://code')) void shell.openExternal('laramac://code')
  })
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;font:14px -apple-system,BlinkMacSystemFont,sans-serif;color:#e8ecf6;background:radial-gradient(70% 60% at 20% 0%,#1d3a5a 0%,transparent 70%),radial-gradient(60% 60% at 100% 100%,#3b1d5a 0%,transparent 70%),#0d1017;-webkit-user-select:none}
    main{height:100%;display:grid;place-content:center;justify-items:center;gap:14px;text-align:center;padding:0 48px}
    h1{margin:0;font-size:22px;font-weight:650;letter-spacing:-.01em}p{margin:0;color:#aab3c8;line-height:1.55}
    a{margin-top:8px;padding:9px 18px;border-radius:999px;color:#fff;text-decoration:none;font-weight:600;background:linear-gradient(135deg,#38bdf8,#8b5cf6);box-shadow:0 10px 24px -10px #8b5cf6}
  </style><main><h1>Almost there</h1><p>Laramac Code is set up from Laramac: it installs the editor, PHP intelligence and the AI tools, then this app opens straight away.</p><a href="laramac://code">Open Laramac</a></main>`
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function recent() {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'))
    return Array.isArray(list) ? list.filter((f) => typeof f === 'string' && fs.existsSync(f)) : []
  } catch {
    return []
  }
}
function addRecent(folder) {
  try {
    fs.writeFileSync(recentFile(), JSON.stringify(remember(recent(), folder)))
  } catch {
    // Not important.
  }
  buildMenu()
}

/** Opens a folder (or a file at a line inside it) in a window: the one already showing that folder, or a new one. */
async function open(target) {
  try {
    await startServer()
  } catch (e) {
    if (e.setup) return setupWindow()
    dialog.showErrorBox('Laramac Code could not start', e.message)
    return
  }
  const o = target ?? { folder: recent()[0] ?? launch.home ?? os.homedir() }
  const url = editorUrl(origin, port, o)
  const same = BrowserWindow.getAllWindows().find((w) => {
    try {
      return new URL(w.webContents.getURL()).searchParams.get('folder') === o.folder
    } catch {
      return false
    }
  })
  if (same && !o.file) {
    if (same.isMinimized()) same.restore()
    same.focus()
  } else if (same) {
    void same.loadURL(url)
    same.focus()
  } else newWindow(url)
  addRecent(o.folder)
}

/** Requests from Laramac: a laramac-code:// address, or the request file when the app was already open. */
function takeRequest() {
  try {
    const r = JSON.parse(fs.readFileSync(REQUEST, 'utf8'))
    fs.rmSync(REQUEST, { force: true })
    if (typeof r.at === 'number' && Date.now() - r.at < 60_000) return validOpen(r)
  } catch {
    // No request.
  }
  return null
}
function handle(o) {
  if (!o) return
  if (app.isReady()) void open(o)
  else pending.push(o)
}

app.on('open-url', (e, url) => {
  e.preventDefault()
  // The request file carries the same folder; reading it here keeps it from opening twice.
  takeRequest()
  handle(validOpen(parseOpenUrl(url)))
})
app.on('open-file', (e, p) => {
  e.preventDefault()
  let o = null
  try {
    o = fs.statSync(p).isDirectory() ? validOpen({ folder: p }) : validOpen({ folder: path.dirname(p), file: p })
  } catch {
    o = null
  }
  handle(o)
})
app.on('second-instance', () => {
  const r = takeRequest()
  if (r) void open(r)
  else BrowserWindow.getAllWindows()[0]?.focus()
})
app.on('activate', () => {
  const r = takeRequest()
  if (r) void open(r)
  else if (BrowserWindow.getAllWindows().length === 0) void open(null)
})
app.on('before-quit', () => {
  quitting = true
  stopServer()
})
app.on('window-all-closed', () => {
  // Like other Mac editors, it stays open without windows; the editor stops after a while to save memory.
  setTimeout(() => {
    if (BrowserWindow.getAllWindows().length === 0) stopServer()
  }, 10 * 60_000)
})

// ---------------------------------------------------------------- Menus

function openFolderDialog() {
  void dialog.showOpenDialog({ title: 'Open a folder in Laramac Code', properties: ['openDirectory', 'createDirectory'], defaultPath: launch?.home ?? os.homedir() }).then((r) => {
    if (!r.canceled && r.filePaths[0]) void open(validOpen({ folder: r.filePaths[0] }))
  })
}

function buildMenu() {
  const recents = recent()
  const template = [
    {
      label: 'Laramac Code',
      submenu: [
        { role: 'about', label: 'About Laramac Code' },
        { type: 'separator' },
        { label: 'Laramac…', click: () => void shell.openExternal('laramac://code') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Laramac Code' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Laramac Code' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'Shift+CmdOrCtrl+N', click: () => void open(null) },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: openFolderDialog },
        {
          label: 'Open Recent',
          submenu: recents.length
            ? [...recents.map((f) => ({ label: f.replace(os.homedir(), '~'), click: () => void open(validOpen({ folder: f })) })), { type: 'separator' }, { label: 'Clear Menu', click: () => { fs.rmSync(recentFile(), { force: true }); buildMenu() } }]
            : [{ label: 'Nothing yet', enabled: false }]
        },
        { type: 'separator' },
        { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { label: 'Reload Window', accelerator: 'Alt+CmdOrCtrl+R', click: (_m, w) => w?.webContents.reload() }]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Show the Editor’s Log', click: () => void shell.openPath(LOG) },
        { label: 'Laramac Code on GitHub', click: () => void shell.openExternal('https://github.com/Pino10/laramac') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Laramac Code', applicationVersion: app.getVersion(), copyright: 'Part of Laramac. Built on code-server, the open-source VS Code by Coder.' })
  buildMenu()
  const first = pending.shift() ?? takeRequest()
  void open(first ?? null)
  for (const o of pending.splice(0)) void open(o)
})
