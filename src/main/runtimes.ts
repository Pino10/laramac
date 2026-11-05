/**
 * Language runtimes for the starter store. Laramac installs its own copy of each into
 * ~/.laramac/runtimes (no admin password, nothing global), or uses one already on this Mac.
 */
import { githubApi } from './seckit/ghapi'
import { execFile, spawn } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter, join } from 'path'
import type { RuntimeId, RuntimeInfo } from '../shared/types'
import { dirs } from './paths'
import { downloadFile, extract, makeExecutable, removeQuarantine, sha256File, USER_AGENT } from './download'
import { jobs } from './jobs'
import { brewPrefix, findOnPath, isMac } from './platform'
import { nodeShim } from './nodeversions'
import { defaultMinor, installMinor, installedPatch, listVersions, phpBinary } from './php'

type Update = (p: number | null, label?: string) => void

const arm = (): boolean => process.arch === 'arm64'
export const runtimesRoot = (): string => join(dirs.root(), 'runtimes')

/** Folders holding each managed runtime's programs. */
export function managedBinDirs(): Partial<Record<RuntimeId, string>> {
  const r = runtimesRoot()
  return {
    node: join(r, 'node', 'bin'),
    bun: join(r, 'bun', 'bin'),
    python: join(r, 'uv', 'bin'),
    go: join(r, 'go', 'bin'),
    dotnet: join(r, 'dotnet'),
    rust: join(r, 'cargo', 'bin')
  }
}

const COMMAND: Record<RuntimeId, string> = { node: 'node', bun: 'bun', python: 'uv', dotnet: 'dotnet', go: 'go', rust: 'cargo', swift: 'swift', php: 'php' }

/** Where tools usually live when installed by hand or by their own installers. */
const commonDirs = (): string[] => {
  const h = homedir()
  return [join(h, '.cargo', 'bin'), join(h, '.bun', 'bin'), join(h, '.local', 'bin'), '/usr/local/go/bin', '/usr/local/share/dotnet', join(h, '.dotnet')]
}

/** PATH and variables that let setup tools and dev servers find every runtime. */
export function runtimeEnv(): NodeJS.ProcessEnv {
  const managed = Object.values(managedBinDirs()).filter((d) => existsSync(d))
  const brew = brewPrefix()
  const path = [...managed, dirs.bin(), join(dirs.root(), 'composer', 'vendor', 'bin'), ...(brew ? [join(brew, 'bin'), join(brew, 'sbin')] : []), ...commonDirs(), process.env.PATH ?? '', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
    .filter(Boolean)
    .join(delimiter)
  const env: NodeJS.ProcessEnv = {
    PATH: path,
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    ASTRO_TELEMETRY_DISABLED: '1',
    NG_CLI_ANALYTICS: 'false',
    npm_config_yes: 'true',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    COMPOSER_HOME: join(dirs.root(), 'composer'),
    COMPOSER_NO_INTERACTION: '1'
  }
  const r = runtimesRoot()
  if (existsSync(join(r, 'dotnet', 'dotnet'))) env.DOTNET_ROOT = join(r, 'dotnet')
  if (existsSync(join(r, 'cargo', 'bin'))) {
    env.CARGO_HOME = join(r, 'cargo')
    env.RUSTUP_HOME = join(r, 'rustup')
  }
  return env
}

/** First version number in a tool's --version output. */
export function parseVersion(id: RuntimeId, out: string): string | null {
  if (id === 'swift') return /Swift version (\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? null
  return /(\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? null
}

function capture(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000, env: { ...process.env, ...env } }, (err, out, errOut) => resolve(err ? null : `${out}${errOut}`))
  })
}

