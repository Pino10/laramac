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
const http = require('http')
const https = require('https')
const crypto = require('crypto')

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
    appearance: ['dark', 'light', 'system'].includes(l.appearance) ? l.appearance : 'system',
    theme: Number.isInteger(l.theme) ? l.theme : 0,
    update: l.update && /^\d+\.\d+\.\d+$/.test(l.update.version) && /^\d+\.\d+\.\d+$/.test(l.update.current) ? { version: l.update.version, current: l.update.current } : null,
    ai: readAi(l.ai),
    background: { dark: /^#[0-9a-f]{6}$/i.test(l.background?.dark) ? l.background.dark : '#0d1017', light: /^#[0-9a-f]{6}$/i.test(l.background?.light) ? l.background.light : '#f6f7fb' }
  }
}

const PROVIDERS = new Set(['lmstudio', 'ollama', 'openai'])
const okUrl = (u) => {
  try {
    const x = new URL(u)
    return (x.protocol === 'http:' || x.protocol === 'https:') && !x.username && !x.password ? x.href : null
  } catch {
    return null
  }
}
/** Only on this Mac, or over https: where the Free LLM API key may be sent. */
const okKeyUrl = (u) => {
  const x = okUrl(u)
  if (!x) return null
  const h = new URL(x)
  return h.protocol === 'https:' || ['127.0.0.1', 'localhost', '[::1]'].includes(h.hostname) ? x : null
}

/** The AI part of launch.json: model servers (no keys in it, ever) and the Free LLM API address. */
function readAi(ai) {
  if (!ai || typeof ai !== 'object') return { servers: [], freellm: null }
  const servers = (Array.isArray(ai.servers) ? ai.servers : [])
    .filter((s) => s && typeof s.name === 'string' && /^[\w .()-]{1,40}$/.test(s.name) && PROVIDERS.has(s.provider) && okUrl(s.baseUrl) && (s.model === undefined || (typeof s.model === 'string' && s.model.length <= 120 && !/[\n\r]/.test(s.model))))
    .slice(0, 8)
    .map((s) => ({ name: s.name, provider: s.provider, baseUrl: okUrl(s.baseUrl), model: s.model || 'AUTODETECT' }))
  const f = ai.freellm
  const freellm = f && okKeyUrl(f.baseUrl) ? { baseUrl: okKeyUrl(f.baseUrl), models: (Array.isArray(f.models) ? f.models : ['auto']).filter((m) => typeof m === 'string' && /^[\w.:/-]{1,80}$/.test(m)).slice(0, 6) } : null
  return { servers, freellm }
}

const y = (v) => JSON.stringify(String(v))
/**
 * Continue's config.yaml: the chat in Laramac Code's side bar. LM Studio and Ollama find their own
 * models; the Free LLM API goes through the relay on this Mac, so its real key is never written.
 */
function continueConfig(ai, relay) {
  const lines = ['# Made by Laramac Code each time it starts. Changes here are replaced.', 'name: Laramac', 'version: 1.0.0', 'schema: v1', 'models:']
  const add = (m) => {
    lines.push(`  - name: ${y(m.name)}`, `    provider: ${m.provider}`, `    model: ${y(m.model)}`)
    if (m.apiBase) lines.push(`    apiBase: ${y(m.apiBase)}`)
    if (m.apiKey) lines.push(`    apiKey: ${y(m.apiKey)}`)
    lines.push('    roles:', '      - chat', '      - edit', '      - apply')
    if (m.tools) lines.push('    capabilities:', '      - tool_use')
  }
  if (relay && ai.freellm) for (const model of ai.freellm.models.length ? ai.freellm.models : ['auto']) add({ name: `Free LLM API (${model})`, provider: 'openai', model, apiBase: `http://127.0.0.1:${relay.port}/v1/`, apiKey: relay.token, tools: true })
  for (const s of ai.servers) add({ name: s.name, provider: s.provider, model: s.model, apiBase: s.provider === 'ollama' ? s.baseUrl.replace(/\/v1\/?$/, '') : s.baseUrl.replace(/\/?$/, '/') })
  if (lines[lines.length - 1] === 'models:') lines[lines.length - 1] = 'models: []'
  return lines.join('\n') + '\n'
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a))
  const z = Buffer.from(String(b))
  return x.length === z.length && crypto.timingSafeEqual(x, z)
}

/**
 * The relay for the Free LLM API: takes requests from the editor on 127.0.0.1 with this start's
 * token, adds the real key, and sends them on only to the Free LLM API's own address. Browsers
 * (anything with an Origin) and other hosts are refused.
 */
