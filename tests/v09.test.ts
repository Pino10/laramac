import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listPackages, removePackage } from '../src/main/packages'
import { dirs } from '../src/main/paths'
import { freshEnv } from './helpers'

describe('packages', () => {
  it('lists what is installed with sizes, and removes only what it listed', async () => {
    freshEnv()
    mkdirSync(join(dirs.php('8.4'), 'bin'), { recursive: true })
    writeFileSync(join(dirs.php('8.4'), 'VERSION'), '8.4.27\n')
    writeFileSync(join(dirs.php('8.4'), 'bin', 'php'), Buffer.alloc(300_000))
    mkdirSync(dirs.mysql('8.4.13'), { recursive: true })
    writeFileSync(join(dirs.mysql('8.4.13'), 'mysqld'), Buffer.alloc(100_000))
    writeFileSync(join(dirs.bin(), 'cloudflared'), Buffer.alloc(50_000))
    writeFileSync(join(dirs.downloads(), 'old.tar.gz'), Buffer.alloc(80_000))

    const list = await listPackages()
    const byId = Object.fromEntries(list.map((p) => [p.id, p]))
    expect(byId['php:8.4']).toMatchObject({ group: 'php', detail: '8.4.27' })
    expect(byId['php:8.4'].bytes).toBeGreaterThan(250_000)
    expect(byId['mysql:8.4.13']).toMatchObject({ group: 'database', name: 'MySQL' })
    expect(byId['bin:cloudflared']).toMatchObject({ group: 'tool' })
    expect(byId['cache:downloads'].bytes).toBeGreaterThan(70_000)

    const stopped: string[] = []
    const removedPhp: string[] = []
    const deps = { stopService: async (s: string) => void stopped.push(s), removePhp: async (m: string) => void removedPhp.push(m) }

    await removePackage('mysql:8.4.13', deps as never)
    expect(stopped).toEqual(['mysql'])
    expect(existsSync(dirs.mysql('8.4.13'))).toBe(false)

    await removePackage('cache:downloads', deps as never)
    expect(existsSync(dirs.downloads())).toBe(true)
    expect(readdirSync(dirs.downloads())).toEqual([])

    await removePackage('php:8.4', deps as never)
    expect(removedPhp).toEqual(['8.4'])

    await expect(removePackage('dir:../../etc', deps as never)).rejects.toThrow(/no longer installed/)
    await expect(removePackage('bin:sh', deps as never)).rejects.toThrow(/no longer installed/)
  })
})

describe('MCP server for AI tools', () => {
  it('speaks MCP over HTTP, only with the token and never to browsers', async () => {
    freshEnv()
    const { startMcpServer, mcpToken } = await import('../src/main/mcp')
    const calls: string[] = []
    const port = 53999
    const server = await startMcpServer({
      port,
      version: '0.9.0',
      onCall: (n) => calls.push(n),
      tools: [
        { name: 'list_sites', description: 'Sites', inputSchema: { type: 'object', properties: {} }, run: async () => [{ name: 'shop' }] },
        { name: 'fail', description: 'Fails', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new Error('nope') } }
      ]
    })
    const url = `http://127.0.0.1:${port}/mcp`
    const token = mcpToken()
    const post = (body: object, headers: Record<string, string> = {}): Promise<Response> =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) })
    try {
      const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json()
      expect(init.result.protocolVersion).toBe('2025-06-18')
      expect(init.result.serverInfo.name).toBe('laramac')
      expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)

      const list = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()
      expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['list_sites', 'fail'])

      const call = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_sites', arguments: {} } })).json()
      expect(JSON.parse(call.result.content[0].text)).toEqual([{ name: 'shop' }])
      const bad = await (await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'fail', arguments: {} } })).json()
      expect(bad.result).toMatchObject({ isError: true, content: [{ text: 'nope' }] })
      expect(calls).toEqual(['list_sites', 'fail'])

      expect((await post({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, { Authorization: 'Bearer wrong' })).status).toBe(401)
      expect((await post({ jsonrpc: '2.0', id: 6, method: 'tools/list' }, { Origin: 'https://evil.example' })).status).toBe(401)
      const noAuth = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      expect(noAuth.status).toBe(401)
    } finally {
      server.close()
    }
  })
})

