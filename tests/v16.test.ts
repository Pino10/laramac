import { execFile, execFileSync, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { dirs } from '../src/main/paths'
import { generateFpmConf, generatePmaConfig } from '../src/main/configgen'
import { laravelEnv } from '../src/shared/starters'
import type { SiteInfo } from '../src/shared/types'

const which = (b: string): boolean => spawnSync('which', [b]).status === 0
const fakeCrypto = { available: () => true, encrypt: (s: string) => `enc:${Buffer.from(s).toString('base64')}`, decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString() }
const site = (path: string, extra: Partial<SiteInfo> = {}): SiteInfo => ({
  name: 'shop',
  path,
  docRoot: join(path, 'public'),
  domain: 'shop.test',
  url: 'http://shop.test',
  httpsUrl: 'https://shop.test',
  kind: 'laravel',
  secure: false,
  php: '8.4',
  aliases: [],
  ...extra
})

describe('laramac.yml', () => {
  it('reads a project file and refuses anything unsafe or unknown', async () => {
    const { parseProjectFile } = await import('../src/main/project')
    const f = parseProjectFile(`
php: "8.3"
https: true
aliases: [shop.local]
services: [mysql, redis, mailpit]
database: { engine: mysql, name: shop }
dev: npm run dev
setup:
  - composer install
  - npm install
something_new: ignored
`)
    expect(f).toEqual({
      php: '8.3',
      https: true,
      aliases: ['shop.local'],
      services: ['mysql', 'redis', 'mailpit'],
      database: { engine: 'mysql', name: 'shop' },
      dev: { command: 'npm run dev', proxy: true },
      setup: ['composer install', 'npm install']
    })
    expect(() => parseProjectFile('php: latest')).toThrow(/8.4/)
    expect(() => parseProjectFile('services: [docker]')).toThrow(/not a service/)
    expect(() => parseProjectFile('database: { name: "x; DROP" }')).toThrow(/letters/)
    expect(() => parseProjectFile('aliases: ["evil.com/../x"]')).toThrow(/valid address/)
    expect(() => parseProjectFile('setup: ["a\\nb"]')).toThrow(/one line/)
    expect(() => parseProjectFile('a: [unclosed')).toThrow(/YAML/)
    expect(() => parseProjectFile('- just\n- a list')).toThrow(/list of settings/)
  })

  it('writes one from what the project uses, and plans before changing anything', async () => {
    const { www } = freshEnv()
    const { inferProject, writeProjectFile, readProjectFile, planProject } = await import('../src/main/project')
    const path = join(www, 'shop')
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, '.env'), 'DB_CONNECTION=mysql\nDB_PORT=3306\nDB_DATABASE=shop\nCACHE_STORE=redis\nMAIL_PORT=1025\n')
    writeFileSync(join(path, '.env.example'), '')
    writeFileSync(join(path, 'artisan'), '')
    writeFileSync(join(path, 'composer.json'), '{}')
    const s = site(path, { secure: true })
    const inferred = inferProject(s)
    expect(inferred).toMatchObject({ php: '8.4', https: true, services: ['mysql', 'redis', 'mailpit'], database: { engine: 'mysql', name: 'shop' } })
    expect(inferred.setup).toEqual(['composer install', 'cp -n .env.example .env', 'php artisan key:generate --no-interaction', 'php artisan migrate --no-interaction'])
    const text = writeProjectFile(s, inferred)
    expect(text.startsWith('# Laramac project file.')).toBe(true)
    const read = readProjectFile(s)!
    expect(read.file).toEqual(inferred)
    const plan = planProject(site(path, { php: '8.3', secure: false }), read.file, ['8.3'], [
      { id: 'mysql', installed: true },
      { id: 'redis', installed: false }
    ])
    expect(plan.steps).toEqual(['Install PHP 8.4 and use it', 'Turn on HTTPS', 'Start mysql', 'Install and start redis', 'Install and start mailpit', 'Create the mysql database shop'])
    expect(plan.commands).toEqual(inferred.setup)
  })

  it('marks a site whose laramac.yml is new or changed since it was applied', async () => {
    const { www } = freshEnv()
    const { scanSites, setSiteConfig } = await import('../src/main/sites')
    const { projectFileHash } = await import('../src/main/project')
    mkdirSync(join(www, 'shop'))
    writeFileSync(join(www, 'shop', 'laramac.yml'), 'php: "8.4"\n')
    expect(scanSites()[0].projectFile).toBe('new')
    setSiteConfig('shop', { projectHash: projectFileHash('php: "8.4"\n') })
    expect(scanSites()[0].projectFile).toBe('applied')
    writeFileSync(join(www, 'shop', 'laramac.yml'), 'php: "8.5"\n')
    expect(scanSites()[0].projectFile).toBe('new')
  })
})

