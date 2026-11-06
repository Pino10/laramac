import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import http from 'http'
import { createRequire } from 'module'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { onRunEvent, resolveArgv, startRun } from '../src/main/cmdrun'
import { cleanSaved, findCommands, isDue, listFolders, runnerFor, splitCommand } from '../src/main/commands'
import { PROFILE_NAME, xdebugIni } from '../src/main/configgen'
import { aiLaunch, checksPackage, IDE_EXTENSIONS, ideSettings, workbenchCss } from '../src/main/idecore'
import { accentBuild, themeJson } from '../src/main/idetheme'
import { boostState, BOOST_COMMANDS } from '../src/main/phpdev'
import { listProfiles, parseCachegrind, profileFile, profileHost, readProfile } from '../src/main/profiler'
import { owaspChecklist, owaspCategory } from '../src/main/seckit/owasp'

const req = createRequire(import.meta.url)
const lib = req('../code-app/lib.js') as {
  readLaunch: (text: string, exists?: (p: string) => boolean) => { ai: { servers: { name: string; provider: string; baseUrl: string; model: string }[]; freellm: { baseUrl: string; models: string[] } | null } } | null
  readAi: (ai: unknown) => { servers: { name: string; provider: string; baseUrl: string; model: string }[]; freellm: { baseUrl: string; models: string[] } | null }
  continueConfig: (ai: unknown, relay: { port: number; token: string } | null) => string
  relayHandler: (o: { base: string; key: string; token: string }) => http.RequestListener
}
const ext = req('../src/main/idext/extension.cjs') as {
  parseRoutes: (t: string) => { method: string; uri: string; name: string; action: string; middleware: string[]; path: string | null }[] | null
  actionFile: (root: string, action: string) => { file: string; method: string } | null
  projectScripts: (root: string) => { kind: string; name: string; command: string }[]
}
const fx = (f: string): string => readFileSync(join(__dirname, 'fixtures', 'v28', f), 'utf8')
const tmp = (): string => mkdtempSync(join(tmpdir(), 'v28-'))

