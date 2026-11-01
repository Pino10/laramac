import http from 'http'
import net from 'net'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { dirs } from '../src/main/paths'

// A stand-in for the Keychain: reversible, but never plain text.
const fakeCrypto = { available: () => true, encrypt: (s: string) => `enc:${Buffer.from(s).toString('base64')}`, decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString() }

function listen(handler: http.RequestListener, port = 0): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(port, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port }))
  })
}
const body = (req: http.IncomingMessage): Promise<string> => new Promise((r) => {
  let b = ''
  req.on('data', (c) => (b += c))
  req.on('end', () => r(b))
})

describe('model servers', () => {
  it('saves servers with encrypted keys, never returns the key, and refuses plain http to the internet', async () => {
    freshEnv()
    const m = await import('../src/main/models')
    m.setModelCrypto(fakeCrypto)
    const list = m.saveServer({ name: 'Claude API', baseUrl: 'https://api.anthropic.com/v1/', api: 'anthropic', key: 'sk-ant-secret-123' })
    expect(list[0]).toMatchObject({ name: 'Claude API', baseUrl: 'https://api.anthropic.com', api: 'anthropic', hasKey: true })
    expect(JSON.stringify(list)).not.toContain('sk-ant-secret-123')
    const raw = readFileSync(join(dirs.root(), 'model-servers.json'), 'utf8')
    expect(raw).not.toContain('sk-ant-secret-123')
    expect(statSync(join(dirs.root(), 'model-servers.json')).mode & 0o077).toBe(0)
    expect(() => m.saveServer({ name: 'Bad', baseUrl: 'http://example.com/v1', api: 'openai' })).toThrow(/https/)
    expect(m.saveServer({ name: 'vMLX', baseUrl: 'localhost:8000/v1', api: 'openai' })[1].baseUrl).toBe('http://127.0.0.1:8000/v1')
    const id = m.listServers()[0].id
    expect(m.saveServer({ id, name: 'Claude API', baseUrl: 'https://api.anthropic.com', api: 'anthropic', key: null })[0].hasKey).toBe(false)
  })

  it('names port 8000 after whichever MLX app is open', async () => {
    const { nameForPort } = await import('../src/main/models')
    expect(nameForPort(8000, '/Applications/vMLX.app/Contents/MacOS/vMLX')).toMatchObject({ provider: 'vMLX (:8000)', toolId: 'vmlx' })
    expect(nameForPort(8000, '/Applications/oMLX.app/Contents/MacOS/oMLX')).toMatchObject({ provider: 'oMLX (:8000)', toolId: 'omlx' })
    expect(nameForPort(8080, '/opt/homebrew/bin/llama-server')).toMatchObject({ provider: 'llama.cpp (:8080)' })
    expect(nameForPort(8001, '').provider).toBe('Server on :8001')
  })

  it('talks to a saved Anthropic-format server with its key, and a keyed OpenAI-format one', async () => {
    freshEnv()
    const m = await import('../src/main/models')
    m.setModelCrypto(fakeCrypto)
    const seen: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = []
    const { server, port } = await listen(async (req, res) => {
      const b = await body(req)
      req.url = (req.url ?? '').split('?')[0]
      seen.push({ url: req.url, headers: req.headers, body: b })
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'mlx-qwen3' }, { id: 'nomic-embed-text' }] }))
      if (req.url === '/v1/messages') {
        if (req.headers['x-api-key'] !== 'local-key') return res.writeHead(401).end(JSON.stringify({ error: { message: 'invalid x-api-key' } }))
        return res.end(JSON.stringify({ content: [{ type: 'text', text: 'ready' }] }))
      }
      if (req.url === '/v1/chat/completions') {
        if (req.headers.authorization !== 'Bearer open-key') return res.writeHead(401).end('{"error":"Unauthorized"}')
        return res.end(JSON.stringify({ choices: [{ message: { content: 'ready too' } }] }))
      }
      res.writeHead(404).end('{}')
    })
    try {
      m.saveServer({ name: 'vMLX Anthropic', baseUrl: `http://127.0.0.1:${port}`, api: 'anthropic', key: 'local-key' })
      m.saveServer({ name: 'vMLX OpenAI', baseUrl: `http://127.0.0.1:${port}/v1`, api: 'openai', key: 'open-key' })
      const found = await m.detectLlms()
      const anth = found.find((f) => f.provider === 'vMLX Anthropic')!
      expect(anth).toMatchObject({ api: 'anthropic', saved: true, online: true, models: ['mlx-qwen3'], remote: false })
      expect(await m.testLlm(anth.baseUrl, 'mlx-qwen3')).toMatchObject({ ok: true, reply: 'ready' })
      const msg = seen.find((s) => s.url === '/v1/messages')!
      expect(msg.headers['anthropic-version']).toBe('2023-06-01')
      expect(JSON.parse(msg.body)).toMatchObject({ model: 'mlx-qwen3', max_tokens: 16 })
      expect(await m.testLlm(`http://127.0.0.1:${port}/v1`, 'mlx-qwen3')).toMatchObject({ ok: true, reply: 'ready too' })

      const { setSettings } = await import('../src/main/settings')
      setSettings({ llm: { baseUrl: anth.baseUrl, model: 'mlx-qwen3' } })
      const reply = await m.chatWithLlm([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'hi' }
      ])
      expect(reply).toBe('ready')
      const last = JSON.parse(seen.filter((s) => s.url === '/v1/messages').pop()!.body)
      expect(last.system).toBe('Be brief.')
      expect(last.messages).toEqual([{ role: 'user', content: 'hi' }])

      const id = m.listServers().find((s) => s.name === 'vMLX Anthropic')!.id
      m.saveServer({ id, name: 'vMLX Anthropic', baseUrl: `http://127.0.0.1:${port}`, api: 'anthropic', key: 'wrong' })
      const bad = await m.testLlm(anth.baseUrl, 'mlx-qwen3')
      expect(bad.ok).toBe(false)
      expect(bad.error).toContain('The key was refused')
    } finally {
      server.close()
    }
  })
})