function relayHandler({ base, key, token }) {
  const target = new URL(base)
  const prefix = target.pathname.replace(/\/+$/, '')
  const mod = target.protocol === 'https:' ? https : http
  const fail = (res, code, message) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message } }))
  }
  return (req, res) => {
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) return fail(res, 403, 'Only Laramac Code can use this.')
    const auth = String(req.headers.authorization || '')
    if (!safeEqual(auth.startsWith('Bearer ') ? auth.slice(7) : '', token)) return fail(res, 401, 'Wrong token.')
    if (req.method !== 'GET' && req.method !== 'POST') return fail(res, 405, 'Only GET and POST.')
    const u = new URL(req.url || '/', 'http://relay')
    if (!/^\/v1\/[\w./-]*$/.test(u.pathname) || u.pathname.includes('..')) return fail(res, 404, 'Not here.')
    const headers = { authorization: `Bearer ${key}`, accept: req.headers.accept || '*/*', 'user-agent': 'Laramac Code' }
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
    if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']
    const up = mod.request({ protocol: target.protocol, hostname: target.hostname.replace(/^\[|\]$/g, ''), port: target.port || undefined, path: prefix + u.pathname.slice(3) + u.search, method: req.method, headers, timeout: 600000 }, (r) => {
      const out = {}
      for (const h of ['content-type', 'cache-control', 'x-request-id']) if (r.headers[h]) out[h] = r.headers[h]
      res.writeHead(r.statusCode || 502, out)
      r.pipe(res)
    })
    up.on('timeout', () => up.destroy(new Error('The Free LLM API took too long.')))
    up.on('error', (e) => (res.headersSent ? res.destroy() : fail(res, 502, `The Free LLM API did not answer: ${e.message}`)))
    req.pipe(up)
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

/** The text a click on the update banner writes to the console, which the app listens for. */
const UPDATE_MARK = '__laramac_code_update__'

/**
 * A quiet banner at the top of the editor when a newer Laramac is out. Only numbers are put in it
 * (they are checked in readLaunch), the button asks Laramac to show the update, and the cross hides
 * it until the next version. Calling it with null removes the banner.
 */
function bannerScript(update) {
  if (!update) return "document.getElementById('lc-update')?.remove()"
  const v = JSON.stringify(update.version)
  return `(() => { try { if (localStorage.getItem('lc-update-hidden') === ${v}) return } catch (e) {} const old = document.getElementById('lc-update'); if (old && old.dataset.v === ${v}) return; old?.remove(); const b = document.createElement('div'); b.id = 'lc-update'; b.dataset.v = ${v}; const t = document.createElement('span'); t.textContent = 'Laramac ' + ${v} + ' is ready.'; const go = document.createElement('button'); go.textContent = 'See what is new'; go.onclick = () => console.log(${JSON.stringify(UPDATE_MARK)}); const x = document.createElement('button'); x.className = 'x'; x.setAttribute('aria-label', 'Hide'); x.textContent = '\u00d7'; x.onclick = () => { try { localStorage.setItem('lc-update-hidden', ${v}) } catch (e) {} b.remove() }; b.append(t, go, x); document.body.appendChild(b) })()`
}

const BANNER_CSS = `
#lc-update{position:fixed;z-index:2600;top:44px;right:16px;display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:999px;font:500 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--vscode-foreground,#e6e9f2);background:color-mix(in srgb,var(--vscode-editorWidget-background,#161b27) 86%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--vscode-focusBorder,#8ab4f8) 45%,transparent);box-shadow:0 14px 40px -12px rgba(0,0,0,.55),0 0 0 4px color-mix(in srgb,var(--vscode-focusBorder,#8ab4f8) 12%,transparent);animation:lc-up .35s cubic-bezier(.2,.8,.2,1)}
#lc-update button{font:inherit;border:0;cursor:pointer;border-radius:999px;padding:6px 12px;color:var(--vscode-button-foreground,#0b1020);background:var(--vscode-button-background,#8ab4f8)}
#lc-update button.x{padding:5px 9px;background:transparent;color:inherit;opacity:.6;font-size:15px;line-height:1}
#lc-update button.x:hover{opacity:1}
@keyframes lc-up{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#lc-update{animation:none}}
`

/** The folders opened most recently, newest first, without duplicates or folders that are gone. */
function remember(list, folder, exists = fs.existsSync, max = 12) {
  return [folder, ...list.filter((f) => f !== folder)].filter((f) => exists(f)).slice(0, max)
}

module.exports = { editorUrl, validOpen, parseOpenUrl, readLaunch, readAi, continueConfig, relayHandler, withPort, remember, fontScript, WINDOW_CSS, ENV_KEYS, bannerScript, BANNER_CSS, UPDATE_MARK }