describe('Commands on a site', () => {
  const site = tmp()
  mkdirSync(join(site, 'tools'), { recursive: true })
  mkdirSync(join(site, 'scripts', 'deploy'), { recursive: true })
  mkdirSync(join(site, 'node_modules', 'x'), { recursive: true })
  mkdirSync(join(site, 'video', 'clips'), { recursive: true })
  writeFileSync(join(site, 'tools', 'make_film.py'), '#!/usr/bin/env python3\nprint("film")\n')
  writeFileSync(join(site, 'scripts', 'deploy', 'go.sh'), '#!/bin/bash\necho go\n')
  writeFileSync(join(site, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } }))
  writeFileSync(join(site, 'pnpm-lock.yaml'), '')
  writeFileSync(join(site, 'composer.json'), JSON.stringify({ scripts: { test: 'phpunit', 'post-install-cmd': 'x' } }))
  writeFileSync(join(site, 'Makefile'), 'build:\n\techo b\n.PHONY: build\nclean:\n\trm -rf x\n')

  it('finds scripts in any folder, plus package.json, composer and Makefile', () => {
    const found = findCommands(site)
    const names = found.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['tools/make_film.py', 'scripts/deploy/go.sh', 'pnpm run dev', 'pnpm run build', 'composer run test', 'make clean']))
    expect(names.some((n) => n.includes('post-install-cmd'))).toBe(false)
    expect(found.find((c) => c.name === 'tools/make_film.py')?.argv).toEqual(['python3', 'tools/make_film.py'])
    expect(found.find((c) => c.name === 'pnpm run dev')?.argv).toEqual(['pnpm', 'run', 'dev'])
    expect(runnerFor('x.rb', '')).toBe('ruby')
    expect(runnerFor('x', '#!/usr/bin/env node')).toBe('node')
  })
  it('lists the folders to run in, without node_modules', () => {
    const f = listFolders(site)
    expect(f).toEqual(expect.arrayContaining(['tools', 'scripts', 'scripts/deploy', 'video', 'video/clips']))
    expect(f.some((x) => x.startsWith('node_modules'))).toBe(false)
  })
  it('splits a command like a shell would, but refuses shell tricks', () => {
    expect(splitCommand('python3 tools/make_film.py --from-clips')).toEqual(['python3', 'tools/make_film.py', '--from-clips'])
    expect(splitCommand(`php artisan tinker --execute="echo 'hi there';"`.replace(';', ''))).toEqual(['php', 'artisan', 'tinker', "--execute=echo 'hi there'"])
    expect(splitCommand('ls my\\ folder')).toEqual(['ls', 'my folder'])
    for (const bad of ['ls | wc', 'a && b', 'echo $HOME', 'rm x; ls', 'cat < x', 'echo `id`']) expect(() => splitCommand(bad)).toThrow(/need a shell/)
  })
  it('runs Python through uv in any folder, with that folder’s requirements', () => {
    const has = (files: string[]) => (p: string) => files.includes(p)
    expect(resolveArgv(['python3', 'tools/make_film.py', '--from-clips'], '', '/uv', '/s', has(['/s/tools/requirements.txt']))).toEqual(['/uv', 'run', '--no-project', '--with-requirements', '/s/tools/requirements.txt', 'python', 'tools/make_film.py', '--from-clips'])
    expect(resolveArgv(['python3.12', 'a.py'], '', '/uv', '/s/video', has([]))).toEqual(['/uv', 'run', '--no-project', '--python', '3.12', 'python', 'a.py'])
    expect(resolveArgv(['python', 'main.py'], '', '/uv', '/s/app', has(['/s/app/pyproject.toml']))).toEqual(['/uv', 'run', 'python', 'main.py'])
    expect(resolveArgv(['python3', 'a.py'], '', null, '/s')).toEqual(['python3', 'a.py'])
    expect(resolveArgv(['php', 'artisan'], '', '/uv', '/s')).toEqual(['php', 'artisan'])
  })
  it('really runs a Python script through uv in a chosen folder', async () => {
    let uv = ''
    try {
      uv = execFileSync('which', ['uv'], { encoding: 'utf8' }).trim()
    } catch {
      return
    }
    writeFileSync(join(site, 'video', 'clips', 'hello.py'), 'import sys\nprint("hello from", sys.argv[1])\n')
    const done = new Promise<{ out: string; code: number | null }>((resolve) => {
      let out = ''
      onRunEvent((e) => {
        if (e.kind === 'data') out += e.data
        else resolve({ out, code: e.code })
      })
    })
    const argv = resolveArgv(['python3', 'hello.py', 'clips'], process.env.PATH, uv, join(site, 'video', 'clips'))
    startRun({ site: 'demo', name: 'hello', argv, cwd: join(site, 'video', 'clips'), env: { ...process.env, UV_OFFLINE: '1' } })
    const r = await done
    expect(r.out).toContain('hello from clips')
    expect(r.code).toBe(0)
  }, 120_000)
  it('checks saved commands and schedules', () => {
    const [c] = cleanSaved([{ argv: ['php', 'artisan', 'schedule:run'], cwd: '/', schedule: { every: 'minutes', minutes: 0.5 } }])
    expect(c.schedule).toEqual({ every: 'minutes', minutes: 1 })
    expect(() => cleanSaved([{ argv: ['ls'], cwd: '../etc' }])).toThrow(/inside the site/)
    expect(cleanSaved([{ argv: ['x'], schedule: { every: 'daily', at: '2:05' } }])[0].schedule).toEqual({ every: 'daily', at: '02:05' })
    const now = new Date(2026, 10, 5, 2, 10).getTime()
    expect(isDue({ every: 'daily', at: '02:05' }, 0, now)).toBe(true)
    expect(isDue({ every: 'daily', at: '02:05' }, now - 60_000, now)).toBe(false)
    expect(isDue({ every: 'minutes', minutes: 5 }, now - 4 * 60_000, now)).toBe(false)
    expect(isDue({ every: 'minutes', minutes: 5 }, now - 5 * 60_000, now)).toBe(true)
  })
})

