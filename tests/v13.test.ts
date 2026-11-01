import { spawn, spawnSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import http from 'http'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { dirs } from '../src/main/paths'
import { generateApacheConf, generateNginxConf, type SiteConf } from '../src/main/configgen'
import { laravelEnv, resolveOptions, starterById, starterContext, STARTERS, fillPort, xcodeProjectSpec } from '../src/shared/starters'
import { parseVersion, pickDotnet, pickGo, pickNode, shaFor } from '../src/main/runtimes'
import { applyPatch, expandCommand } from '../src/main/starterrun'
import { waitForPort, isPortOpen } from '../src/main/process'

const which = (b: string): boolean => spawnSync('which', [b]).status === 0
const APACHE = ['apache2', 'httpd'].find(which)
const MODULES = ['/usr/lib/apache2/modules', '/opt/homebrew/opt/httpd/lib/httpd/modules'].find(existsSync)
const ONLINE = spawnSync('npm', ['view', 'create-vite', 'version'], { encoding: 'utf8', timeout: 30000 }).status === 0

describe('starter catalog', () => {
  it('has unique ids, real categories, docs and at least one step for every starter', () => {
    const ids = new Set<string>()
    for (const s of STARTERS) {
      expect(ids.has(s.id), s.id).toBe(false)
      ids.add(s.id)
      expect(s.docs).toMatch(/^https:\/\//)
      const ctx = starterContext('My Shop', 'test')
      const steps = s.steps(ctx, resolveOptions(s, {}))
      expect(steps.length, s.id).toBeGreaterThan(0)
      for (const step of steps) if ('run' in step) expect(step.run.every((a) => typeof a === 'string' && a.length > 0), s.id).toBe(true)
      const dev = s.dev?.(resolveOptions(s, {}))
      if (dev?.proxy) expect(JSON.stringify(dev), s.id).toContain('{port}')
    }
    expect(STARTERS.length).toBeGreaterThanOrEqual(30)
  })

  it('only passes real choices to commands', () => {
    const react = starterById('react')!
    expect(resolveOptions(react, { lang: 'js', compiler: 'on', evil: '; rm -rf /' })).toEqual({ lang: 'js', compiler: 'on' })
    expect(resolveOptions(react, { lang: '--template=../../x' })).toEqual({ lang: 'ts', compiler: 'off' })
    const run = react.steps(starterContext('a', 'test'), { lang: 'ts', compiler: 'off' })[0]
    expect('run' in run && run.run).toContain('react-ts')
  })

  it('makes names safe for code and domains', () => {
    expect(starterContext('my-cool_app.v2', 'test')).toMatchObject({ domain: 'my-cool-app-v2.test', db: 'my_cool_app_v2', ident: 'MyCoolAppV2' })
    expect(starterContext('3d-viewer', 'localhost').ident).toBe('App3dViewer')
    expect(fillPort(['--port', '{port}'], 5170)).toEqual(['--port', '5170'])
    expect(fillPort({ PORT: '{port}' }, 5171)).toEqual({ PORT: '5171' })
    expect(xcodeProjectSpec(starterContext('weather', 'test'), 'iOS')).toContain('PRODUCT_BUNDLE_IDENTIFIER: com.example.weather')
  })

  it('points a Laravel .env at MySQL, PostgreSQL or SQLite', () => {
    const env = 'APP_URL=http://localhost\nDB_CONNECTION=sqlite\n# DB_HOST=127.0.0.1\n# DB_PORT=3306\n# DB_DATABASE=laravel\n# DB_USERNAME=root\n# DB_PASSWORD=\nMAIL_MAILER=log\n'
    const my = laravelEnv(env, 'mysql', 'shop', 'shop.test')
    expect(my).toContain('DB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_DATABASE=shop\nDB_USERNAME=root\nDB_PASSWORD=')
    expect(my).toContain('APP_URL=http://shop.test')
    expect(my).toContain('MAIL_PORT=1025')
    expect(laravelEnv(env, 'pgsql', 'shop', 'shop.test')).toContain('DB_PORT=5432\nDB_DATABASE=shop\nDB_USERNAME=postgres')
    const lite = laravelEnv(my, 'sqlite', 'shop', 'shop.test')
    expect(lite).toContain('DB_CONNECTION=sqlite')
    expect(lite).toContain('# DB_DATABASE=')
  })

  it('patches Next.js so name.test may load dev assets, and skips missing files', () => {
    const { www } = freshEnv()
    const file = join(www, 'next.config.ts')
    writeFileSync(file, 'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {\n  /* config options here */\n};\n\nexport default nextConfig;\n')
    const step = starterById('nextjs')!.steps(starterContext('shop', 'test'), { lang: 'ts', tailwind: 'yes' })[1]
    expect('patch' in step && applyPatch(file, step)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain("allowedDevOrigins: ['shop.test', '*.shop.test'],")
    expect('patch' in step && applyPatch(join(www, 'missing.ts'), step)).toBe(false)
  })

  it('runs composer and php through Laramac’s own PHP when it has one', () => {
    const php = { bin: '/x/php', ini: '/x/php.ini', composer: '/x/composer.phar' }
    expect(expandCommand(['composer', 'create-project', 'laravel/laravel', 'a'], php)).toEqual(['/x/php', '-c', '/x/php.ini', '/x/composer.phar', 'create-project', 'laravel/laravel', 'a'])
    expect(expandCommand(['php', 'artisan', 'migrate'], php)).toEqual(['/x/php', '-c', '/x/php.ini', 'artisan', 'migrate'])
    expect(expandCommand(['npm', 'install'], php)).toEqual(['npm', 'install'])
    expect(expandCommand(['composer', 'install'], null)).toEqual(['composer', 'install'])
  })
})

describe('runtime versions', () => {
  it('picks the newest LTS Node, stable Go and LTS .NET for this Mac', () => {
    const node = [
      { version: 'v25.1.0', lts: false as const, files: ['osx-arm64-tar'] },
      { version: 'v24.11.0', lts: 'Krypton', files: ['osx-arm64-tar', 'osx-x64-tar'] },
      { version: 'v22.21.0', lts: 'Jod', files: ['osx-arm64-tar'] }
    ]
    expect(pickNode(node, 'arm64')?.version).toBe('v24.11.0')
    const go = [
      { version: 'go1.26rc1', stable: false, files: [{ filename: 'go1.26rc1.darwin-arm64.tar.gz', os: 'darwin', arch: 'arm64', kind: 'archive', sha256: 'a' }] },
      { version: 'go1.25.3', stable: true, files: [{ filename: 'go1.25.3.darwin-arm64.tar.gz', os: 'darwin', arch: 'arm64', kind: 'archive', sha256: 'b' }, { filename: 'go1.25.3.darwin-arm64.pkg', os: 'darwin', arch: 'arm64', kind: 'installer', sha256: 'c' }] }
    ]
    expect(pickGo(go, 'arm64')).toEqual({ version: '1.25.3', filename: 'go1.25.3.darwin-arm64.tar.gz', sha256: 'b' })
    const dotnet = {
      'releases-index': [
        { 'channel-version': '10.0', 'latest-sdk': '10.0.100', 'release-type': 'lts', 'support-phase': 'active' },
        { 'channel-version': '9.0', 'latest-sdk': '9.0.306', 'release-type': 'sts', 'support-phase': 'active' },
        { 'channel-version': '8.0', 'latest-sdk': '8.0.415', 'release-type': 'lts', 'support-phase': 'active' }
      ]
    }
    expect(pickDotnet(dotnet)).toEqual({ channel: '10.0', sdk: '10.0.100' })
  })

  it('reads checksums and version output', () => {
    const sums = `${'a'.repeat(64)}  node-v24.11.0-darwin-arm64.tar.gz\n${'b'.repeat(64)}  node-v24.11.0-darwin-x64.tar.gz\n`
    expect(shaFor(sums, 'node-v24.11.0-darwin-x64.tar.gz')).toBe('b'.repeat(64))
    expect(shaFor(sums, 'other.tar.gz')).toBeNull()
    expect(parseVersion('go', 'go version go1.25.3 darwin/arm64')).toBe('1.25.3')
    expect(parseVersion('python', 'uv 0.9.7 (Homebrew 2025-10-30)')).toBe('0.9.7')
    expect(parseVersion('swift', 'swift-driver version: 1.127.14.1 Apple Swift version 6.2 (swiftlang-6.2.0.19.9)')).toBe('6.2')
    expect(parseVersion('node', 'v24.11.0')).toBe('24.11.0')
  })
})

describe('dev server proxy config', () => {
  const site: SiteConf = { domain: 'shop.test', docRoot: '/x', kind: 'node', phpPort: null, secure: false, aliases: ['shop.localhost'], proxyTo: 'http://127.0.0.1:5170' }
  it('Nginx passes name.test through with WebSockets and a friendly page when it is down', () => {
    const conf = generateNginxConf({ sites: [site], extras: [], httpPort: 80, httpsPort: 443, pidFile: 'p', errorLog: 'e', accessLog: 'a', fastcgiParamsFile: 'f', tempDir: 't' })
    expect(conf).toContain('proxy_pass http://127.0.0.1:5170;')
    expect(conf).toContain('proxy_set_header Host 127.0.0.1:5170;')
    expect(conf).toContain('proxy_set_header Upgrade $http_upgrade;')
    expect(conf).toContain('shop.test is not running')
    expect(conf).not.toContain('root "/x"')
  })
  it('Apache does the same and keeps it private to this Mac', () => {
    const conf = generateApacheConf({ sites: [site], extras: [], port: 80, httpsPort: 443, modulesDir: '/m', pidFile: 'p', errorLog: 'e', accessLog: 'a', serverRoot: '/s' })
    expect(conf).toContain('ProxyPass / http://127.0.0.1:5170/ upgrade=websocket')
    expect(conf).toContain('ServerAlias *.shop.test shop.localhost')
    expect(conf).toContain('mod_proxy_http.so')
    expect(conf).toMatch(/<Location \/>\s+Require local/)
    expect(conf).not.toContain('DocumentRoot "/x"')
  })
})

/** Starts Apache in front of the given sites and returns a function to request through it. */
async function apacheFront(sites: SiteConf[], port: number): Promise<{ get: (host: string, path?: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>; stop: () => void }> {
  const conf = generateApacheConf({
    sites,
    extras: [],
    port,
    httpsPort: port + 400,
    modulesDir: MODULES!,
    mimeTypesFile: existsSync('/etc/mime.types') ? '/etc/mime.types' : undefined,
    pidFile: join(dirs.run(), 'httpd.pid'),
    errorLog: join(dirs.logs(), 'error.log'),
    accessLog: join(dirs.logs(), 'access.log'),
    serverRoot: dirs.run()
  })
    .split('\n')
    .filter((line) => {
      const m = /LoadModule \S+ "([^"]+)"/.exec(line)
      return !m || existsSync(m[1])
    })
    .join('\n')
  const file = join(dirs.conf(), 'httpd.conf')
  writeFileSync(file, conf)
  const check = spawnSync(APACHE!, ['-t', '-f', file], { encoding: 'utf8' })
  expect(check.stderr + check.stdout).toContain('Syntax OK')
  const httpd = spawn(APACHE!, ['-f', file, '-DFOREGROUND'], { stdio: 'ignore' })
  expect(await waitForPort(port, 10000)).toBe(true)
  const get = (host: string, path = '/', init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers: { Host: host, ...init.headers } }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }))
      })
      req.on('error', reject)
      if (init.body) req.write(init.body)
      req.end()
    })
  return { get, stop: () => httpd.kill() }
}

