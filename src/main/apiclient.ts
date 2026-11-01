import { randomBytes } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Agent, fetch as ufetch, FormData } from 'undici'
import type { ApiCollection, ApiRequest, ApiResponse, ApiStore, HttpMethod, KV } from '../shared/types'
import { dirs } from './paths'

/**
 * A small API client, like Insomnia or Postman. Requests are sent from the
 * main process, so there are no browser CORS limits, and saved under
 * ~/.laramac/api with owner-only permissions.
 */
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const MAX_BODY = 5 * 1024 * 1024
const file = (): string => join(dirs.root(), 'api', 'store.json')
export const newId = (): string => randomBytes(6).toString('hex')

export function emptyRequest(name = 'New request'): ApiRequest {
  return {
    id: newId(),
    name,
    method: 'GET',
    url: '',
    query: [],
    headers: [],
    body: { type: 'none', text: '', form: [] },
    auth: { type: 'none', token: '', user: '', pass: '' }
  }
}

const EMPTY: ApiStore = {
  collections: [{ id: 'default', name: 'My requests', requests: [] }],
  environments: [{ id: 'local', name: 'Local', vars: [{ key: 'base', value: 'https://myblog.test', enabled: true }] }],
  activeEnv: 'local',
  history: []
}

export function loadStore(): ApiStore {
  try {
    if (existsSync(file())) return { ...EMPTY, ...(JSON.parse(readFileSync(file(), 'utf8')) as ApiStore) }
  } catch {
    /* fall through to a fresh store */
  }
  return structuredClone(EMPTY)
}

export function saveStore(store: ApiStore): void {
  const text = JSON.stringify(store)
  if (text.length > 20 * 1024 * 1024) throw new Error('Your saved requests are too large to store.')
  if (!Array.isArray(store.collections) || !Array.isArray(store.environments)) throw new Error('That is not a valid set of requests.')
  mkdirSync(join(dirs.root(), 'api'), { recursive: true, mode: 0o700 })
  writeFileSync(file(), text, { mode: 0o600 })
  chmodSync(file(), 0o600)
}

/** Fills in {{name}} from the active environment. Unknown names are left as they are. */
export function fillVars(text: string, vars: KV[]): string {
  const map = new Map(vars.filter((v) => v.enabled && v.key).map((v) => [v.key.trim(), v.value]))
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k: string) => (map.has(k) ? map.get(k)! : m))
}

export function buildUrl(req: ApiRequest, vars: KV[]): string {
  let raw = fillVars(req.url.trim(), vars)
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `http://${raw}`
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https addresses can be requested.')
  for (const q of req.query) if (q.enabled && q.key) url.searchParams.append(fillVars(q.key, vars), fillVars(q.value, vars))
  return url.toString()
}

// Sites on this Mac use Laramac's own certificates, which Node does not know about.
const isLocal = (host: string): boolean => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /\.(test|localhost|internal|lan|example)$/.test(host)
const localAgent = new Agent({ connect: { rejectUnauthorized: false } })
const agent = new Agent()

