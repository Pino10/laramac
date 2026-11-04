import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { fits, majorFrom, newestPerMajor, nodeNeed, nodeShim } from '../src/main/nodeversions'
import { isNewer, jumpOf, parseBrewOutdated, parseClaudeVersion, parseCloudflaredVersion, parseComposerVersion, siteItem, sortItems } from '../src/main/updates'
import { applyAuth, clearCookies, cookieHeader, emptyRequest, graphqlBody, oauthToken, rememberCookies, toCode, toCurl } from '../src/main/apiclient'
import { collectionFromRoutes, findRoutes, jsRouterRoutes, laravelRoutes, nestRoutes, pythonRoutes, toTemplate } from '../src/main/apiroutes'
import { apiUrl, authFor, cleanRemote, isAzureRemote } from '../src/main/azure'
import { healthIssues, parseNpmOutdated, siteApiVars } from '../src/main/hub'
import { claudeLmConfigFor } from '../src/main/claudesetup'
import { ensureLmContext } from '../src/main/seckit/lmstudio'
import type { SiteInfo } from '../src/shared/types'

const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const site = (name: string, extra: Partial<SiteInfo> = {}): SiteInfo => ({ name, path: `/tmp/none/${name}`, docRoot: '', domain: `${name}.test`, url: `http://${name}.test`, httpsUrl: `https://${name}.test`, kind: 'node', secure: false, php: null, aliases: [], ...extra })
const dir = (files: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), 'lm21-'))
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(join(d, f, '..'), { recursive: true })
    writeFileSync(join(d, f), t)
  }
  return d
}

describe('Node.js per project', () => {
  it('reads every way a project asks for a version', () => {
    expect(majorFrom('v20.11.1')).toBe('20')
    expect(majorFrom('lts/iron')).toBe('20')
    expect(majorFrom('nodejs 22.3.0')).toBe('22')
    expect(majorFrom('lts/*')).toBeNull()
    expect(nodeNeed(dir({ '.nvmrc': '18\n' }))).toEqual({ major: '18', source: '.nvmrc', exact: true })
    expect(nodeNeed(dir({ '.tool-versions': 'python 3.12\nnodejs 20.9.0\n' }))?.major).toBe('20')
    expect(nodeNeed(dir({ 'package.json': JSON.stringify({ volta: { node: '22.1.0' } }) }))).toMatchObject({ major: '22', exact: true })
    expect(nodeNeed(dir({ 'package.json': JSON.stringify({ engines: { node: '>=18' } }) }))).toMatchObject({ major: '18', exact: false })
    expect(nodeNeed(dir({ 'package.json': JSON.stringify({ engines: { node: '^20.0.0' } }) }))).toMatchObject({ major: '20', exact: true })
    expect(nodeNeed(dir({ 'package.json': '{}' }))).toBeNull()
  })
  it('decides whether a version fits', () => {
    expect(fits({ major: '18', source: '', exact: false }, '24')).toBe(true)
    expect(fits({ major: '18', source: '', exact: true }, '24')).toBe(false)
    expect(fits({ major: '20', source: '', exact: true }, '20')).toBe(true)
  })
  it('picks the newest release of each line for this Mac', () => {
    const index = [
      { version: 'v24.11.1', lts: 'Krypton', files: ['osx-arm64-tar', 'osx-x64-tar'] },
      { version: 'v24.11.0', lts: 'Krypton', files: ['osx-arm64-tar'] },
      { version: 'v22.21.0', lts: 'Jod', files: ['osx-arm64-tar'] },
      { version: 'v20.19.5', lts: 'Iron', files: ['osx-x64-tar'] },
      { version: 'v14.21.3', lts: 'Fermium', files: ['osx-arm64-tar'] }
    ]
    expect(newestPerMajor(index, 'arm64')).toEqual([
      { major: '24', version: '24.11.1', lts: 'Krypton' },
      { major: '22', version: '22.21.0', lts: 'Jod' }
    ])
  })
  it('writes Terminal commands that switch by folder', () => {
    const sh = nodeShim('npm', '/Users/x/.laramac/runtimes/node/bin')
    expect(sh).toMatch(/\.nvmrc/)
    expect(sh).toMatch(/node-map/)
    expect(sh).toContain('exec "$dir/npm" "$@"')
  })
  it('the Doctor offers to install a missing Node for a site', () => {
    const [i] = healthIssues({ services: [], sites: [site('old')], dnsReady: true, httpPort: 80, nodeMajor: '24', probes: {}, nodeFor: { old: { want: '18', source: '.nvmrc', installed: false } } }).filter((x) => x.id === 'node-old')
    expect(i).toMatchObject({ level: 'warn', fix: 'node-install:18', fixLabel: 'Install Node 18' })
    expect(healthIssues({ services: [], sites: [site('ok')], dnsReady: true, httpPort: 80, nodeMajor: '24', probes: {}, nodeFor: { ok: { want: '20', source: '.nvmrc', installed: true } } }).some((x) => x.id === 'node-ok')).toBe(false)
  })
})

