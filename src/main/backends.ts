/**
 * Supabase and Firebase for a project, running on this Mac.
 *
 *   Supabase  the official Supabase CLI runs the whole stack (Postgres, Auth, Storage, Studio) in
 *             containers. It needs a container runtime: Docker Desktop or OrbStack if you have
 *             one, otherwise Laramac installs Colima, a small free one, with Homebrew.
 *   Firebase  the official Firebase emulators (Auth, Firestore, Storage, and the Emulator UI),
 *             installed into the project as a dev dependency, with a "demo-" project id so
 *             nothing connects to Google. They need Java, which Laramac installs with Homebrew.
 *
 * Each project gets its own ports, so several can run at once. The keys are written to the
 * project's .env file with the names its framework reads.
 */
import { execFile } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { BackendConfig, BackendKind, BackendStatus } from '../shared/types'
import { brew } from './brew'
import { brewPrefix, findOnPath } from './platform'
import { runtimeEnv } from './runtimes'
import { runQuiet } from './starterrun'
import { getSettings } from './settings'
import { dirs } from './paths'
import { ManagedProcess } from './process'

type Line = (l: string) => void

const DOCKER_APPS = ['/Applications/Docker.app', '/Applications/OrbStack.app']

function sh(cmd: string, args: string[], env: NodeJS.ProcessEnv = runtimeEnv(), timeout = 20000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => execFile(cmd, args, { env, timeout, cwd, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim())) : resolve(String(out)))))
}

function brewBin(name: string): string | null {
  const p = brewPrefix()
  const b = p ? join(p, 'bin', name) : null
  return b && existsSync(b) ? b : findOnPath(name)
}

/** Java from Homebrew's openjdk is "keg-only": it is not on the PATH until we point at it. */
export function javaHome(): string | null {
  const p = brewPrefix()
  for (const v of ['openjdk@21', 'openjdk']) {
    const home = p ? join(p, 'opt', v, 'libexec', 'openjdk.jdk', 'Contents', 'Home') : ''
    if (home && existsSync(join(home, 'bin', 'java'))) return home
  }
  return process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', 'java')) ? process.env.JAVA_HOME : null
}

async function dockerWorks(): Promise<boolean> {
  const docker = brewBin('docker') ?? (existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : null)
  if (!docker) return false
  return sh(docker, ['info', '--format', '{{.ServerVersion}}'], { ...runtimeEnv(), PATH: `${(runtimeEnv().PATH ?? '')}:/usr/local/bin` }, 15000)
    .then(() => true)
    .catch(() => false)
}

export async function backendStatus(): Promise<BackendStatus> {
  return {
    supabaseCli: !!brewBin('supabase'),
    docker: await dockerWorks(),
    dockerApp: DOCKER_APPS.find((a) => existsSync(a))?.replace(/^\/Applications\/|\.app$/g, '') ?? (brewBin('colima') ? 'Colima' : null),
    java: !!javaHome(),
    homebrew: !!brewPrefix()
  }
}

/** A running container runtime: the one you have, or Colima. */
export async function ensureDocker(onLine: Line): Promise<void> {
  if (await dockerWorks()) return
  const app = DOCKER_APPS.find((a) => existsSync(a))
  if (app) {
    onLine(`Starting ${app.replace(/^\/Applications\/|\.app$/g, '')}`)
    await sh('/usr/bin/open', ['-a', app])
    for (let i = 0; i < 60; i++) {
      if (await dockerWorks()) return
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`${app.replace(/^\/Applications\/|\.app$/g, '')} did not start. Open it once yourself, then try again.`)
  }
  if (!brewBin('colima')) {
    onLine('Installing Colima and Docker with Homebrew')
    await brew(['install', 'colima', 'docker'], (l) => onLine(`Colima: ${l.slice(0, 60)}`))
  }
  onLine('Starting Colima (the first time takes a minute)')
  await runQuiet([brewBin('colima') ?? 'colima', 'start', '--cpu', '2', '--memory', '4'], dirs.root(), runtimeEnv(), (l) => onLine(`Colima: ${l.slice(0, 60)}`), 10 * 60_000)
  if (!(await dockerWorks())) throw new Error('Colima started, but Docker is not answering yet. Try again in a moment.')
}

export async function ensureSupabaseCli(onLine: Line): Promise<string> {
  const found = brewBin('supabase')
  if (found) return found
  onLine('Installing the Supabase CLI with Homebrew')
  await brew(['install', 'supabase/tap/supabase'], (l) => onLine(`Supabase CLI: ${l.slice(0, 60)}`))
  const bin = brewBin('supabase')
  if (!bin) throw new Error('The Supabase CLI did not install.')
  return bin
}