export async function sendRequest(req: ApiRequest, vars: KV[]): Promise<ApiResponse> {
  if (!METHODS.includes(req.method)) throw new Error('Unknown method.')
  const url = buildUrl(req, vars)
  const headers: Record<string, string> = {}
  for (const h of req.headers) if (h.enabled && h.key.trim()) headers[fillVars(h.key.trim(), vars)] = fillVars(h.value, vars)
  if (req.auth.type === 'bearer' && req.auth.token) headers['Authorization'] = `Bearer ${fillVars(req.auth.token, vars)}`
  if (req.auth.type === 'basic') {
    headers['Authorization'] = `Basic ${Buffer.from(`${fillVars(req.auth.user, vars)}:${fillVars(req.auth.pass, vars)}`).toString('base64')}`
  }
  const has = (name: string): boolean => Object.keys(headers).some((k) => k.toLowerCase() === name)

  let body: string | FormData | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body.type === 'json') {
      body = fillVars(req.body.text, vars)
      if (!has('content-type')) headers['Content-Type'] = 'application/json'
    } else if (req.body.type === 'text') {
      body = fillVars(req.body.text, vars)
      if (!has('content-type')) headers['Content-Type'] = 'text/plain'
    } else if (req.body.type === 'urlencoded') {
      const p = new URLSearchParams()
      for (const f of req.body.form) if (f.enabled && f.key) p.append(fillVars(f.key, vars), fillVars(f.value, vars))
      body = p.toString()
      if (!has('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else if (req.body.type === 'form') {
      const fd = new FormData()
      for (const f of req.body.form) if (f.enabled && f.key) fd.append(fillVars(f.key, vars), fillVars(f.value, vars))
      body = fd
    }
  }
  if (!has('user-agent')) headers['User-Agent'] = 'Laramac'

  const started = performance.now()
  const res = await ufetch(url, {
    method: req.method,
    headers,
    body,
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
    dispatcher: isLocal(new URL(url).hostname) ? localAgent : agent
  }).catch((err: Error & { cause?: Error }) => {
    const why = err.cause?.message ?? err.message
    throw new Error(/ENOTFOUND/.test(why) ? `${new URL(url).hostname} could not be found.` : /ECONNREFUSED/.test(why) ? `Nothing is answering at ${new URL(url).host}.` : /aborted|timeout/i.test(why) ? 'The request took longer than 60 seconds.' : why)
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const ms = Math.round(performance.now() - started)
  return {
    status: res.status,
    statusText: res.statusText,
    ms,
    bytes: buf.length,
    headers: [...res.headers.entries()],
    contentType: res.headers.get('content-type') ?? '',
    body: buf.subarray(0, MAX_BODY).toString('utf8'),
    truncated: buf.length > MAX_BODY,
    url
  }
}

export function toCurl(req: ApiRequest, vars: KV[]): string {
  const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
  const parts = [`curl -X ${req.method} ${q(buildUrl(req, vars))}`]
  for (const h of req.headers) if (h.enabled && h.key) parts.push(`-H ${q(`${fillVars(h.key, vars)}: ${fillVars(h.value, vars)}`)}`)
  if (req.auth.type === 'bearer' && req.auth.token) parts.push(`-H ${q(`Authorization: Bearer ${fillVars(req.auth.token, vars)}`)}`)
  if (req.auth.type === 'basic') parts.push(`-u ${q(`${fillVars(req.auth.user, vars)}:${fillVars(req.auth.pass, vars)}`)}`)
  if (req.body.type === 'json') parts.push(`-H 'Content-Type: application/json' --data ${q(fillVars(req.body.text, vars))}`)
  if (req.body.type === 'text') parts.push(`--data ${q(fillVars(req.body.text, vars))}`)
  if (req.body.type === 'urlencoded') for (const f of req.body.form) if (f.enabled) parts.push(`--data-urlencode ${q(`${f.key}=${f.value}`)}`)
  if (req.body.type === 'form') for (const f of req.body.form) if (f.enabled) parts.push(`-F ${q(`${f.key}=${f.value}`)}`)
  return parts.join(' \\\n  ')
}

// ------------------------------------------------------------------ import

const kv = (key: string, value: string, enabled = true): KV => ({ key, value: String(value ?? ''), enabled })
const method = (m: unknown): HttpMethod => {
  const up = String(m ?? 'GET').toUpperCase() as HttpMethod
  return METHODS.includes(up) ? up : 'GET'
}

/** Splits a shell command line the way a shell would, enough for pasted cURL commands. */
function shellWords(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  let any = false
  const s = cmd.replace(/\\\r?\n/g, ' ')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === "'" || c === '"') {
      quote = c
      any = true
    } else if (c === '\\' && i + 1 < s.length) cur += s[++i]
    else if (/\s/.test(c)) {
      if (cur || any) out.push(cur)
      cur = ''
      any = false
    } else cur += c
  }
  if (cur || any) out.push(cur)
  return out
}