describe('The profiler', () => {
  it('reads a real Xdebug 3 profile: own time, time with calls, calls and files', () => {
    const r = parseCachegrind(fx('cachegrind.out').split('\n'))
    expect(r.creator).toMatch(/^xdebug 3\./)
    expect(r.totalMs).toBeGreaterThan(10)
    const by = Object.fromEntries(r.functions.map((f) => [f.name, f]))
    expect(by['usleep()']).toMatchObject({ internal: true, file: '', calls: 1 })
    expect(by['usleep()'].selfMs).toBeGreaterThan(14)
    expect(r.functions[0].name).toBe('usleep()')
    expect(by['render()'].inclMs).toBeGreaterThanOrEqual(by['usleep()'].selfMs)
    expect(by['App\\Models\\Post::all()']).toMatchObject({ internal: false, calls: 1 })
    expect(by['App\\Models\\Post::all()'].file).toMatch(/lib\.php$/)
    expect(by['hash()'].calls).toBe(300)
    // fib(8) calls itself: 67 calls in all, and its time with calls is counted once.
    expect(by['fib()'].calls).toBe(67)
    expect(by['fib()'].inclMs).toBeLessThan(r.totalMs)
    expect(by['{main}'].inclMs).toBeCloseTo(r.totalMs, 0)
  })
  it('streams a profile from disk', async () => {
    const r = await readProfile(join(__dirname, 'fixtures', 'v28', 'cachegrind.out'))
    expect(r.count).toBe(parseCachegrind(fx('cachegrind.out').split('\n')).count)
  })
  it('names profiles by host and finds a site’s own', () => {
    expect(profileHost('cachegrind.out.shop.test.1762380000_123456_orders_12')).toEqual({ host: 'shop.test', at: 1762380000123, path: '/orders/12' })
    expect(profileHost('cachegrind.out.shop.test.1762380000_123456')?.path).toBe('/')
    expect(profileHost('notes.txt')).toBeNull()
    const dir = tmp()
    for (const f of ['cachegrind.out.shop.test.1762380000_1', 'cachegrind.out.blog.test.1762380001_1', 'cachegrind.out.www.shop.test.1762380002_1_x']) writeFileSync(join(dir, f), 'x')
    expect(listProfiles(['shop.test', 'www.shop.test'], dir).map((p) => p.file)).toEqual(['cachegrind.out.www.shop.test.1762380002_1_x', 'cachegrind.out.shop.test.1762380000_1'])
    expect(profileFile('../cachegrind.out.shop.test.1762380000_1', dir)).toBeNull()
    expect(profileFile('cachegrind.out.shop.test.1762380000_1', dir)).toBe(join(dir, 'cachegrind.out.shop.test.1762380000_1'))
  })
  it('profiles only on request, and the debugger still works alone', () => {
    const both = xdebugIni('/x/xdebug.so', { debug: true, profile: true, outputDir: '/p' })
    expect(both).toContain('xdebug.mode = debug,profile')
    expect(both).toContain('xdebug.start_with_request = trigger')
    expect(both).toContain(`xdebug.profiler_output_name = ${PROFILE_NAME}`)
    const debug = xdebugIni('/x/xdebug.so', { debug: true, profile: false, outputDir: '' })
    expect(debug).toContain('xdebug.start_with_request = yes')
    expect(debug.join('\n')).not.toContain('output_dir')
  })
  it('the ini really profiles a request with the cookie and not without (real Xdebug)', () => {
    let so = ''
    try {
      so = execFileSync('php', ['-r', 'echo ini_get("extension_dir");'], { encoding: 'utf8' }) + '/xdebug.so'
    } catch {
      return
    }
    if (!existsSync(so)) return
    const dir = tmp()
    const ini = join(dir, 'php.ini')
    writeFileSync(ini, xdebugIni(so, { debug: false, profile: true, outputDir: dir }).join('\n').replace(/^zend_extension.*$/m, ''))
    const script = join(dir, 'a.php')
    writeFileSync(script, '<?php echo strlen(str_repeat("x", 10));')
    const run = (env: Record<string, string>): void => void execFileSync('php', ['-c', ini, '-d', 'xdebug.mode=profile', script], { env: { ...process.env, ...env } })
    run({})
    expect(listProfilesIn(dir)).toBe(0)
    run({ XDEBUG_TRIGGER: '1' })
    expect(listProfilesIn(dir)).toBe(1)
  })
})
const listProfilesIn = (dir: string): number => require('fs').readdirSync(dir).filter((f: string) => f.startsWith('cachegrind.out')).length

