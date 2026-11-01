import http from 'http'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { dirs } from '../src/main/paths'
import { buildTrayMenu, type TrayItem } from '../src/main/traymenu'
import { collectSiteLogs, doctorMessages, linesAbout, redact, tailText } from '../src/main/sitedoctor'
import type { ServiceInfo, SiteInfo } from '../src/shared/types'

const svc = (id: ServiceInfo['id'], status: ServiceInfo['status'], port?: number): ServiceInfo => ({ id, name: id[0].toUpperCase() + id.slice(1), description: '', status, group: 'web', port })
const site = (name: string, extra: Partial<SiteInfo> = {}): SiteInfo => ({
  name,
  path: `/www/${name}`,
  docRoot: `/www/${name}`,
  domain: `${name}.test`,
  url: `http://${name}.test`,
  httpsUrl: `https://${name}.test`,
  kind: 'node',
  secure: false,
  php: '8.4',
  aliases: [],
  ...extra
})
const find = (items: TrayItem[], label: string): TrayItem | undefined => items.find((i) => i.label === label)

describe('menu bar', () => {
  it('shows what runs, toggles services and dev servers, and opens sites', () => {
    const menu = buildTrayMenu({
      services: [svc('apache', 'running', 80), svc('mysql', 'stopped', 3306), svc('redis', 'not-installed')],
      sites: [site('shop', { dev: { port: 5170, proxy: true, running: true, command: 'npm run dev' } }), site('blog', { kind: 'wordpress', secure: true })],
      tld: 'test',
      phpmyadmin: false,
      editor: 'Cursor',
      aiName: 'Claude Code'
    })
    expect(menu[0]).toMatchObject({ label: '1 of 2 services running', enabled: false })
    expect(menu[1]).toMatchObject({ label: '1 of 1 dev servers running', enabled: false })

    const services = find(menu, 'Services')!.submenu!
    expect(services.map((s) => s.label)).not.toContain('Redis')
    expect(find(services, 'Apache   :80')).toMatchObject({ checked: true, action: { kind: 'service', id: 'apache', on: false } })
    expect(find(services, 'Mysql   :3306')).toMatchObject({ checked: false, action: { kind: 'service', id: 'mysql', on: true } })

    expect(find(menu, 'Dev servers')!.submenu![0]).toMatchObject({ label: 'shop   :5170', checked: true, action: { kind: 'dev', site: 'shop', on: false } })

    const sites = find(menu, 'Sites')!.submenu!
    const shop = find(sites, 'shop   ●')!.submenu!
    expect(shop[0]).toMatchObject({ label: 'Stop dev server', action: { kind: 'dev', site: 'shop', on: false } })
    const blog = find(sites, 'blog')!.submenu!
    expect(find(blog, 'Open blog.test')).toMatchObject({ action: { kind: 'open-url', url: 'https://blog.test' } })
    expect(find(blog, 'Open Claude Code here')).toMatchObject({ action: { kind: 'ai', path: '/www/blog' } })
    expect(find(menu, 'Open phpMyAdmin')).toMatchObject({ enabled: false })
    expect(find(menu, 'New Project…')).toMatchObject({ action: { kind: 'show', page: 'starters' } })
  })

  it('still makes sense before anything is installed', () => {
    const menu = buildTrayMenu({ services: [svc('apache', 'not-installed')], sites: [], tld: 'test', phpmyadmin: false, editor: 'Cursor', aiName: 'Claude Code' })
    expect(menu[0].label).toBe('Nothing installed yet')
    expect(find(menu, 'Dev servers')).toBeUndefined()
    expect(find(menu, 'Sites')).toMatchObject({ enabled: false })
  })
})

