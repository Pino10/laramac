import { execFileSync, spawn, spawnSync, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate, getSettings, resetSettingsCache, setSettings } from '../src/main/settings'
import { generateApacheConf, generatePhpIni } from '../src/main/configgen'
import { hashFor, parseLaramacPhpAssets } from '../src/main/versions'
import { pickUpdate } from '../src/main/updatecheck'
import { setRoot, dirs } from '../src/main/paths'
import * as ssh from '../src/main/ssh'
import { waitForPort } from '../src/main/process'

describe('settings survive updates', () => {
  it('moves 0.5 Apache ports to the second server and keeps everything else', () => {
    const old: Record<string, unknown> = { wwwPath: '/Users/me/www', httpPort: 80, apachePort: 8081, apacheHttpsPort: 8444, tld: 'test', defaultPhp: '8.4' }
    expect(migrate(old)).toBe(true)
    expect(old).toMatchObject({ wwwPath: '/Users/me/www', secondaryHttpPort: 8081, secondaryHttpsPort: 8444, defaultPhp: '8.4' })
    expect(old.apachePort).toBeUndefined()
  })

  it('remembers choices on disk so a new default never moves an existing setup', () => {
    const root = mkdtempSync(join(tmpdir(), 'lm-set-'))
    setRoot(root)
    resetSettingsCache()
    setSettings({ defaultPhp: '8.3' })
    const saved = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'))
    expect(saved.wwwPath).toBe(getSettings().wwwPath)
    expect(saved.primaryServer).toBe('apache')
    resetSettingsCache()
    expect(getSettings().defaultPhp).toBe('8.3')
  })
})

describe('Apache is protected when it listens on every interface', () => {
  const base = {
    sites: [{ domain: 'a.test', docRoot: '/tmp/a', kind: 'php' as const, phpPort: 9085, secure: false }],
    extras: [],
    port: 80,
    httpsPort: 443,
    modulesDir: '/m',
    pidFile: '/p',
    errorLog: '/e',
    accessLog: '/a',
    serverRoot: '/s'
  }
  it('admits only this Mac by default', () => {
    const conf = generateApacheConf(base)
    expect(conf).toContain('Listen 80')
    expect(conf).toContain('Require local')
    expect(conf).not.toContain('Require all granted')
  })
  it('admits the network only when you allow it', () => {
    expect(generateApacheConf({ ...base, allowLan: true })).toContain('Require all granted')
  })
})

const PHP = spawnSync('which', ['php']).status === 0
describe.skipIf(!PHP)('php.ini', () => {
  it('is accepted by real PHP without warnings, with your own settings winning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-ini-'))
    const ini = join(dir, 'php.ini')
    writeFileSync(
      ini,
      generatePhpIni({
        minor: '8.3',
        errorLog: join(dir, 'err.log'),
        sessionDir: dir,
        extensions: ['mysqli', 'apcu', 'intl'],
        timezone: 'Europe/London',
        custom: 'memory_limit = 1G'
      })
    )
    const res = spawnSync('php', ['-n', '-c', ini, '-r', 'echo ini_get("memory_limit"),"|",ini_get("date.timezone"),"|",ini_get("session.save_path");'], { encoding: 'utf8' })
    expect(res.stderr).not.toMatch(/Warning|Error|deprecated/i)
    expect(res.stdout).toBe(`1G|Europe/London|${dir}`)
  })

  it('leaves out settings newer PHP deprecated', () => {
    const ini = generatePhpIni({ minor: '8.5', errorLog: '/e' })
    expect(ini).not.toMatch(/sid_length|sid_bits_per_character/)
    expect(ini).not.toContain('opcache.jit = off')
    expect(generatePhpIni({ minor: '8.2', errorLog: '/e' })).toContain('opcache.jit = off')
  })
})

