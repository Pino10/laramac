/*
 * Laramac Code, the parts without Electron, so they can be tested.
 *
 * Laramac Code is its own Mac app. Laramac installs code-server (the open-source VS Code), its
 * extensions and Laramac's settings, then writes launch.json: how to start the editor. This app
 * reads it, starts the editor on 127.0.0.1 with a password made for each start, and shows it in
 * its own windows. Laramac asks it to open a folder or a file at a line with a laramac-code://
 * address, or with a small request file when it is already running.
 */
'use strict'

const path = require('path')
const fs = require('fs')

/** The address that opens a folder, and optionally a file at a line, in the editor. */
function editorUrl(origin, port, o) {
  const q = new URLSearchParams({ folder: o.folder })
  if (o.file) {
    const at = o.line && o.line > 0 ? `:${Math.floor(o.line)}` : ''
    const payload = [['openFile', `vscode-remote://127.0.0.1:${port}${encodeURI(o.file)}${at}`]]
    if (at) payload.push(['gotoLineMode', 'true'])
    q.set('payload', JSON.stringify(payload))
  }
  return `${origin}/?${q.toString()}`
}

/**
 * What to open, checked: an absolute folder that exists, and optionally a file that exists inside
 * it, with a line. Anything else is ignored.
 */
function validOpen(o, exists = fs.existsSync, isDir = (p) => fs.statSync(p).isDirectory()) {
  if (!o || typeof o !== 'object') return null
  const folder = typeof o.folder === 'string' ? path.resolve(o.folder) : null
  if (!folder || !path.isAbsolute(o.folder) || !exists(folder) || !isDir(folder)) return null
  const out = { folder }
  if (typeof o.file === 'string' && o.file) {
    const file = path.resolve(o.file)
    if (path.isAbsolute(o.file) && exists(file) && !isDir(file)) {
      out.file = file
      const line = Number(o.line)
      if (Number.isInteger(line) && line > 0 && line < 10000000) out.line = line
    }
  }
  return out
}

/** laramac-code://open?folder=/x&file=/x/a.php&line=12 */
function parseOpenUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'laramac-code:' || (u.hostname !== 'open' && u.pathname.replace(/^\/+/, '') !== 'open')) return null
    return { folder: u.searchParams.get('folder'), file: u.searchParams.get('file') || undefined, line: u.searchParams.get('line') || undefined }
  } catch {
    return null
  }
}

/** Only these come from launch.json into the editor's environment. */
const ENV_KEYS = /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_[A-Z]+|TMPDIR|COMPOSER_HOME|LARAMAC_[A-Z_]+|NVM_DIR|BUN_INSTALL|CARGO_HOME|RUSTUP_HOME|GOPATH|GOROOT|DOTNET_ROOT|PHP_INI_SCAN_DIR|PHPRC)$/

/** launch.json, checked. Returns null when Laramac has not set Laramac Code up. */
function readLaunch(text, exists = fs.existsSync) {
  let l
  try {
    l = JSON.parse(text)
  } catch {
    return null
  }
  if (!l || typeof l.bin !== 'string' || !path.isAbsolute(l.bin) || !exists(l.bin) || !Array.isArray(l.args)) return null
  const env = {}
  for (const [k, v] of Object.entries(l.env || {})) if (ENV_KEYS.test(k) && typeof v === 'string') env[k] = v
  return {
    bin: l.bin,
    args: l.args.filter((a) => typeof a === 'string'),
    env,
    css: typeof l.css === 'string' ? l.css : '',
    fonts: Array.isArray(l.fonts) ? l.fonts.filter((f) => f && typeof f.family === 'string' && /^[\w ]{1,40}$/.test(f.family) && Number.isInteger(f.weight) && f.weight >= 100 && f.weight <= 900 && typeof f.data === 'string' && /^[A-Za-z0-9+/=]{100,400000}$/.test(f.data)) : [],
    home: typeof l.home === 'string' ? l.home : null,
    background: { dark: /^#[0-9a-f]{6}$/i.test(l.background?.dark) ? l.background.dark : '#0d1017', light: /^#[0-9a-f]{6}$/i.test(l.background?.light) ? l.background.light : '#f6f7fb' }
  }
}

/** The arguments with this start's port. */
const withPort = (args, port) => args.map((a) => a.split('{port}').join(String(port)))

/** Room for the traffic lights, and a title bar you can drag, in Laramac Code's own window. */
const WINDOW_CSS = `
.monaco-workbench .part.titlebar{-webkit-app-region:drag}
.monaco-workbench .part.titlebar .titlebar-left{padding-left:78px!important}
.monaco-workbench.fullscreen .part.titlebar .titlebar-left{padding-left:8px!important}
.monaco-workbench .part.titlebar .action-item,.monaco-workbench .part.titlebar .command-center,.monaco-workbench .part.titlebar .menubar,.monaco-workbench .part.titlebar .monaco-toolbar,.monaco-workbench .part.titlebar .window-controls-container,.monaco-workbench .part.titlebar .layout-dropdown-container{-webkit-app-region:no-drag}
`

/**
 * Loads the interface font into the editor's page. The page only accepts fonts from itself, so a
 * font file address would be refused; a FontFace made from the bytes is not.
 */
function fontScript(fonts) {
  const safe = fonts.map((f) => ({ family: f.family, weight: f.weight, data: f.data }))
  return `(() => { for (const f of ${JSON.stringify(safe)}) { try { const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)); const face = new FontFace(f.family, bytes, { weight: String(f.weight), style: 'normal' }); document.fonts.add(face); void face.load() } catch (e) {} } })()`
}

/** The folders opened most recently, newest first, without duplicates or folders that are gone. */
function remember(list, folder, exists = fs.existsSync, max = 12) {
  return [folder, ...list.filter((f) => f !== folder)].filter((f) => exists(f)).slice(0, max)
}

module.exports = { editorUrl, validOpen, parseOpenUrl, readLaunch, withPort, remember, fontScript, WINDOW_CSS, ENV_KEYS }