/** Finds a runtime's main program: Laramac's own copy first, then this Mac's. */
export function locate(id: RuntimeId): { path: string; managed: boolean } | null {
  if (id === 'php') {
    const minor = defaultMinor()
    if (minor) return { path: phpBinary(minor), managed: true }
    const sys = findOnPath('php')
    return sys ? { path: sys, managed: false } : null
  }
  const own = managedBinDirs()[id]
  if (own && existsSync(join(own, COMMAND[id]))) return { path: join(own, COMMAND[id]), managed: true }
  if (id === 'swift' && isMac) {
    // /usr/bin/swift exists even without the developer tools; it only works once they are installed.
    return existsSync('/Library/Developer/CommandLineTools/usr/bin/swift') || existsSync('/Applications/Xcode.app') ? { path: '/usr/bin/swift', managed: false } : null
  }
  const sys = findOnPath(COMMAND[id], commonDirs())
  return sys ? { path: sys, managed: false } : null
}

const META: Record<RuntimeId, { name: string; description: string }> = {
  node: { name: 'Node.js', description: 'JavaScript and TypeScript: React, Vue, Next.js, Nuxt, Angular and more. Includes npm.' },
  bun: { name: 'Bun', description: 'A fast JavaScript runtime and package manager.' },
  python: { name: 'Python', description: 'Through uv, which installs Python itself and keeps each project separate.' },
  dotnet: { name: '.NET', description: 'C# and ASP.NET Core, from Microsoft (long-term support release).' },
  go: { name: 'Go', description: "Google's language for fast servers and tools." },
  rust: { name: 'Rust', description: 'Rust and Cargo, through rustup. Also needed by Tauri.' },
  swift: { name: 'Swift', description: "Apple's language. Comes with Xcode or the command line tools." },
  php: { name: 'PHP', description: 'Managed on the PHP page. Includes Composer.' }
}

export const RUNTIME_IDS: RuntimeId[] = ['node', 'php', 'python', 'bun', 'dotnet', 'go', 'rust', 'swift']

export async function runtimeInfo(id: RuntimeId): Promise<RuntimeInfo> {
  const found = locate(id)
  let version: string | null = null
  if (found) {
    if (id === 'php') version = defaultMinor() ? installedPatch(defaultMinor()!) : parseVersion(id, (await capture(found.path, ['--version'])) ?? '')
    else {
      const args = id === 'go' ? ['version'] : ['--version']
      version = parseVersion(id, (await capture(found.path, args, runtimeEnv())) ?? '')
    }
  }
  return {
    id,
    ...META[id],
    installed: !!found && !!version,
    version,
    managed: !!found?.managed,
    path: found?.path ?? null,
    canInstall: id !== 'swift' || isMac,
    note: id === 'swift' && !found ? 'Installs Apple’s command line tools. For iPhone and Mac apps, also get Xcode from the App Store.' : undefined
  }
}

export const listRuntimes = (): Promise<RuntimeInfo[]> => Promise.all(RUNTIME_IDS.map(runtimeInfo))

// ------------------------------------------------------------------ latest versions

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return (await res.json()) as T
}

export interface NodeRelease {
  version: string
  lts: string | false
  files: string[]
}
/** Newest long-term-support Node for this Mac. */
export function pickNode(index: NodeRelease[], arch: 'arm64' | 'x64'): NodeRelease | null {
  return index.find((r) => r.lts && r.files.includes(`osx-${arch}-tar`)) ?? null
}

export interface GoRelease {
  version: string
  stable: boolean
  files: { filename: string; os: string; arch: string; kind: string; sha256: string }[]
}
export function pickGo(list: GoRelease[], arch: 'arm64' | 'amd64'): { version: string; filename: string; sha256: string } | null {
  for (const r of list) {
    if (!r.stable) continue
    const f = r.files.find((x) => x.os === 'darwin' && x.arch === arch && x.kind === 'archive')
    if (f) return { version: r.version.replace(/^go/, ''), filename: f.filename, sha256: f.sha256 }
  }
  return null
}

/** Reads the digest for one file from a SHASUMS-style list. */
export function shaFor(sums: string, file: string): string | null {
  for (const line of sums.split('\n')) {
    const m = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (m && m[2].trim() === file) return m[1].toLowerCase()
  }
  return null
}