export async function ensureJava(onLine: Line): Promise<string> {
  const home = javaHome()
  if (home) return home
  onLine('Installing Java (OpenJDK 21) with Homebrew, for the Firebase emulators')
  await brew(['install', 'openjdk@21'], (l) => onLine(`Java: ${l.slice(0, 60)}`))
  const after = javaHome()
  if (!after) throw new Error('Java did not install.')
  return after
}

// ---------------------------------------------------------------- Ports

const SUPABASE_BASE = 54321
const FIREBASE_BASE = { ui: 4000, auth: 9099, firestore: 8080, storage: 9199, hub: 4400, logging: 4500 }

/** The nth project with this backend gets its own block of ports. */
function slot(kind: BackendKind, site: string): number {
  const used = Object.entries(getSettings().siteConfig)
    .filter(([name, c]) => name !== site && c.backend?.kind === kind)
    .map(([, c]) => c.backend?.slot ?? 0)
  let n = 0
  while (used.includes(n)) n++
  return n
}

/** Moves every port in supabase/config.toml by 100 for each project already using Supabase. */
export function shiftSupabasePorts(toml: string, n: number, projectId: string): string {
  return toml
    .replace(/^project_id\s*=\s*".*"$/m, `project_id = "${projectId}"`)
    .replace(/^(\s*(?:port|shadow_port|inspector_port|smtp_port|pop3_port)\s*=\s*)(\d+)/gm, (_m, k: string, v: string) => `${k}${Number(v) + n * 100}`)
}

export function firebaseJson(n: number): object {
  const p = (v: number): number => v + n * 10
  return {
    emulators: {
      // 127.0.0.1 everywhere: the address Laramac and your app use, never IPv6 ::1 or the network.
      auth: { host: '127.0.0.1', port: p(FIREBASE_BASE.auth) },
      firestore: { host: '127.0.0.1', port: p(FIREBASE_BASE.firestore), websocketPort: p(9150) },
      storage: { host: '127.0.0.1', port: p(FIREBASE_BASE.storage) },
      hub: { host: '127.0.0.1', port: p(FIREBASE_BASE.hub) },
      logging: { host: '127.0.0.1', port: p(FIREBASE_BASE.logging) },
      ui: { enabled: true, host: '127.0.0.1', port: p(FIREBASE_BASE.ui) },
      singleProjectMode: true
    },
    firestore: { rules: 'firestore.rules' },
    storage: { rules: 'storage.rules' }
  }
}

// ---------------------------------------------------------------- .env

/** The prefix each framework uses for values the browser may read. */
export function publicPrefix(starter: string): string {
  if (starter === 'nextjs') return 'NEXT_PUBLIC_'
  if (starter === 'nuxt') return 'NUXT_PUBLIC_'
  if (['sveltekit', 'astro'].includes(starter)) return 'PUBLIC_'
  if (['react', 'vue', 'vite', 'react-router', 'solid', 'qwik'].includes(starter)) return 'VITE_'
  return ''
}

export const envFileFor = (starter: string): string => (starter === 'nextjs' ? '.env.local' : '.env')

/** Sets keys in an env file, keeping everything else, and keeps it out of Git. */
export function writeEnv(dir: string, file: string, values: Record<string, string>): void {
  const path = join(dir, file)
  let text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`
    const re = new RegExp(`^${k}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
  }
  writeFileSync(path, text)
  const gi = join(dir, '.gitignore')
  const ignored = existsSync(gi) ? readFileSync(gi, 'utf8') : ''
  if (!new RegExp(`^(\\.env\\*?|${file.replace('.', '\\.')})$`, 'm').test(ignored)) appendFileSync(gi, `${ignored && !ignored.endsWith('\n') ? '\n' : ''}${file}\n`)
}

/** Reads "KEY=value" lines, as printed by `supabase status -o env`. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return out
}

/** The keys a project reads, from the Supabase CLI's status. */
export function supabaseEnv(status: Record<string, string>, prefix: string): Record<string, string> {
  const url = status.API_URL ?? ''
  const anon = status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? ''
  const out: Record<string, string> = {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY ?? '',
    DATABASE_URL: status.DB_URL ?? ''
  }
  if (prefix) {
    out[`${prefix}SUPABASE_URL`] = url
    out[`${prefix}SUPABASE_ANON_KEY`] = anon
  }
  return out
}

