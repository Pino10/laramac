import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { codeAppAsset, ideSettings, launchEnv, openRequestUrl, serverArgs } from '../src/main/idecore'
import { processUsage, pulseBySite } from '../src/main/sitetools'
import { sanitizeSettingsPatch } from '../src/main/validate'

const req = createRequire(import.meta.url)
// The Laramac Code app's own helpers (code-app/lib.js, plain JavaScript inside the app).
const lib = req('../code-app/lib.js') as {
  editorUrl: (origin: string, port: number, o: { folder: string; file?: string; line?: number }) => string
  validOpen: (o: unknown, exists?: (p: string) => boolean, isDir?: (p: string) => boolean) => { folder: string; file?: string; line?: number } | null
  parseOpenUrl: (u: string) => { folder: string | null; file?: string; line?: string } | null
  readLaunch: (text: string, exists?: (p: string) => boolean) => { bin: string; args: string[]; env: Record<string, string>; background: { dark: string; light: string } } | null
  withPort: (args: string[], port: number) => string[]
  remember: (list: string[], folder: string, exists?: (p: string) => boolean, max?: number) => string[]
  WINDOW_CSS: string
  fontScript: (fonts: { family: string; weight: number; data: string }[]) => string
}

const tmp = mkdtempSync(join(tmpdir(), 'laramac-v27-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', 'v27', n), 'utf8')

describe('The Laramac Code app', () => {
  const site = join(tmp, 'shop')
  mkdirSync(join(site, 'app'), { recursive: true })
  writeFileSync(join(site, 'app', 'User.php'), '<?php')

  it('opens only folders and files that exist, with a sensible line', () => {
    expect(lib.validOpen({ folder: site })).toEqual({ folder: site })
    expect(lib.validOpen({ folder: site, file: join(site, 'app', 'User.php'), line: '42' })).toEqual({ folder: site, file: join(site, 'app', 'User.php'), line: 42 })
    expect(lib.validOpen({ folder: site, file: join(site, 'nope.php'), line: 3 })).toEqual({ folder: site })
    expect(lib.validOpen({ folder: site, file: join(site, 'app', 'User.php'), line: -1 })).toEqual({ folder: site, file: join(site, 'app', 'User.php') })
    expect(lib.validOpen({ folder: 'relative/path' })).toBeNull()
    expect(lib.validOpen({ folder: join(tmp, 'missing') })).toBeNull()
    expect(lib.validOpen({ folder: join(site, 'app', 'User.php') })).toBeNull()
    expect(lib.validOpen(null)).toBeNull()
  })

  it('reads laramac-code:// addresses from Laramac, and nothing else', () => {
    const u = openRequestUrl({ folder: '/Users/me/www/shop', file: '/Users/me/www/shop/app/User.php', line: 12 })
    expect(u).toBe('laramac-code://open?folder=%2FUsers%2Fme%2Fwww%2Fshop&file=%2FUsers%2Fme%2Fwww%2Fshop%2Fapp%2FUser.php&line=12')
    expect(lib.parseOpenUrl(u)).toEqual({ folder: '/Users/me/www/shop', file: '/Users/me/www/shop/app/User.php', line: '12' })
    expect(lib.parseOpenUrl('laramac-code://open?folder=%2Fx')).toEqual({ folder: '/x', file: undefined, line: undefined })
    expect(lib.parseOpenUrl('laramac-code://delete?folder=%2Fx')).toBeNull()
    expect(lib.parseOpenUrl('https://open?folder=%2Fx')).toBeNull()
    expect(lib.parseOpenUrl('not a url')).toBeNull()
    expect(openRequestUrl({ folder: '/a', line: 4 })).toBe('laramac-code://open?folder=%2Fa')
  })

  it('reads launch.json and keeps only the environment the editor needs', () => {
    const binPath = join(tmp, 'code-server')
    writeFileSync(binPath, '')
    const text = JSON.stringify({
      bin: binPath,
      args: serverArgs({ port: '{port}', dataDir: '/d', extDir: '/e' }),
      env: { PATH: '/x/bin:/usr/bin', COMPOSER_HOME: '/c', LARAMAC_SKILL_DIRS: '/s1:/s2', GITHUB_TOKEN: 'ghp_secret', AWS_SECRET_ACCESS_KEY: 'x', NODE_OPTIONS: '--inspect' },
      background: { dark: '#101010', light: 'red' }
    })
    const l = lib.readLaunch(text)!
    expect(Object.keys(l.env).sort()).toEqual(['COMPOSER_HOME', 'LARAMAC_SKILL_DIRS', 'PATH'])
    expect(l.background).toEqual({ dark: '#101010', light: '#f6f7fb' })
    expect(lib.withPort(l.args, 51234).slice(0, 4)).toEqual(['--bind-addr', '127.0.0.1:51234', '--auth', 'password'])
    expect(lib.readLaunch(JSON.stringify({ bin: join(tmp, 'gone'), args: [] }))).toBeNull()
    expect(lib.readLaunch(JSON.stringify({ bin: 'relative', args: [] }), () => true)).toBeNull()
    expect(lib.readLaunch('{oops')).toBeNull()
  })

  it('opens a file at its line in the editor, the same way as before', () => {
    const u = new URL(lib.editorUrl('http://127.0.0.1:5100', 5100, { folder: '/w/shop', file: '/w/shop/a b.php', line: 7 }))
    expect(u.searchParams.get('folder')).toBe('/w/shop')
    expect(JSON.parse(u.searchParams.get('payload')!)).toEqual([
      ['openFile', 'vscode-remote://127.0.0.1:5100/w/shop/a%20b.php:7'],
      ['gotoLineMode', 'true']
    ])
  })

  it('loads Poppins into the page from its bytes, and only well-formed fonts from launch.json', () => {
    const binPath = join(tmp, 'cs2')
    writeFileSync(binPath, '')
    const data = readFileSync(join(__dirname, '..', 'node_modules', '@fontsource', 'poppins', 'files', 'poppins-latin-400-normal.woff2')).toString('base64')
    const l = lib.readLaunch(JSON.stringify({ bin: binPath, args: [], fonts: [{ family: 'Laramac Poppins', weight: 400, data }, { family: "x'); alert(1); ('", weight: 400, data }, { family: 'Ok', weight: 9999, data }, { family: 'Ok', weight: 500, data: 'not base64!' }] })) as unknown as { fonts: { family: string }[] }
    expect(l.fonts.map((f) => f.family)).toEqual(['Laramac Poppins'])
    const js = lib.fontScript(l.fonts as never)
    expect(() => new Function(js)).not.toThrow()
    expect(js).toMatch(/new FontFace\(f\.family, bytes/)
  })

  it('remembers recent folders, newest first, without duplicates or ones that are gone', () => {
    const ok = new Set(['/a', '/b', '/c'])
    expect(lib.remember(['/a', '/b', '/gone'], '/c', (p) => ok.has(p))).toEqual(['/c', '/a', '/b'])
    expect(lib.remember(['/a', '/b', '/c'], '/b', (p) => ok.has(p))).toEqual(['/b', '/a', '/c'])
    expect(lib.remember(['/a', '/b', '/c'], '/a', () => true, 2)).toEqual(['/a', '/b'])
  })

  it('leaves room for the traffic lights and lets you drag the title bar', () => {
    expect(lib.WINDOW_CSS).toMatch(/titlebar\{-webkit-app-region:drag\}/)
    expect(lib.WINDOW_CSS).toMatch(/padding-left:78px/)
    expect(lib.WINDOW_CSS).toMatch(/command-center[^}]*no-drag|no-drag/)
  })
})