describe('host names', () => {
  it('cleans extra site names and rewrites only its own block of /etc/hosts', async () => {
    const { cleanAlias, needsHostsEntry, withHostsBlock } = await import('../src/main/hosts')
    expect(cleanAlias(' Shop.Local. ')).toBe('shop.local')
    for (const bad of ['localhost', 'shop', '-a.test', 'a b.test', 'x.test;rm', '1.2.3.4', 'evil.test\n127.0.0.1 bank.com']) {
      expect(() => cleanAlias(bad)).toThrow()
    }
    expect(needsHostsEntry('shop.local', 'test')).toBe(true)
    expect(needsHostsEntry('api.shop.test', 'test')).toBe(false)
    expect(needsHostsEntry('shop.localhost', 'test')).toBe(false)

    const original = '127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n::1 localhost\n'
    const once = withHostsBlock(original, ['shop.local', 'radio.dev.internal'])
    expect(once).toContain('127.0.0.1 shop.local\n::1 shop.local')
    expect(once.startsWith(original.trimEnd())).toBe(true)
    // Rewriting replaces the block instead of adding another, and removing all names removes it.
    expect(withHostsBlock(once, ['shop.local', 'radio.dev.internal'])).toBe(once)
    expect(withHostsBlock(once, [])).toBe(original)
  })

  it('links /tmp/mysql.sock to Laramac only when nobody else owns it', async () => {
    const { mkdtempSync, symlinkSync, writeFileSync, readlinkSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { linkSharedSocket } = await import('../src/main/svc/mysql')
    const dir = mkdtempSync(join(tmpdir(), 'lm-sock-'))
    const ours = join(dir, '.laramac-run-mysql.sock')
    writeFileSync(ours, '')
    expect(linkSharedSocket(ours, join(dir, 'a.sock'))).toBe('linked')
    expect(readlinkSync(join(dir, 'a.sock'))).toBe(ours)
    expect(linkSharedSocket(ours, join(dir, 'a.sock'))).toBe('kept')
    writeFileSync(join(dir, 'real.sock'), '')
    expect(linkSharedSocket(ours, join(dir, 'real.sock'))).toBe('taken')
    const other = join(dir, 'homebrew-mysql.sock')
    writeFileSync(other, '')
    symlinkSync(other, join(dir, 'b.sock'))
    expect(linkSharedSocket(ours, join(dir, 'b.sock'))).toBe('taken')
    symlinkSync(join(dir, 'gone.sock'), join(dir, 'c.sock'))
    expect(linkSharedSocket(ours, join(dir, 'c.sock'))).toBe('linked')
  })
})

const PYFTP = (await import('child_process')).spawnSync('python3', ['-c', 'import pyftpdlib']).status === 0
describe.skipIf(!PYFTP)('FTP servers', () => {
  it('browses and deploys over FTP with a Keychain password', async () => {
    const { spawn } = await import('child_process')
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('fs')
    const { tmpdir } = await import('os')
    const ssh = await import('../src/main/ssh')
    const { deploy, cleanRemotePath } = await import('../src/main/deploy')
    const { waitForPort } = await import('../src/main/process')
    freshEnv()
    const home = mkdtempSync(join(tmpdir(), 'lm-ftp-'))
    const port = 2121
    const server = spawn('python3', ['-m', 'pyftpdlib', '-p', String(port), '-u', 'deploy', '-P', 'hunter2-long', '-d', home, '-w', '-i', '127.0.0.1'], { stdio: 'ignore' })
    try {
      expect(await waitForPort(port, 10000)).toBe(true)
      const crypto = { available: () => true, encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.slice(4) }
      const id = ssh.saveServer({ name: 'Shared host', host: '127.0.0.1', port, user: 'deploy', auth: 'password', password: 'hunter2-long', protocol: 'ftp' }, crypto)[0].id
      expect(ssh.listServers()[0]).toMatchObject({ protocol: 'ftp', hasPassword: true })

      const site = mkdtempSync(join(tmpdir(), 'lm-ftp-site-'))
      mkdirSync(join(site, 'assets'))
      writeFileSync(join(site, 'index.php'), 'hello ftp')
      writeFileSync(join(site, 'assets', 'app.css'), 'body{}')
      writeFileSync(join(site, '.env'), 'x')
      const fs = await ssh.openFs(id, null, crypto)
      try {
        const res = await deploy(fs, site, cleanRemotePath('public_html/'), {}, () => undefined)
        expect(res.uploaded).toBe(2)
        expect(readFileSync(join(home, 'public_html', 'assets', 'app.css'), 'utf8')).toBe('body{}')
        expect(existsSync(join(home, 'public_html', '.env'))).toBe(false)
        expect((await deploy(fs, site, 'public_html', {}, () => undefined)).uploaded).toBe(0)
      } finally {
        fs.close()
      }

      const conn = await ssh.connectSftp(id, null, crypto)
      expect(conn.status).toBe('connected')
      if (conn.status === 'connected') {
        const listing = await ssh.listDir(conn.session, 'public_html')
        expect(listing.entries.map((e) => `${e.type}:${e.name}`)).toEqual(['dir:assets', 'file:index.php'])
        ssh.disconnect(conn.session)
      }
      expect(() => cleanRemotePath('/')).toThrow()
      expect(() => cleanRemotePath('www/../../etc')).toThrow()
    } finally {
      server.kill()
    }
  })
})

describe('API client', () => {
  it('sends requests with environment variables, auth and bodies', async () => {
    const { createServer } = await import('http')
    const { sendRequest, emptyRequest, toCurl, fromCurl } = await import('../src/main/apiclient')
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('X-Seen', 'yes')
        res.statusCode = req.url?.startsWith('/missing') ? 404 : 201
        res.end(JSON.stringify({ method: req.method, url: req.url, auth: req.headers.authorization, ct: req.headers['content-type'], body }))
      })
    })
    await new Promise<void>((r) => server.listen(18555, '127.0.0.1', () => r()))
    try {
      const vars = [
        { key: 'base', value: 'http://127.0.0.1:18555', enabled: true },
        { key: 'token', value: 's3cret', enabled: true },
        { key: 'off', value: 'nope', enabled: false }
      ]
      const req = emptyRequest()
      req.method = 'POST'
      req.url = '{{base}}/posts'
      req.query = [{ key: 'page', value: '2', enabled: true }, { key: 'skip', value: 'x', enabled: false }]
      req.auth = { type: 'bearer', token: '{{token}}', user: '', pass: '' }
      req.body = { type: 'json', text: '{"title":"{{off}}"}', form: [] }
      const res = await sendRequest(req, vars)
      expect(res.status).toBe(201)
      expect(res.headers).toContainEqual(['x-seen', 'yes'])
      const echo = JSON.parse(res.body)
      expect(echo).toMatchObject({ method: 'POST', url: '/posts?page=2', auth: 'Bearer s3cret', ct: 'application/json', body: '{"title":"{{off}}"}' })

      const form = emptyRequest()
      form.method = 'PUT'
      form.url = 'http://127.0.0.1:18555/form'
      form.body = { type: 'urlencoded', text: '', form: [{ key: 'a b', value: '1&2', enabled: true }] }
      expect(JSON.parse((await sendRequest(form, [])).body).body).toBe('a+b=1%262')

      const back = fromCurl(toCurl(req, vars))
      expect(back).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:18555/posts?page=2' })
      expect(back.headers.find((h) => h.key === 'Authorization')?.value).toBe('Bearer s3cret')
      expect((await sendRequest({ ...emptyRequest(), url: 'http://127.0.0.1:18555/missing' }, [])).status).toBe(404)

      // Tests and saved values, like Postman.
      const checked = await sendRequest(
        {
          ...req,
          tests: [
            { enabled: true, source: 'status', path: '', op: 'eq', value: '201' },
            { enabled: true, source: 'time', path: '', op: 'lt', value: '5000' },
            { enabled: true, source: 'header', path: 'X-Seen', op: 'eq', value: 'yes' },
            { enabled: true, source: 'json', path: 'method', op: 'eq', value: 'POST' },
            { enabled: true, source: 'json', path: 'nothing.here', op: 'exists', value: '' },
            { enabled: false, source: 'status', path: '', op: 'eq', value: '500' }
          ],
          extract: [{ enabled: true, name: 'lastAuth', path: 'auth' }, { enabled: true, name: 'seen', path: 'header:x-seen' }]
        },
        vars
      )
      expect(checked.tests.map((t) => t.pass)).toEqual([true, true, true, true, false])
      expect(checked.tests[4].detail).toBe('Got nothing')
      expect(checked.saved).toEqual([{ key: 'lastAuth', value: 'Bearer s3cret' }, { key: 'seen', value: 'yes' }])
      const { applySaved, mergeVars, toCode } = await import('../src/main/apiclient')
      expect(applySaved({ id: 'e', name: 'Local', vars: [{ key: 'seen', value: 'no', enabled: false }] }, checked.saved).vars).toEqual([
        { key: 'seen', value: 'yes', enabled: true },
        { key: 'lastAuth', value: 'Bearer s3cret', enabled: true }
      ])
      expect(mergeVars([{ key: 'base', value: 'col', enabled: true }, { key: 'x', value: '1', enabled: true }], [{ key: 'base', value: 'env', enabled: true }])).toEqual([
        { key: 'base', value: 'env', enabled: true },
        { key: 'x', value: '1', enabled: true }
      ])
      expect(toCode(req, vars, 'fetch')).toContain("fetch(\"http://127.0.0.1:18555/posts?page=2\"")
      const php = toCode(req, vars, 'php')
      expect(php).toContain("'Authorization: Bearer s3cret'")
      const { spawnSync } = await import('child_process')
      if (spawnSync('which', ['php']).status === 0) expect(spawnSync('php', ['-l'], { input: php, encoding: 'utf8' }).stdout).toContain('No syntax errors')
      expect(toCode(req, vars, 'python')).toContain('requests.request(')
      await expect(sendRequest({ ...emptyRequest(), url: 'http://127.0.0.1:18556/' }, [])).rejects.toThrow(/Nothing is answering/)
      await expect(sendRequest({ ...emptyRequest(), url: 'file:///etc/passwd' }, [])).rejects.toThrow(/Only http/)
    } finally {
      server.close()
    }
  })

  it('imports Postman, Insomnia, OpenAPI and cURL', async () => {
    const { importText } = await import('../src/main/apiclient')
    const postman = importText(
      JSON.stringify({
        variable: [{ key: 'base', value: 'https://shop.test' }],
        info: { name: 'Shop API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [
          { name: 'Orders', item: [{ name: 'List', request: { method: 'GET', url: { raw: '{{base}}/orders' }, header: [{ key: 'Accept', value: 'application/json' }] } }] },
          {
            name: 'Login',
            event: [{ listen: 'test', script: { exec: ['pm.test("ok", () => pm.response.to.have.status(200));', 'var jsonData = pm.response.json();', 'pm.environment.set("token", jsonData.data.token);', 'pm.expect(pm.response.responseTime).to.be.below(500);'] } }],
            request: { method: 'POST', url: '{{base}}/login', body: { mode: 'raw', raw: '{"email":"a"}', options: { raw: { language: 'json' } } }, auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc' }] } }
          }
        ]
      })
    ).collection!
    expect(postman.name).toBe('Shop API')
    expect(postman.requests.map((r) => `${r.folder ?? ''}|${r.name}`)).toEqual(['Orders|List', '|Login'])
    expect(postman.variables).toEqual([{ key: 'base', value: 'https://shop.test', enabled: true }])
    expect(postman.requests[1].tests).toEqual([
      { enabled: true, source: 'status', path: '', op: 'eq', value: '200' },
      { enabled: true, source: 'time', path: '', op: 'lt', value: '500' }
    ])
    expect(postman.requests[1].extract).toEqual([{ enabled: true, name: 'token', path: 'data.token' }])
    const { toPostman } = await import('../src/main/apiclient')
    const again = importText(JSON.stringify(toPostman(postman))).collection!
    expect(again.requests.map((r) => `${r.folder ?? ''}|${r.name}|${r.method}`)).toEqual(['Orders|List|GET', '|Login|POST'])
    expect(importText(JSON.stringify({ name: 'Staging', values: [{ key: 'base', value: 'https://staging.example.com', enabled: true }], _postman_variable_scope: 'environment' })).environment).toMatchObject({ name: 'Staging', vars: [{ key: 'base' }] })
    expect(postman.requests[1]).toMatchObject({ method: 'POST', body: { type: 'json' }, auth: { type: 'bearer', token: 'abc' } })

    const insomnia = importText(JSON.stringify({ _type: 'export', resources: [{ _type: 'workspace', name: 'Radio' }, { _type: 'request', name: 'Now playing', method: 'GET', url: 'https://radio.test/api/now', headers: [], parameters: [{ name: 'limit', value: '5' }] }] })).collection!
    expect(insomnia).toMatchObject({ name: 'Radio', requests: [{ name: 'Now playing', query: [{ key: 'limit', value: '5' }] }] })

    const openapi = importText(JSON.stringify({ openapi: '3.0.0', info: { title: 'Pets' }, servers: [{ url: 'https://api.example.com/v1' }], paths: { '/pets/{id}': { get: { summary: 'Get a pet', parameters: [{ name: 'id', in: 'path' }] }, delete: { operationId: 'deletePet' } } } })).collection!
    expect(openapi.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET https://api.example.com/v1/pets/{{id}}', 'DELETE https://api.example.com/v1/pets/{{id}}'])

    const curl = importText(`curl 'https://api.example.com/users' -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'`).collection!
    expect(curl.requests[0]).toMatchObject({ method: 'POST', url: 'https://api.example.com/users', body: { type: 'json', text: '{"name":"Ada"}' } })
    expect(() => importText('not json')).toThrow(/cURL/)
  })
})

