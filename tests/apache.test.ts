import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { generateApacheConf } from '../src/main/configgen'
import { dirs } from '../src/main/paths'
import { freshEnv } from './helpers'

const APACHE = ['apache2', 'httpd'].find((bin) => spawnSync('which', [bin]).status === 0)
const MODULES = ['/usr/lib/apache2/modules', '/opt/homebrew/opt/httpd/lib/httpd/modules'].find(existsSync)

describe.skipIf(process.platform !== 'linux' || !APACHE || !MODULES)('apache config', () => {
  it('passes the real syntax check', () => {
    const { www } = freshEnv()
    mkdirSync(join(www, 'blog'))
    const conf = generateApacheConf({
      sites: [{ domain: 'blog.test', docRoot: join(www, 'blog'), kind: 'php', phpPort: 9083, secure: false }],
      extras: [],
      port: 18081,
      httpsPort: 18444,
      modulesDir: MODULES!,
      pidFile: join(dirs.run(), 'httpd.pid'),
      errorLog: join(dirs.logs(), 'error.log'),
      accessLog: join(dirs.logs(), 'access.log'),
      serverRoot: dirs.run()
    })
      .split('\n')
      // Debian builds some core modules into the binary, so their .so files are absent.
      .filter((line) => {
        const m = /LoadModule \S+ "([^"]+)"/.exec(line)
        return !m || existsSync(m[1])
      })
      .join('\n')

    const file = join(dirs.conf(), 'httpd.conf')
    writeFileSync(file, conf)
    const result = spawnSync(APACHE!, ['-t', '-f', file], { encoding: 'utf8' })
    expect(result.stderr + result.stdout).toContain('Syntax OK')
  })
})

describe.skipIf(process.platform !== 'linux' || !APACHE || !MODULES)('Laragon-style addresses', () => {
  it('serves projects at localhost/<folder>, 127.0.0.1/<folder>, <name>.localhost and extra names', async () => {
    const { www } = freshEnv()
    mkdirSync(join(www, 'radio'))
    writeFileSync(join(www, 'radio', 'index.html'), 'radio home')
    mkdirSync(join(www, 'blog'))
    writeFileSync(join(www, 'blog', 'index.html'), 'blog home')
    const port = 18091
    const conf = generateApacheConf({
      sites: [
        { domain: 'radio.test', docRoot: join(www, 'radio'), kind: 'static', phpPort: null, secure: false, aliases: ['radio.localhost', 'imperial.local'] },
        { domain: 'blog.test', docRoot: join(www, 'blog'), kind: 'static', phpPort: null, secure: false, aliases: ['blog.localhost'] }
      ],
      extras: [],
      localhost: { root: www, phpPort: null },
      mimeTypesFile: existsSync('/etc/mime.types') ? '/etc/mime.types' : undefined,
      port,
      httpsPort: 18491,
      modulesDir: MODULES!,
      pidFile: join(dirs.run(), 'httpd.pid'),
      errorLog: join(dirs.logs(), 'error.log'),
      accessLog: join(dirs.logs(), 'access.log'),
      serverRoot: dirs.run()
    })
      .split('\n')
      .filter((line) => {
        const m = /LoadModule \S+ "([^"]+)"/.exec(line)
        return !m || existsSync(m[1])
      })
      .join('\n')
    const file = join(dirs.conf(), 'httpd.conf')
    writeFileSync(file, conf)
    const { spawn } = await import('child_process')
    const httpd = spawn(APACHE!, ['-f', file, '-DFOREGROUND'], { stdio: 'ignore' })
    const { waitForPort } = await import('../src/main/process')
    expect(await waitForPort(port, 10000)).toBe(true)
    const http = await import('http')
    const get = (host: string, path = '/'): Promise<string> =>
      new Promise((resolve, reject) =>
        http
          .get({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => {
            let body = ''
            res.on('data', (c) => (body += c))
            res.on('end', () => resolve(`${res.statusCode} ${body.trim()}`))
          })
          .on('error', reject)
      )
    try {
      expect(await get('localhost', '/radio/')).toBe('200 radio home')
      expect(await get('127.0.0.1', '/blog/')).toBe('200 blog home')
      expect(await get('radio.test')).toBe('200 radio home')
      expect(await get('radio.localhost')).toBe('200 radio home')
      expect(await get('imperial.local')).toBe('200 radio home')
      expect(await get('blog.localhost')).toBe('200 blog home')
    } finally {
      httpd.kill()
    }
  })
})
