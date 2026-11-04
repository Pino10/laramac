/**
 * A collection of requests made from a site's own code, without running it: Laravel routes,
 * Next.js route handlers and API pages, Express, Fastify and Hono routers, NestJS controllers,
 * FastAPI and Flask apps, and any OpenAPI file in the project. Every request starts with
 * {{base}}, which the site's environment fills in.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import type { ApiCollection, ApiRequest, HttpMethod } from '../shared/types'
import { emptyRequest, importText, newId } from './apiclient'

export interface FoundRoute {
  method: HttpMethod
  path: string
  /** Where it was found, like routes/api.php or app/api/users/route.ts. */
  file: string
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const SKIP = new Set(['node_modules', 'vendor', '.git', '.next', 'dist', 'build', '.nuxt', '.output', 'storage', 'coverage', '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj'])
const MAX_FILES = 4000
const MAX_SIZE = 512 * 1024

function walk(dir: string, exts: RegExp, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || out.length > MAX_FILES) return out
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const n of names) {
    if (SKIP.has(n) || n.startsWith('.')) continue
    const p = join(dir, n)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(p, exts, out, depth + 1)
    else if (exts.test(n) && st.size < MAX_SIZE) out.push(p)
  }
  return out
}

const read = (f: string): string => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}

/** /users/{id} and /users/:id become /users/{{id}}, so a variable can fill them. */
export function toTemplate(path: string): string {
  const p = ('/' + path.trim().replace(/^\/+/, '')).replace(/\/+$/, '') || '/'
  // Already {{x}} stays as it is; Flask's <int:id> goes first so its colon is not read as Express's :id.
  return p
    .replace(/<(?:\w+:)?(\w+)>/g, '{{$1}}')
    .replace(/(?<!\{)\{(\w+)\??\}(?!\})/g, '{{$1}}')
    .replace(/\/:(\w+)\??/g, '/{{$1}}')
    .replace(/\[\.\.\.(\w+)\]/g, '{{$1}}')
    .replace(/\[(\w+)\]/g, '{{$1}}')
}

const join2 = (a: string, b: string): string => toTemplate(`${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`)

