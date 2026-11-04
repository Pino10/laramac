import { randomBytes } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Agent, fetch as ufetch, FormData } from 'undici'
import type { ApiCodeLang, ApiAssertion, ApiCollection, ApiEnvironment, ApiExtract, ApiImportResult, ApiRequest, ApiResponse, ApiStore, ApiTestResult, HttpMethod, KV } from '../shared/types'
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

// ------------------------------------------------------------------ auth, cookies, GraphQL

/** OAuth 2 tokens from the client-credentials flow, kept in memory until they expire. */
const oauthCache = new Map<string, { token: string; until: number }>()

export async function oauthToken(a: ApiRequest['auth'], vars: KV[], f: typeof ufetch = ufetch): Promise<string> {
  const tokenUrl = fillVars(a.tokenUrl ?? '', vars).trim()
  if (!/^https?:\/\//i.test(tokenUrl)) throw new Error('Enter the token address (Token URL) for OAuth 2.')
  const id = fillVars(a.clientId ?? '', vars)
  const secret = fillVars(a.clientSecret ?? '', vars)
  const scope = fillVars(a.scope ?? '', vars)
  const key = `${tokenUrl}|${id}|${scope}`
  const hit = oauthCache.get(key)
  if (hit && hit.until > Date.now() + 10_000) return hit.token
  const form = new URLSearchParams({ grant_type: 'client_credentials', ...(scope ? { scope } : {}) })
  const res = await f(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}` },
    body: form.toString(),
    signal: AbortSignal.timeout(30_000),
    dispatcher: isLocal(new URL(tokenUrl).hostname) ? localAgent : agent
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!res.ok || !data.access_token) throw new Error(`The token address answered ${res.status}${data.error_description || data.error ? `: ${data.error_description ?? data.error}` : ''}.`)
  oauthCache.set(key, { token: data.access_token, until: Date.now() + (data.expires_in ?? 3600) * 1000 })
  return data.access_token
}

/** Adds the request's authentication to its headers or address. */
export async function applyAuth(req: ApiRequest, vars: KV[], url: URL, headers: Record<string, string>): Promise<void> {
  const a = req.auth
  if (a.type === 'bearer' && a.token) headers['Authorization'] = `Bearer ${fillVars(a.token, vars)}`
  if (a.type === 'basic') headers['Authorization'] = `Basic ${Buffer.from(`${fillVars(a.user, vars)}:${fillVars(a.pass, vars)}`).toString('base64')}`
  if (a.type === 'apikey' && a.keyName?.trim()) {
    const name = fillVars(a.keyName.trim(), vars)
    if (a.keyIn === 'query') url.searchParams.set(name, fillVars(a.token, vars))
    else headers[name] = fillVars(a.token, vars)
  }
  if (a.type === 'oauth2') headers['Authorization'] = `Bearer ${await oauthToken(a, vars)}`
}

/** The JSON a GraphQL server expects: the query, and the variables when there are any. */
export function graphqlBody(query: string, variables: string | undefined): string {
  let v: unknown = undefined
  if (variables?.trim()) {
    try {
      v = JSON.parse(variables)
    } catch {
      throw new Error('The GraphQL variables are not valid JSON.')
    }
  }
  return JSON.stringify(v === undefined ? { query } : { query, variables: v })
}

/** A simple cookie jar per host, for this session only (like a private browser window). */
const jar = new Map<string, Map<string, string>>()

export function rememberCookies(host: string, setCookies: string[]): void {
  if (!setCookies.length) return
  const m = jar.get(host) ?? new Map<string, string>()
  for (const c of setCookies) {
    const [pair, ...attrs] = c.split(';')
    const i = pair.indexOf('=')
    if (i < 1) continue
    const name = pair.slice(0, i).trim()
    const value = pair.slice(i + 1).trim()
    const expired = attrs.some((x) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(x)) || attrs.some((x) => /^\s*expires\s*=/i.test(x) && Date.parse(x.split('=').slice(1).join('=')) < Date.now())
    if (expired || value === '') m.delete(name)
    else m.set(name, value)
  }
  jar.set(host, m)
}

export function cookieHeader(host: string): string | null {
  const m = jar.get(host)
  return m && m.size ? [...m].map(([k, v]) => `${k}=${v}`).join('; ') : null
}

export const cookieList = (): { host: string; names: string[] }[] => [...jar].filter(([, m]) => m.size).map(([host, m]) => ({ host, names: [...m.keys()] }))
export const clearCookies = (): void => jar.clear()

export async function sendRequest(req: ApiRequest, vars: KV[], opts: { cookies?: boolean } = {}): Promise<ApiResponse> {
  if (!METHODS.includes(req.method)) throw new Error('Unknown method.')
  const target = new URL(buildUrl(req, vars))
  const headers: Record<string, string> = {}
  for (const h of req.headers) if (h.enabled && h.key.trim()) headers[fillVars(h.key.trim(), vars)] = fillVars(h.value, vars)
  await applyAuth(req, vars, target, headers)
  const url = target.toString()
  const has = (name: string): boolean => Object.keys(headers).some((k) => k.toLowerCase() === name)
  const useJar = opts.cookies !== false
  if (useJar && !has('cookie')) {
    const c = cookieHeader(target.host)
    if (c) headers['Cookie'] = c
  }

  let body: string | FormData | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body.type === 'json') {
      body = fillVars(req.body.text, vars)
      if (!has('content-type')) headers['Content-Type'] = 'application/json'
    } else if (req.body.type === 'graphql') {
      body = graphqlBody(fillVars(req.body.text, vars), req.body.variables ? fillVars(req.body.variables, vars) : undefined)
      if (!has('content-type')) headers['Content-Type'] = 'application/json'
      if (!has('accept')) headers['Accept'] = 'application/graphql-response+json, application/json'
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
  if (useJar) rememberCookies(target.host, res.headers.getSetCookie?.() ?? [])
  const buf = Buffer.from(await res.arrayBuffer())
  const ms = Math.round(performance.now() - started)
  const text = buf.subarray(0, MAX_BODY).toString('utf8')
  const headersList = [...res.headers.entries()]
  let json: unknown = undefined
  try {
    json = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  const view = { status: res.status, ms, headers: headersList, body: text, json }
  return {
    tests: runAssertions(req.tests ?? [], view),
    saved: extractValues(req.extract ?? [], view),
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

// ------------------------------------------------------------------ tests

interface View {
  status: number
  ms: number
  headers: [string, string][]
  body: string
  json: unknown
}

/** Reads a value like data.items[0].id or $.token from parsed JSON. */
export function jsonPath(obj: unknown, path: string): unknown {
  const parts = path
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[["']([^"']+)["']\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (p === 'length' && (Array.isArray(cur) || typeof cur === 'string')) return (cur as { length: number }).length
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

const show = (v: unknown): string => (v === undefined ? 'nothing' : typeof v === 'string' ? `"${v}"` : JSON.stringify(v))

function pick(a: { source: string; path: string }, v: View): unknown {
  if (a.source === 'status') return v.status
  if (a.source === 'time') return v.ms
  if (a.source === 'body') return v.body
  if (a.source === 'header') return v.headers.find(([k]) => k.toLowerCase() === a.path.trim().toLowerCase())?.[1]
  return jsonPath(v.json, a.path)
}

function label(a: ApiAssertion): string {
  const what = a.source === 'status' ? 'Status' : a.source === 'time' ? 'Response time' : a.source === 'body' ? 'Body' : a.source === 'header' ? `Header ${a.path}` : a.path || 'JSON'
  const op = { eq: 'is', neq: 'is not', contains: 'contains', exists: 'exists', lt: 'is below', gt: 'is above' }[a.op]
  return a.op === 'exists' ? `${what} exists` : `${what} ${op} ${a.value}${a.source === 'time' ? ' ms' : ''}`
}

export function runAssertions(list: ApiAssertion[], v: View): ApiTestResult[] {
  return list
    .filter((a) => a.enabled)
    .map((a) => {
      const actual = pick(a, v)
      const num = Number(a.value)
      const asText = typeof actual === 'string' ? actual : actual === undefined ? '' : JSON.stringify(actual)
      let pass = false
      switch (a.op) {
        case 'exists':
          pass = actual !== undefined && actual !== null
          break
        case 'eq':
          pass = asText === a.value || (typeof actual === 'number' && actual === num) || String(actual) === a.value
          break
        case 'neq':
          pass = !(asText === a.value || String(actual) === a.value)
          break
        case 'contains':
          pass = asText.includes(a.value)
          break
        case 'lt':
          pass = Number(actual) < num
          break
        case 'gt':
          pass = Number(actual) > num
          break
      }
      return { name: label(a), pass, detail: pass ? '' : `Got ${show(actual)}` }
    })
}

export function extractValues(list: ApiExtract[], v: View): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = []
  for (const e of list) {
    if (!e.enabled || !e.name.trim() || !e.path.trim()) continue
    const val = e.path.startsWith('header:') ? v.headers.find(([k]) => k.toLowerCase() === e.path.slice(7).trim().toLowerCase())?.[1] : jsonPath(v.json, e.path)
    if (val === undefined || val === null) continue
    out.push({ key: e.name.trim(), value: typeof val === 'string' ? val : JSON.stringify(val) })
  }
  return out
}

/** Environment values win over collection variables with the same name. */
export function mergeVars(collection: KV[] | undefined, env: KV[] | undefined): KV[] {
  const map = new Map<string, KV>()
  for (const v of collection ?? []) if (v.enabled) map.set(v.key, v)
  for (const v of env ?? []) if (v.enabled) map.set(v.key, v)
  return [...map.values()]
}

/** Writes saved values into an environment, adding names it does not have yet. */
export function applySaved(env: ApiEnvironment, saved: { key: string; value: string }[]): ApiEnvironment {
  const vars = [...env.vars]
  for (const s of saved) {
    const i = vars.findIndex((v) => v.key === s.key)
    if (i >= 0) vars[i] = { ...vars[i], value: s.value, enabled: true }
    else vars.push({ key: s.key, value: s.value, enabled: true })
  }
  return { ...env, vars }
}

// ------------------------------------------------------------------ code

export function toCode(req: ApiRequest, vars: KV[], lang: ApiCodeLang): string {
  if (lang === 'curl') return toCurl(req, vars)
  const target = new URL(buildUrl(req, vars))
  const headers: Record<string, string> = {}
  for (const h of req.headers) if (h.enabled && h.key) headers[fillVars(h.key, vars)] = fillVars(h.value, vars)
  const a = req.auth
  if (a.type === 'bearer' && a.token) headers['Authorization'] = `Bearer ${fillVars(a.token, vars)}`
  if (a.type === 'basic') headers['Authorization'] = `Basic ${Buffer.from(`${fillVars(a.user, vars)}:${fillVars(a.pass, vars)}`).toString('base64')}`
  if (a.type === 'apikey' && a.keyName) {
    if (a.keyIn === 'query') target.searchParams.set(fillVars(a.keyName, vars), fillVars(a.token, vars))
    else headers[fillVars(a.keyName, vars)] = fillVars(a.token, vars)
  }
  if (a.type === 'oauth2') headers['Authorization'] = 'Bearer <token from the OAuth 2 token address>'
  const url = target.toString()
  let body: string | null = null
  if (req.body.type === 'json' || req.body.type === 'text') {
    body = fillVars(req.body.text, vars)
    if (req.body.type === 'json') headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  } else if (req.body.type === 'graphql') {
    body = graphqlBody(fillVars(req.body.text, vars), req.body.variables ? fillVars(req.body.variables, vars) : undefined)
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  } else if (req.body.type === 'urlencoded' || req.body.type === 'form') {
    body = new URLSearchParams(req.body.form.filter((f) => f.enabled).map((f) => [fillVars(f.key, vars), fillVars(f.value, vars)])).toString()
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/x-www-form-urlencoded'
  }
  const hasBody = body !== null && req.method !== 'GET' && req.method !== 'HEAD'
  const isJson = /json/i.test(headers['Content-Type'] ?? '')
  if (lang === 'fetch') {
    const opts = [`  method: '${req.method}'`]
    if (Object.keys(headers).length) opts.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')}`)
    if (hasBody) opts.push(`  body: ${JSON.stringify(body)}`)
    return `const res = await fetch(${JSON.stringify(url)}, {\n${opts.join(',\n')}\n})\nconst data = await res.json()\nconsole.log(res.status, data)`
  }
  if (lang === 'axios') {
    const opts = [`  method: '${req.method.toLowerCase()}'`, `  url: ${JSON.stringify(url)}`]
    if (Object.keys(headers).length) opts.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')}`)
    if (hasBody) opts.push(`  data: ${isJson ? body : JSON.stringify(body)}`)
    return `import axios from 'axios'\n\nconst res = await axios({\n${opts.join(',\n')}\n})\nconsole.log(res.status, res.data)`
  }
  if (lang === 'python') {
    const lines = ['import requests', '', `response = requests.request(`, `    ${JSON.stringify(req.method)},`, `    ${JSON.stringify(url)},`]
    if (Object.keys(headers).length) lines.push(`    headers=${JSON.stringify(headers)},`)
    if (hasBody) lines.push(`    data=${JSON.stringify(body)},`)
    lines.push(')', 'print(response.status_code, response.text)')
    return lines.join('\n')
  }
  if (lang === 'go') {
    const lines = ['package main', '', 'import (', '\t"fmt"', '\t"io"', '\t"net/http"', ...(hasBody ? ['\t"strings"'] : []), ')', '', 'func main() {']
    lines.push(`\treq, _ := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(url)}, ${hasBody ? `strings.NewReader(${JSON.stringify(body)})` : 'nil'})`)
    for (const [k, v] of Object.entries(headers)) lines.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
    lines.push('\tres, err := http.DefaultClient.Do(req)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tdefer res.Body.Close()', '\tb, _ := io.ReadAll(res.Body)', '\tfmt.Println(res.StatusCode, string(b))', '}')
    return lines.join('\n')
  }
  if (lang === 'httpie') {
    const q = (t: string): string => `'${t.replace(/'/g, `'\\''`)}'`
    const parts = [`http ${req.method} ${q(url)}`]
    for (const [k, v] of Object.entries(headers)) parts.push(q(`${k}:${v}`))
    if (hasBody) return `${parts.join(' \\\n  ')} \\\n  --raw ${q(body!)}`
    return parts.join(' \\\n  ')
  }
  const q = (t: string): string => `'${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if (lang === 'laravel') {
    const chain = ['$response = Http::']
    const parts: string[] = []
    const plain = Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type')
    if (plain.length) parts.push(`withHeaders([${plain.map(([k, v]) => `${q(k)} => ${q(v)}`).join(', ')}])`)
    const m = req.method.toLowerCase()
    const verb = ['get', 'post', 'put', 'patch', 'delete', 'head'].includes(m) ? m : null
    if (hasBody && isJson) parts.push(verb ? `${verb}(${q(url)}, json_decode(${q(body!)}, true))` : `send(${q(req.method)}, ${q(url)}, ['json' => json_decode(${q(body!)}, true)])`)
    else if (hasBody) parts.push(`withBody(${q(body!)}, ${q(headers['Content-Type'] ?? 'text/plain')})`, verb ? `${verb}(${q(url)})` : `send(${q(req.method)}, ${q(url)})`)
    else parts.push(verb ? `${verb}(${q(url)})` : `send(${q(req.method)}, ${q(url)})`)
    return `use Illuminate\\Support\\Facades\\Http;\n\n${chain[0]}${parts.join('\n    ->')};\n\n$response->status();\n$response->json();`
  }
  const lines = ['<?php', '$ch = curl_init();', 'curl_setopt_array($ch, [', `    CURLOPT_URL => ${q(url)},`, '    CURLOPT_RETURNTRANSFER => true,', `    CURLOPT_CUSTOMREQUEST => ${q(req.method)},`]
  if (Object.keys(headers).length) lines.push(`    CURLOPT_HTTPHEADER => [${Object.entries(headers).map(([k, v]) => q(`${k}: ${v}`)).join(', ')}],`)
  if (hasBody) lines.push(`    CURLOPT_POSTFIELDS => ${q(body!)},`)
  lines.push(']);', '$body = curl_exec($ch);', '$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);', 'curl_close($ch);', 'echo $status, PHP_EOL, $body;')
  return lines.join('\n')
}