describe('PHP builds and checksums', () => {
  it('reads Laramac PHP builds from release assets', () => {
    const u = (n: string): { name: string; browser_download_url: string } => ({ name: n, browser_download_url: `https://x/${n}` })
    const builds = parseLaramacPhpAssets(
      [
        u('php-8.5.12-cli-macos-aarch64.tar.gz'),
        u('php-8.5.12-fpm-macos-aarch64.tar.gz'),
        u('php-8.5.12-macos-aarch64.sha256'),
        u('php-8.5.11-cli-macos-aarch64.tar.gz'),
        u('php-8.5.11-fpm-macos-aarch64.tar.gz'),
        u('php-8.4.27-fpm-macos-aarch64.tar.gz') // no CLI: skipped
      ],
      'aarch64'
    )
    expect(Object.keys(builds)).toEqual(['8.5'])
    expect(builds['8.5']).toMatchObject({ version: '8.5.12', source: 'laramac', sumsUrl: 'https://x/php-8.5.12-macos-aarch64.sha256' })
  })

  it('never offers a Laramac PHP build without its checksum list', () => {
    const u = (n: string): { name: string; browser_download_url: string } => ({ name: n, browser_download_url: `https://x/${n}` })
    const builds = parseLaramacPhpAssets([u('php-8.5.12-cli-macos-aarch64.tar.gz'), u('php-8.5.12-fpm-macos-aarch64.tar.gz')], 'aarch64')
    expect(builds).toEqual({})
  })

  it('finds a file in a checksum list', () => {
    const a = 'a'.repeat(64)
    const b = 'b'.repeat(64)
    expect(hashFor(`${a}  php-8.5.12-cli-macos-aarch64.tar.gz\n${b}  Laramac-0.6.0-arm64.dmg\n`, 'Laramac-0.6.0-arm64.dmg')).toBe(b)
    expect(hashFor(`${a}  other.dmg`, 'Laramac-0.6.0-arm64.dmg')).toBeNull()
  })
})

describe('app updates', () => {
  const rel = (tag: string, assets: string[], extra: Record<string, unknown> = {}): never =>
    ({
      tag_name: tag,
      draft: false,
      body: `Notes for ${tag}`,
      published_at: '2026-11-01T00:00:00Z',
      html_url: `https://github.com/x/releases/${tag}`,
      assets: assets.map((n) => ({ name: n, browser_download_url: `https://dl/${n}` })),
      ...extra
    }) as never

  it('offers the newest app release for this chip, ignoring server builds and drafts', () => {
    const picked = pickUpdate(
      [
        rel('php-builds', ['php-8.5.12-fpm-macos-aarch64.tar.gz']),
        rel('v0.6.0', ['Laramac-0.6.0-arm64.dmg', 'Laramac-0.6.0-x64.dmg', 'SHA256SUMS.txt']),
        rel('v0.7.0', ['Laramac-0.7.0-arm64.dmg', 'SHA256SUMS.txt'], { draft: true }),
        rel('v0.5.2', ['Laramac-0.5.2-arm64.dmg', 'SHA256SUMS.txt'])
      ],
      '0.5.2',
      'arm64'
    )
    expect(picked?.info.version).toBe('0.6.0')
    expect(picked?.dmg).toBe('https://dl/Laramac-0.6.0-arm64.dmg')
  })

  it('never offers a release it cannot verify', () => {
    expect(pickUpdate([rel('v0.6.0', ['Laramac-0.6.0-arm64.dmg'])], '0.5.2', 'arm64')).toBeNull()
  })

  it('says nothing when you are up to date', () => {
    expect(pickUpdate([rel('v0.6.0', ['Laramac-0.6.0-arm64.dmg', 'SHA256SUMS.txt'])], '0.6.0', 'arm64')).toBeNull()
  })
})

describe('SSH servers', () => {
  const crypto: ssh.Crypto = { available: () => true, encrypt: (s) => Buffer.from(s).toString('base64'), decrypt: (s) => Buffer.from(s, 'base64').toString() }

  it('refuses hosts and users that could smuggle options', () => {
    const base = { name: 'x', host: 'example.com', port: 22, user: 'deploy', auth: 'agent' as const }
    expect(() => ssh.validateServer(base)).not.toThrow()
    expect(() => ssh.validateServer({ ...base, host: '-oProxyCommand=sh' })).toThrow()
    expect(() => ssh.validateServer({ ...base, user: 'root;rm' })).toThrow()
    expect(() => ssh.validateServer({ ...base, port: 0 })).toThrow()
  })

  it('never sends saved passwords to the page and stores them encrypted', () => {
    setRoot(mkdtempSync(join(tmpdir(), 'lm-ssh-')))
    const list = ssh.saveServer({ name: 'Prod', host: 'example.com', port: 22, user: 'me', auth: 'password', password: 'hunter2' }, crypto)
    expect(list[0].hasPassword).toBe(true)
    expect(JSON.stringify(list)).not.toContain('hunter2')
    expect(readFileSync(join(dirs.root(), 'servers.json'), 'utf8')).not.toContain('hunter2')
  })
})