describe('Laravel Boost', () => {
  it('knows when Boost is in a Laravel project, and its version from composer.lock', () => {
    const d = tmp()
    expect(boostState(d)).toEqual({ laravel: false, installed: false, version: null })
    writeFileSync(join(d, 'artisan'), '')
    writeFileSync(join(d, 'composer.json'), JSON.stringify({ 'require-dev': { 'laravel/boost': '^1.8' } }))
    expect(boostState(d)).toEqual({ laravel: true, installed: true, version: null })
    writeFileSync(join(d, 'composer.lock'), JSON.stringify({ packages: [], 'packages-dev': [{ name: 'laravel/boost', version: 'v1.8.2' }] }))
    expect(boostState(d).version).toBe('1.8.2')
    expect(BOOST_COMMANDS.install).toBe('composer require laravel/boost --dev && php artisan boost:install')
  })
})

describe('OWASP in Laramac', () => {
  it('uses the reviewer’s OWASP line, and a web scan’s CWE', () => {
    expect(owaspCategory({ title: 'Orders can be read by anyone', text: 'A01 Broken Access Control, CWE-639\nThe show method…' })).toBe('A01')
    const l = owaspChecklist([{ title: 'Missing X-Frame-Options', severity: 'info', cwe: ['cwe-1021'] }], ['web-scan', 'headers'])
    expect(l.items.find((i) => i.id === 'A02')?.status).toBe('checked')
    expect(l.items.find((i) => i.id === 'A06')?.status).toBe('not-checked')
  })
})