export function toCurl(req: ApiRequest, vars: KV[]): string {
  const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
  const parts = [`curl -X ${req.method} ${q(buildUrl(req, vars))}`]
  for (const h of req.headers) if (h.enabled && h.key) parts.push(`-H ${q(`${fillVars(h.key, vars)}: ${fillVars(h.value, vars)}`)}`)
  if (req.auth.type === 'bearer' && req.auth.token) parts.push(`-H ${q(`Authorization: Bearer ${fillVars(req.auth.token, vars)}`)}`)
  if (req.auth.type === 'basic') parts.push(`-u ${q(`${fillVars(req.auth.user, vars)}:${fillVars(req.auth.pass, vars)}`)}`)
  if (req.auth.type === 'apikey' && req.auth.keyName && req.auth.keyIn !== 'query') parts.push(`-H ${q(`${fillVars(req.auth.keyName, vars)}: ${fillVars(req.auth.token, vars)}`)}`)
  if (req.auth.type === 'oauth2') parts.push(`-H 'Authorization: Bearer <token from the OAuth 2 token address>'`)
  if (req.body.type === 'json') parts.push(`-H 'Content-Type: application/json' --data ${q(fillVars(req.body.text, vars))}`)
  if (req.body.type === 'graphql') parts.push(`-H 'Content-Type: application/json' --data ${q(graphqlBody(fillVars(req.body.text, vars), req.body.variables))}`)
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
  event?: { listen?: string; script?: { exec?: string[] | string } }[]
  request?: {
    method?: string
    url?: string | { raw?: string }
    header?: { key: string; value: string; disabled?: boolean }[]
    body?: { mode?: string; raw?: string; urlencoded?: { key: string; value: string; disabled?: boolean }[]; formdata?: { key: string; value: string; disabled?: boolean }[]; options?: { raw?: { language?: string } } }
    auth?: { type?: string; bearer?: { key: string; value: string }[]; basic?: { key: string; value: string }[] }
  }
}

