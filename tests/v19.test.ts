import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { envFileFor, firebaseEnv, firebaseJson, parseEnv, publicPrefix, shiftSupabasePorts, supabaseEnv, writeEnv } from '../src/main/backends'
import { STARTERS, DATA_CHOICES } from '../src/shared/starters'

const fx = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('Supabase', () => {
  it('gives each project its own ports in the real config.toml from `supabase init`', () => {
    const toml = fx('supabase-config.toml')
    const first = shiftSupabasePorts(toml, 0, 'shop')
    expect(first).toMatch(/^project_id = "shop"$/m)
    expect(first).toMatch(/^port = 54321$/m)
    const second = shiftSupabasePorts(toml, 1, 'blog')
    for (const p of [54421, 54422, 54420, 54429, 54423, 54424, 54427, 8183]) expect(second).toMatch(new RegExp(`= ${p}$`, 'm'))
    expect(second).not.toMatch(/^[^#\n]*= 5432[0-9]$/m)
    // Commented examples are left alone.
    expect(second).toContain('# project_id = "my-firebase-project"')
  })
  it('turns `supabase status -o env` into the names the framework reads', () => {
    const status = parseEnv('API_URL="http://127.0.0.1:54321"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\nSTUDIO_URL="http://127.0.0.1:54323"\nANON_KEY="eyJhbGciOi.anon"\nSERVICE_ROLE_KEY="eyJhbGciOi.service"\n')
    const env = supabaseEnv(status, publicPrefix('nextjs'))
    expect(env).toMatchObject({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOi.anon', SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOi.service', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
    // The service key never gets a public prefix.
    expect(Object.keys(env).some((k) => k.startsWith('NEXT_PUBLIC_') && k.includes('SERVICE'))).toBe(false)
    expect(supabaseEnv(parseEnv('API_URL=x\nPUBLISHABLE_KEY=sb_publishable_1\nSECRET_KEY=sb_secret_1'), 'VITE_')).toMatchObject({ VITE_SUPABASE_ANON_KEY: 'sb_publishable_1', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_1' })
  })
})

describe('Firebase', () => {
  it('uses a demo project and its own emulator ports', () => {
    const j = firebaseJson(2) as { emulators: Record<string, { port: number }> }
    expect(j.emulators.auth.port).toBe(9119)
    expect(j.emulators.ui.port).toBe(4020)
    const env = firebaseEnv('demo-shop', 0, 'NEXT_PUBLIC_')
    expect(env).toMatchObject({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-shop', NEXT_PUBLIC_FIREBASE_EMULATORS: 'auth=9099,firestore=8080,storage=9199' })
  })
})

describe('.env', () => {
  it('sets keys, keeps the rest and keeps the file out of Git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-env-'))
    writeFileSync(join(dir, '.env'), 'APP_NAME=shop\nDATABASE_URL=old\n')
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n')
    writeEnv(dir, '.env', { DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/shop', SECRET: 'a b' })
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('APP_NAME=shop\nDATABASE_URL=postgresql://postgres@127.0.0.1:5432/shop\nSECRET="a b"\n')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.env\n')
    writeEnv(dir, '.env', { X: '1' })
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.env\n')
  })
  it('uses the file and prefix each framework reads', () => {
    expect([envFileFor('nextjs'), envFileFor('nuxt')]).toEqual(['.env.local', '.env'])
    expect(['nextjs', 'nuxt', 'sveltekit', 'react', 'nestjs'].map(publicPrefix)).toEqual(['NEXT_PUBLIC_', 'NUXT_PUBLIC_', 'PUBLIC_', 'VITE_', ''])
  })
})

describe('starters', () => {
  it('offer Supabase, Firebase and the usual databases for JavaScript projects', () => {
    const next = STARTERS.find((s) => s.id === 'nextjs')!
    expect(next.options?.find((o) => o.id === 'data')?.choices.map((c) => c.id)).toEqual(DATA_CHOICES.map((c) => c.id))
    expect(DATA_CHOICES.map((c) => c.label)).toEqual(expect.arrayContaining(['Supabase', 'Firebase']))
    // PHP frameworks keep their own database choice.
    expect(STARTERS.find((s) => s.id === 'laravel')!.options?.some((o) => o.id === 'data')).toBe(false)
  })
})
