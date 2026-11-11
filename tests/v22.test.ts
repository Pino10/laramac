import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import * as tools from '../src/main/sitetools'
import { checkHookUrl, hookBody, raycastScripts } from '../src/main/webhooks'
import { generateApacheConf, generateNginxConf, corsOriginPattern } from '../src/main/configgen'
import { packContents, packPluginDirs, SKILL_PACKS } from '../src/main/seckit/skillpacks'
import { SKILLS } from '../src/main/seckit/skills'
import { ollamaAsset } from '../src/main/svc/ollama'
import type { SiteInfo } from '../src/shared/types'

const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const dir = (files: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), 'lm22-'))
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(join(d, f, '..'), { recursive: true })
    writeFileSync(join(d, f), t)
  }
  return d
}
const site = (path: string, extra: Partial<SiteInfo> = {}): SiteInfo => ({ name: 'shop', path, docRoot: path, domain: 'shop.test', url: 'http://shop.test', httpsUrl: 'https://shop.test', kind: 'laravel', secure: false, php: '8.4', aliases: [], ...extra })

describe('Requests from the access log', () => {
  it('reads Nginx (seconds) and Apache (microseconds) lines', () => {
    expect(tools.parseAccessLine('n|2026-11-04T10:00:00+00:00|shop.test|GET|/api/products?page=2|200|0.123|512')).toMatchObject({ host: 'shop.test', method: 'GET', status: 200, ms: 123 })
    expect(tools.parseAccessLine('a|2026-11-04T10:00:01+0000|shop.test|POST|/orders|500|45000|20')).toMatchObject({ status: 500, ms: 45 })
    expect(tools.parseAccessLine('127.0.0.1 - - [04/Nov/2026] "GET / HTTP/1.1" 200 10')).toBeNull()
  })
  it('summarises one site, its slowest addresses and errors', () => {
    const log = ['n|t1|shop.test|GET|/a|200|0.010|1', 'n|t2|shop.test|GET|/a|200|0.030|1', 'n|t3|blog.test|GET|/x|200|0.5|1', 'n|t4|api.shop.test|GET|/slow|500|2.000|1'].join('\n')
    const r = tools.siteRequests(log, ['shop.test'])
    expect(r.count).toBe(3)
    expect(r.errors).toBe(1)
    expect(r.slowest[0]).toMatchObject({ path: '/slow', ms: 2000 })
    expect(r.lines[0].path).toBe('/slow')
  })
  it('the web servers write that format, and CORS only for local origins', () => {
    const conf = { sites: [{ domain: 'api.test', docRoot: '/x', kind: 'laravel' as const, phpPort: 9084, secure: false, cors: { tld: 'test' } }], extras: [], httpPort: 80, httpsPort: 443, localhost: null } as never
    const n = generateNginxConf({ ...(conf as object), errorLog: '/e', accessLog: '/a', pidFile: '/p', tempDir: '/t', mimeTypes: '', allowLan: false } as never)
    expect(n).toContain("log_format laramac 'n|$time_iso8601|$host")
    expect(n).toContain('access_log "/a" laramac;')
    expect(n).toContain('add_header Access-Control-Allow-Origin $laramac_cors always;')
    const a = generateApacheConf({ ...(conf as object), port: 80, errorLog: '/e', accessLog: '/a', pidFile: '/p', serverRoot: '/s', modulesDir: '/m', mimeTypes: '/mt', allowLan: false } as never)
    expect(a).toContain('LogFormat "a|%{%Y-%m-%dT%H:%M:%S%z}t|%V|%m|%U%q|%>s|%D|%B" laramac')
    expect(a).toContain('Header always set Access-Control-Allow-Origin "expr=%{req:Origin}"')
    const re = new RegExp(corsOriginPattern('test').replace(/\\\\/g, '\\'))
    expect(re.test('http://app.test:5173')).toBe(true)
    expect(re.test('http://localhost:3000')).toBe(true)
    expect(re.test('https://evil.com')).toBe(false)
    expect(re.test('https://test.evil.com')).toBe(false)
  })
})