/** Turns the common Postman test lines into Laramac tests and saved variables. Other code is left out. */
function postmanScripts(item: PostmanItem): { tests: ApiAssertion[]; extract: ApiExtract[] } {
  const tests: ApiAssertion[] = []
  const extract: ApiExtract[] = []
  for (const ev of item.event ?? []) {
    if (ev.listen !== 'test') continue
    const code = Array.isArray(ev.script?.exec) ? ev.script!.exec.join('\n') : String(ev.script?.exec ?? '')
    for (const m of code.matchAll(/to\.have\.status\(\s*(\d{3})\s*\)/g)) tests.push({ enabled: true, source: 'status', path: '', op: 'eq', value: m[1] })
    for (const m of code.matchAll(/responseTime\)\.to\.be\.below\(\s*(\d+)\s*\)/g)) tests.push({ enabled: true, source: 'time', path: '', op: 'lt', value: m[1] })
    for (const m of code.matchAll(/to\.have\.header\(\s*["']([^"']+)["']\s*\)/g)) tests.push({ enabled: true, source: 'header', path: m[1], op: 'exists', value: '' })
    for (const m of code.matchAll(/to\.include\(\s*["']([^"']+)["']\s*\)/g)) tests.push({ enabled: true, source: 'body', path: '', op: 'contains', value: m[1] })
    for (const m of code.matchAll(/pm\.(?:environment|collectionVariables|globals)\.set\(\s*["']([^"']+)["']\s*,\s*(?:pm\.response\.json\(\)|jsonData|json|response|res|data)((?:\.[A-Za-z_$][\w$]*|\[\d+\])+)\s*\)/g)) {
      extract.push({ enabled: true, name: m[1], path: m[2].replace(/^\./, '') })
    }
  }
  return { tests, extract }
}