describe.skipIf(process.platform !== 'linux' || !APACHE || !MODULES || !ONLINE)('starters, for real', () => {
  it(
    'React: creates with create-vite, runs Vite, serves it at name.test with live reload, and stops every process',
    async () => {
      const { www } = freshEnv()
      const { createFromStarter } = await import('../src/main/starterrun')
      const { scanSites } = await import('../src/main/sites')
      const { startDev, stopDev } = await import('../src/main/devservers')
      const { getSettings } = await import('../src/main/settings')
      const { webconfSites } = await import('./v13-helpers')

      const { devPort } = await createFromStarter({ starter: 'react', name: 'shop-ui', options: { lang: 'ts' }, start: false, git: true })
      expect(devPort).toBeGreaterThanOrEqual(5170)
      expect(existsSync(join(www, 'shop-ui', 'node_modules', 'vite'))).toBe(true)
      expect(existsSync(join(www, 'shop-ui', '.git'))).toBe(true)
      const site = scanSites().find((s) => s.name === 'shop-ui')!
      expect(site).toMatchObject({ kind: 'node', dev: { port: devPort, proxy: true, running: false } })

      const front = await apacheFront(webconfSites(scanSites()), 18171)
      try {
        // Before it starts, name.test explains instead of failing.
        const down = await front.get('shop-ui.test')
        expect(down.status).toBe(503)
        expect(down.body).toContain('shop-ui.test is not running')

        await startDev(site, getSettings().siteConfig['shop-ui'].dev!)
        const page = await front.get('shop-ui.test')
        expect(page.status).toBe(200)
        expect(page.body).toContain('<div id="root"></div>')
        const client = await front.get('shop-ui.test', '/@vite/client')
        const token = /wsToken = "([^"]+)"/.exec(client.body)?.[1] ?? /"([A-Za-z0-9_-]{8,})"/.exec(/wsToken[^;]+/.exec(client.body)?.[0] ?? '')?.[1]
        expect(token).toBeTruthy()

        // Vite's live reload WebSocket works through Apache.
        const ws = new WebSocket(`ws://127.0.0.1:18171/?token=${token}`, 'vite-hmr')
        const opened = await new Promise<boolean>((resolve) => {
          ws.onopen = () => resolve(true)
          ws.onerror = () => resolve(false)
          setTimeout(() => resolve(false), 8000)
        })
        ws.close()
        expect(opened).toBe(true)

        await stopDev('shop-ui')
        // npm started Vite; stopping must stop Vite too, freeing the port.
        await new Promise((r) => setTimeout(r, 500))
        expect(await isPortOpen(devPort!)).toBe(false)
      } finally {
        front.stop()
        await stopDev('shop-ui')
      }
    },
    300_000
  )

  it.skipIf(!which('uv'))(
    'FastAPI and Django: create with uv, serve at name.test, and Django accepts forms posted from name.test',
    async () => {
      freshEnv()
      const { createFromStarter } = await import('../src/main/starterrun')
      const { scanSites } = await import('../src/main/sites')
      const { startDev, stopAllDev } = await import('../src/main/devservers')
      const { getSettings } = await import('../src/main/settings')
      const { webconfSites } = await import('./v13-helpers')

      await createFromStarter({ starter: 'fastapi', name: 'insights', options: {}, start: false, git: false })
      await createFromStarter({ starter: 'django', name: 'portal', options: {}, start: false, git: false })
      const sites = scanSites()
      expect(sites.find((s) => s.name === 'insights')?.kind).toBe('python')
      const front = await apacheFront(webconfSites(sites), 18172)
      try {
        for (const name of ['insights', 'portal']) await startDev(sites.find((s) => s.name === name)!, getSettings().siteConfig[name].dev!)
        const health = await front.get('insights.test', '/api/health')
        expect(health.status).toBe(200)
        expect(JSON.parse(health.body)).toEqual({ ok: true })
        expect((await front.get('insights.test', '/docs')).body).toContain('swagger')

        const login = await front.get('portal.test', '/admin/login/')
        expect(login.status).toBe(200)
        const cookie = /csrftoken=([^;]+)/.exec(String(login.headers['set-cookie']))?.[1]
        const field = /name="csrfmiddlewaretoken" value="([^"]+)"/.exec(login.body)?.[1]
        expect(cookie && field).toBeTruthy()
        const post = await front.get('portal.test', '/admin/login/', {
          method: 'POST',
          headers: { Cookie: `csrftoken=${cookie}`, Origin: 'http://portal.test', Referer: 'http://portal.test/admin/login/', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `csrfmiddlewaretoken=${field}&username=nobody&password=wrong&next=/admin/`
        })
        // 200 with the form again (wrong password) proves CSRF accepted name.test; 403 would mean it refused.
        expect(post.status).toBe(200)
        expect(post.body).toContain('Please enter the correct username')
      } finally {
        front.stop()
        await stopAllDev()
      }
    },
    300_000
  )

  it.skipIf(!which('go'))(
    'Go: creates a module and serves it at name.test',
    async () => {
      freshEnv()
      const { createFromStarter } = await import('../src/main/starterrun')
      const { scanSites } = await import('../src/main/sites')
      const { startDev, stopAllDev } = await import('../src/main/devservers')
      const { getSettings } = await import('../src/main/settings')
      const { webconfSites } = await import('./v13-helpers')
      await createFromStarter({ starter: 'go', name: 'pinger', options: {}, start: false, git: false })
      const sites = scanSites()
      expect(sites.find((s) => s.name === 'pinger')?.kind).toBe('go')
      const front = await apacheFront(webconfSites(sites), 18173)
      try {
        await startDev(sites[0], getSettings().siteConfig.pinger.dev!)
        expect((await front.get('pinger.test')).body).toContain('pinger is running on Go')
        expect((await front.get('pinger.test', '/api/health')).body.trim()).toBe('{"ok":true}')
      } finally {
        front.stop()
        await stopAllDev()
      }
    },
    300_000
  )

  it.skipIf(!which('cargo'))(
    'Rust: cargo new with Axum compiles and serves at name.test',
    async () => {
      freshEnv()
      const { createFromStarter } = await import('../src/main/starterrun')
      const { scanSites } = await import('../src/main/sites')
      const { startDev, stopAllDev } = await import('../src/main/devservers')
      const { getSettings } = await import('../src/main/settings')
      const { webconfSites } = await import('./v13-helpers')
      await createFromStarter({ starter: 'rust', name: 'ferris', options: {}, start: false, git: false })
      const sites = scanSites()
      const front = await apacheFront(webconfSites(sites), 18174)
      try {
        await startDev(sites[0], getSettings().siteConfig.ferris.dev!)
        expect((await front.get('ferris.test', '/api/health')).body).toBe('{"ok":true}')
      } finally {
        front.stop()
        await stopAllDev()
      }
    },
    600_000
  )

  it.skipIf(!which('php') || !which('composer'))(
    'Laravel: composer create-project, SQLite, migrations, served by PHP rather than proxied',
    async () => {
      const { www } = freshEnv()
      const { createFromStarter } = await import('../src/main/starterrun')
      const { scanSites } = await import('../src/main/sites')
      await createFromStarter({ starter: 'laravel', name: 'radio', options: { kit: 'none', db: 'sqlite' }, start: false, git: false })
      const env = readFileSync(join(www, 'radio', '.env'), 'utf8')
      expect(env).toContain('APP_URL=http://radio.test')
      expect(env).toContain('DB_CONNECTION=sqlite')
      const status = spawnSync('php', ['artisan', 'migrate:status'], { cwd: join(www, 'radio'), encoding: 'utf8' })
      expect(status.stdout).toContain('create_users_table')
      const site = scanSites().find((s) => s.name === 'radio')!
      expect(site.kind).toBe('laravel')
      expect(site.dev).toBeUndefined()
    },
    600_000
  )

  it('cleans up a failed project so the name can be tried again', async () => {
    const { www } = freshEnv()
    const { createFromStarter } = await import('../src/main/starterrun')
    // An option that makes create-vite fail: the folder exists check happens first, so use an impossible template via a patched starter.
    const s = starterById('vite')!
    const original = s.steps
    s.steps = (c) => [{ label: 'Creating the folder', mkdir: true }, { label: 'Failing', run: ['node', '-e', 'process.exit(3)'], cwd: 'project' }]
    try {
      await expect(createFromStarter({ starter: 'vite', name: 'broken', options: {}, start: false, git: false })).rejects.toThrow(/failed/)
      expect(existsSync(join(www, 'broken'))).toBe(false)
    } finally {
      s.steps = original
    }
  })
})
