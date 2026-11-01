import { execFileSync, spawnSync } from 'child_process'
import { statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { assertMinor, isWebUrl, sanitizeSettingsPatch } from '../src/main/validate'
import { caCertPath, ensureCa, ensureSiteCert } from '../src/main/ssl'
import { installResolver } from '../src/main/dns'
import { parseSha256 } from '../src/main/download'
import { generateApacheConf, generateNginxConf } from '../src/main/configgen'
import { dirs } from '../src/main/paths'
import { freshEnv } from './helpers'

describe('settings from the renderer', () => {
  it('accepts valid values', () => {
    expect(sanitizeSettingsPatch({ tld: 'test', httpPort: 8080, allowLan: true })).toEqual({
      tld: 'test',
      httpPort: 8080,
      allowLan: true
    })
  })

  it('refuses suffixes that are real TLDs or that smuggle shell commands', () => {
    expect(() => sanitizeSettingsPatch({ tld: 'com' })).toThrow()
    expect(() => sanitizeSettingsPatch({ tld: 'test; rm -rf ~' })).toThrow()
    expect(() => sanitizeSettingsPatch({ tld: 'test$(id)' })).toThrow()
  })

  it('refuses unknown keys, so per-site config cannot be overwritten in bulk', () => {
    expect(() => sanitizeSettingsPatch({ siteConfig: {} })).toThrow()
    expect(() => sanitizeSettingsPatch({ __proto__: { x: 1 }, evil: true })).toThrow()
  })

  it('refuses bad ports, versions, tokens and model addresses', () => {
    expect(() => sanitizeSettingsPatch({ httpPort: 0 })).toThrow()
    expect(() => sanitizeSettingsPatch({ httpPort: '80' })).toThrow()
    expect(() => sanitizeSettingsPatch({ mysqlVersion: '../../8.4' })).toThrow()
    expect(() => sanitizeSettingsPatch({ ngrokToken: 'abc def' })).toThrow()
    expect(() => sanitizeSettingsPatch({ llm: { baseUrl: 'file:///etc/passwd', model: 'x' } })).toThrow()
  })

  it('refuses system folders as the projects folder', () => {
    expect(() => sanitizeSettingsPatch({ wwwPath: '/' })).toThrow()
    expect(() => sanitizeSettingsPatch({ wwwPath: '/etc/nginx' })).toThrow()
    expect(() => sanitizeSettingsPatch({ wwwPath: 'relative/path' })).toThrow()
    expect(sanitizeSettingsPatch({ wwwPath: '/Users/me/Sites/' })).toEqual({ wwwPath: '/Users/me/Sites' })
  })
})

describe('other inputs', () => {
  it('only treats plain versions as PHP versions (no path traversal)', () => {
    expect(assertMinor('8.3')).toBe('8.3')
    expect(() => assertMinor('../..')).toThrow()
    expect(() => assertMinor('8.3/../../x')).toThrow()
  })

  it('only opens web addresses', () => {
    expect(isWebUrl('https://shop.test')).toBe(true)
    expect(isWebUrl('file:///Applications/Calculator.app')).toBe(false)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
  })

  it('never runs the admin command with a suffix outside the allow list', async () => {
    await expect(installResolver('com')).rejects.toThrow('not allowed')
  })

  it('reads checksum files in the formats publishers use', () => {
    const h = 'a'.repeat(64)
    expect(parseSha256(`${h}  composer.phar`)).toBe(h)
    expect(parseSha256(h)).toBe(h)
    expect(parseSha256('nothing here')).toBeNull()
  })
})

describe('network exposure', () => {
  const base = {
    sites: [{ domain: 'a.test', docRoot: '/tmp/a', kind: 'php' as const, phpPort: 9083, secure: false }],
    extras: []
  }
  it('Nginx only answers this Mac unless LAN access is turned on', () => {
    const opts = {
      ...base,
      httpPort: 80,
      httpsPort: 443,
      pidFile: '/p',
      errorLog: '/e',
      accessLog: '/a',
      fastcgiParamsFile: '/f',
      tempDir: '/t'
    }
    expect(generateNginxConf(opts)).toContain('allow 127.0.0.1;')
    expect(generateNginxConf({ ...opts, allowLan: true })).not.toContain('allow 127.0.0.1;')
  })
  it('Apache listens on loopback unless LAN access is turned on', () => {
    const opts = { ...base, port: 8080, httpsPort: 8443, modulesDir: '/m', pidFile: '/p', errorLog: '/e', accessLog: '/a', serverRoot: '/s' }
    expect(generateApacheConf(opts)).toContain('Listen 127.0.0.1:8080')
    expect(generateApacheConf({ ...opts, allowLan: true })).toContain('Listen 8080')
  })
})

const hasOpenssl = spawnSync('which', ['openssl']).status === 0

describe.skipIf(!hasOpenssl)('local certificate authority', () => {
  it('signs certificates for .test sites that verify', async () => {
    freshEnv()
    const cert = await ensureSiteCert('shop.test')
    const out = execFileSync('openssl', ['verify', '-CAfile', caCertPath(), cert.cert]).toString()
    expect(out).toContain('OK')
  })

  it('refuses to issue certificates for real domains', async () => {
    freshEnv()
    await expect(ensureSiteCert('google.com')).rejects.toThrow('only issued')
  })

  it('cannot vouch for real websites even if its key leaked', async () => {
    freshEnv()
    await ensureCa('test')
    // Sign a certificate for a real domain with the CA key directly, as an attacker would.
    const key = join(dirs.certs(), 'evil.key')
    const csr = join(dirs.certs(), 'evil.csr')
    const crt = join(dirs.certs(), 'evil.crt')
    const ext = join(dirs.certs(), 'evil.ext')
    writeFileSync(ext, 'subjectAltName = DNS:google.com\n')
    execFileSync('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=google.com'])
    execFileSync('openssl', [
      'x509', '-req', '-in', csr, '-CA', caCertPath(), '-CAkey', join(dirs.certs(), 'laramac-ca.key'),
      '-CAcreateserial', '-out', crt, '-days', '30', '-extfile', ext
    ])
    const res = spawnSync('openssl', ['verify', '-CAfile', caCertPath(), crt], { encoding: 'utf8' })
    expect(res.status).not.toBe(0)
    expect(res.stdout + res.stderr).toMatch(/permitted subtree violation|name constraint/i)
  })

  it('keeps private keys readable only by you', async () => {
    freshEnv()
    const cert = await ensureSiteCert('blog.test')
    const mode = (p: string): string => (statSync(p).mode & 0o777).toString(8)
    expect(mode(cert.key)).toBe('600')
    expect(mode(join(dirs.certs(), 'laramac-ca.key'))).toBe('600')
    expect(mode(dirs.certs())).toBe('700')
  })
})