describe('GitHub push', () => {
  it('commits a site and pushes it to main, a branch, or as a version tag', async () => {
    const { execFileSync } = await import('child_process')
    const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { publish, siteStatus, nextVersion } = await import('../src/main/github')
    const root = mkdtempSync(join(tmpdir(), 'lm-git-'))
    const remote = join(root, 'remote.git')
    execFileSync('git', ['init', '--bare', '-b', 'main', remote])
    const site = join(root, 'radio')
    mkdirSync(join(site, 'node_modules'), { recursive: true })
    writeFileSync(join(site, 'index.php'), 'v1')
    writeFileSync(join(site, '.env'), 'SECRET=1')
    writeFileSync(join(site, 'node_modules', 'x.js'), 'x')
    const auth = { config: [], user: { name: 'Ada', email: '1+ada@users.noreply.github.com' } }
    const show = (ref: string, f: string): string => execFileSync('git', ['--git-dir', remote, 'show', `${ref}:${f}`]).toString()
    const files = (ref: string): string[] => execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', ref]).toString().trim().split('\n')

    expect((await siteStatus(site)).isRepo).toBe(false)
    const first = await publish(site, remote, { mode: 'main', message: 'First version' }, auth)
    expect(first).toMatchObject({ mode: 'main', ref: 'main' })
    expect(files('main').sort()).toEqual(['.gitignore', 'index.php'])
    expect(readFileSync(join(site, '.gitignore'), 'utf8')).toContain('.env')
    expect(execFileSync('git', ['--git-dir', remote, 'log', '-1', '--format=%an <%ae> %s', 'main']).toString().trim()).toBe('Ada <1+ada@users.noreply.github.com> First version')

    writeFileSync(join(site, 'index.php'), 'v2 try')
    await publish(site, remote, { mode: 'branch', message: 'Try a header', branch: 'feature/header' }, auth)
    expect(show('feature/header', 'index.php')).toBe('v2 try')
    expect(show('main', 'index.php')).toBe('v1')

    const st = await siteStatus(site)
    expect(st).toMatchObject({ isRepo: true, branch: 'main', changed: 0 })
    expect(nextVersion(st.lastTag)).toBe('v1.0.0')
    const tagged = await publish(site, remote, { mode: 'tag', message: 'Release', tag: 'v1.0.0', notes: 'First release' }, auth)
    expect(tagged.ref).toBe('v1.0.0')
    expect(show('v1.0.0', 'index.php')).toBe('v2 try')
    expect(nextVersion((await siteStatus(site)).lastTag)).toBe('v1.0.1')

    // Someone else pushes to main; a normal push is refused, "replace" overwrites.
    const other = join(root, 'other')
    execFileSync('git', ['clone', '-q', remote, other])
    writeFileSync(join(other, 'index.php'), 'theirs')
    execFileSync('git', ['-C', other, '-c', 'user.name=B', '-c', 'user.email=b@x', 'commit', '-qam', 'theirs'])
    execFileSync('git', ['-C', other, 'push', '-q', 'origin', 'main'])
    writeFileSync(join(site, 'index.php'), 'mine')
    await expect(publish(site, remote, { mode: 'main', message: 'mine' }, auth)).rejects.toThrow(/Replace what is on GitHub/)
    await publish(site, remote, { mode: 'main', message: 'mine', replace: true }, auth)
    expect(show('main', 'index.php')).toBe('mine')

    await expect(publish(site, remote, { mode: 'branch', message: 'x', branch: '../evil' }, auth)).rejects.toThrow(/branch a name/)

    // Pull brings in what someone else pushed, and refuses while there are unpushed changes.
    const { pull } = await import('../src/main/github')
    execFileSync('git', ['-C', site, 'branch', '--set-upstream-to=origin/main', 'main'])
    execFileSync('git', ['-C', other, 'fetch', '-q', 'origin'])
    execFileSync('git', ['-C', other, 'reset', '-q', '--hard', 'origin/main'])
    writeFileSync(join(other, 'about.php'), 'about')
    execFileSync('git', ['-C', other, 'add', '.'])
    execFileSync('git', ['-C', other, '-c', 'user.name=B', '-c', 'user.email=b@x', 'commit', '-qm', 'about page'])
    execFileSync('git', ['-C', other, 'push', '-q', 'origin', 'main'])
    expect(await pull(site, auth)).toBe('Brought in 1 new commit.')
    expect(readFileSync(join(site, 'about.php'), 'utf8')).toBe('about')
    expect(await pull(site, auth)).toBe('Already up to date.')
    writeFileSync(join(site, 'index.php'), 'unsaved')
    await expect(pull(site, auth)).rejects.toThrow(/not pushed yet/)
  })
})