export function fromCurl(cmd: string): ApiRequest {
  const w = shellWords(cmd.trim())
  if (w[0] !== 'curl') throw new Error('That does not look like a curl command.')
  const req = emptyRequest()
  let explicit: HttpMethod | null = null
  const data: string[] = []
  for (let i = 1; i < w.length; i++) {
    const a = w[i]
    const next = (): string => w[++i] ?? ''
    if (a === '-X' || a === '--request') explicit = method(next())
    else if (a === '-H' || a === '--header') {
      const h = next()
      const at = h.indexOf(':')
      if (at > 0) req.headers.push(kv(h.slice(0, at).trim(), h.slice(at + 1).trim()))
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(a)) data.push(next())
    else if (a === '--data-urlencode') {
      req.body.type = 'urlencoded'
      const [k, ...v] = next().split('=')
      req.body.form.push(kv(k, v.join('=')))
    } else if (a === '-F' || a === '--form') {
      req.body.type = 'form'
      const [k, ...v] = next().split('=')
      req.body.form.push(kv(k, v.join('=')))
    } else if (a === '-u' || a === '--user') {
      const [u, ...p] = next().split(':')
      req.auth = { ...req.auth, type: 'basic', user: u, pass: p.join(':') }
    } else if (a === '--url') req.url = next()
    else if (!a.startsWith('-') && !req.url) req.url = a
  }
  if (data.length) {
    const text = data.join('&')
    const ct = req.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? ''
    req.body = { ...req.body, type: /json/.test(ct) || /^\s*[[{]/.test(text) ? 'json' : 'text', text }
  }
  req.method = explicit ?? (data.length || req.body.form.length ? 'POST' : 'GET')
  try {
    const u = new URL(req.url)
    req.name = `${req.method} ${u.pathname}`
  } catch {
    req.name = `${req.method} request`
  }
  return req
}

interface PostmanItem {
  name?: string
  item?: PostmanItem[]
  request?: {
    method?: string
    url?: string | { raw?: string }
    header?: { key: string; value: string; disabled?: boolean }[]
    body?: { mode?: string; raw?: string; urlencoded?: { key: string; value: string; disabled?: boolean }[]; formdata?: { key: string; value: string; disabled?: boolean }[]; options?: { raw?: { language?: string } } }
    auth?: { type?: string; bearer?: { key: string; value: string }[]; basic?: { key: string; value: string }[] }
  }
}

function fromPostman(doc: { info?: { name?: string }; item?: PostmanItem[] }): ApiCollection {
  const requests: ApiRequest[] = []
  const walk = (items: PostmanItem[], prefix: string): void => {
    for (const it of items) {
      if (it.item) {
        walk(it.item, `${prefix}${it.name ?? 'Folder'} / `)
        continue
      }
      const r = it.request
      if (!r) continue
      const req = emptyRequest(`${prefix}${it.name ?? 'Request'}`)
      req.method = method(r.method)
      const raw = typeof r.url === 'string' ? r.url : r.url?.raw ?? ''
      req.url = raw
      req.headers = (r.header ?? []).map((h) => kv(h.key, h.value, !h.disabled))
      const b = r.body
      if (b?.mode === 'raw') req.body = { type: b.options?.raw?.language === 'json' || /^\s*[[{]/.test(b.raw ?? '') ? 'json' : 'text', text: b.raw ?? '', form: [] }
      if (b?.mode === 'urlencoded') req.body = { type: 'urlencoded', text: '', form: (b.urlencoded ?? []).map((f) => kv(f.key, f.value, !f.disabled)) }
      if (b?.mode === 'formdata') req.body = { type: 'form', text: '', form: (b.formdata ?? []).map((f) => kv(f.key, f.value, !f.disabled)) }
      const find = (list: { key: string; value: string }[] | undefined, k: string): string => list?.find((x) => x.key === k)?.value ?? ''
      if (r.auth?.type === 'bearer') req.auth = { ...req.auth, type: 'bearer', token: find(r.auth.bearer, 'token') }
      if (r.auth?.type === 'basic') req.auth = { ...req.auth, type: 'basic', user: find(r.auth.basic, 'username'), pass: find(r.auth.basic, 'password') }
      requests.push(req)
    }
  }
  walk(doc.item ?? [], '')
  return { id: newId(), name: doc.info?.name ?? 'Postman collection', requests }
}

function fromInsomnia(doc: { resources?: Record<string, unknown>[] }): ApiCollection {
  const res = doc.resources ?? []
  const requests = res
    .filter((r) => r._type === 'request')
    .map((r) => {
      const req = emptyRequest(String(r.name ?? 'Request'))
      req.method = method(r.method)
      req.url = String(r.url ?? '')
      req.headers = ((r.headers as { name: string; value: string; disabled?: boolean }[]) ?? []).map((h) => kv(h.name, h.value, !h.disabled))
      req.query = ((r.parameters as { name: string; value: string; disabled?: boolean }[]) ?? []).map((h) => kv(h.name, h.value, !h.disabled))
      const body = (r.body ?? {}) as { mimeType?: string; text?: string; params?: { name: string; value: string; disabled?: boolean }[] }
      if (body.text !== undefined) req.body = { type: /json/.test(body.mimeType ?? '') ? 'json' : 'text', text: body.text, form: [] }
      if (body.params) req.body = { type: /urlencoded/.test(body.mimeType ?? '') ? 'urlencoded' : 'form', text: '', form: body.params.map((p) => kv(p.name, p.value, !p.disabled)) }
      const auth = (r.authentication ?? {}) as { type?: string; token?: string; username?: string; password?: string }
      if (auth.type === 'bearer') req.auth = { ...req.auth, type: 'bearer', token: auth.token ?? '' }
      if (auth.type === 'basic') req.auth = { ...req.auth, type: 'basic', user: auth.username ?? '', pass: auth.password ?? '' }
      return req
    })
  const ws = res.find((r) => r._type === 'workspace')
  return { id: newId(), name: String(ws?.name ?? 'Insomnia collection'), requests }
}

function fromOpenApi(doc: { info?: { title?: string }; servers?: { url: string }[]; paths?: Record<string, Record<string, { summary?: string; operationId?: string; parameters?: { name: string; in: string; example?: unknown }[]; requestBody?: unknown }>> }): ApiCollection {
  const base = doc.servers?.[0]?.url ?? '{{base}}'
  const requests: ApiRequest[] = []
  for (const [path, ops] of Object.entries(doc.paths ?? {})) {
    for (const [m, op] of Object.entries(ops)) {
      if (!METHODS.includes(m.toUpperCase() as HttpMethod)) continue
      const req = emptyRequest(op.summary ?? op.operationId ?? `${m.toUpperCase()} ${path}`)
      req.method = method(m)
      req.url = `${base.replace(/\/$/, '')}${path.replace(/\{(\w+)\}/g, '{{$1}}')}`
      for (const p of op.parameters ?? []) {
        if (p.in === 'query') req.query.push(kv(p.name, p.example === undefined ? '' : String(p.example), false))
        if (p.in === 'header') req.headers.push(kv(p.name, p.example === undefined ? '' : String(p.example), false))
      }
      if (op.requestBody) req.body = { type: 'json', text: '{\n  \n}', form: [] }
      requests.push(req)
    }
  }
  return { id: newId(), name: doc.info?.title ?? 'OpenAPI', requests }
}

/** Reads a Postman v2 collection, an Insomnia export, an OpenAPI 3 / Swagger 2 JSON file, or a cURL command. */
export function importText(text: string): ApiCollection {
  const t = text.trim()
  if (t.startsWith('curl ')) {
    const req = fromCurl(t)
    return { id: newId(), name: 'Imported from cURL', requests: [req] }
  }
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(t) as Record<string, unknown>
  } catch {
    throw new Error('Paste a cURL command, or choose a Postman, Insomnia or OpenAPI JSON file. YAML OpenAPI files need converting to JSON first.')
  }
  if (Array.isArray(doc.item)) return fromPostman(doc as never)
  if (Array.isArray(doc.resources)) return fromInsomnia(doc as never)
  if (doc.openapi || doc.swagger) return fromOpenApi(doc as never)
  throw new Error('That file is not a Postman, Insomnia or OpenAPI collection.')
}