describe('Laramac sets the app up', () => {
  it('picks the app zip for this Mac from Laramac’s own release', () => {
    const assets = [{ name: 'Laramac-0.27.0-arm64.dmg' }, { name: 'Laramac-Code-0.27.0-arm64.zip' }, { name: 'Laramac-Code-0.27.0-x64.zip' }, { name: 'SHA256SUMS.txt' }]
    expect(codeAppAsset(assets, '0.27.0', 'arm64')?.name).toBe('Laramac-Code-0.27.0-arm64.zip')
    expect(codeAppAsset(assets, '0.27.0', 'x64')?.name).toBe('Laramac-Code-0.27.0-x64.zip')
    expect(codeAppAsset(assets, '0.28.0', 'arm64')).toBeNull()
  })
  it('writes no tokens or keys into launch.json, only the PATH and tool folders', () => {
    const env = launchEnv({ PATH: '/p', COMPOSER_HOME: '/c', HOME: '/Users/me', GITHUB_TOKEN: 't', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', SSH_AUTH_SOCK: '/s' }, { LARAMAC_SKILL_DIRS: '/s' })
    expect(env).toEqual({ PATH: '/p', COMPOSER_HOME: '/c', LARAMAC_SKILL_DIRS: '/s' })
  })
  it('turns the AI side panel on: Claude Code there, layout buttons back', () => {
    const s = ideSettings({ font: 'system', fontSize: 14, phpPath: null, phpVersion: null, appearance: 'auto' })
    expect(s.managed['claudeCode.preferredLocation']).toBe('sidebar')
    expect(s.managed['workbench.layoutControl.enabled']).toBe(true)
    expect(s.defaults['workbench.secondarySideBar.defaultVisibility']).toBe('visibleInWorkspace')
  })
})

describe('Live on this Mac (real measurements)', () => {
  it('adds up each service with everything it started, from real ps output', () => {
    const root = Number(fx('root.txt').trim())
    const now = 1_000_000
    const r = processUsage(fx('ps.txt'), [{ name: 'Busy service', pid: root, since: now - 3_725_000 }, { name: 'Gone', pid: 999999, since: 0 }], now)
    expect(r).toEqual([{ name: 'Busy service', cpu: 98.6, memMb: 8.4, uptimeSec: 3725, count: 4 }])
  })
  it('splits traffic per site, busiest first, without localhost or bare addresses', () => {
    const now = Date.parse('2026-11-05T14:30:30+00:00')
    const log = [
      'n|2026-11-05T14:30:10+00:00|shop.test|GET|/|200|0.040|10',
      'n|2026-11-05T14:29:10+00:00|shop.test|GET|/cart|500|0.300|10',
      'n|2026-11-05T14:20:00+00:00|shop.test:443|GET|/|200|0.050|10',
      'n|2026-11-05T14:10:00+00:00|blog.test|GET|/|200|0.020|10',
      'n|2026-11-05T14:10:00+00:00|localhost|GET|/|200|0.020|10',
      'a|2026-11-05T14:10:00+0000|127.0.0.1|GET|/|200|2000|10'
    ].join('\n')
    const r = pulseBySite(log, now)
    expect(r.map((x) => [x.host, x.today, x.errors])).toEqual([
      ['shop.test', 3, 1],
      ['blog.test', 1, 0]
    ])
    expect(r[0].perMinute[29]).toBe(1)
    expect(r[0].perMinute[28]).toBe(1)
    expect(r[0].medianMs).toBe(50)
  })
})

describe('Ion, MacSec’s look', () => {
  it('can be chosen', () => {
    expect(sanitizeSettingsPatch({ glassStyle: 'ion' })).toEqual({ glassStyle: 'ion' })
    expect(() => sanitizeSettingsPatch({ glassStyle: 'midnight' })).toThrow()
  })
})
