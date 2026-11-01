import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { parseComposerAudit, parseNpmAudit } from '../src/main/audit'
import { normalizeBase } from '../src/main/models'
import { pushableFiles, scanSecrets, listRemoteRepos } from '../src/main/review'

describe('0.16.1', () => {
  it('adds /v1 to a bare OpenAI address only', () => {
    expect(normalizeBase('http://127.0.0.1:8000', 'openai')).toBe('http://127.0.0.1:8000/v1')
    expect(normalizeBase('127.0.0.1:1234/', 'openai')).toMatch(/^http:\/\/127\.0\.0\.1:1234\/v1$/)
    expect(normalizeBase('https://openrouter.ai/api/v1', 'openai')).toBe('https://openrouter.ai/api/v1')
    expect(normalizeBase('http://127.0.0.1:8000', 'anthropic')).toBe('http://127.0.0.1:8000')
    expect(normalizeBase('http://127.0.0.1:8000/v1', 'anthropic')).toBe('http://127.0.0.1:8000')
  })

  it('reads composer audit output', () => {
    const json = JSON.stringify({
      advisories: { 'guzzlehttp/guzzle': [{ title: 'Cookie leak', cve: 'CVE-2022-31042', link: 'https://x', affectedVersions: '<7.4.4', severity: 'high' }] },
      abandoned: { 'swiftmailer/swiftmailer': 'symfony/mailer' }
    })
    const f = parseComposerAudit(json)
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ package: 'guzzlehttp/guzzle', severity: 'high', id: 'CVE-2022-31042' })
    expect(f[1].title).toContain('symfony/mailer')
  })

  it('reads npm audit output and skips indirect entries', () => {
    const json = JSON.stringify({
      vulnerabilities: {
        axios: { severity: 'moderate', range: '<1.6.0', fixAvailable: true, via: [{ title: 'CSRF', url: 'https://gh/advisory' }] },
        wrapper: { severity: 'moderate', via: ['axios'], fixAvailable: true }
      }
    })
    const f = parseNpmAudit(json)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ package: 'axios', severity: 'medium', fix: 'npm audit fix' })
  })

  it('checks only files git would push', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'laramac-push-'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    writeFileSync(join(dir, '.gitignore'), '.env\n')
    writeFileSync(join(dir, '.env'), 'STRIPE_SECRET=sk_live_' + 'a'.repeat(30) + '\n')
    mkdirSync(join(dir, 'config'))
    writeFileSync(join(dir, 'config', 'pay.php'), "<?php return ['key' => 'sk_live_" + 'b'.repeat(30) + "'];\n")
    const files = await pushableFiles(dir)
    expect(files).toContain('config/pay.php')
    expect(files).not.toContain('.env')
    const hits = await scanSecrets(dir, files)
    expect(hits.map((h) => h.file)).toEqual(['config/pay.php'])
  })

  it('asks for a token and a valid organization', async () => {
    await expect(listRemoteRepos('github', '  ')).rejects.toThrow(/token/)
    await expect(listRemoteRepos('azure', 'abc', 'bad org!')).rejects.toThrow(/organization/)
  })
})