export function firebaseEnv(projectId: string, n: number, prefix: string): Record<string, string> {
  const p = (v: number): number => v + n * 10
  const out: Record<string, string> = {
    GCLOUD_PROJECT: projectId,
    FIREBASE_PROJECT_ID: projectId,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${p(FIREBASE_BASE.auth)}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${p(FIREBASE_BASE.firestore)}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${p(FIREBASE_BASE.storage)}`
  }
  if (prefix) {
    out[`${prefix}FIREBASE_PROJECT_ID`] = projectId
    out[`${prefix}FIREBASE_API_KEY`] = 'demo-key'
    out[`${prefix}FIREBASE_AUTH_DOMAIN`] = `${projectId}.firebaseapp.com`
    out[`${prefix}FIREBASE_STORAGE_BUCKET`] = `${projectId}.appspot.com`
    out[`${prefix}FIREBASE_EMULATORS`] = `auth=${p(FIREBASE_BASE.auth)},firestore=${p(FIREBASE_BASE.firestore)},storage=${p(FIREBASE_BASE.storage)}`
  }
  return out
}

/** A small client file the project can import; it connects to the emulators in development. */
export function firebaseClient(prefix: string, ts: boolean): string {
  const env = (k: string): string => (prefix.startsWith('VITE_') ? `import.meta.env.${prefix}${k}` : prefix ? `process.env.${prefix}${k}` : `process.env.FIREBASE_${k.replace('FIREBASE_', '')}`)
  return `// Made by Laramac. In development it talks to the Firebase emulators on this Mac.
import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const app = getApps()[0] ?? initializeApp({
  apiKey: ${env('FIREBASE_API_KEY')},
  authDomain: ${env('FIREBASE_AUTH_DOMAIN')},
  projectId: ${env('FIREBASE_PROJECT_ID')},
  storageBucket: ${env('FIREBASE_STORAGE_BUCKET')}
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

const ports${ts ? ': Record<string, number>' : ''} = Object.fromEntries(String(${env('FIREBASE_EMULATORS')} ?? '').split(',').filter(Boolean).map((p) => [p.split('=')[0], Number(p.split('=')[1])]))
if (ports.auth) {
  connectAuthEmulator(auth, \`http://127.0.0.1:\${ports.auth}\`, { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore)
  connectStorageEmulator(storage, '127.0.0.1', ports.storage)
}
`
}

export function supabaseClient(prefix: string): string {
  const env = (k: string): string => (prefix.startsWith('VITE_') ? `import.meta.env.${prefix}${k}` : `process.env.${prefix}${k}`)
  return `// Made by Laramac. The keys come from your .env file.
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(${env('SUPABASE_URL')}!, ${env('SUPABASE_ANON_KEY')}!)
`
}

// ---------------------------------------------------------------- Setting a project up

const libDir = (dir: string): string => (existsSync(join(dir, 'src')) ? join(dir, 'src', 'lib') : join(dir, 'lib'))

export async function setupSupabase(dir: string, site: string, starter: string, onLine: Line): Promise<BackendConfig> {
  const bin = await ensureSupabaseCli(onLine)
  await ensureDocker(onLine)
  const env = runtimeEnv()
  const n = slot('supabase', site)
  if (!existsSync(join(dir, 'supabase', 'config.toml'))) await runQuiet([bin, 'init', '--yes'], dir, env, onLine)
  const toml = join(dir, 'supabase', 'config.toml')
  writeFileSync(toml, shiftSupabasePorts(readFileSync(toml, 'utf8'), n, site.replace(/[^a-zA-Z0-9_-]/g, '-')))
  onLine('Starting Supabase (the first time downloads its containers, a few minutes)')
  await runQuiet([bin, 'start'], dir, env, (l) => onLine(`Supabase: ${l.slice(0, 70)}`), 30 * 60_000)
  const status = parseEnv(await sh(bin, ['status', '-o', 'env'], env, 60000, dir).catch(() => ''))
  const prefix = publicPrefix(starter)
  writeEnv(dir, envFileFor(starter), supabaseEnv(status, prefix))
  if (existsSync(join(dir, 'package.json'))) {
    onLine('Adding @supabase/supabase-js')
    await runQuiet(['npm', 'install', '--no-fund', '--no-audit', '@supabase/supabase-js'], dir, env, onLine)
    const ts = existsSync(join(dir, 'tsconfig.json'))
    const file = join(libDir(dir), `supabase.${ts ? 'ts' : 'js'}`)
    if (!existsSync(file)) {
      mkdirSync(libDir(dir), { recursive: true })
      writeFileSync(file, supabaseClient(prefix))
    }
  }
  return { kind: 'supabase', slot: n, studioUrl: status.STUDIO_URL ?? `http://127.0.0.1:${54323 + n * 100}`, apiUrl: status.API_URL }
}

export async function setupFirebase(dir: string, site: string, starter: string, onLine: Line): Promise<BackendConfig> {
  await ensureJava(onLine)
  const n = slot('firebase', site)
  const projectId = `demo-${site.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 24)}`
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify(firebaseJson(n), null, 2) + '\n')
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: projectId } }, null, 2) + '\n')
  if (!existsSync(join(dir, 'firestore.rules')))
    writeFileSync(join(dir, 'firestore.rules'), `rules_version = '2';\n// Signed-in users only. Tighten these before you deploy.\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}\n`)
  if (!existsSync(join(dir, 'storage.rules')))
    writeFileSync(join(dir, 'storage.rules'), `rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write: if request.auth != null;\n    }\n  }\n}\n`)
  const prefix = publicPrefix(starter)
  writeEnv(dir, envFileFor(starter), firebaseEnv(projectId, n, prefix))
  if (existsSync(join(dir, 'package.json'))) {
    onLine('Adding firebase and the Firebase emulators')
    const env = runtimeEnv()
    await runQuiet(['npm', 'install', '--no-fund', '--no-audit', 'firebase'], dir, env, onLine)
    await runQuiet(['npm', 'install', '--no-fund', '--no-audit', '--save-dev', 'firebase-tools'], dir, env, onLine)
    const ts = existsSync(join(dir, 'tsconfig.json'))
    const file = join(libDir(dir), `firebase.${ts ? 'ts' : 'js'}`)
    if (!existsSync(file)) {
      mkdirSync(libDir(dir), { recursive: true })
      writeFileSync(file, firebaseClient(prefix, ts))
    }
  }
  return { kind: 'firebase', slot: n, projectId, studioUrl: `http://127.0.0.1:${FIREBASE_BASE.ui + n * 10}` }
}

