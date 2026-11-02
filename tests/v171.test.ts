import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { cleanReviewSessions, cloneForReview, endReviewSession, reviewSourcesDir } from '../src/main/review'

describe('0.17.1 review sessions', () => {
  it('gives every review its own folder and removes it afterwards', async () => {
    freshEnv()
    // An https address is required; a local repo is served through git's file transport via a URL rewrite.
    const repo = mkdtempSync(join(tmpdir(), 'lm-rev-'))
    writeFileSync(join(repo, 'index.php'), '<?php echo 1;')
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'], { cwd: repo })
    const home = mkdtempSync(join(tmpdir(), 'lm-gh-'))
    writeFileSync(join(home, '.gitconfig'), `[url "file://${repo}"]\n\tinsteadOf = https://example.test/acme/shop\n[protocol "file"]\n\tallow = always\n`)
    const oldHome = process.env.HOME
    process.env.HOME = home
    try {
      const a = await cloneForReview('https://example.test/acme/shop', null)
      const b = await cloneForReview('https://example.test/acme/shop', null)
      expect(a).not.toBe(b)
      expect(existsSync(join(a, 'index.php'))).toBe(true)
      endReviewSession(a)
      expect(existsSync(dirname(a))).toBe(false)
      expect(existsSync(b)).toBe(true)
      cleanReviewSessions()
      expect(readdirSync(reviewSourcesDir())).toEqual([])
    } finally {
      process.env.HOME = oldHome
    }
  })

  it('never deletes anything outside the sessions folder', () => {
    freshEnv()
    const outside = mkdtempSync(join(tmpdir(), 'lm-keep-'))
    mkdirSync(join(outside, 'code'))
    endReviewSession(join(outside, 'code'))
    expect(existsSync(outside)).toBe(true)
    mkdirSync(join(reviewSourcesDir(), 'not-a-session', 'code'), { recursive: true })
    endReviewSession(join(reviewSourcesDir(), 'not-a-session', 'code'))
    expect(existsSync(join(reviewSourcesDir(), 'not-a-session'))).toBe(true)
  })
})

import { chmodSync as chmod2, existsSync as exists2, readFileSync as read2 } from 'fs'
import { importPhp, listVersions } from '../src/main/php'
import { dirs } from '../src/main/paths'

const fakePhp = (dir: string, version: string, fpmVersion = version): void => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'php'), `#!/bin/sh\ncase "$*" in *-m*) printf '[PHP Modules]\\nmbstring\\nopenssl\\n';; *) printf '${version}';; esac\n`)
  writeFileSync(join(dir, 'php-fpm'), `#!/bin/sh\nprintf 'PHP ${fpmVersion} (fpm-fcgi)'\n`)
  chmod2(join(dir, 'php'), 0o755)
  chmod2(join(dir, 'php-fpm'), 0o755)
}

describe('0.18 older PHP from a download', () => {
  it('adds PHP from a cli and an fpm archive, like static-php.dev gives them', async () => {
    freshEnv()
    const src = mkdtempSync(join(tmpdir(), 'lm-phpdl-'))
    fakePhp(join(src, 'b'), '8.1.30')
    execFileSync('tar', ['-czf', join(src, 'php-8.1.30-cli-macos-aarch64.tar.gz'), '-C', join(src, 'b'), 'php'])
    execFileSync('tar', ['-czf', join(src, 'php-8.1.30-fpm-macos-aarch64.tar.gz'), '-C', join(src, 'b'), 'php-fpm'])
    const v = await importPhp([join(src, 'php-8.1.30-cli-macos-aarch64.tar.gz'), join(src, 'php-8.1.30-fpm-macos-aarch64.tar.gz')])
    expect(v).toBe('8.1.30')
    expect(exists2(join(dirs.php('8.1'), 'php-fpm'))).toBe(true)
    expect(read2(join(dirs.php('8.1'), 'SOURCE'), 'utf8')).toBe('imported')
    expect(read2(join(dirs.php('8.1'), 'EXTENSIONS'), 'utf8')).toBe('mbstring\nopenssl')
  })

  it('explains what is missing or wrong', async () => {
    freshEnv()
    const src = mkdtempSync(join(tmpdir(), 'lm-phpbad-'))
    fakePhp(join(src, 'only'), '8.2.1')
    execFileSync('tar', ['-czf', join(src, 'cli.tar.gz'), '-C', join(src, 'only'), 'php'])
    await expect(importPhp([join(src, 'cli.tar.gz')])).rejects.toThrow(/not php-fpm/)
    fakePhp(join(src, 'mix'), '8.2.1', '8.3.4')
    await expect(importPhp([join(src, 'mix')])).rejects.toThrow(/Choose matching/)
  })

  it('offers only the newest PHP, plus what you have', async () => {
    freshEnv()
    fakePhp(dirs.php('8.1'), '8.1.30')
    writeFileSync(join(dirs.php('8.1'), 'VERSION'), '8.1.30')
    const list = await listVersions()
    const minors = list.map((v) => v.minor)
    expect(minors).toContain('8.1')
    expect(minors.filter((m) => m !== '8.1').length).toBeLessThanOrEqual(1)
  })
})
