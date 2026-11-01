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