describe('Laramac Code: AI chat', () => {
  it('launch.json gets the model servers and the Free LLM API address, never a key', () => {
    const ai = aiLaunch({
      llm: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3' },
      servers: [
        { name: 'Work GPU', baseUrl: 'http://10.0.0.5:8000/v1', api: 'openai', hasKey: false },
        { name: 'Paid', baseUrl: 'https://api.example.com/v1', api: 'openai', hasKey: true },
        { name: 'Claude', baseUrl: 'https://api.anthropic.com', api: 'anthropic', hasKey: true }
      ],
      freellm: { baseUrl: 'http://127.0.0.1:31415/v1' },
      freeModels: ['auto', 'auto:fast']
    })
    expect(ai.servers.map((s) => s.name)).toEqual(['LM Studio', 'Ollama'])
    expect(ai.freellm).toEqual({ baseUrl: 'http://127.0.0.1:31415/v1', models: ['auto', 'auto:fast'] })
    const withModel = aiLaunch({ llm: { baseUrl: 'http://10.0.0.5:8000/v1', model: 'gpt-oss' }, servers: [], freellm: null, freeModels: [] })
    expect(withModel.servers[2]).toEqual({ name: 'Local model', provider: 'openai', baseUrl: 'http://10.0.0.5:8000/v1', model: 'gpt-oss' })
  })
  it('the app reads it safely: no key over plain http to another machine, odd names dropped', () => {
    const ai = lib.readAi({ servers: [{ name: 'LM Studio', provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1' }, { name: 'bad\nname', provider: 'openai', baseUrl: 'http://x' }, { name: 'X', provider: 'shell', baseUrl: 'http://x' }], freellm: { baseUrl: 'http://evil.example.com/v1' } })
    expect(ai.servers.map((s) => s.name)).toEqual(['LM Studio'])
    expect(ai.freellm).toBeNull()
    expect(lib.readAi({ freellm: { baseUrl: 'https://free.example.com/v1', models: ['auto', 'bad model'] } }).freellm).toEqual({ baseUrl: 'https://free.example.com/v1', models: ['auto'] })
  })
  it('writes a Continue config with the relay’s token, not the key', () => {
    const ai = lib.readAi({ servers: [{ name: 'LM Studio', provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1' }, { name: 'Ollama', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }], freellm: { baseUrl: 'http://127.0.0.1:31415/v1', models: ['auto'] } })
    const y = parseYaml(lib.continueConfig(ai, { port: 5555, token: 'tok' })) as { schema: string; models: { name: string; provider: string; model: string; apiBase: string; apiKey?: string; roles: string[]; capabilities?: string[] }[] }
    expect(y.schema).toBe('v1')
    expect(y.models.map((m) => [m.name, m.provider, m.model, m.apiBase])).toEqual([
      ['Free LLM API (auto)', 'openai', 'auto', 'http://127.0.0.1:5555/v1/'],
      ['LM Studio', 'lmstudio', 'AUTODETECT', 'http://127.0.0.1:1234/v1/'],
      ['Ollama', 'ollama', 'AUTODETECT', 'http://127.0.0.1:11434']
    ])
    expect(y.models[0]).toMatchObject({ apiKey: 'tok', capabilities: ['tool_use'] })
    expect(y.models.every((m) => m.roles.includes('chat') && m.roles.includes('edit'))).toBe(true)
    // Without a key in the Keychain there is no relay, and no Free LLM entry.
    expect((parseYaml(lib.continueConfig(ai, null)) as { models: unknown[] }).models).toHaveLength(2)
  })
  it('the relay adds the key, streams the answer, and refuses everything else', async () => {
    const seen: { auth?: string; path?: string; body: string }[] = []
    const upstream = http.createServer((rq, rs) => {
      let body = ''
      rq.on('data', (c) => (body += c))
      rq.on('end', () => {
        seen.push({ auth: rq.headers.authorization, path: rq.url, body })
        rs.writeHead(200, { 'content-type': 'text/event-stream', 'set-cookie': 'x=1' })
        rs.write('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')
        setTimeout(() => rs.end('data: [DONE]\n\n'), 20)
      })
    })
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()))
    const up = (upstream.address() as AddressInfo).port
    const relay = http.createServer(lib.relayHandler({ base: `http://127.0.0.1:${up}/v1`, key: 'freellmapi-real', token: 'tok' }))
    await new Promise<void>((r) => relay.listen(0, '127.0.0.1', () => r()))
    const rp = (relay.address() as AddressInfo).port
    const call = (path: string, headers: Record<string, string>, method = 'POST'): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> =>
      new Promise((resolve, reject) => {
        const r = http.request({ host: '127.0.0.1', port: rp, path, method, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
          let b = ''
          res.on('data', (c) => (b += c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }))
        })
        r.on('error', reject)
        r.end(method === 'POST' ? '{"model":"auto","messages":[]}' : undefined)
      })
    const ok = await call('/v1/chat/completions', { authorization: 'Bearer tok' })
    expect(ok.status).toBe(200)
    expect(ok.body).toContain('"Hi"')
    expect(ok.body).toContain('[DONE]')
    expect(ok.headers['set-cookie']).toBeUndefined()
    expect(seen[0]).toEqual({ auth: 'Bearer freellmapi-real', path: '/v1/chat/completions', body: '{"model":"auto","messages":[]}' })
    expect((await call('/v1/chat/completions', { authorization: 'Bearer nope' })).status).toBe(401)
    expect((await call('/v1/chat/completions', { authorization: 'Bearer tok', origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/v1/chat/completions', { authorization: 'Bearer tok', host: 'evil.example' })).status).toBe(403)
    expect((await call('/admin', { authorization: 'Bearer tok' })).status).toBe(404)
    expect((await call('/v1/../admin', { authorization: 'Bearer tok' })).status).toBe(404)
    expect((await call('/v1/models', { authorization: 'Bearer tok' }, 'DELETE')).status).toBe(405)
    expect(seen).toHaveLength(1)
    relay.close()
    upstream.close()
  })
})

describe('Laramac Code: look, languages and Laravel', () => {
  it('ships Continue, the Laravel extension, test runners and the main languages', () => {
    const ids = IDE_EXTENSIONS.map((e) => e.id)
    for (const id of ['continue.continue', 'laravel.vscode-laravel', 'recca0120.vscode-phpunit', 'vitest.explorer', 'ms-python.python', 'detachhead.basedpyright', 'golang.go', 'rust-lang.rust-analyzer', 'redhat.java', 'miguelsolorio.fluent-icons', 'pkief.material-icon-theme']) expect(ids).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
    const s = ideSettings({ font: 'system', fontSize: 14, phpPath: null, phpVersion: null, appearance: 'dark' })
    expect(s.managed['continue.telemetryEnabled']).toBe(false)
    expect(s.managed['python.languageServer']).toBe('None')
    expect(s.defaults['workbench.productIconTheme']).toBe('fluent-icons')
  })
  it('islands: the parts float on a deeper base', () => {
    // Aurora (the default) floats the parts as rounded cards; Terminal keeps them as hard-edged panels.
    expect(workbenchCss({ uiFont: 'system' })).toContain('clip-path:inset(0 7px 8px 7px round 12px)')
    expect(workbenchCss({ uiFont: 'system', look: 'terminal' })).toContain('clip-path:inset(0 1px 1px 1px round 0)')
    const dark = themeJson('dark', 'blue') as { colors: Record<string, string> }
    expect(dark.colors['titleBar.activeBackground']).toBe('#070913')
    expect(dark.colors['sideBar.background']).toBe(dark.colors['editor.background'])
    expect(dark.colors['sideBar.border']).toBe('#00000000')
    expect(accentBuild('blue')).toBeGreaterThanOrEqual(30)
    expect(accentBuild('blue', 'terminal')).not.toBe(accentBuild('blue', 'aurora'))
  })
  it('the Laravel panel reads real route:list output and finds the controller', () => {
    const routes = ext.parseRoutes(fx('route-list.json'))!
    expect(routes.length).toBeGreaterThan(0)
    // Real output from Laravel 13 (php artisan route:list --json).
    expect(routes.find((r) => r.uri === '/')).toMatchObject({ method: 'GET', action: 'Closure', path: 'routes/web.php:5' })
    const show = routes.find((r) => r.name === 'orders.show')!
    expect(show).toMatchObject({ method: 'POST', uri: '/orders/{id}', middleware: ['web', 'auth'] })
    expect(ext.actionFile('/s', show.action)).toEqual({ file: '/s/app/Http/Controllers/OrderController.php', method: 'show' })
    expect(routes.find((r) => r.name === 'storage.local')?.path).toMatch(/^vendor\/laravel\/framework\/.+:\d+$/)
    expect(ext.actionFile('/s', 'App\\Http\\Controllers\\OrderController@show')).toEqual({ file: '/s/app/Http/Controllers/OrderController.php', method: 'show' })
    expect(ext.parseRoutes('not json')).toBeNull()
  })
  it('lists a project’s own scripts with the right package manager', () => {
    const d = tmp()
    writeFileSync(join(d, 'composer.json'), JSON.stringify({ scripts: { dev: 'x', 'post-update-cmd': 'y' } }))
    writeFileSync(join(d, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }))
    writeFileSync(join(d, 'bun.lock'), '')
    expect(ext.projectScripts(d)).toEqual([
      { kind: 'composer', name: 'dev', command: 'composer run dev' },
      { kind: 'bun', name: 'build', command: 'bun run build' }
    ])
    const pkg = checksPackage('1.0.0') as { contributes: { views: Record<string, { id: string }[]>; configuration: { properties: Record<string, unknown> } } }
    expect(pkg.contributes.views.explorer[0].id).toBe('laramac.project')
    expect(pkg.contributes.configuration.properties['laramac.startPage']).toBeTruthy()
  })
})

