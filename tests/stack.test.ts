/**
 * End-to-end test of the generated configs against real Nginx and PHP-FPM.
 * Runs only where those programs are installed (it is skipped on a plain Mac checkout).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  fastcgiParams,
  generateFpmConf,
  generateNginxConf,
  generatePhpIni,
  phpPortFor
} from '../src/main/configgen'
import { ManagedProcess } from '../src/main/process'
import { buildHostConfs } from '../src/main/webconf'
import { caCertPath, ensureSiteCert } from '../src/main/ssl'
import { setSiteConfig } from '../src/main/sites'
import { dirs } from '../src/main/paths'
import { freshEnv } from './helpers'

const which = (bin: string): string | null => {
  try {
    return execFileSync('which', [bin]).toString().trim()
  } catch {
    return null
  }
}

const NGINX = which('nginx')
const FPM = which('php-fpm8.3') ?? which('php-fpm')
const canRun = process.platform === 'linux' && !!NGINX && !!FPM

function get(
  port: number,
  host: string,
  path: string,
  tls?: { ca: string }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const opts = {
      host: '127.0.0.1',
      port,
      path,
      headers: { Host: host },
      ...(tls ? { ca: tls.ca, servername: host } : {})
    }
    const req = (tls ? httpsRequest : httpRequest)(opts, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe.skipIf(!canRun)('real Nginx + PHP-FPM', () => {
  const fpm = new ManagedProcess('php-fpm')
  const nginx = new ManagedProcess('nginx')
  const HTTP = 18080
  const HTTPS = 18443
  const MINOR = '8.3'

  beforeAll(async () => {
    const { root, www } = freshEnv()
    for (const d of [root, www]) chmodSync(d, 0o755)

    mkdirSync(join(www, 'blog'))
    writeFileSync(join(www, 'blog', 'index.php'), '<?php echo "hello from blog on PHP " . PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')
    writeFileSync(join(www, 'blog', 'info.php'), '<?php echo $_SERVER["SERVER_NAME"] . "|" . $_SERVER["REQUEST_URI"];')

    mkdirSync(join(www, 'shop', 'public'), { recursive: true })
    writeFileSync(join(www, 'shop', 'artisan'), '')
    writeFileSync(join(www, 'shop', 'public', 'index.php'), '<?php echo "front controller:" . $_SERVER["REQUEST_URI"];')
    setSiteConfig('shop', { secure: true })

    for (const d of [www, join(www, 'blog'), join(www, 'shop'), join(www, 'shop', 'public')]) chmodSync(d, 0o755)
    for (const f of [
      join(www, 'blog', 'index.php'),
      join(www, 'blog', 'info.php'),
      join(www, 'shop', 'public', 'index.php')
    ]) chmodSync(f, 0o644)

    // PHP-FPM with the same generated config the app writes (plus the user it needs as root).
    const port = phpPortFor(MINOR)
    const fpmConf = join(dirs.conf(), 'fpm.conf')
    writeFileSync(
      fpmConf,
      generateFpmConf({ port, pidFile: join(dirs.run(), 'fpm.pid'), errorLog: join(dirs.logs(), 'fpm.log') }) +
        'user = www-data\ngroup = www-data\n'
    )
    const ini = join(dirs.conf(), 'php.ini')
    writeFileSync(ini, generatePhpIni({ errorLog: join(dirs.logs(), 'php.log') }))
    await fpm.start(
      { command: FPM!, args: ['-R', '-y', fpmConf, '-c', ini, '-F'], logFile: join(dirs.logs(), 'fpm-out.log') },
      port
    )

    // Nginx from the real host list, including an HTTPS site with a CA-signed certificate.
    const hosts = await buildHostConfs()
    // buildHostConfs resolves PHP from installed versions; point sites at our test pool instead.
    for (const s of hosts.sites) s.phpPort = port
    const tmp = join(dirs.run(), 'nginx-tmp')
    for (const d of ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) mkdirSync(join(tmp, d), { recursive: true })
    const params = join(dirs.conf(), 'fastcgi_params')
    writeFileSync(params, fastcgiParams())
    const conf = join(dirs.conf(), 'nginx.conf')
    writeFileSync(
      conf,
      generateNginxConf({
        sites: hosts.sites,
        extras: [],
        httpPort: HTTP,
        httpsPort: HTTPS,
        pidFile: join(dirs.run(), 'nginx.pid'),
        errorLog: join(dirs.logs(), 'nginx-error.log'),
        accessLog: join(dirs.logs(), 'nginx-access.log'),
        fastcgiParamsFile: params,
        tempDir: tmp
      })
    )
    execFileSync(NGINX!, ['-t', '-c', conf, '-p', dirs.run(), '-e', join(dirs.logs(), 'nginx-error.log')])
    await nginx.start(
      {
        command: NGINX!,
        args: ['-c', conf, '-p', dirs.run(), '-e', join(dirs.logs(), 'nginx-error.log')],
        logFile: join(dirs.logs(), 'nginx-out.log')
      },
      HTTP
    )
  })

  afterAll(async () => {
    await nginx.stop()
    await fpm.stop()
  })

  it('serves a PHP site', async () => {
    const res = await get(HTTP, 'blog.test', '/')
    expect(res.status).toBe(200)
    expect(res.body).toBe('hello from blog on PHP 8.3')
  })

  it('passes server variables to PHP', async () => {
    const res = await get(HTTP, 'blog.test', '/info.php?x=1')
    expect(res.body).toBe('blog.test|/info.php?x=1')
  })

  it('serves wildcard subdomains from the same site', async () => {
    const res = await get(HTTP, 'api.blog.test', '/')
    expect(res.body).toContain('hello from blog')
  })

  it('serves Laravel-style projects from public/ with a front controller', async () => {
    const res = await get(HTTP, 'shop.test', '/products/42')
    expect(res.status).toBe(200)
    expect(res.body).toBe('front controller:/products/42')
  })

  it('serves HTTPS signed by the Laramac CA', async () => {
    const ca = readFileSync(caCertPath(), 'utf8')
    const res = await get(HTTPS, 'shop.test', '/secure', { ca })
    expect(res.status).toBe(200)
    expect(res.body).toBe('front controller:/secure')
  })

  it('covers wildcard names in the certificate', async () => {
    const cert = await ensureSiteCert('shop.test')
    expect(existsSync(cert.cert)).toBe(true)
    const text = execFileSync('openssl', ['x509', '-in', cert.cert, '-noout', '-text']).toString()
    expect(text).toContain('DNS:shop.test')
    expect(text).toContain('DNS:*.shop.test')
    const verify = execFileSync('openssl', ['verify', '-CAfile', caCertPath(), cert.cert]).toString()
    expect(verify).toContain('OK')
  })

  it('refuses requests from other machines on the network', async () => {
    const { networkInterfaces } = await import('os')
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    if (!lan) return
    const res = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: lan, port: HTTP, path: '/', headers: { Host: 'blog.test' } }, (r) => {
        r.resume()
        resolve(r.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
    expect(res).toBe(403)
  })

  it('blocks hidden files like .env', async () => {
    const res = await get(HTTP, 'blog.test', '/.env')
    expect(res.status).toBe(403)
  })
})