// ---------------------------------------------------------------- Running

const emulators = new Map<string, ManagedProcess>()
export const backendLogFile = (site: string): string => join(dirs.logs(), `backend-${site.replace(/[^a-zA-Z0-9._-]/g, '_')}.log`)

/** Starts a project's backend before its dev server. */
export async function startBackend(site: string, dir: string, b: BackendConfig, onLine: Line = () => undefined): Promise<void> {
  if (b.kind === 'supabase') {
    const bin = await ensureSupabaseCli(onLine)
    await ensureDocker(onLine)
    await runQuiet([bin, 'start'], dir, runtimeEnv(), onLine, 15 * 60_000)
    return
  }
  let proc = emulators.get(site)
  if (proc?.running) return
  await stopLeftoverEmulators(b.slot ?? 0)
  proc = new ManagedProcess(`${site} Firebase emulators`)
  emulators.set(site, proc)
  const home = await ensureJava(onLine)
  const env = { ...runtimeEnv(), JAVA_HOME: home, PATH: `${join(home, 'bin')}:${runtimeEnv().PATH ?? ''}` }
  mkdirSync(dirs.logs(), { recursive: true })
  // Ready when the Emulator UI answers.
  await proc.start({ command: 'npx', args: ['--no-install', 'firebase', 'emulators:start', '--project', b.projectId ?? 'demo-app'], cwd: dir, env, logFile: backendLogFile(site), group: true }, FIREBASE_BASE.ui + (b.slot ?? 0) * 10, 180000)
}

/**
 * The Firestore emulator is a Java program that can outlive the Firebase CLI, keeping its port.
 * Only processes listening on this project's emulator ports, and that are emulators, are stopped.
 */
async function stopLeftoverEmulators(n: number): Promise<void> {
  const ports = [FIREBASE_BASE.firestore, FIREBASE_BASE.auth, FIREBASE_BASE.storage, FIREBASE_BASE.ui, FIREBASE_BASE.hub, FIREBASE_BASE.logging, 9150].map((p) => p + n * 10)
  for (const port of ports) {
    const pids = await sh('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], process.env, 5000)
      .catch(() => sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], process.env, 5000))
      .catch(() => '')
    for (const pid of pids.split('\n').map((x) => Number(x.trim())).filter(Boolean)) {
      const cmd = await sh('/bin/ps', ['-o', 'command=', '-p', String(pid)], process.env, 5000).catch(() => '')
      if (/emulator|firebase/i.test(cmd)) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // Already gone.
        }
      }
    }
  }
}

export async function stopBackend(site: string, dir: string, b: BackendConfig): Promise<void> {
  if (b.kind === 'firebase') {
    await emulators.get(site)?.stop()
    return stopLeftoverEmulators(b.slot ?? 0)
  }
  const bin = brewBin('supabase')
  if (bin) await sh(bin, ['stop'], runtimeEnv(), 120000, dir).catch(() => undefined)
}

export const isBackendRunning = (site: string): boolean => !!emulators.get(site)?.running

export async function stopAllBackends(): Promise<void> {
  await Promise.allSettled([...emulators.values()].map((p) => p.stop()))
  for (const c of Object.values(getSettings().siteConfig)) if (c.backend?.kind === 'firebase') await stopLeftoverEmulators(c.backend.slot ?? 0)
}