describe('Updates for everything', () => {
  it('compares versions and sizes the jump', () => {
    expect(jumpOf('8.4.1', '8.4.3')).toBe('patch')
    expect(jumpOf('2.7.9', '2.8.0')).toBe('minor')
    expect(jumpOf('20.1.0', '22.0.0')).toBe('major')
    expect(isNewer('1.2.3', '1.2.10')).toBe(true)
    expect(isNewer('1.2.10', '1.2.3')).toBe(false)
    expect(isNewer('1.0.0', null)).toBe(false)
  })
  it('reads tool versions', () => {
    expect(parseComposerVersion('Composer version 2.8.4 2024-12-11 10:57:47')).toBe('2.8.4')
    expect(parseClaudeVersion('2.1.31 (Claude Code)')).toBe('2.1.31')
    expect(parseCloudflaredVersion('cloudflared version 2025.11.1 (built 2025-11-07-1234 UTC)')).toBe('2025.11.1')
  })
  it('keeps only the Homebrew formulae Laramac looks after', () => {
    const out = JSON.stringify({ formulae: [{ name: 'nginx', installed_versions: ['1.27.2'], current_version: '1.29.3', pinned: false }, { name: 'wget', installed_versions: ['1.24'], current_version: '1.25', pinned: false }, { name: 'redis', installed_versions: ['7.4.0'], current_version: '8.2.2', pinned: true }], casks: [] })
    expect(parseBrewOutdated(out, ['nginx', 'redis', 'httpd'])).toEqual([{ formula: 'nginx', current: '1.27.2', latest: '1.29.3' }])
    expect(parseBrewOutdated('not json', ['nginx'])).toEqual([])
  })
  it('turns a site’s outdated packages into one line that needs consent', () => {
    const item = siteItem('shop', parseNpmOutdated(fx('npm-outdated.json')))!
    expect(item).toMatchObject({ id: 'site:shop', group: 'site', runsProjectCode: true })
    expect(siteItem('none', [])).toBeNull()
    expect(sortItems([item, { id: 'php:8.4', group: 'php', name: 'PHP 8.4', current: '8.4.1', latest: '8.4.3', detail: '' }]).map((i) => i.group)).toEqual(['php', 'site'])
  })
})

