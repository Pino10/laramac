import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { EDITOR_FONTS, IDE_EXTENSIONS, folderFor, ideSettings, macAsset, mergeSettings, openUrl, serverArgs, sha256Of } from '../src/main/idecore'
import { ACCENTS, accentBuild, isAccent, themeJson, themePackage, vsixManifest } from '../src/main/idetheme'
import { ARTISAN, PHP_TOOLS, QUICK_SETTINGS, installedGlobals, readQuick, writeQuick } from '../src/main/phpdev'
import { pulseFrom } from '../src/main/sitetools'
import { buildSkillSet, detectStack, estimateMinutes, recommend, skillCatalog } from '../src/main/seckit/skillplan'

const tmp = mkdtempSync(join(tmpdir(), 'laramac-v25-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('Laramac Code (the built-in editor)', () => {
  // Asset names and digest format from code-server's GitHub releases.
  const assets = [
    { name: 'code-server-4.104.2-linux-amd64.tar.gz', url: 'l' },
    { name: 'code-server-4.104.2-macos-arm64.tar.gz', url: 'a', digest: 'sha256:' + 'ab'.repeat(32) },
    { name: 'code-server-4.104.2-macos-amd64.tar.gz', url: 'i', digest: null }
  ]
  it('picks the Mac build for the chip, and only trusts a real SHA-256', () => {
    expect(macAsset(assets, 'v4.104.2', 'arm64')?.url).toBe('a')
    expect(macAsset(assets, 'v4.104.2', 'x64')?.url).toBe('i')
    expect(macAsset(assets, 'v9.9.9', 'arm64')).toBeNull()
    expect(sha256Of(assets[1].digest)).toBe('ab'.repeat(32))
    expect(sha256Of(null)).toBeNull()
    expect(sha256Of('sha1:abc')).toBeNull()
  })
  it('opens a folder, or a file at a line, through the workbench address', () => {
    expect(openUrl(5100, '/Users/me/Laramac/www/shop')).toBe('http://127.0.0.1:5100/?folder=%2FUsers%2Fme%2FLaramac%2Fwww%2Fshop')
    const u = new URL(openUrl(5100, '/w/shop', '/w/shop/app/Models/User.php', 42))
    expect(u.searchParams.get('folder')).toBe('/w/shop')
    expect(JSON.parse(u.searchParams.get('payload')!)).toEqual([
      ['openFile', 'vscode-remote://127.0.0.1:5100/w/shop/app/Models/User.php:42'],
      ['gotoLineMode', 'true']
    ])
    expect(JSON.parse(new URL(openUrl(5100, '/w', '/w/my file.php')).searchParams.get('payload')!)[0][1]).toBe('vscode-remote://127.0.0.1:5100/w/my%20file.php')
  })
  it('opens the whole site for a file inside it, and the file’s folder otherwise', () => {
    const roots = ['/w/shop', '/w/shop-admin', '/w']
    expect(folderFor('/w/shop/.env', roots, false)).toBe('/w/shop')
    expect(folderFor('/w/shop-admin/routes/web.php', roots, false)).toBe('/w/shop-admin')
    expect(folderFor('/opt/php/8.3/php.ini', roots, false)).toBe('/opt/php/8.3')
    expect(folderFor('/w/shop/', roots, true)).toBe('/w/shop')
    expect(folderFor('/x', [], false)).toBe('/')
  })
  it('is PHP first: Intelephense, Xdebug and Blade are in the extension set', () => {
    const ids = IDE_EXTENSIONS.map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['bmewburn.vscode-intelephense-client', 'xdebug.php-debug', 'onecentlin.laravel-blade', 'mikestead.dotenv']))
  })
  it('writes settings that follow Laramac, and keeps yours', () => {
    const s = ideSettings({ font: 'jetbrains', fontSize: 14, phpPath: '/L/bin/php', phpVersion: '8.4.1', appearance: 'auto' })
    expect(s.managed['editor.fontFamily']).toBe(EDITOR_FONTS.jetbrains.family)
    expect(s.managed['window.autoDetectColorScheme']).toBe(true)
    expect(s.managed['telemetry.telemetryLevel']).toBe('off')
    expect(s.managed['intelephense.environment.phpVersion']).toBe('8.4.1')
    expect(s.managed['php.debug.executablePath']).toBe('/L/bin/php')
    const merged = mergeSettings({ 'editor.lineHeight': 2, 'editor.fontSize': 20, 'my.own': 1 }, s)
    expect(merged['editor.lineHeight']).toBe(2)
    expect(merged['my.own']).toBe(1)
    expect(merged['editor.fontSize']).toBe(14)
    expect(merged['editor.stickyScroll.enabled']).toBe(true)
    expect(ideSettings({ font: 'nope', fontSize: 13, phpPath: null, phpVersion: null, appearance: 'light' }).managed['workbench.colorTheme']).toBe('Laramac Studio Light')
  })
  it('only listens on this Mac, with a password, telemetry and update checks off', () => {
    const a = serverArgs({ port: 5100, dataDir: '/d', extDir: '/e' })
    expect(a.slice(0, 4)).toEqual(['--bind-addr', '127.0.0.1:5100', '--auth', 'password'])
    expect(a).toEqual(expect.arrayContaining(['--disable-telemetry', '--disable-update-check']))
  })
  it('builds a Studio theme for every accent, dark and light', () => {
    for (const a of Object.keys(ACCENTS)) {
      expect(isAccent(a)).toBe(true)
      for (const k of ['dark', 'light'] as const) {
        const t = themeJson(k, a as never) as { type: string; colors: Record<string, string>; tokenColors: unknown[] }
        expect(t.type).toBe(k)
        expect(Object.keys(t.colors).length).toBeGreaterThan(20)
        expect(t.tokenColors.length).toBeGreaterThan(5)
      }
    }
    expect(isAccent('pink')).toBe(false)
    expect(themePackage('teal', accentBuild('teal')).version).toBe(`1.0.${accentBuild('teal')}`)
    expect(vsixManifest('1.0.12')).toContain('Version="1.0.12"')
  })
})

