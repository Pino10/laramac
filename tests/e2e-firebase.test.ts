import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, onTestFinished } from 'vitest'

// A real Next.js app (made by create-next-app in /tmp/lm/myapp) and Java are needed.
const APP = '/tmp/lm/myapp'
const JAVA = '/usr/lib/jvm/java-21-openjdk-amd64'
const run = existsSync(join(APP, 'package.json')) && existsSync(join(JAVA, 'bin', 'java')) ? describe : describe.skip

run('Firebase on a real Next.js project', () => {
  it('sets up the emulators, starts them and they answer', async () => {
    process.env.JAVA_HOME = JAVA
    // This test machine sets Java proxy options that the emulators print and then choke on.
    delete process.env.JAVA_TOOL_OPTIONS
    const tmp = mkdtempSync(join(tmpdir(), 'lm-fb-'))
    const dir = join(tmp, 'shop')
    // The copied app with its node_modules is over a gigabyte: remove it however the test ends.
    // Deleting it can take longer than a hook's usual 30 seconds on a busy disk.
    onTestFinished(() => rmSync(tmp, { recursive: true, force: true }), 300_000)
    cpSync(APP, dir, { recursive: true, filter: (s) => !s.includes('/.next') })
    const { setupFirebase, startBackend, stopBackend } = await import('../src/main/backends')
    const lines: string[] = []
    const b = await setupFirebase(dir, 'shop', 'nextjs', (l) => lines.push(l))
    expect(b).toMatchObject({ kind: 'firebase', projectId: 'demo-shop', studioUrl: 'http://127.0.0.1:4000' })
    expect(readFileSync(join(dir, '.env.local'), 'utf8')).toContain('NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-shop')
    expect(existsSync(join(dir, 'src', 'lib', 'firebase.ts'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).devDependencies['firebase-tools']).toBeTruthy()
    await startBackend('shop', dir, b)
    const ui = await fetch('http://127.0.0.1:4000/')
    expect(ui.status).toBe(200)
    // Firestore answers on its emulator port.
    const fs = await fetch('http://127.0.0.1:8080/')
    expect(fs.status).toBe(200)
    await stopBackend('shop', dir, b)
    await new Promise((r) => setTimeout(r, 1500))
    const still = await fetch('http://127.0.0.1:8080/').then(() => true).catch(() => false)
    expect(still).toBe(false)
  }, 600_000)
})