function fromPostman(doc: { info?: { name?: string }; item?: PostmanItem[]; variable?: { key: string; value: unknown; disabled?: boolean }[] }): ApiCollection {
  const requests: ApiRequest[] = []
  const walk = (items: PostmanItem[], folder: string): void => {
    for (const it of items) {
      if (it.item) {
        walk(it.item, folder ? `${folder}/${it.name ?? 'Folder'}` : (it.name ?? 'Folder'))
        continue
      }
      const r = it.request
      if (!r) continue
      const req = emptyRequest(it.name ?? 'Request')
      if (folder) req.folder = folder
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
      const { tests, extract } = postmanScripts(it)
      if (tests.length) req.tests = tests
      if (extract.length) req.extract = extract
      requests.push(req)
    }
  }
  walk(doc.item ?? [], '')
  const variables = (doc.variable ?? []).map((v) => kv(v.key, String(v.value ?? ''), !v.disabled))
  return { id: newId(), name: doc.info?.name ?? 'Postman collection', requests, ...(variables.length ? { variables } : {}) }
}

/** Exports a collection as a Postman v2.1 collection, so it opens in Postman too. */
export function toPostman(col: ApiCollection): unknown {
  type Node = { name: string; item: unknown[] }
  const root: Node = { name: '', item: [] }
  const folderNode = (path: string | undefined): Node => {
    let node = root
    for (const part of (path ?? '').split('/').filter(Boolean)) {
      let next = node.item.find((x): x is Node => !!x && typeof x === 'object' && (x as Node).name === part && Array.isArray((x as Node).item)) as Node | undefined
      if (!next) {
        next = { name: part, item: [] }
        node.item.push(next)
      }
      node = next
    }
    return node
  }
  for (const r of col.requests) {
    const body =
      r.body.type === 'json' || r.body.type === 'text'
        ? { mode: 'raw', raw: r.body.text, options: { raw: { language: r.body.type === 'json' ? 'json' : 'text' } } }
        : r.body.type === 'urlencoded'
          ? { mode: 'urlencoded', urlencoded: r.body.form.map((f) => ({ key: f.key, value: f.value, disabled: !f.enabled })) }
          : r.body.type === 'form'
            ? { mode: 'formdata', formdata: r.body.form.map((f) => ({ key: f.key, value: f.value, type: 'text', disabled: !f.enabled })) }
            : undefined
    const auth =
      r.auth.type === 'bearer'
        ? { type: 'bearer', bearer: [{ key: 'token', value: r.auth.token, type: 'string' }] }
        : r.auth.type === 'basic'
          ? { type: 'basic', basic: [{ key: 'username', value: r.auth.user }, { key: 'password', value: r.auth.pass }] }
          : undefined
    const qs = r.query.filter((q) => q.key)
    folderNode(r.folder).item.push({
      name: r.name,
      request: {
        method: r.method,
        header: r.headers.map((h) => ({ key: h.key, value: h.value, disabled: !h.enabled })),
        url: { raw: r.url + (qs.length ? (r.url.includes('?') ? '&' : '?') + qs.map((q) => `${q.key}=${q.value}`).join('&') : '') },
        ...(body ? { body } : {}),
        ...(auth ? { auth } : {})
      }
    })
  }
  return {
    info: { name: col.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: root.item,
    variable: (col.variables ?? []).map((v) => ({ key: v.key, value: v.value, disabled: !v.enabled }))
  }
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

/** Reads a Postman collection or environment, an Insomnia export, an OpenAPI 3 / Swagger 2 JSON file, or a cURL command. */
export function importText(text: string): ApiImportResult {
  const t = text.trim()
  if (t.startsWith('curl ')) {
    const req = fromCurl(t)
    return { collection: { id: newId(), name: 'Imported from cURL', requests: [req] } }
  }
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(t) as Record<string, unknown>
  } catch {
    throw new Error('Paste a cURL command, or choose a Postman, Insomnia or OpenAPI JSON file. YAML OpenAPI files need converting to JSON first.')
  }
  if (Array.isArray(doc.item)) return { collection: fromPostman(doc as never) }
  if (Array.isArray(doc.values)) {
    const values = doc.values as { key: string; value: unknown; enabled?: boolean }[]
    return { environment: { id: newId(), name: String(doc.name ?? 'Imported environment'), vars: values.map((v) => kv(v.key, String(v.value ?? ''), v.enabled !== false)) } }
  }
  if (Array.isArray(doc.resources)) return { collection: fromInsomnia(doc as never) }
  if (doc.openapi || doc.swagger) return { collection: fromOpenApi(doc as never) }
  throw new Error('That file is not a Postman collection or environment, an Insomnia export or an OpenAPI file.')
}