describe('database root password', () => {
  it('is stored encrypted, reaches phpMyAdmin and new projects, and is passed to clients by environment', async () => {
    freshEnv()
    const { setSecretsCrypto, setSecret, dbPassword, dbEnv } = await import('../src/main/secrets')
    setSecretsCrypto(fakeCrypto)
    expect(dbPassword('mysql')).toBe('')
    expect(dbEnv('mysql').MYSQL_PWD).toBeUndefined()
    setSecret('mysql-root', "s3cr3t'x")
    expect(readFileSync(join(dirs.root(), 'secrets.json'), 'utf8')).not.toContain('s3cr3t')
    expect(dbPassword('mysql')).toBe("s3cr3t'x")
    expect(dbEnv('mysql').MYSQL_PWD).toBe("s3cr3t'x")
    expect(dbPassword('mariadb')).toBe('')
    const pma = generatePmaConfig('k', { mysql: "s3cr3t'x" })
    expect(pma).toContain("$cfg['Servers'][$i]['password'] = 's3cr3t\\'x';")
    expect(pma).toContain("$cfg['Servers'][$i]['password'] = '';")
    expect(spawnSync('php', ['-l'], { input: pma }).status === 0 || !which('php')).toBe(true)
    expect(laravelEnv('DB_CONNECTION=sqlite\n', 'mysql', 'shop', 'shop.test', 'pw')).toContain('DB_PASSWORD=pw')
    setSecret('mysql-root', '')
    expect(dbPassword('mysql')).toBe('')
  })
})

describe('dumps', () => {
  it('asks PHP-FPM to send dumps to Laramac only when turned on', () => {
    const on = generateFpmConf({ port: 9084, pidFile: 'p', errorLog: 'e', env: { VAR_DUMPER_FORMAT: 'server', VAR_DUMPER_SERVER: '127.0.0.1:9912' } })
    expect(on).toContain('env[VAR_DUMPER_FORMAT] = server')
    expect(on).toContain('env[VAR_DUMPER_SERVER] = 127.0.0.1:9912')
    expect(generateFpmConf({ port: 9084, pidFile: 'p', errorLog: 'e' })).not.toContain('VAR_DUMPER')
  })

  it.skipIf(!which('php') || !which('composer'))(
    'catches a real dump() sent the way Laravel and Symfony send it',
    async () => {
      freshEnv()
      const d = await import('../src/main/dumps')
      await d.installDumper()
      expect(d.dumperInstalled()).toBe(true)
      const port = 19912
      await d.startDumpServer(port)
      try {
        const got = new Promise<import('../src/shared/types').DumpItem>((resolve) => d.dumpEvents.once('dump', resolve))
        const script = join(dirs.root(), 'app.php')
        writeFileSync(script, `<?php\nrequire ${JSON.stringify(join(d.dumperDir(), 'vendor', 'autoload.php'))};\ndump(['user' => 'ada', 'roles' => ['admin', 'editor'], 'id' => 42]);\n`)
        const out = execFileSync('php', [script], { env: { ...process.env, VAR_DUMPER_FORMAT: 'server', VAR_DUMPER_SERVER: `127.0.0.1:${port}` }, encoding: 'utf8' })
        // Sent to the window, so nothing is printed by the script itself.
        expect(out).not.toContain('ada')
        const item = await got
        expect(item.text).toContain('"user" => "ada"')
        expect(item.text).toContain('"editor"')
        expect(item.html).toContain('sf-dump')
        expect(item.file).toBe(script)
        expect(item.line).toBe(3)
        expect(d.listDumps()[0].id).toBe(item.id)
        d.clearDumps()
        expect(d.listDumps()).toEqual([])
      } finally {
        d.stopDumpServer()
      }
    },
    240_000
  )

  it('ignores lines that are not dumps', async () => {
    const { parseDumpLine } = await import('../src/main/dumps')
    expect(parseDumpLine('{"ready":true}')).toBeNull()
    expect(parseDumpLine('garbage')).toBeNull()
    expect(parseDumpLine(JSON.stringify({ html: '<pre>x</pre>', text: 'x', file: '/a.php', line: 3, at: 5 }))).toMatchObject({ html: '<pre>x</pre>', file: '/a.php', line: 3, at: 5 })
  })
})

