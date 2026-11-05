import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { IDE_EXTENSIONS, PHPACTOR_COMPLETORS, checksPackage, ideSettings, phpactorConfig, workbenchCss } from '../src/main/idecore'
import { vsixManifest } from '../src/main/idetheme'
import { SKILL_PACKS, installPack, packContents } from '../src/main/seckit/skillpacks'
import { detectStack, recommend, skillCatalog } from '../src/main/seckit/skillplan'
import { migrate } from '../src/main/settings'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

const req = createRequire(import.meta.url)
// The extension Laramac installs into Laramac Code (plain JavaScript; its parsers are pure).
const ext = req('../src/main/idext/extension.cjs') as {
  parsePhpLint: (out: string, file: string) => { file: string; line: number; severity: string; message: string }[]
  parsePhpstan: (t: string) => { file: string; line: number; message: string; code?: string }[]
  parsePsalm: (t: string) => { file: string; line: number; column?: number; severity: string; code?: string }[]
  parseSemgrep: (t: string, root: string) => { file: string; line: number; severity: string; code?: string }[]
  parseAiFindings: (t: string, root: string) => { file: string | null; line: number; severity: string; message: string; code?: string }[]
  aiPrompt: (target: string, isFile: boolean) => string
  findTool: (root: string, name: string, dirs: string[]) => string | null
}

const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', 'v26', n), 'utf8')
const tmp = mkdtempSync(join(tmpdir(), 'laramac-v26-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('Laramac Checks (real tool output)', () => {
  it('reads php -l', () => {
    const r = ext.parsePhpLint(fx('php-lint.txt'), '/tmp/phpl/bad.php')
    expect(r[0]).toMatchObject({ file: '/tmp/phpl/bad.php', line: 2, severity: 'error' })
    expect(r[0].message).toMatch(/unexpected token "\{"/)
    expect(ext.parsePhpLint('No syntax errors detected in a.php', 'a.php')).toEqual([])
  })
  it('reads PHPStan 2 JSON, with its identifier and tip', () => {
    const r = ext.parsePhpstan(fx('phpstan.json'))
    expect(r.map((x) => [x.line, x.code])).toEqual([
      [8, 'property.notFound'],
      [13, 'variable.undefined']
    ])
    expect(r[0].file).toBe('/tmp/pst/app/User.php')
    expect(r[0].message).toMatch(/Learn more/)
    // PHPStan prints a note before the JSON when it is not quiet.
    expect(ext.parsePhpstan(` ! [NOTE] something\n${fx('phpstan.json')}`).length).toBe(2)
    expect(ext.parsePhpstan('not json')).toEqual([])
  })
  it('reads Psalm JSON', () => {
    const r = ext.parsePsalm(fx('psalm.json'))
    expect(r.map((x) => [x.line, x.column, x.code, x.severity])).toEqual([
      [8, 16, 'UndefinedThisPropertyFetch', 'error'],
      [13, 21, 'UndefinedVariable', 'error']
    ])
  })
  it('reads Semgrep JSON, with paths made absolute', () => {
    const r = ext.parseSemgrep(fx('semgrep.json'), '/tmp/pst')
    expect(r.length).toBe(2)
    expect(r[0]).toMatchObject({ file: '/tmp/pst/app/db.php', line: 3, severity: 'error', code: 'tainted-sql-string' })
  })
  it('reads the AI’s findings from a json block, and ignores everything else', () => {
    const answer = 'I read the controller.\n\n```json\n[{"file":"app/Http/Controllers/OrderController.php","line":41,"severity":"critical","title":"Any user can read any order","why":"show() does not check the owner.","fix":"Scope the query to the user."},{"file":"routes/web.php","line":"7","severity":"low","title":"Unused route"}]\n```'
    const r = ext.parseAiFindings(answer, '/w/shop')
    expect(r[0]).toMatchObject({ file: '/w/shop/app/Http/Controllers/OrderController.php', line: 41, severity: 'error', code: 'critical' })
    expect(r[0].message).toMatch(/Fix: Scope/)
    expect(r[1]).toMatchObject({ line: 7, severity: 'info' })
    expect(ext.parseAiFindings('Nothing worth reporting.\n```json\n[]\n```', '/w')).toEqual([])
    expect(ext.parseAiFindings('no json here', '/w')).toEqual([])
  })
  it('asks for a read-only review in the framework’s own terms', () => {
    const p = ext.aiPrompt('app/User.php', true)
    expect(p).toMatch(/the file app\/User\.php/)
    expect(p).toMatch(/do not change anything/)
    expect(p).toMatch(/laravel-best-practices/)
  })
  it('prefers the project’s own PHPStan over the global one', () => {
    const root = join(tmp, 'proj')
    mkdirSync(join(root, 'vendor', 'bin'), { recursive: true })
    const glob = join(tmp, 'global')
    mkdirSync(glob, { recursive: true })
    writeFileSync(join(glob, 'phpstan'), '')
    expect(ext.findTool(root, 'phpstan', [glob])).toBe(join(glob, 'phpstan'))
    writeFileSync(join(root, 'vendor', 'bin', 'phpstan'), '')
    expect(ext.findTool(root, 'phpstan', [glob])).toBe(join(root, 'vendor', 'bin', 'phpstan'))
    expect(ext.findTool(root, 'psalm', [glob])).toBeNull()
  })
})

