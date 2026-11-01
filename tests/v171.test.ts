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