/** Laravel: Route::get('/x', ...), Route::match, Route::resource and apiResource, with simple prefix groups. */
export function laravelRoutes(text: string, file: string, apiPrefix = ''): FoundRoute[] {
  const out: FoundRoute[] = []
  const add = (m: string, p: string): void => void out.push({ method: m.toUpperCase() as HttpMethod, path: join2(apiPrefix, p), file })
  // Prefix groups: Route::prefix('admin')->group(function () { ... }); taken one level deep.
  const groups: { start: number; end: number; prefix: string }[] = []
  const g = /Route::prefix\(\s*['"]([^'"]+)['"]\s*\)[^;{]*?->group\(\s*function\s*\([^)]*\)\s*\{/g
  let gm: RegExpExecArray | null
  while ((gm = g.exec(text))) {
    let depth = 1
    let i = g.lastIndex
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    groups.push({ start: g.lastIndex, end: i, prefix: gm[1] })
  }
  const prefixAt = (pos: number): string => groups.filter((x) => pos >= x.start && pos < x.end).map((x) => x.prefix).join('/')
  const verb = /Route::(get|post|put|patch|delete|options|any)\(\s*['"]([^'"]*)['"]/gi
  let m: RegExpExecArray | null
  while ((m = verb.exec(text))) {
    const p = join2(prefixAt(m.index), m[2])
    if (m[1].toLowerCase() === 'any') add('GET', p)
    else add(m[1], p)
  }
  const match = /Route::match\(\s*\[([^\]]+)\]\s*,\s*['"]([^'"]*)['"]/gi
  while ((m = match.exec(text))) for (const v of m[1].match(/\w+/g) ?? []) if (METHODS.includes(v.toUpperCase() as HttpMethod)) add(v, join2(prefixAt(m.index), m[2]))
  const res = /Route::(apiResource|resource)\(\s*['"]([^'"]+)['"]/gi
  while ((m = res.exec(text))) {
    const base = join2(prefixAt(m.index), m[2])
    const one = `${base}/{{id}}`
    add('GET', base)
    add('POST', base)
    add('GET', one)
    add('PUT', one)
    add('DELETE', one)
    if (m[1] === 'resource') {
      add('GET', `${base}/create`)
      add('GET', `${one}/edit`)
    }
  }
  return out
}

/** Express, Fastify, Hono and Koa routers: app.get('/x', ...), router.post("/y", ...). */
export function jsRouterRoutes(text: string, file: string): FoundRoute[] {
  const out: FoundRoute[] = []
  const re = /\b(?:app|router|server|api|routes|fastify|hono)\s*\.\s*(get|post|put|patch|delete|options|head)\s*\(\s*['"`](\/[^'"`]*)['"`]/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ method: m[1].toUpperCase() as HttpMethod, path: toTemplate(m[2]), file })
  return out
}

/** NestJS: @Controller('users') with @Get(':id'), @Post() and so on. */
export function nestRoutes(text: string, file: string): FoundRoute[] {
  const out: FoundRoute[] = []
  const ctrl = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(text)
  if (!ctrl) return out
  const base = ctrl[1] ?? ''
  const re = /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ method: m[1].toUpperCase() as HttpMethod, path: join2(base, m[2] ?? ''), file })
  return out
}

/** FastAPI and Flask: @app.get("/x"), @router.post("/y"), @app.route("/z", methods=["POST"]). */
export function pythonRoutes(text: string, file: string): FoundRoute[] {
  const out: FoundRoute[] = []
  const prefix = /APIRouter\(\s*prefix\s*=\s*['"]([^'"]+)['"]/.exec(text)?.[1] ?? ''
  const re = /@\w+\.(get|post|put|patch|delete|options|head)\(\s*['"]([^'"]*)['"]/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ method: m[1].toUpperCase() as HttpMethod, path: join2(prefix, m[2]), file })
  const route = /@\w+\.route\(\s*['"]([^'"]*)['"](?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?/gi
  while ((m = route.exec(text))) {
    const verbs = m[2] ? (m[2].match(/\w+/g) ?? []).map((v) => v.toUpperCase()) : ['GET']
    for (const v of verbs) if (METHODS.includes(v as HttpMethod)) out.push({ method: v as HttpMethod, path: toTemplate(m[1]), file })
  }
  return out
}

/** Next.js: app/**\/route.ts exporting GET, POST...; pages/api/** files answer any method. */
export function nextRoutes(root: string): FoundRoute[] {
  const out: FoundRoute[] = []
  for (const base of ['app', join('src', 'app')]) {
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const f of walk(dir, /^route\.(ts|js|mjs|tsx)$/)) {
      const rel = relative(dir, f).split(sep).slice(0, -1)
      // Route groups like (shop) are not part of the address.
      const path = toTemplate(rel.filter((p) => !/^\(.*\)$/.test(p) && !p.startsWith('@')).join('/'))
      const text = read(f)
      const verbs = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1] as HttpMethod)
      for (const v of [...new Set(verbs)]) out.push({ method: v, path, file: relative(root, f) })
    }
  }
  for (const base of [join('pages', 'api'), join('src', 'pages', 'api')]) {
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const f of walk(dir, /\.(ts|js|mjs)$/)) {
      const rel = relative(join(root, base.replace(/api$/, '')), f).replace(/\.(ts|js|mjs)$/, '').replace(/\/index$/, '')
      out.push({ method: 'GET', path: toTemplate(rel), file: relative(root, f) })
    }
  }
  return out
}

/** Every route found in a project, without duplicates, sorted by address. */
export function findRoutes(root: string): FoundRoute[] {
  const out: FoundRoute[] = []
  if (existsSync(join(root, 'artisan'))) {
    const prefix = /->prefix\(\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,200}?routes\/api\.php/.exec(read(join(root, 'bootstrap', 'app.php')))?.[1] ?? 'api'
    if (existsSync(join(root, 'routes', 'api.php'))) out.push(...laravelRoutes(read(join(root, 'routes', 'api.php')), 'routes/api.php', prefix))
    if (existsSync(join(root, 'routes', 'web.php'))) out.push(...laravelRoutes(read(join(root, 'routes', 'web.php')), 'routes/web.php'))
  }
  if (existsSync(join(root, 'package.json'))) {
    out.push(...nextRoutes(root))
    for (const f of walk(root, /\.(ts|js|mjs|cjs)$/)) {
      if (/\.(test|spec|d)\.[tj]s$/.test(f)) continue
      const text = read(f)
      const rel = relative(root, f)
      if (text.includes('@Controller(')) out.push(...nestRoutes(text, rel))
      else if (/\.(get|post|put|patch|delete)\s*\(\s*['"`]\//.test(text)) out.push(...jsRouterRoutes(text, rel))
    }
  }
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt')) || existsSync(join(root, 'main.py')) || existsSync(join(root, 'app.py'))) {
    for (const f of walk(root, /\.py$/)) {
      const text = read(f)
      if (/@\w+\.(get|post|put|patch|delete|route)\(/.test(text)) out.push(...pythonRoutes(text, relative(root, f)))
    }
  }
  const seen = new Set<string>()
  return out
    .filter((r) => {
      const k = `${r.method} ${r.path}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.path.localeCompare(b.path) || METHODS.indexOf(a.method) - METHODS.indexOf(b.method))
}

/** The routes as a collection, grouped in folders by their first path segment. */
export function collectionFromRoutes(name: string, routes: FoundRoute[]): ApiCollection {
  const requests: ApiRequest[] = routes.slice(0, 1000).map((r) => {
    const req = emptyRequest(`${r.method} ${r.path}`)
    req.method = r.method
    req.url = `{{base}}${r.path === '/' ? '' : r.path}`
    req.folder = r.path.split('/').filter(Boolean)[0]?.replace(/\{\{|\}\}/g, '') || undefined
    if (['POST', 'PUT', 'PATCH'].includes(r.method)) req.body = { type: 'json', text: '{\n  \n}', form: [] }
    req.headers = [{ key: 'Accept', value: 'application/json', enabled: true }]
    return req
  })
  return { id: newId(), name, requests, variables: [{ key: 'id', value: '1', enabled: true }] }
}

/** An OpenAPI or Swagger JSON file in the project, when there is one. */
export function openApiInProject(root: string): ApiCollection | null {
  for (const f of ['openapi.json', 'swagger.json', join('public', 'openapi.json'), join('docs', 'openapi.json'), join('storage', 'api-docs', 'api-docs.json'), join('public', 'swagger.json')]) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    try {
      const r = importText(read(p))
      if (r.collection) return r.collection
    } catch {
      // Not a usable file.
    }
  }
  return null
}