async function githubLatest(repo: string): Promise<{ tag: string; assets: { name: string; url: string }[] }> {
  const r = await githubApi<{ tag_name: string; assets: { name: string; browser_download_url: string }[] }>(`/repos/${repo}/releases/latest`)
  return { tag: r.tag_name, assets: r.assets.map((a) => ({ name: a.name, url: a.browser_download_url })) }
}

interface DotnetIndex {
  'releases-index': { 'channel-version': string; 'latest-sdk': string; 'release-type': string; 'support-phase': string }[]
}
export function pickDotnet(index: DotnetIndex): { channel: string; sdk: string } | null {
  const lts = index['releases-index'].filter((r) => r['release-type'] === 'lts' && r['support-phase'] === 'active')
  lts.sort((a, b) => parseFloat(b['channel-version']) - parseFloat(a['channel-version']))
  return lts[0] ? { channel: lts[0]['channel-version'], sdk: lts[0]['latest-sdk'] } : null
}

export async function latestVersions(): Promise<Partial<Record<RuntimeId, string>>> {
  const out: Partial<Record<RuntimeId, string>> = {}
  const tasks: Promise<void>[] = [
    getJson<NodeRelease[]>('https://nodejs.org/dist/index.json').then((i) => {
      const n = pickNode(i, arm() ? 'arm64' : 'x64')
      if (n) out.node = n.version.replace(/^v/, '')
    }),
    githubLatest('oven-sh/bun').then((r) => void (out.bun = r.tag.replace(/^bun-v/, ''))),
    githubLatest('astral-sh/uv').then((r) => void (out.python = r.tag)),
    getJson<GoRelease[]>('https://go.dev/dl/?mode=json').then((l) => {
      const g = pickGo(l, arm() ? 'arm64' : 'amd64')
      if (g) out.go = g.version
    }),
    getJson<DotnetIndex>('https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json').then((i) => {
      const d = pickDotnet(i)
      if (d) out.dotnet = d.sdk
    }),
    githubLatest('rust-lang/rust').then((r) => void (out.rust = r.tag)),
    listVersions().then((v) => {
      const top = v[0]
      if (top) out.php = top.latest
    })
  ]
  await Promise.allSettled(tasks)
  return out
}

// ------------------------------------------------------------------ installing

async function fetchVerified(url: string, file: string, sha: string | null, label: string, update: Update): Promise<string> {
  const dest = join(dirs.downloads(), file)
  await downloadFile(url, dest, (p) => update(p, `Downloading ${label}`))
  if (sha) {
    const actual = await sha256File(dest)
    if (actual !== sha) {
      rmSync(dest, { force: true })
      throw new Error(`The ${label} download did not match its published checksum and was deleted.`)
    }
  }
  return dest
}

async function textOf(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status}).`)
  return res.text()
}

/** Unpacks an archive and moves the single folder inside it to `target`. */
async function unpackInto(archive: string, target: string, pick?: (entries: string[]) => string | undefined): Promise<void> {
  const staging = `${target}.staging`
  rmSync(staging, { recursive: true, force: true })
  await extract(archive, staging)
  const entries = readdirSync(staging)
  const inner = pick ? pick(entries) : entries.length === 1 ? entries[0] : undefined
  rmSync(target, { recursive: true, force: true })
  renameSync(inner ? join(staging, inner) : staging, target)
  rmSync(staging, { recursive: true, force: true })
  rmSync(archive, { force: true })
  await removeQuarantine(target)
}

function runLogged(cmd: string, args: string[], env: NodeJS.ProcessEnv, update: Update, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } })
    let last = ''
    const on = (b: Buffer): void => {
      const line = b.toString().split('\n').map((x) => x.trim()).filter(Boolean).pop()
      if (line) {
        last = line
        update(null, `${label}: ${line.slice(0, 70)}`)
      }
    }
    child.stdout.on('data', on)
    child.stderr.on('data', on)
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed: ${last}`))))
  })
}