describe('API client', () => {
  it('sends GraphQL as JSON with variables', () => {
    expect(JSON.parse(graphqlBody('{ me { id } }', '{"a":1}'))).toEqual({ query: '{ me { id } }', variables: { a: 1 } })
    expect(JSON.parse(graphqlBody('{ me { id } }', ''))).toEqual({ query: '{ me { id } }' })
    expect(() => graphqlBody('{}', '{oops')).toThrow(/not valid JSON/)
  })
  it('adds API keys in a header or the address', async () => {
    const req = emptyRequest()
    req.auth = { type: 'apikey', token: '{{k}}', user: '', pass: '', keyName: 'X-API-Key', keyIn: 'header' }
    const url = new URL('https://api.example.com/x')
    const headers: Record<string, string> = {}
    await applyAuth(req, [{ key: 'k', value: 'abc', enabled: true }], url, headers)
    expect(headers['X-API-Key']).toBe('abc')
    req.auth.keyIn = 'query'
    req.auth.keyName = 'api_key'
    await applyAuth(req, [{ key: 'k', value: 'abc', enabled: true }], url, {})
    expect(url.searchParams.get('api_key')).toBe('abc')
  })
  it('gets and keeps an OAuth 2 client-credentials token', async () => {
    let calls = 0
    const fake = (async (_u: string, init: { body: string; headers: Record<string, string> }) => {
      calls++
      expect(init.body).toContain('grant_type=client_credentials')
      expect(init.headers.Authorization).toMatch(/^Basic /)
      return new Response(JSON.stringify({ access_token: 'tok123', expires_in: 3600 }), { status: 200 })
    }) as never
    const a = { type: 'oauth2' as const, token: '', user: '', pass: '', tokenUrl: 'https://auth.example.com/token', clientId: 'id', clientSecret: 's', scope: 'read' }
    expect(await oauthToken(a, [], fake)).toBe('tok123')
    expect(await oauthToken(a, [], fake)).toBe('tok123')
    expect(calls).toBe(1)
  })
  it('keeps cookies per host, and forgets expired ones', () => {
    clearCookies()
    rememberCookies('shop.test', ['laravel_session=abc; path=/; httponly', 'XSRF-TOKEN=xyz; path=/'])
    expect(cookieHeader('shop.test')).toBe('laravel_session=abc; XSRF-TOKEN=xyz')
    rememberCookies('shop.test', ['XSRF-TOKEN=; Max-Age=0'])
    expect(cookieHeader('shop.test')).toBe('laravel_session=abc')
    expect(cookieHeader('other.test')).toBeNull()
  })
  it('writes the request in more languages', () => {
    const req = emptyRequest()
    req.method = 'POST'
    req.url = 'https://api.example.com/users'
    req.body = { type: 'json', text: '{"name":"Ada"}', form: [] }
    req.auth = { type: 'bearer', token: 't0k', user: '', pass: '' }
    expect(toCode(req, [], 'axios')).toContain("method: 'post'")
    expect(toCode(req, [], 'laravel')).toContain("Http::withHeaders(['Authorization' => 'Bearer t0k'])")
    expect(toCode(req, [], 'laravel')).toContain("->post('https://api.example.com/users', json_decode('{\"name\":\"Ada\"}', true))")
    expect(toCode(req, [], 'go')).toContain('http.NewRequest("POST", "https://api.example.com/users", strings.NewReader(')
    expect(toCode(req, [], 'httpie')).toMatch(/^http POST 'https:\/\/api\.example\.com\/users'/)
    req.body = { type: 'graphql', text: '{ me { id } }', form: [], variables: '' }
    expect(toCurl(req, [])).toContain(`--data '{"query":"{ me { id } }"}'`)
  })
})

describe('Requests from a site’s code', () => {
  it('reads Laravel routes, resources and prefix groups', () => {
    const r = laravelRoutes(`<?php
Route::get('/users/{user}', [UserController::class, 'show']);
Route::post('orders', fn () => 1);
Route::apiResource('photos', PhotoController::class);
Route::prefix('admin')->group(function () {
    Route::delete('/posts/{post?}', [PostController::class, 'destroy']);
});
Route::match(['get', 'post'], '/search', SearchController::class);`, 'routes/api.php', 'api')
    const lines = r.map((x) => `${x.method} ${x.path}`)
    expect(lines).toContain('GET /api/users/{{user}}')
    expect(lines).toContain('POST /api/orders')
    expect(lines).toContain('PUT /api/photos/{{id}}')
    expect(lines).toContain('DELETE /api/admin/posts/{{post}}')
    expect(lines).toContain('POST /api/search')
  })
  it('reads Express, NestJS and FastAPI', () => {
    expect(jsRouterRoutes(`router.get('/items/:id', h)\napp.post("/login", h)`, 'a.js').map((x) => `${x.method} ${x.path}`)).toEqual(['GET /items/{{id}}', 'POST /login'])
    expect(nestRoutes(`@Controller('cats')\nclass C {\n @Get(':id') one() {}\n @Post() add() {}\n}`, 'c.ts').map((x) => `${x.method} ${x.path}`)).toEqual(['GET /cats/{{id}}', 'POST /cats'])
    expect(pythonRoutes(`router = APIRouter(prefix="/v1")\n@router.get("/items/{item_id}")\ndef f(): pass\n@app.route("/x", methods=["POST", "PUT"])`, 'm.py').map((x) => `${x.method} ${x.path}`)).toEqual(['GET /v1/items/{{item_id}}', 'POST /x', 'PUT /x'])
  })
  it('reads Next.js route handlers, skipping route groups', () => {
    const d = dir({ 'package.json': '{}', 'app/(shop)/api/products/[id]/route.ts': 'export async function GET() {}\nexport const DELETE = () => 1', 'pages/api/hello.ts': 'export default function h() {}' })
    const lines = findRoutes(d).map((x) => `${x.method} ${x.path}`)
    expect(lines).toContain('GET /api/products/{{id}}')
    expect(lines).toContain('DELETE /api/products/{{id}}')
    expect(lines).toContain('GET /api/hello')
  })
  it('makes a collection that uses the site’s {{base}}', () => {
    const c = collectionFromRoutes('shop routes', [{ method: 'POST', path: '/api/orders', file: 'x' }])
    expect(c.requests[0]).toMatchObject({ method: 'POST', url: '{{base}}/api/orders', folder: 'api' })
    expect(toTemplate('/a/<int:id>/b')).toBe('/a/{{id}}/b')
  })
  it('a site environment has its address and non-secret URLs only', () => {
    const vars = siteApiVars(site('shop', { kind: 'laravel', secure: true }), 'APP_URL=https://shop.test\nSTRIPE_SECRET_URL=https://x\nAPI_URL="https://api.shop.test"\nDB_PASSWORD=x\nREDIS_URL=redis://u:p@h\n')
    expect(vars.map((v) => v.key)).toEqual(['base', 'host', 'api', 'APP_URL', 'API_URL'])
    expect(vars[0].value).toBe('https://shop.test')
  })
})