describe('the laramac command', () => {
  it('talks to the app with its private key and prints what it is told', async () => {
    freshEnv()
    const { startMcpServer } = await import('../src/main/mcp')
    const { installCli, cliScript } = await import('../src/main/cli')
    const calls: string[] = []
    const started: string[] = []
    const server = await startMcpServer({
      port: 53536,
      version: '0.16.0',
      onCall: (n) => calls.push(n),
      tools: [
        { name: 'list_services', description: '', inputSchema: { type: 'object', properties: {} }, run: async () => [{ name: 'MySQL', status: 'running', port: 3306 }, { name: 'Redis', status: 'stopped', port: 6379 }, { name: 'Mongo', status: 'not-installed' }] },
        { name: 'list_sites', description: '', inputSchema: { type: 'object', properties: {} }, run: async () => [{ name: 'shop', url: 'https://shop.test', kind: 'laravel', php: '8.4' }] },
        { name: 'start_service', description: '', inputSchema: { type: 'object', properties: {} }, run: async (a) => void started.push(String(a.id)) },
        { name: 'stop_service', description: '', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new Error('Unknown service: nope') } }
      ]
    })
    try {
      installCli(process.execPath)
      // Runs without blocking, so the server in this same process can answer.
      const run = (...args: string[]): Promise<{ out: string; err: string; code: number }> =>
        new Promise((resolve) => {
          execFile(process.execPath, [cliScript(), ...args], { encoding: 'utf8', timeout: 20000 }, (err, out, e) =>
            resolve({ out: String(out), err: String(e), code: err ? ((err as NodeJS.ErrnoException & { code?: number }).code as unknown as number) ?? 1 : 0 })
          )
        })
      const status = await run('status')
      expect(status.code).toBe(0)
      expect(status.out).toContain('MySQL')
      expect(status.out).toContain(':3306')
      expect(status.out).not.toContain('Mongo')
      expect((await run('sites')).out).toContain('https://shop.test')
      expect((await run('start', 'redis')).out).toContain('Started redis')
      expect(started).toEqual(['redis'])
      const bad = await run('stop', 'nope')
      expect(bad.code).toBe(1)
      expect(bad.err).toContain('Unknown service: nope')
      expect((await run('help')).out).toContain('laramac status')
      expect((await run('frobnicate')).err).toContain('Unknown command')
      expect(calls).toContain('list_services')
      expect(readFileSync(join(dirs.bin(), 'laramac'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE=1')
    } finally {
      server.close()
    }
  })

  it('says so when the app is not open', async () => {
    freshEnv()
    const { installCli, cliScript } = await import('../src/main/cli')
    installCli(process.execPath)
    const r = spawnSync(process.execPath, [cliScript(), 'status'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Open Laramac first|not answering/)
  })
})

describe('new services', () => {
  it('lists S3 storage and RabbitMQ with how to connect', async () => {
    freshEnv()
    const { services } = await import('../src/main/services')
    const list = services.list()
    expect(list.find((s) => s.id === 's3')).toMatchObject({ name: 'S3 storage', group: 'database', port: 9000 })
    expect(list.find((s) => s.id === 's3')!.connection).toContain('laramac-secret')
    expect(list.find((s) => s.id === 'rabbitmq')).toMatchObject({ name: 'RabbitMQ', port: 5672 })
  })
})

describe('site logs', () => {
  it('returns the full recent log, unredacted, for the log viewer', async () => {
    const { www } = freshEnv()
    const { collectSiteLogs } = await import('../src/main/sitedoctor')
    const path = join(www, 'shop')
    mkdirSync(join(path, 'storage', 'logs'), { recursive: true })
    writeFileSync(join(path, 'storage', 'logs', 'laravel.log'), Array.from({ length: 300 }, (_, i) => `[x] local.ERROR: line ${i} password=hunter2`).join('\n'))
    const full = collectSiteLogs(site(path), { lines: 400, redact: false })
    expect(full[0].text.split('\n')).toHaveLength(300)
    expect(full[0].text).toContain('hunter2')
    const forAi = collectSiteLogs(site(path))
    expect(forAi[0].text).not.toContain('hunter2')
    expect(existsSync(join(path, 'laramac.yml'))).toBe(false)
  })
})
