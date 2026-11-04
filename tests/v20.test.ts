import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { envPath, healthIssues, parseComposerOutdated, parseNpmOutdated, readEnv, reconCsv, reconDiff, reconUrls, reviewFindings, wantedNode, writeEnvFile } from '../src/main/hub'
import type { ServiceInfo, SiteInfo } from '../src/shared/types'

const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const svc = (id: string, status: ServiceInfo['status'], error?: string): ServiceInfo => ({ id: id as never, name: id === 'apache' ? 'Apache' : id, description: '', status, group: 'web' as never, port: id === 'apache' ? 80 : undefined, error })
const site = (name: string, extra: Partial<SiteInfo> = {}): SiteInfo => ({ name, path: `/tmp/none/${name}`, docRoot: '', domain: `${name}.test`, url: `http://${name}.test`, httpsUrl: '', kind: 'node', secure: false, php: null, aliases: [], ...extra })

describe('Doctor', () => {
  it('says what is wrong and how to fix it', () => {
    const issues = healthIssues({ services: [svc('apache', 'stopped'), svc('php', 'stopped')], sites: [site('blog', { kind: 'wordpress' })], dnsReady: false, httpPort: 80, nodeMajor: null, probes: {} })
    expect(issues.map((i) => [i.id, i.fix])).toEqual([
      ['web-stopped', 'start-web'],
      ['dns', 'setup-dns'],
      ['php', 'restart:php']
    ])
  })
  it('explains a port that another program holds', () => {
    const [i] = healthIssues({ services: [svc('apache', 'error', '(48)Address already in use: AH00072: make_sock: could not bind to address [::]:80')], sites: [], dnsReady: true, httpPort: 80, nodeMajor: null, probes: {} }).filter((x) => x.id === 'svc-apache')
    expect(i.detail).toMatch(/Port 80 is used by another program/)
    expect(i.fix).toBe('restart:apache')
  })
  it('checks every site answers, and stopped dev servers', () => {
    const issues = healthIssues({
      services: [svc('nginx', 'running')],
      sites: [site('shop', { dev: { port: 5170, proxy: true, running: false, command: 'npm run dev' } }), site('api'), site('blog'), site('ok')],
      dnsReady: true,
      httpPort: 80,
      nodeMajor: null,
      probes: { api: null, blog: 502, ok: 200 }
    })
    expect(issues.map((i) => [i.id, i.fix])).toEqual([
      ['dev-shop', 'start-dev:shop'],
      ['down-api', 'logs:api'],
      ['5xx-blog', 'logs:blog']
    ])
  })
  it('notices a project that asks for another Node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-node-'))
    writeFileSync(join(dir, '.nvmrc'), 'v20.11.0\n')
    expect(wantedNode(dir)).toBe('20')
    const issues = healthIssues({ services: [], sites: [site('x', { path: dir })], dnsReady: true, httpPort: 80, nodeMajor: '24', probes: {} })
    expect(issues.find((i) => i.id === 'node-x')?.title).toBe('x asks for Node 20')
  })
})

describe('.env editor', () => {
  it('edits only .env files inside the site', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-env2-'))
    mkdirSync(join(dir, 'sub'))
    const s = site('a', { path: dir })
    writeEnvFile(s, '.env', 'APP_NAME=shop')
    expect(readEnv(s, '.env')).toBe('APP_NAME=shop\n')
    expect(readEnv(s, '.env.local')).toBe('')
    expect(() => envPath(s, '../.env')).toThrow()
    expect(() => envPath(s, 'config.php')).toThrow()
  })
})

describe('packages', () => {
  it('reads real npm outdated output', () => {
    const p = parseNpmOutdated(fx('npm-outdated.json'))
    expect(p.length).toBeGreaterThan(1)
    const node = p.find((x) => x.name === '@types/node')!
    expect(node).toMatchObject({ manager: 'npm', current: '20.19.43', latest: '26.6.6', major: true })
  })
  it('reads real composer outdated output', () => {
    expect(parseComposerOutdated(fx('composer-outdated.json'))[0]).toMatchObject({ name: 'psr/log', manager: 'composer', current: '1.1.0', latest: '3.0.2', major: true })
  })
})

describe('review findings', () => {
  it('reads the report format reviewers write', () => {
    const md = `## Summary\nTwo problems.\n\n## Findings\n### [HIGH] SQL injection in orders export\nFile: app/Reports/Export.php:77\nWhat: the status comes straight from the request.\nFix: use bindings.\n\n### [LOW] **Verbose errors**\nFile: \`config/app.php\`\nWhat: debug is on.\nFix: set APP_DEBUG=false.\n`
    expect(reviewFindings(md)).toEqual([
      { index: 0, severity: 'high', title: 'SQL injection in orders export', file: 'app/Reports/Export.php', line: 77, what: 'the status comes straight from the request.', fix: 'use bindings.' },
      { index: 1, severity: 'low', title: 'Verbose errors', file: 'config/app.php', line: undefined, what: 'debug is on.', fix: 'set APP_DEBUG=false.' }
    ])
  })
})

describe('recon compare and export', () => {
  const before = { hosts: [{ host: 'a.example.com' }, { host: 'old.example.com' }], js: [], findings: [{ id: '1', title: 'Old problem', severity: 'high' }], endpoints: ['/api/v1'] }
  const now = { hosts: [{ host: 'a.example.com', live: { url: 'https://a.example.com/' } }, { host: 'new.example.com' }], js: [{ url: 'https://a.example.com/app.js', sourceMap: {} }], findings: [{ id: '2', title: 'New problem', severity: 'medium' }], endpoints: ['/api/v1', '/api/v2/admin'] }
  it('says what changed since the last recon', () => {
    expect(reconDiff(now, before, '2026-11-01')).toEqual({ first: false, since: '2026-11-01', newHosts: ['new.example.com'], goneHosts: ['old.example.com'], newSourceMaps: ['https://a.example.com/app.js'], newFindings: [{ severity: 'medium', title: 'New problem' }], fixedFindings: [{ severity: 'high', title: 'Old problem' }], newEndpoints: ['/api/v2/admin'] })
    expect(reconDiff(now, null).first).toBe(true)
  })
  it('exports a CSV that spreadsheets cannot run, and a URL list for Burp', () => {
    const csv = reconCsv({ findings: [{ severity: 'high', kind: 'secret', title: '=HYPERLINK("x")', url: 'https://a', fix: 'a, b' }] })
    expect(csv.split('\n')[1]).toBe(`high,secret,"'=HYPERLINK(""x"")",https://a,"a, b"`)
    expect(reconUrls({ ...now, js: now.js })).toBe('https://a.example.com/\nhttps://a.example.com/app.js\nhttps://a.example.com/api/v1\nhttps://a.example.com/api/v2/admin\n')
  })
})