describe('PHP for developers', () => {
  it('reads and writes the quick settings block, leaving your own lines alone', () => {
    const mine = '; my settings\nxdebug.mode = debug\n'
    expect(readQuick(mine)).toEqual(Object.fromEntries(QUICK_SETTINGS.map((q) => [q.key, q.fallback])))
    const once = writeQuick(mine, { memory_limit: '1G', upload_max_filesize: '1G', display_errors: 'On' })
    expect(once).toContain('xdebug.mode = debug')
    expect(once).toContain('memory_limit = 1G')
    expect(once).toContain('post_max_size = 1G')
    // Laramac's own default is not written: nothing to override.
    expect(once).not.toContain('display_errors')
    expect(readQuick(once).memory_limit).toBe('1G')
    const twice = writeQuick(once, { memory_limit: '2G' })
    expect(twice.match(/Laramac quick settings \(/g)?.length).toBe(1)
    expect(readQuick(twice)).toMatchObject({ memory_limit: '2G', upload_max_filesize: '256M' })
    expect(writeQuick(twice, {})).toBe(mine)
    expect(() => writeQuick(mine, { memory_limit: '9T' })).toThrow(/not one of the choices/)
  })
  it('knows which global tools Composer installed (both installed.json formats)', () => {
    const home = join(tmp, 'composer')
    mkdirSync(join(home, 'vendor', 'composer'), { recursive: true })
    writeFileSync(join(home, 'vendor', 'composer', 'installed.json'), JSON.stringify({ packages: [{ name: 'laravel/pint', version: 'v1.18.1' }, { name: 'phpstan/phpstan', version: '2.0.3' }] }))
    expect(installedGlobals(home)).toEqual({ 'laravel/pint': '1.18.1', 'phpstan/phpstan': '2.0.3' })
    writeFileSync(join(home, 'vendor', 'composer', 'installed.json'), JSON.stringify([{ name: 'rector/rector', version: '1.2.0' }]))
    expect(installedGlobals(home)).toEqual({ 'rector/rector': '1.2.0' })
    expect(installedGlobals(join(tmp, 'none'))).toEqual({})
  })
  it('lists the tools PHP developers reach for, and Artisan commands with fixed arguments', () => {
    expect(PHP_TOOLS.map((t) => t.pkg)).toEqual(expect.arrayContaining(['laravel/installer', 'phpstan/phpstan', 'laravel/pint', 'rector/rector']))
    expect(ARTISAN.find((a) => a.id === 'fresh')?.confirm).toBeTruthy()
    for (const a of ARTISAN) expect(a.args.every((x) => /^[\w:-]+$/.test(x))).toBe(true)
  })
})

describe('Overview pulse', () => {
  // Real lines in Laramac's nginx format (configgen NGINX_LOG_FORMAT) and Apache's.
  const now = Date.parse('2026-11-05T14:30:30+00:00')
  const log = [
    'n|2026-11-05T14:30:10+00:00|shop.test|GET|/|200|0.042|5120',
    'n|2026-11-05T14:29:50+00:00|shop.test|POST|/cart|500|0.310|90',
    'n|2026-11-05T14:10:00+00:00|blog.test|GET|/feed|200|0.020|800',
    'a|2026-11-05T14:30:20+0000|api.test|GET|/v1|200|15000|10',
    'n|2026-11-04T23:59:00+00:00|shop.test|GET|/|200|0.050|10',
    'garbage line'
  ].join('\n')
  it('counts requests per minute, today’s total, errors and the median time', () => {
    const p = pulseFrom(log, now)
    expect(p.perMinute.length).toBe(30)
    // The last 60 seconds are the newest minute: 10, 20 and 40 seconds ago.
    expect(p.perMinute[29]).toBe(3)
    expect(p.perMinute[28]).toBe(0)
    expect(p.perMinute[9]).toBe(1)
    expect(p.today).toBe(4)
    expect(p.errorsToday).toBe(1)
    expect(p.medianMs).toBe(42)
  })
})

describe('Choosing skills per review', () => {
  const own = join(tmp, 'own')
  for (const n of ['security-code-review', 'client-side-review', 'recon-methodology']) {
    mkdirSync(join(own, 'skills', n), { recursive: true })
    writeFileSync(join(own, 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: ${n}.\n---\n`)
  }
  it('recommends by stack, builds a folder with only what was chosen, and estimates the time', () => {
    const root = join(tmp, 'site')
    mkdirSync(join(root, 'wp-content'), { recursive: true })
    writeFileSync(join(root, 'wp-config.php'), '<?php')
    const stack = detectStack(root)
    expect(stack).toEqual(expect.arrayContaining(['php', 'wordpress']))
    const items = skillCatalog({ app: 'Laramac', ownDir: own, packsRoot: join(tmp, 'packs') })
    expect(items.some((i) => i.id === 'own:recon-methodology')).toBe(false)
    const rec = recommend(items, stack)
    expect(rec).toContain('own:client-side-review')
    expect(rec).not.toContain('own:electron-review')
    const out = buildSkillSet(items, ['own:security-code-review'], join(tmp, 'set'))
    expect(out).toEqual([join(tmp, 'set')])
    const [lo, hi] = estimateMinutes({ files: 1400, skills: 10, reviewer: 'claude' })
    expect(lo).toBeGreaterThanOrEqual(2)
    expect(hi).toBeGreaterThan(lo)
  })
})