async function installNode(update: Update): Promise<void> {
  const arch = arm() ? 'arm64' : 'x64'
  const rel = pickNode(await getJson<NodeRelease[]>('https://nodejs.org/dist/index.json'), arch)
  if (!rel) throw new Error('No Node.js release for this Mac was found.')
  const file = `node-${rel.version}-darwin-${arch}.tar.gz`
  const sums = await textOf(`https://nodejs.org/dist/${rel.version}/SHASUMS256.txt`)
  const archive = await fetchVerified(`https://nodejs.org/dist/${rel.version}/${file}`, file, shaFor(sums, file), `Node.js ${rel.version}`, update)
  update(null, 'Unpacking Node.js')
  await unpackInto(archive, join(runtimesRoot(), 'node'))
}

async function installBun(update: Update): Promise<void> {
  const rel = await githubLatest('oven-sh/bun')
  const name = `bun-darwin-${arm() ? 'aarch64' : 'x64'}`
  const asset = rel.assets.find((a) => a.name === `${name}.zip`)
  const sumsAsset = rel.assets.find((a) => a.name === 'SHASUMS256.txt')
  if (!asset) throw new Error('No Bun build for this Mac was found.')
  const sha = sumsAsset ? shaFor(await textOf(sumsAsset.url), asset.name) : null
  const archive = await fetchVerified(asset.url, asset.name, sha, 'Bun', update)
  const target = join(runtimesRoot(), 'bun')
  await unpackInto(archive, join(target, 'unpacked'))
  mkdirSync(join(target, 'bin'), { recursive: true })
  rmSync(join(target, 'bin', 'bun'), { force: true })
  renameSync(join(target, 'unpacked', 'bun'), join(target, 'bin', 'bun'))
  rmSync(join(target, 'unpacked'), { recursive: true, force: true })
  await makeExecutable(join(target, 'bin', 'bun'))
}

async function installUv(update: Update): Promise<void> {
  const rel = await githubLatest('astral-sh/uv')
  const file = `uv-${arm() ? 'aarch64' : 'x86_64'}-apple-darwin.tar.gz`
  const asset = rel.assets.find((a) => a.name === file)
  const sumAsset = rel.assets.find((a) => a.name === `${file}.sha256`)
  if (!asset) throw new Error('No uv build for this Mac was found.')
  const sha = sumAsset ? /([a-f0-9]{64})/i.exec(await textOf(sumAsset.url))?.[1].toLowerCase() ?? null : null
  const archive = await fetchVerified(asset.url, file, sha, 'uv', update)
  await unpackInto(archive, join(runtimesRoot(), 'uv', 'bin'))
  update(null, 'Installing Python')
  await runLogged(join(runtimesRoot(), 'uv', 'bin', 'uv'), ['python', 'install'], runtimeEnv(), update, 'Python')
}

async function installGo(update: Update): Promise<void> {
  const g = pickGo(await getJson<GoRelease[]>('https://go.dev/dl/?mode=json'), arm() ? 'arm64' : 'amd64')
  if (!g) throw new Error('No Go release for this Mac was found.')
  const archive = await fetchVerified(`https://go.dev/dl/${g.filename}`, g.filename, g.sha256, `Go ${g.version}`, update)
  update(null, 'Unpacking Go')
  await unpackInto(archive, join(runtimesRoot(), 'go'))
}

async function installDotnet(update: Update): Promise<void> {
  const script = join(dirs.downloads(), 'dotnet-install.sh')
  await downloadFile('https://builds.dotnet.microsoft.com/dotnet/scripts/v1/dotnet-install.sh', script, (p) => update(p, 'Downloading the .NET installer'))
  chmodSync(script, 0o755)
  const target = join(runtimesRoot(), 'dotnet')
  mkdirSync(target, { recursive: true })
  await runLogged('/bin/bash', [script, '--channel', 'LTS', '--install-dir', target, '--no-path'], runtimeEnv(), update, '.NET')
  rmSync(script, { force: true })
}