describe('mail delivery', () => {
  it('keeps the password encrypted and writes Mailpit’s relay file only while relaying', async () => {
    freshEnv()
    const r = await import('../src/main/mailrelay')
    r.setMailCrypto(fakeCrypto)
    expect(r.mailpitRelayArgs()).toEqual([])
    expect(() => r.saveRelay({ mode: 'all', preset: 'resend', host: '', port: 587, security: 'starttls', username: 'resend', from: '' })).toThrow(/SMTP server/)
    const saved = r.saveRelay({ mode: 'all', preset: 'resend', host: 'smtp.resend.com', port: 587, security: 'starttls', username: 'resend', from: 'hi@example.com', password: 're_123secret' })
    expect(saved).toMatchObject({ mode: 'all', hasPassword: true })
    expect(JSON.stringify(saved)).not.toContain('re_123secret')
    expect(readFileSync(join(dirs.root(), 'mail-relay.json'), 'utf8')).not.toContain('re_123secret')

    const args = r.mailpitRelayArgs()
    expect(args).toEqual(['--smtp-relay-config', r.relayConfigFile(), '--smtp-relay-all'])
    const yaml = readFileSync(r.relayConfigFile(), 'utf8')
    expect(yaml).toContain('host: "smtp.resend.com"')
    expect(yaml).toContain('starttls: true')
    expect(yaml).toContain('password: "re_123secret"')
    expect(yaml).toContain('override-from: "hi@example.com"')
    expect(statSync(r.relayConfigFile()).mode & 0o077).toBe(0)

    r.saveRelay({ mode: 'release', preset: 'resend', host: 'smtp.resend.com', port: 587, security: 'starttls', username: 'resend', from: '' })
    expect(r.mailpitRelayArgs()).toEqual(['--smtp-relay-config', r.relayConfigFile()])
    r.saveRelay({ mode: 'catch', preset: 'resend', host: 'smtp.resend.com', port: 587, security: 'starttls', username: 'resend', from: '' })
    expect(r.mailpitRelayArgs()).toEqual([])
    expect(existsSync(r.relayConfigFile())).toBe(false)
  })

  it('sends a test email over SMTP', async () => {
    freshEnv()
    const { sendTestMail } = await import('../src/main/mailrelay')
    let got = ''
    const smtp = net.createServer((sock) => {
      sock.write('220 fake ESMTP\r\n')
      let data = false
      sock.on('data', (d) => {
        const t = d.toString()
        got += t
        if (data) {
          if (t.includes('\r\n.\r\n')) {
            data = false
            sock.write('250 queued\r\n')
          }
          return
        }
        if (t.startsWith('EHLO')) sock.write('250-fake\r\n250 SIZE 1000\r\n')
        else if (t.startsWith('DATA')) {
          data = true
          sock.write('354 go\r\n')
        } else if (t.startsWith('QUIT')) sock.end('221 bye\r\n')
        else sock.write('250 ok\r\n')
      })
    })
    await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', () => r()))
    try {
      await sendTestMail('you@example.com', (smtp.address() as net.AddressInfo).port)
      expect(got).toContain('RCPT TO:<you@example.com>')
      expect(got).toContain('Subject: Laramac test email')
      await expect(sendTestMail('not an email')).rejects.toThrow(/email address/)
    } finally {
      smtp.close()
    }
  })
})