describe('site doctor', () => {
  it('blanks secrets before logs reach a model', () => {
    const log = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
      'DB_PASSWORD=hunter2 and api_key: "sk-live-1234567890abcdef"',
      'connecting to mysql://root:s3cret@127.0.0.1:3306/shop',
      'token=ghp_abcdefghijklmnopqrstuvwxyz0123',
      'Cookie: laravel_session=abc123; XSRF-TOKEN=xyz',
      'AWS key AKIAABCDEFGHIJKLMNOP leaked',
      'Plain error: Undefined variable $user in app/Http/Controllers/Shop.php:42'
    ].join('\n')
    const out = redact(log)
    for (const secret of ['eyJhbGciOiJIUzI1NiJ9', 'hunter2', 'sk-live-1234567890abcdef', 's3cret', 'ghp_abcdefghijklmnopqrstuvwxyz0123', 'laravel_session=abc123', 'AKIAABCDEFGHIJKLMNOP']) {
      expect(out, secret).not.toContain(secret)
    }
    expect(out).toContain('mysql://root:[hidden]@127.0.0.1')
    expect(out).toContain('Undefined variable $user in app/Http/Controllers/Shop.php:42')
  })

  it('reads the site’s own log and only the shared lines about it', () => {
    const { www } = freshEnv()
    const path = join(www, 'shop')
    mkdirSync(join(path, 'storage', 'logs'), { recursive: true })
    const old = Array.from({ length: 500 }, (_, i) => `[2026-11-01 10:00:${i}] local.INFO: fine ${i}`).join('\n')
    writeFileSync(join(path, 'storage', 'logs', 'laravel.log'), `${old}\n[2026-11-01 11:00:00] local.ERROR: SQLSTATE[HY000] [1049] Unknown database 'shop' password=topsecret\n`)
    writeFileSync(join(dirs.logs(), 'apache-error.log'), `[error] other.test broke\n[error] AH01071: Got error 'PHP message: PHP Fatal error in ${path}/public/index.php'\n`)
    writeFileSync(join(dirs.logs(), 'php-8.4-error.log'), 'nothing about it\n')
    const logs = collectSiteLogs(site('shop', { path, kind: 'laravel', domain: 'shop.test' }))
    const byName = Object.fromEntries(logs.map((l) => [l.name, l.text]))
    expect(byName['Laravel log']).toContain("Unknown database 'shop'")
    expect(byName['Laravel log']).not.toContain('topsecret')
    expect(byName['Laravel log'].split('\n').length).toBeLessThanOrEqual(120)
    expect(byName['Apache errors']).toContain('PHP Fatal error')
    expect(byName['Apache errors']).not.toContain('other.test')
    expect(byName['PHP errors']).toBeUndefined()
    expect(linesAbout('a shop.test\nb blog.test\nc shop.test', ['shop.test'], 1)).toBe('c shop.test')
    expect(tailText(join(www, 'missing.log'))).toBe('')
  })

  it('asks the local model with the logs and returns its answer', async () => {
    const { www } = freshEnv()
    const path = join(www, 'shop')
    mkdirSync(join(path, 'storage', 'logs'), { recursive: true })
    writeFileSync(join(path, 'storage', 'logs', 'laravel.log'), "local.ERROR: Unknown database 'shop'\n")
    let seen = ''
    const server = await new Promise<http.Server>((resolve) => {
      const s = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          seen = body
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { content: '1. The database shop does not exist.\n2. Run `php artisan migrate`.' } }] }))
        })
      })
      s.listen(18411, '127.0.0.1', () => resolve(s))
    })
    try {
      const { setSettings } = await import('../src/main/settings')
      setSettings({ llm: { baseUrl: 'http://127.0.0.1:18411/v1', model: 'qwen/qwen3-8b' } })
      const { explainSite } = await import('../src/main/sitedoctor')
      const r = await explainSite(site('shop', { path, kind: 'laravel' }), [])
      expect(r.reply).toContain('php artisan migrate')
      expect(r.sources.map((s) => s.name)).toEqual(['Laravel log'])
      expect(r.sources[0].text).toBe('')
      const sent = JSON.parse(seen) as { model: string; messages: { role: string; content: string }[] }
      expect(sent.model).toBe('qwen/qwen3-8b')
      expect(sent.messages[0].role).toBe('system')
      expect(sent.messages[1].content).toContain("Unknown database 'shop'")
    } finally {
      server.close()
    }
  })

  it('keeps follow-up questions in order after the logs', () => {
    const msgs = doctorMessages(site('shop'), [], [
      { role: 'assistant', content: 'It is the database.' },
      { role: 'user', content: 'Show me the exact change' }
    ])
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(msgs[1].content).toContain('No log has anything for this site yet.')
  })
})