describe('Laramac Code setup', () => {
  it('adds Phpactor for refactoring and switches off its completion and diagnostics', () => {
    expect(IDE_EXTENSIONS.map((e) => e.id)).toContain('phpactor.vscode-phpactor')
    const c = phpactorConfig()
    for (const k of PHPACTOR_COMPLETORS) expect(c[`completion_worse.completor.${k}.enabled`]).toBe(false)
    expect(c['language_server_worse_reflection.diagnostics.enable']).toBe(false)
    expect(c['language_server_phpstan.enabled']).toBe(false)
    const s = ideSettings({ font: 'system', fontSize: 14, phpPath: '/L/php', phpVersion: '8.4.0', appearance: 'auto' })
    expect(s.managed['phpactor.executablePath']).toBe('/L/php')
    expect(s.managed['chat.disableAIFeatures']).toBe(true)
    expect(s.defaults['laramac.ai']).toBe('ask')
  })
  it('describes the Laramac Checks extension: commands, settings and only these AI choices', () => {
    const p = checksPackage('1.0.7') as { main: string; contributes: { commands: { command: string }[]; configuration: { properties: Record<string, { enum?: string[] }> } } }
    expect(p.main).toBe('./extension.js')
    expect(p.contributes.commands.map((c) => c.command)).toEqual(expect.arrayContaining(['laramac.checkFile', 'laramac.reviewFile', 'laramac.reviewProject']))
    expect(p.contributes.configuration.properties['laramac.ai'].enum).toEqual(['ask', 'claude', 'claudelm', 'claudefree'])
    expect(vsixManifest('1.0.7', { id: 'laramac-checks', name: 'Laramac Checks', description: 'x', category: 'Linters' })).toMatch(/Id="laramac-checks" Version="1.0.7"/)
  })
  it('gives the editor Laramac’s look, with Poppins only when chosen', () => {
    const fonts = [{ weight: 400, url: 'data:font/woff2;base64,AAAA' }]
    const p = workbenchCss({ uiFont: 'poppins', fonts })
    expect(p).toMatch(/@font-face\{font-family:'Laramac Poppins'/)
    expect(p).toMatch(/\.monaco-workbench\{font-family:'Laramac Poppins'/)
    const sys = workbenchCss({ uiFont: 'system', fonts })
    expect(sys).not.toMatch(/@font-face/)
    // Only the interface: the code itself keeps its monospaced font.
    expect(sys).not.toMatch(/\.view-lines/)
  })
})

describe('Laravel’s own skills (Laravel Boost)', () => {
  it('finds them where Laravel Boost keeps them, and leaves out the paid ones', () => {
    const pack = SKILL_PACKS.find((p) => p.id === 'laravel')!
    expect(pack.repo).toBe('laravel/boost')
    expect(pack.license).toBe('MIT')
    expect(pack.pick).not.toContain('fluxui-pro-development')
    expect(pack.pick).not.toContain('deploying-to-cloud')
    // The layout of github.com/laravel/boost at 541d0f85 (November 2026).
    const repo = join(tmp, 'boost')
    for (const [n, p] of Object.entries(pack.paths!)) {
      mkdirSync(join(repo, p, 'rules'), { recursive: true })
      writeFileSync(join(repo, p, 'SKILL.md'), `---\nname: ${n}\ndescription: ${n}\n---\n`)
    }
    expect(packContents(pack, repo)).toEqual(pack.pick)
  })
  it('recommends them for a Laravel project with Tailwind', () => {
    const root = join(tmp, 'shop')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'artisan'), '')
    writeFileSync(join(root, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^12.0', 'laravel/pennant': '^1.0' } }))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0' } }))
    const stack = detectStack(root)
    expect(stack).toEqual(expect.arrayContaining(['laravel', 'tailwind', 'pennant']))
    const packs = join(tmp, 'packs')
    mkdirSync(join(packs, 'laravel', 'repo'), { recursive: true })
    mkdirSync(join(packs, 'laravel', 'plugin', 'skills'), { recursive: true })
    for (const n of ['laravel-best-practices', 'tailwindcss-development', 'pennant-development']) {
      mkdirSync(join(packs, 'laravel', 'plugin', 'skills', n), { recursive: true })
      writeFileSync(join(packs, 'laravel', 'plugin', 'skills', n, 'SKILL.md'), `---\nname: ${n}\ndescription: ${n}\n---\n`)
    }
    writeFileSync(join(packs, 'laravel', 'state.json'), JSON.stringify({ id: 'laravel', installed: true, commit: 'x', at: null, loaded: ['laravel-best-practices', 'tailwindcss-development', 'pennant-development'] }))
    const items = skillCatalog({ app: 'Laramac', ownDir: join(tmp, 'own'), packsRoot: packs })
    const rec = recommend(items, stack)
    expect(rec).toEqual(expect.arrayContaining(['pack:laravel:laravel-best-practices', 'pack:laravel:tailwindcss-development', 'pack:laravel:pennant-development']))
    expect(recommend(items, ['php'])).not.toContain('pack:laravel:laravel-best-practices')
  })
  it('installs only from the list', async () => {
    await expect(installPack(join(tmp, 'nope'), 'someone/else')).rejects.toThrow(/not on the list/)
    expect(readdirSync(tmp)).not.toContain('nope-repo')
  })
})

describe('Settings carried over', () => {
  it('turns Midnight into Prism, and an unchosen editor into Laramac Code', () => {
    const s: Record<string, unknown> = { glassStyle: 'midnight', editor: 'auto' }
    expect(migrate(s as never)).toBe(true)
    expect(s).toMatchObject({ glassStyle: 'prism', editor: 'laramac' })
    const kept: Record<string, unknown> = { glassStyle: 'aurora', editor: 'phpstorm' }
    migrate(kept as never)
    expect(kept).toMatchObject({ glassStyle: 'aurora', editor: 'phpstorm' })
  })
})

describe('Burp Suite Professional', () => {
  it('shows the edition from the app’s name', async () => {
    const { appEdition } = await import('../src/main/aitools')
    expect(appEdition('Burp Suite', '/Applications/Burp Suite Professional.app')).toBe('Burp Suite Professional')
    expect(appEdition('Burp Suite', '/Applications/Burp Suite Community Edition.app')).toBe('Burp Suite Community')
    expect(appEdition('Burp Suite', null)).toBe('Burp Suite')
    expect(appEdition('LM Studio', '/Applications/LM Studio.app')).toBe('LM Studio')
  })
})