async function installRust(update: Update): Promise<void> {
  const triple = `${arm() ? 'aarch64' : 'x86_64'}-apple-darwin`
  const base = `https://static.rust-lang.org/rustup/dist/${triple}/rustup-init`
  const sha = /([a-f0-9]{64})/i.exec(await textOf(`${base}.sha256`))?.[1].toLowerCase() ?? null
  const init = await fetchVerified(base, 'rustup-init', sha, 'rustup', update)
  await makeExecutable(init)
  const env = { ...runtimeEnv(), CARGO_HOME: join(runtimesRoot(), 'cargo'), RUSTUP_HOME: join(runtimesRoot(), 'rustup') }
  await runLogged(init, ['-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', 'stable'], env, update, 'Rust')
  rmSync(init, { force: true })
}

async function installSwift(): Promise<void> {
  if (!isMac) throw new Error('Swift for iPhone and Mac apps needs macOS.')
  // Opens Apple's own installer for the command line tools, which includes Swift.
  await new Promise<void>((resolve) => execFile('xcode-select', ['--install'], () => resolve()))
  throw new Error('Apple’s installer is open. Finish it, then come back. For iPhone and Mac apps, also install Xcode from the App Store.')
}

async function installPhp(): Promise<void> {
  const versions = await listVersions()
  const top = versions[0]
  if (!top) throw new Error('No PHP build was found.')
  await installMinor(top.minor)
}

const INSTALLERS: Record<RuntimeId, (u: Update) => Promise<void>> = {
  node: installNode,
  bun: installBun,
  python: installUv,
  go: installGo,
  dotnet: installDotnet,
  rust: installRust,
  swift: installSwift,
  php: installPhp
}

/** Installs (or updates) Laramac's own copy of a runtime. */
export async function installRuntime(id: RuntimeId): Promise<void> {
  mkdirSync(runtimesRoot(), { recursive: true })
  if (id === 'php' || id === 'swift') return INSTALLERS[id](() => undefined)
  await jobs.run(`Installing ${META[id].name}`, (update) => INSTALLERS[id](update))
  refreshRuntimeShims()
}

/** Installs whatever a starter needs that this Mac does not have yet. */
export async function ensureRuntimes(ids: RuntimeId[]): Promise<void> {
  for (const id of ids) {
    if (locate(id)) continue
    await installRuntime(id)
  }
}

const SHIMS: Partial<Record<RuntimeId, string[]>> = {
  node: ['node', 'npm', 'npx', 'corepack'],
  bun: ['bun', 'bunx'],
  python: ['uv', 'uvx'],
  go: ['go', 'gofmt'],
  dotnet: ['dotnet'],
  rust: ['cargo', 'rustc', 'rustup', 'rustfmt']
}

/** Small scripts in Laramac's bin folder so Terminal finds the managed runtimes too. */
export function refreshRuntimeShims(): void {
  mkdirSync(dirs.bin(), { recursive: true })
  const bins = managedBinDirs()
  const extra = runtimeEnv()
  for (const [id, tools] of Object.entries(SHIMS) as [RuntimeId, string[]][]) {
    const dir = bins[id]
    for (const tool of tools) {
      const file = join(dirs.bin(), tool)
      const real = dir ? join(dir, tool) : ''
      if (!dir || !existsSync(real)) {
        // Only remove scripts Laramac wrote, never something else's file.
        continue
      }
      if (id === 'node') {
        writeFileSync(file, nodeShim(tool, dir))
        chmodSync(file, 0o755)
        continue
      }
      const vars = id === 'dotnet' ? `DOTNET_ROOT="${extra.DOTNET_ROOT}" ` : id === 'rust' ? `CARGO_HOME="${extra.CARGO_HOME}" RUSTUP_HOME="${extra.RUSTUP_HOME}" ` : ''
      writeFileSync(file, `#!/bin/sh\n# Written by Laramac.\nPATH="${dir}:$PATH" ${vars}exec "${real}" "$@"\n`)
      chmodSync(file, 0o755)
    }
  }
}
