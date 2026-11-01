import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { inspect, inspectGit, runImport, type RunDeps } from '../src/main/importer'
import { envFromExample, frameworkName, inferDev, nodeInstallCommand, planSetup } from '../src/main/importsetup'

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
const put = (root: string, files: Record<string, string>): string => {
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(root, f, '..'), { recursive: true })
    writeFileSync(join(root, f), body)
  }
  return root
}
const deps = (ran: string[][]): RunDeps => ({
  update: () => undefined,
  ensureRunning: async () => undefined,
  clientFor: () => null,
  runStep: async (argv) => {
    ran.push(argv)
  },
  createDb: async () => true,
  dbPassword: () => 'pw'
})

describe('0.17 import for every project type', () => {
  it('plans a Laravel project from Git: .env, Composer, npm, build, migrations', () => {
    const dir = put(tmp('lm-lara-'), {
      artisan: '',
      'composer.json': '{}',
      'package.json': JSON.stringify({ scripts: { build: 'vite build', dev: 'vite' } }),
      'package-lock.json': '{}',
      '.env.example': 'APP_NAME=Shop\nAPP_KEY=\nDB_CONNECTION=sqlite\n',
      'public/index.php': ''
    })
    const plan = planSetup(dir, 'laravel', false)
    expect(plan.steps.map((s) => s.id)).toEqual(['env', 'composer', 'node', 'build', 'migrate'])
    expect(plan.steps.find((s) => s.id === 'node')!.command).toEqual(['npm', 'ci'])
    expect(plan.dev).toBeNull()
    expect(planSetup(dir, 'laravel', true).steps.map((s) => s.id)).not.toContain('migrate')
  })

  it('makes a .env with a real app key', () => {
    const env = envFromExample('APP_NAME=Shop\nAPP_KEY=\n')
    const key = /^APP_KEY=base64:(.+)$/m.exec(env)![1]
    expect(Buffer.from(key, 'base64')).toHaveLength(32)
  })

  it('knows React, Next.js, Django and their dev servers', () => {
    const vite = put(tmp('lm-vite-'), { 'package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { react: '19' } }), 'pnpm-lock.yaml': '' })
    expect(frameworkName(vite, 'node')).toBe('React')
    expect(nodeInstallCommand(vite)).toEqual(['npx', '--yes', 'pnpm', 'install'])
    expect(inferDev(vite, 'node')!.command).toEqual(['npm', 'run', 'dev', '--', '--port', '{port}', '--host', '127.0.0.1'])
    const next = put(tmp('lm-next-'), { 'package.json': JSON.stringify({ scripts: { dev: 'next dev' }, dependencies: { next: '15', react: '19' } }) })
    expect(frameworkName(next, 'node')).toBe('Next.js')
    expect(inferDev(next, 'node')!.command).toContain('-p')
    const dj = put(tmp('lm-dj-'), { 'manage.py': '', 'requirements.txt': 'django\n' })
    expect(frameworkName(dj, 'python')).toBe('Django')
    const p = planSetup(dj, 'python', false)
    expect(p.steps.map((s) => s.id)).toEqual(['python', 'migrate'])
    expect(p.dev!.command).toContain('runserver')
  })

  it('imports a cloned Laravel repo, writes .env and runs only the chosen steps', async () => {
    const { www } = freshEnv()
    const repo = put(tmp('lm-repo-'), {
      artisan: '',
      'composer.json': '{}',
      '.env.example': 'APP_KEY=\nAPP_URL=http://localhost\nDB_CONNECTION=sqlite\n',
      'database/.gitkeep': '',
      'public/index.php': ''
    })
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init'], { cwd: repo })
    // A local bare repo stands in for GitHub: inspectGit only takes https, so clone through a file path here.
    const plan = await inspect(repo, [])
    expect(plan.kind).toBe('laravel')
    expect(plan.setup.map((s) => s.id)).toEqual(['env', 'composer', 'migrate'])
    const ran: string[][] = []
    const res = await runImport(plan.id, { name: plan.suggestedName, sqlFile: null, engine: 'mysql', database: 'shop', updateConfig: false, replaceUrl: true, setup: ['env', 'migrate'], startDev: false }, deps(ran))
    const target = join(www, res.site!)
    const env = readFileSync(join(target, '.env'), 'utf8')
    expect(env).toMatch(/^APP_KEY=base64:/m)
    expect(env).toContain(`APP_URL=http://${res.site!.toLowerCase()}.test`)
    expect(existsSync(join(target, 'database', 'database.sqlite'))).toBe(true)
    expect(ran).toEqual([['php', 'artisan', 'migrate', '--force', '--no-interaction']])
    expect(res.failed).toEqual([])
  })

  it('records a failed step and keeps going, and sets up the dev server', async () => {
    freshEnv()
    const dir = put(tmp('lm-react-'), { 'myapp/package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vue: '3' } }), 'myapp/index.html': '' })
    const plan = await inspect(join(dir, 'myapp'), [])
    expect(plan.framework).toBe('Vue')
    expect(plan.dev).toContain('npm run dev')
    const d = deps([])
    d.runStep = async () => {
      throw new Error('npm ERR! network')
    }
    const res = await runImport(plan.id, { name: plan.suggestedName, sqlFile: null, engine: 'mysql', database: 'x', updateConfig: false, replaceUrl: true, setup: ['node'], startDev: true }, d)
    expect(res.failed[0].label).toMatch(/Install npm packages/)
    expect(res.dev!.command[0]).toBe('npm')
  })

  it('ignores setup ids it did not offer', async () => {
    freshEnv()
    const dir = put(tmp('lm-static-'), { 'site/index.html': '<h1>hi</h1>' })
    const plan = await inspect(join(dir, 'site'), [])
    const ran: string[][] = []
    await runImport(plan.id, { name: plan.suggestedName, sqlFile: null, engine: 'mysql', database: 'x', updateConfig: false, replaceUrl: true, setup: ['composer', 'migrate', 'rm -rf'], startDev: true }, deps(ran))
    expect(ran).toEqual([])
  })

  it('only clones https addresses', async () => {
    await expect(inspectGit('file:///etc', '', [])).rejects.toThrow(/https/)
    await expect(inspectGit('https://example.invalid/x/y.git', '', [])).rejects.toThrow()
  })
})

import { generatePhpIni } from '../src/main/configgen'
import { parseLaramacPhpAssets } from '../src/main/versions'

describe('0.17 Xdebug', () => {
  it('is only in php.ini when turned on', () => {
    const off = generatePhpIni({ minor: '8.4', errorLog: '/tmp/e.log' })
    expect(off).not.toContain('xdebug')
    const on = generatePhpIni({ minor: '8.4', errorLog: '/tmp/e.log', xdebug: '/x/php/8.4/xdebug.so', custom: 'xdebug.mode = debug,develop' })
    expect(on).toContain('zend_extension = "/x/php/8.4/xdebug.so"')
    expect(on).toContain('xdebug.client_port = 9003')
    // Your own lines still come last and win.
    expect(on.indexOf('xdebug.mode = debug,develop')).toBeGreaterThan(on.indexOf('zend_extension'))
  })

  it('finds the Xdebug file next to a PHP build', () => {
    const asset = (name: string): { name: string; browser_download_url: string } => ({ name, browser_download_url: `https://x/${name}` })
    const builds = parseLaramacPhpAssets(
      [
        asset('php-8.4.14-cli-macos-aarch64.tar.gz'),
        asset('php-8.4.14-fpm-macos-aarch64.tar.gz'),
        asset('php-8.4.14-macos-aarch64.sha256'),
        asset('php-8.4.14-xdebug-macos-aarch64.tar.gz'),
        asset('php-8.3.27-cli-macos-aarch64.tar.gz'),
        asset('php-8.3.27-fpm-macos-aarch64.tar.gz'),
        asset('php-8.3.27-macos-aarch64.sha256'),
        asset('php-8.3.27-xdebug-macos-aarch64.none')
      ],
      'aarch64'
    )
    expect(builds['8.4'].xdebugUrl).toBe('https://x/php-8.4.14-xdebug-macos-aarch64.tar.gz')
    expect(builds['8.3'].xdebugUrl).toBeUndefined()
  })
})