describe('public links without an account', () => {
  it('relays only to the shared site, WebSockets included', async () => {
    const { startHostRelay, findTunnelUrl } = await import('../src/main/share')
    const { server, port } = await listen((req, res) => res.end(`host=${req.headers.host} fwd=${req.headers['x-forwarded-host']}`))
    server.on('upgrade', (req, socket) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Host: ${req.headers.host}\r\n\r\n`)
      socket.end()
    })
    const relay = await startHostRelay('shop.test', port)
    try {
      const text = await new Promise<string>((resolve) =>
        http.get({ host: '127.0.0.1', port: relay.port, path: '/', headers: { Host: 'abc123.lhr.life' } }, (res) => {
          let b = ''
          res.on('data', (c) => (b += c))
          res.on('end', () => resolve(b))
        })
      )
      expect(text).toBe('host=shop.test fwd=abc123.lhr.life')
      const upgraded = await new Promise<string>((resolve) => {
        const s = net.connect(relay.port, '127.0.0.1', () => s.write('GET /ws HTTP/1.1\r\nHost: abc123.lhr.life\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'))
        let b = ''
        s.on('data', (d) => (b += d))
        s.on('end', () => resolve(b))
      })
      expect(upgraded).toContain('101 Switching Protocols')
      expect(upgraded).toContain('X-Host: shop.test')
    } finally {
      relay.close()
      server.close()
    }
    expect(findTunnelUrl('localhostrun', 'abc tunneled with tls termination, https://7f3a2b.lhr.life\n')).toBe('https://7f3a2b.lhr.life')
    expect(findTunnelUrl('pinggy', 'http://x.a.free.pinggy.link\nhttps://rnxyz-1-2-3-4.a.free.pinggy.link\n')).toBe('https://rnxyz-1-2-3-4.a.free.pinggy.link')
  })
})

describe('code review', () => {
  function project(root: string): void {
    mkdirSync(join(root, 'app', 'Http', 'Controllers'), { recursive: true })
    mkdirSync(join(root, 'vendor', 'lib'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(root, 'app', 'Http', 'Controllers', 'LoginController.php'), '<?php\n$rows = DB::select("SELECT * FROM users WHERE email = \'" . $request->email . "\'");\n')
    writeFileSync(join(root, 'app', 'helpers.php'), '<?php\nfunction add($a, $b) { return $a + $b; }\n')
    writeFileSync(join(root, 'config.js'), `const stripe = "sk_live_${'a'.repeat(24)}"\nconst example = "sk_live_example_xxxxxxxxxxxxxxxxxxxx"\n`)
    writeFileSync(join(root, 'vendor', 'lib', 'Big.php'), '<?php // dependency\n')
    writeFileSync(join(root, 'node_modules', 'x', 'index.js'), 'module.exports = 1\n')
    writeFileSync(join(root, 'logo.png'), Buffer.alloc(100))
  }

  it('reads source files only, risky ones first, and finds leaked keys without storing them', async () => {
    const { www } = freshEnv()
    const r = await import('../src/main/review')
    project(www)
    const files = r.listSourceFiles(www)
    expect(files[0]).toBe('app/Http/Controllers/LoginController.php')
    expect(files).toContain('app/helpers.php')
    expect(files.some((f) => f.startsWith('vendor') || f.startsWith('node_modules') || f.endsWith('.png'))).toBe(false)
    const hits = r.scanSecrets(www, files)
    expect(hits).toEqual([{ file: 'config.js', line: 1, kind: 'Stripe live key' }])
    const chunks = r.chunkFiles(www, files, 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toContain('=== app/Http/Controllers/LoginController.php ===\n1: <?php')
    expect(r.countFindings('### [HIGH] SQL injection\n### [low] Style\n## Summary')).toEqual({ critical: 0, high: 1, medium: 0, low: 1 })
    expect(r.gitAuthHeader('https://dev.azure.com/org/p/_git/repo', 'PAT')).toBe(`AUTHORIZATION: basic ${Buffer.from('pat:PAT').toString('base64')}`)
    expect(r.gitAuthHeader('https://github.com/a/b.git', 'T')).toContain(Buffer.from('x-access-token:T').toString('base64'))
    await expect(r.cloneForReview('git@github.com:a/b.git', null)).rejects.toThrow(/https/)
  })

  it('reviews with the chosen model and saves a report with the leaked keys', async () => {
    const { www } = freshEnv()
    project(www)
    const prompts: string[] = []
    const { server, port } = await listen(async (req, res) => {
      const b = JSON.parse(await body(req)) as { messages: { content: string }[] }
      prompts.push(b.messages.map((m) => m.content).join('\n'))
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: '## Summary\nOne injection.\n\n## Findings\n### [CRITICAL] SQL injection in login\nFile: app/Http/Controllers/LoginController.php:2\nWhat: email is pasted into SQL.\nFix: use bindings.' } }] }))
    })
    try {
      const { setSettings } = await import('../src/main/settings')
      setSettings({ llm: { baseUrl: `http://127.0.0.1:${port}/v1`, model: 'qwen' } })
      const { runReview, listReviews, readReview } = await import('../src/main/review')
      const result = await runReview({ root: www, name: 'shop', reviewer: 'model', focus: 'security', modelName: 'qwen' }, () => undefined)
      expect(result.counts.critical).toBe(1)
      expect(result.markdown).toContain('Stripe live key in `config.js:1`')
      expect(result.markdown).not.toContain('sk_live_aaaa')
      expect(prompts[0]).toContain('LoginController.php')
      expect(prompts[0]).not.toContain('vendor/lib')
      expect(listReviews()[0]).toMatchObject({ id: result.id, counts: { critical: 1 }, secrets: 1 })
      expect(readReview(result.id)).toContain('SQL injection in login')
      expect(() => readReview('../../etc/passwd')).toThrow()
    } finally {
      server.close()
    }
  })
})