describe('Azure DevOps', () => {
  it('only builds dev.azure.com addresses for a valid organization', () => {
    expect(apiUrl('contoso', '_apis/git/repositories')).toBe('https://dev.azure.com/contoso/_apis/git/repositories?api-version=7.1')
    expect(() => apiUrl('evil.com/x', '_apis')).toThrow()
  })
  it('cleans the user name out of clone addresses', () => {
    expect(cleanRemote('https://contoso@dev.azure.com/contoso/Shop/_git/web')).toBe('https://dev.azure.com/contoso/Shop/_git/web')
    expect(() => cleanRemote('https://evil.example/contoso/_git/x')).toThrow()
    expect(isAzureRemote('https://dev.azure.com/contoso/Shop/_git/web')).toBe(true)
  })
  it('sends the token to dev.azure.com only, as a header', () => {
    const a = authFor('PAT123', { org: 'contoso', name: 'Pino', email: 'p@example.com' })
    expect(a.config[1]).toBe(`http.https://dev.azure.com/.extraheader=AUTHORIZATION: Basic ${Buffer.from(':PAT123').toString('base64')}`)
  })
})

describe('Claude everywhere', () => {
  it('claude-lm settings point Claude Code at LM Studio without a token', () => {
    const c = claudeLmConfigFor({ claude: '/usr/local/bin/claude', baseUrl: 'http://localhost:1234/v1', model: 'qwen/qwen3-coder-30b', plugins: ['/p'] })
    expect(c.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:1234')
    expect(c.env.ANTHROPIC_MODEL).toBe('qwen/qwen3-coder-30b')
    expect(c.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(c.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('8192')
  })
  it('reloads a model that LM Studio loaded with too little context', async () => {
    const calls: string[] = []
    const fake = (async (url: string, init?: { body?: string }) => {
      calls.push(`${url.replace('http://127.0.0.1:1234', '')} ${init?.body ?? ''}`)
      if (url.endsWith('/api/v1/models')) return new Response(JSON.stringify({ models: [{ key: 'qwen/qwen3-coder-30b', type: 'llm', max_context_length: 262144, loaded_instances: [{ id: 'qwen/qwen3-coder-30b', config: { context_length: 4096 } }] }] }))
      if (url.endsWith('/load')) return new Response(JSON.stringify({ load_config: { context_length: 65536 } }))
      return new Response('{}')
    }) as never
    const r = await ensureLmContext('http://localhost:1234/v1', 'qwen/qwen3-coder-30b', undefined, undefined, fake)
    expect(r).toMatchObject({ ok: true, reloaded: true, before: 4096, after: 65536 })
    expect(calls[1]).toContain('/api/v1/models/unload')
    expect(calls[2]).toContain('"context_length":65536')
  })
  it('leaves servers that are not LM Studio alone', async () => {
    const r = await ensureLmContext('http://127.0.0.1:11434/v1', 'llama3', undefined, undefined, (async () => new Response('nope', { status: 404 })) as never)
    expect(r).toMatchObject({ ok: true, reloaded: false, note: '' })
  })
})