describe('downloads while the project is private', () => {
  it('reads releases from the private repository with the GitHub sign-in, and downloads its files with it', async () => {
    const { vi } = await import('vitest')
    const dist = await import('../src/main/distribution')
    const calls: { url: string; auth?: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init: { headers?: Record<string, string> }) => {
      calls.push({ url, auth: init?.headers?.Authorization })
      const authed = init?.headers?.Authorization === 'Bearer tok'
      if (url.includes('laramac-releases')) return new Response('{}', { status: 404 })
      if (url.endsWith('/releases?per_page=50')) {
        return authed
          ? Response.json([{ tag_name: 'v0.12.0', assets: [{ name: 'SHA256SUMS.txt', browser_download_url: 'https://github.com/x/SHA256SUMS.txt', url: 'https://api.github.com/assets/9' }] }])
          : new Response('{}', { status: 404 })
      }
      if (url === 'https://api.github.com/assets/9') return new Response(authed ? 'sums' : 'no', { status: authed ? 200 : 404 })
      return new Response('public file')
    })
    try {
      dist.setDownloadToken(() => null)
      await expect(dist.releasesApi('releases?per_page=50')).rejects.toThrow(/could not find/)
      dist.setDownloadToken(() => 'tok')
      const rel = await dist.releasesApi<{ tag_name: string }[]>('releases?per_page=50')
      expect(rel[0].tag_name).toBe('v0.12.0')
      expect(await (await dist.openAsset('https://github.com/x/SHA256SUMS.txt')).text()).toBe('sums')
      expect(await (await dist.openAsset('https://cdn.mysql.com/x.tar.gz')).text()).toBe('public file')
      // The token never goes to other hosts.
      expect(calls.filter((c) => c.auth && !c.url.startsWith('https://api.github.com/')).length).toBe(0)
    } finally {
      vi.unstubAllGlobals()
      dist.setDownloadToken(() => null)
    }
  })
})