describe('Workers and tests', () => {
  it('suggests Laravel workers from the project', () => {
    const d = dir({ artisan: '', 'composer.json': JSON.stringify({ require: { 'laravel/horizon': '^5', 'laravel/reverb': '^1' } }) })
    expect(tools.suggestWorkers(site(d)).map((w) => w.id)).toEqual(['horizon', 'schedule', 'reverb'])
  })
  it('only accepts commands as plain words', () => {
    expect(tools.checkCommand(['php', 'artisan', 'queue:work'])).toEqual(['php', 'artisan', 'queue:work'])
    expect(() => tools.checkCommand(['php;rm', '-rf'])).toThrow()
    expect(() => tools.checkCommand('php artisan')).toThrow()
  })
  it('finds test runners', () => {
    const d = dir({ 'vendor/bin/pest': '', 'node_modules/.bin/vitest': '', 'node_modules/.bin/playwright': '', 'package.json': '{}', 'go.mod': 'module x' })
    expect(tools.findTestRunners(site(d)).map((r) => r.id)).toEqual(['pest', 'vitest', 'playwright', 'go'])
  })
  it('reads the results of real test runs', () => {
    expect(tools.summariseTests(fx('sitetools/vitest-out.txt'))).toMatchObject({ passed: 10, failed: 0 })
    expect(tools.summariseTests(fx('sitetools/pytest-out.txt'))).toMatchObject({ passed: 1, failed: 1 })
    expect(tools.summariseTests(fx('sitetools/go-out.txt')).failed).toBeGreaterThan(0)
    expect(tools.summariseTests('PHPUnit 11.5\n\nTests: 12, Assertions: 30, Failures: 2, Errors: 1, Skipped: 1.')).toMatchObject({ passed: 8, failed: 3, skipped: 1 })
    expect(tools.summariseTests('OK (5 tests, 9 assertions)')).toMatchObject({ passed: 5, failed: 0 })
  })
})

describe('Compose, debugging and other devices', () => {
  it('reads docker compose ps in both formats', () => {
    const line = JSON.stringify({ Service: 'db', State: 'running', Status: 'Up 2 minutes', Publishers: [{ URL: '0.0.0.0', PublishedPort: 5432, TargetPort: 5432 }] })
    expect(tools.parseComposePs(line)).toEqual([{ name: 'db', state: 'running', status: 'Up 2 minutes', ports: '5432→5432' }])
    expect(tools.parseComposePs(`[${line}]`)).toHaveLength(1)
    expect(tools.composeFile(dir({ 'compose.yaml': 'services: {}' }))).toMatch(/compose\.yaml$/)
  })
  it('adds Listen for Xdebug to launch.json and keeps what is there', () => {
    const merged = JSON.parse(tools.mergeLaunchJson('{\n  // mine\n  "version": "0.2.0",\n  "configurations": [{ "name": "Node", "type": "node", },],\n}'))
    expect(merged.configurations.map((c: { name: string }) => c.name)).toEqual(['Node', 'Listen for Xdebug (Laramac)'])
    expect(JSON.parse(tools.mergeLaunchJson(JSON.stringify(merged))).configurations).toHaveLength(2)
    expect(() => tools.mergeLaunchJson('{ not json')).toThrow(/left as it is/)
  })
})

describe('Databases', () => {
  it('plans scrambling of personal data by column name', () => {
    const plan = tools.scramblePlan(
      [
        { table: 'users', column: 'email' },
        { table: 'users', column: 'first_name' },
        { table: 'users', column: 'password' },
        { table: 'logs', column: 'ip_address' },
        { table: 'bad`name', column: 'email' }
      ],
      new Set(['users', 'bad`name'])
    )
    expect(plan.map((p) => `${p.table}.${p.column}`)).toEqual(['users.email', 'users.first_name'])
    expect(plan[0].sql).toBe("UPDATE `users` SET `email` = CONCAT('user', id, '@example.test') WHERE `email` IS NOT NULL;")
  })
  it('compares two schemas', () => {
    const m = (o: Record<string, Record<string, string>>): Map<string, Map<string, string>> => new Map(Object.entries(o).map(([t, c]) => [t, new Map(Object.entries(c))]))
    const d = tools.schemaDiff(m({ users: { id: 'int', email: 'varchar(255)' }, old: { id: 'int' } }), m({ users: { id: 'bigint', name: 'text' }, posts: { id: 'int' } }))
    expect(d).toEqual({ onlyA: ['old'], onlyB: ['posts'], changed: [{ table: 'users', column: 'id', a: 'int', b: 'bigint' }], missingColumns: [{ table: 'users', column: 'email', side: 'b' }, { table: 'users', column: 'name', side: 'a' }] })
  })
})