// ---------------------------------------------------------------- Real SFTP against OpenSSH

const SSHD = existsSync('/usr/sbin/sshd') && process.platform === 'linux' && process.getuid?.() === 0
describe.skipIf(!SSHD)('SFTP against a real OpenSSH server', () => {
  let sshd: ChildProcess
  const dir = mkdtempSync(join(tmpdir(), 'lm-sshd-'))
  const PORT = 2299
  const crypto: ssh.Crypto = { available: () => true, encrypt: (s) => s, decrypt: (s) => s }
  let id = ''

  beforeAll(async () => {
    setRoot(join(dir, 'laramac'))
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(dir, 'host_key')])
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(dir, 'user_key')])
    mkdirSync('/root/.ssh', { recursive: true, mode: 0o700 })
    writeFileSync(join(dir, 'authorized_keys'), readFileSync(join(dir, 'user_key.pub')))
    execFileSync('chmod', ['600', join(dir, 'authorized_keys')])
    mkdirSync('/run/sshd', { recursive: true })
    sshd = spawn('/usr/sbin/sshd', [
      '-D', '-e', '-p', String(PORT),
      '-h', join(dir, 'host_key'),
      '-o', `AuthorizedKeysFile=${join(dir, 'authorized_keys')}`,
      '-o', 'PasswordAuthentication=no',
      '-o', 'PermitRootLogin=prohibit-password',
      '-o', 'StrictModes=no',
      '-o', 'ListenAddress=127.0.0.1',
      '-o', 'Subsystem=sftp internal-sftp',
      '-o', `PidFile=${join(dir, 'sshd.pid')}`
    ], { stdio: 'ignore' })
    expect(await waitForPort(PORT, 10000)).toBe(true)
    id = ssh.saveServer({ name: 'Local', host: '127.0.0.1', port: PORT, user: 'root', auth: 'key', keyPath: join(dir, 'user_key') }, crypto)[0].id
  })

  afterAll(() => {
    ssh.disconnectAll()
    sshd?.kill()
  })

  it('asks you to confirm an unknown server first, showing its real fingerprint', async () => {
    const res = await ssh.connectSftp(id, null, crypto)
    expect(res.status).toBe('unknown-host')
    const real = execFileSync('ssh-keygen', ['-l', '-E', 'sha256', '-f', join(dir, 'host_key.pub')]).toString().split(' ')[1]
    if (res.status === 'unknown-host') {
      expect(res.fingerprint).toBe(real)
      ssh.trustHostKey(id, res.fingerprint)
    }
  })

  it('browses, uploads, downloads, renames and deletes files', async () => {
    const res = await ssh.connectSftp(id, null, crypto)
    expect(res.status).toBe('connected')
    if (res.status !== 'connected') return
    const work = join(dir, 'remote')
    mkdirSync(work)
    writeFileSync(join(work, 'hello.txt'), 'hello from the server')

    const listing = await ssh.listDir(res.session, work)
    expect(listing.entries.map((e) => e.name)).toEqual(['hello.txt'])

    const local = join(dir, 'local')
    mkdirSync(local)
    expect(await ssh.download(res.session, [join(work, 'hello.txt')], local)).toBe(1)
    expect(readFileSync(join(local, 'hello.txt'), 'utf8')).toBe('hello from the server')

    writeFileSync(join(local, 'up.txt'), 'uploaded')
    await ssh.upload(res.session, [join(local, 'up.txt')], work)
    expect(readFileSync(join(work, 'up.txt'), 'utf8')).toBe('uploaded')

    await ssh.mkdir(res.session, work, 'assets')
    await ssh.rename(res.session, join(work, 'up.txt'), 'renamed.txt')
    await ssh.remove(res.session, join(work, 'hello.txt'), false)
    const after = await ssh.listDir(res.session, work)
    expect(after.entries.map((e) => `${e.type}:${e.name}`)).toEqual(['dir:assets', 'file:renamed.txt'])

    await expect(ssh.mkdir(res.session, work, '../escape')).rejects.toThrow()
  })

  it('refuses to connect if the server identity changes', async () => {
    ssh.trustHostKey(id, 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    await expect(ssh.connectSftp(id, null, crypto)).rejects.toThrow(/identity changed/)
  })
})