const NUCLEI = ['/tmp/nt/nuclei'].find(existsSync) ?? (spawnSync('which', ['nuclei']).stdout?.toString().trim() || null)

describe('web scan', () => {
  it('reads Nuclei findings, most severe first, without duplicates', async () => {
    const { parseNuclei, nucleiArgs } = await import('../src/main/scan')
    const lines = [
      { 'template-id': 'tech-detect', info: { name: 'Tech', severity: 'info' }, 'matched-at': 'http://a' },
      { 'template-id': 'git-config', info: { name: 'Exposed .git', severity: 'medium', description: 'Git folder is public', remediation: 'Block /.git' }, 'matched-at': 'http://a/.git/config' },
      { 'template-id': 'git-config', info: { name: 'Exposed .git', severity: 'medium' }, 'matched-at': 'http://a/.git/config' },
      { 'template-id': 'env', info: { name: 'Exposed .env', severity: 'high', reference: 'https://x' }, 'matched-at': 'http://a/.env' }
    ]
    const f = parseNuclei(lines.map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n')
    expect(f.map((x) => x.template)).toEqual(['env', 'git-config', 'tech-detect'])
    expect(f[0].reference).toEqual(['https://x'])
    const args = nucleiArgs({ url: 'http://127.0.0.1:80', host: 'shop.test' }, '/tmp/out.jsonl')
    expect(args).toEqual(expect.arrayContaining(['-H', 'Host: shop.test', '-etags', 'dos,fuzz,intrusive,bruteforce', '-rate-limit', '40']))
  })

  it.skipIf(!NUCLEI)(
    'runs real Nuclei against a local site through its Host name',
    async () => {
      freshEnv()
      const { runNuclei } = await import('../src/main/scan')
      const { server, port } = await listen((req, res) => {
        if (req.url === '/.env' && req.headers.host === 'shop.test') return res.end('APP_KEY=base64:abc\nDB_PASSWORD=x\n')
        res.writeHead(404).end('nope')
      })
      const tpl = join(dirs.root(), 'env.yaml')
      writeFileSync(
        tpl,
        `id: exposed-env\ninfo:\n  name: Exposed .env file\n  author: laramac\n  severity: high\n  description: The .env file can be downloaded.\n  remediation: Serve from public/ only.\nhttp:\n  - method: GET\n    path:\n      - "{{BaseURL}}/.env"\n    matchers:\n      - type: word\n        words:\n          - "APP_KEY="\n`
      )
      try {
        const res = await runNuclei({ url: `http://127.0.0.1:${port}`, host: 'shop.test', templates: tpl, binary: NUCLEI! }, () => undefined)
        expect(res.target).toBe('http://shop.test')
        expect(res.findings).toHaveLength(1)
        expect(res.findings[0]).toMatchObject({ template: 'exposed-env', severity: 'high', name: 'Exposed .env file', remediation: 'Serve from public/ only.' })
        // Without the right Host, the same check finds nothing: the scan really goes to that site.
        const other = await runNuclei({ url: `http://127.0.0.1:${port}`, host: 'blog.test', templates: tpl, binary: NUCLEI! }, () => undefined)
        expect(other.findings).toHaveLength(0)
      } finally {
        server.close()
      }
    },
    120_000
  )
})