describe('Hosting and integrations', () => {
  it('only accepts real Forge and Ploi deploy hooks', () => {
    expect(tools.checkDeployHook('forge', 'https://forge.laravel.com/servers/1/sites/2/deploy/http?token=abc')).toContain('forge.laravel.com')
    expect(() => tools.checkDeployHook('forge', 'https://evil.com/deploy')).toThrow()
    expect(() => tools.checkDeployHook('ploi', 'http://ploi.io/webhooks/servers/1/sites/2/deploy?token=x')).toThrow()
  })
  it('builds the hosting CLI commands without anything from outside', () => {
    expect(tools.hostingCommand('vercel', { prod: true })).toBe('npx --yes vercel@latest deploy --prod')
    expect(tools.hostingCommand('azure', { app: 'shop-app; rm -rf /', group: 'rg-1' })).toBe('az webapp up --name shop-apprm-rf --resource-group rg-1')
  })
  it('accepts webhooks only from their own services', () => {
    expect(checkHookUrl('slack', 'https://hooks.slack.com/services/T/B/x')).toContain('hooks.slack.com')
    expect(() => checkHookUrl('slack', 'https://example.com/x')).toThrow()
    expect(() => checkHookUrl('discord', 'https://discord.com/x')).toThrow()
    expect(() => checkHookUrl('generic', 'https://192.168.1.10/hook')).toThrow()
    expect(hookBody('discord', 'Laramac', 'error', 'MySQL stopped')).toMatchObject({ username: 'Laramac' })
    expect(JSON.stringify(hookBody('teams', 'Laramac', 'success', 'Done'))).toContain('AdaptiveCard')
  })
  it('writes Raycast script commands that call the CLI', () => {
    const s = raycastScripts('/Users/x/.laramac/bin/laramac', 'Laramac')
    expect(s.find((f) => f.file === 'laramac-open.sh')?.text).toMatch(/@raycast.argument1[\s\S]*"\/Users\/x\/.laramac\/bin\/laramac" open "\$1"/)
  })
  it('installs Ollama from its own release with checksums', () => {
    expect(ollamaAsset([{ name: 'ollama-darwin.tgz', browser_download_url: 'u' }, { name: 'sha256sum.txt', browser_download_url: 's' }])).toEqual({ url: 'u', name: 'ollama-darwin.tgz', sums: 's' })
    expect(ollamaAsset([{ name: 'ollama-linux-amd64.tgz', browser_download_url: 'u' }])).toBeNull()
  })
})

describe('Skills', () => {
  it('has 29 skills of its own, and the review plan names real ones', () => {
    expect(Object.keys(SKILLS)).toHaveLength(43)
    for (const n of ['audit-context', 'entry-points', 'variant-analysis', 'false-positive-check', 'change-review', 'insecure-defaults', 'sharp-edges', 'threat-model', 'fix-verification']) expect(SKILLS[n], n).toBeTruthy()
  })
  it('loads only the listed packs, and only their security plugins', () => {
    const tob = SKILL_PACKS.find((p) => p.id === 'trailofbits')!
    const repo = dir({ 'plugins/fp-check/.claude-plugin/plugin.json': '{}', 'plugins/culture-index/.claude-plugin/plugin.json': '{}' })
    expect(packContents(tob, repo)).toEqual(['fp-check'])
    const root = dir({ 'trailofbits/state.json': JSON.stringify({ id: 'trailofbits', installed: true, commit: 'abc', at: '', loaded: ['fp-check'] }), 'trailofbits/repo/plugins/fp-check/.claude-plugin/plugin.json': '{}' })
    expect(packPluginDirs(root)).toEqual([join(root, 'trailofbits', 'repo', 'plugins', 'fp-check')])
  })
})
