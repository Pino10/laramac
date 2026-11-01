import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildWpConfig, validateProjectName } from '../src/main/creator'
import { patchLaravelEnv, phpPortFor } from '../src/main/configgen'
import { detectDocRoot, detectKind, scanSites, slug } from '../src/main/sites'
import { shellQuote } from '../src/main/integrations'
import { freshEnv } from './helpers'

describe('project names', () => {
  it('accepts normal names', () => {
    expect(validateProjectName('my-blog')).toBeNull()
    expect(validateProjectName('shop.v2')).toBeNull()
  })
  it('rejects unsafe names', () => {
    expect(validateProjectName('../etc')).not.toBeNull()
    expect(validateProjectName('a b')).not.toBeNull()
    expect(validateProjectName('')).not.toBeNull()
    expect(validateProjectName('-x')).not.toBeNull()
  })
})

describe('wordpress config', () => {
  const sample = `<?php
define( 'DB_NAME', 'database_name_here' );
define( 'DB_USER', 'username_here' );
define( 'DB_PASSWORD', 'password_here' );
define( 'DB_HOST', 'localhost' );
define( 'AUTH_KEY',         'put your unique phrase here' );
define( 'NONCE_SALT',       'put your unique phrase here' );
`
  it('fills in database settings and salts', () => {
    let n = 0
    const out = buildWpConfig(sample, 'blog', () => `salt${++n}`)
    expect(out).toContain(`'DB_NAME', 'blog'`)
    expect(out).toContain(`'DB_USER', 'root'`)
    expect(out).toContain(`'DB_HOST', '127.0.0.1'`)
    expect(out).toContain(`'AUTH_KEY',         'salt1'`)
    expect(out).not.toContain('put your unique phrase here')
  })
})

describe('laravel env', () => {
  it('updates existing keys and appends missing ones', () => {
    const env = 'APP_URL=http://localhost\n# DB_HOST=127.0.0.1\nDB_CONNECTION=sqlite\n'
    const out = patchLaravelEnv(env, 'shop', 'shop.test')
    expect(out).toContain('APP_URL=http://shop.test')
    expect(out).toContain('DB_CONNECTION=mysql')
    expect(out).toContain('DB_HOST=127.0.0.1')
    expect(out).toContain('DB_DATABASE=shop')
    expect(out).toContain('MAIL_PORT=1025')
    expect(out).not.toContain('sqlite')
  })
})

describe('php ports', () => {
  it('gives each minor version its own port', () => {
    expect(phpPortFor('8.4')).toBe(9084)
    expect(phpPortFor('7.4')).toBe(9074)
    expect(new Set(['8.0', '8.1', '8.2', '8.3', '8.4', '8.5'].map(phpPortFor)).size).toBe(6)
  })
})

describe('shell quoting', () => {
  it('survives apostrophes', () => {
    expect(shellQuote("/Users/o'neil/www")).toBe(`'/Users/o'\\''neil/www'`)
  })
})

describe('site detection', () => {
  it('detects project types and doc roots', () => {
    const base = mkdtempSync(join(tmpdir(), 'laramac-kind-'))
    const make = (name: string, files: string[]): string => {
      const dir = join(base, name)
      for (const f of files) {
        mkdirSync(join(dir, f, '..'), { recursive: true })
        writeFileSync(join(dir, f), '')
      }
      mkdirSync(dir, { recursive: true })
      return dir
    }
    expect(detectKind(make('lv', ['artisan', 'public/index.php']))).toBe('laravel')
    expect(detectKind(make('wp', ['wp-config.php']))).toBe('wordpress')
    expect(detectKind(make('plain', ['index.php']))).toBe('php')
    expect(detectKind(make('node', ['package.json']))).toBe('node')
    expect(detectKind(make('html', ['index.html']))).toBe('static')
    expect(detectDocRoot(join(base, 'lv'), 'laravel')).toBe(join(base, 'lv', 'public'))
    expect(detectDocRoot(join(base, 'plain'), 'php')).toBe(join(base, 'plain'))
  })

  it('slugifies folder names into domains', () => {
    expect(slug('My Cool_Site!')).toBe('my-cool-site')
  })

  it('turns www folders into .test sites', () => {
    const { www } = freshEnv()
    mkdirSync(join(www, 'blog'))
    mkdirSync(join(www, 'Shop App'))
    mkdirSync(join(www, '.hidden'))
    writeFileSync(join(www, 'file.txt'), '')
    const sites = scanSites()
    expect(sites.map((s) => s.domain)).toEqual(['blog.test', 'shop-app.test'])
    expect(sites[0].url).toBe('http://blog.test')
  })
})
