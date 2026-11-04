/**
 * Node.js per project. Laramac keeps its main Node in runtimes/node and any other major
 * versions in runtimes/node-versions/<major>. A project asks for a version with .nvmrc,
 * .node-version, .tool-versions, Volta or package.json "engines"; you can also choose one
 * on the site's page. Dev servers, package updates and Terminal (through the node, npm and
 * npx commands in Laramac's bin folder) then use that version on their own.
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { delimiter, join } from 'path'
import { runtimesRoot, runtimeEnv } from './runtimes'
import { downloadFile, extract, sha256File, USER_AGENT } from './download'
import { dirs } from './paths'

type Update = (p: number | null, label?: string) => void

export interface NodeRelease {
  version: string
  lts: string | false
  files: string[]
}

export const nodeVersionsRoot = (): string => join(runtimesRoot(), 'node-versions')
const mainNodeDir = (): string => join(runtimesRoot(), 'node')
const MAJOR = /^\d{1,3}$/

/** Long-term-support code names, for .nvmrc files that say lts/iron. */
const LTS_NAMES: Record<string, string> = { argon: '4', boron: '6', carbon: '8', dubnium: '10', erbium: '12', fermium: '14', gallium: '16', hydrogen: '18', iron: '20', jod: '22', krypton: '24', lithium: '26' }

export interface NodeNeed {
  major: string
  /** Where the request came from, in words. */
  source: string
  /** true: exactly this major. false: this major or newer is fine. */
  exact: boolean
}

function firstLine(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').split('\n')[0].trim()
  } catch {
    return null
  }
}

/** Turns "v20.11.0", "20", "lts/iron" or "node 22" into a major version. */
export function majorFrom(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim().toLowerCase().replace(/^nodejs\s+|^node\s+/, '')
  const lts = /^lts\/(\w+)/.exec(t)
  if (lts) return LTS_NAMES[lts[1]] ?? null
  const m = /^v?(\d{1,3})(?:\.|$|\s)/.exec(t)
  return m ? m[1] : null
}

/** What Node a project asks for, if anything. */
export function nodeNeed(dir: string): NodeNeed | null {
  for (const f of ['.nvmrc', '.node-version']) {
    const major = majorFrom(firstLine(join(dir, f)))
    if (major) return { major, source: f, exact: true }
  }
  try {
    const line = readFileSync(join(dir, '.tool-versions'), 'utf8')
      .split('\n')
      .find((l) => /^nodejs\s/.test(l.trim()))
    const major = majorFrom(line)
    if (major) return { major, source: '.tool-versions', exact: true }
  } catch {
    // No asdf file.
  }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { volta?: { node?: string }; engines?: { node?: string } }
    const volta = majorFrom(pkg.volta?.node)
    if (volta) return { major: volta, source: 'Volta in package.json', exact: true }
    const e = pkg.engines?.node?.trim()
    if (e) {
      const m = /(\d{1,3})/.exec(e)
      if (m) {
        // ">=18" and "18 || 20 || 22" leave room; "18.x", "^18" and "~18" mean that line only.
        const open = /^>=?|\|\||\s-\s|\*/.test(e) || /\|\|/.test(e)
        return { major: m[1], source: 'engines in package.json', exact: !open }
      }
    }
  } catch {
    // No package.json or not valid JSON.
  }
  return null
}

/** Whether a version fits what the project asks for. */
export const fits = (need: NodeNeed, major: string | null): boolean => !!major && (need.exact ? major === need.major : Number(major) >= Number(need.major))

function versionOf(binDir: string): string | null {
  const node = join(binDir, 'node')
  if (!existsSync(node)) return null
  try {
    return execFileSync(node, ['--version'], { timeout: 5000 }).toString().trim().replace(/^v/, '')
  } catch {
    return null
  }
}

let mainVersionCache: { at: number; v: string | null } | null = null
/** The main Node's version (Laramac's own, or the one on this Mac). */
export function mainNodeVersion(): string | null {
  if (mainVersionCache && Date.now() - mainVersionCache.at < 60_000) return mainVersionCache.v
  let v = versionOf(join(mainNodeDir(), 'bin'))
  if (!v) {
    const p = (runtimeEnv().PATH ?? '').split(delimiter).find((d) => existsSync(join(d, 'node')) && !d.startsWith(dirs.bin()))
    v = p ? versionOf(p) : null
  }
  mainVersionCache = { at: Date.now(), v }
  return v
}
export const clearNodeCache = (): void => {
  mainVersionCache = null
}

export interface InstalledNode {
  major: string
  version: string
  /** The main Node, used when a project does not ask for another. */
  main: boolean
  dir: string
}

export function installedNodes(): InstalledNode[] {
  const out: InstalledNode[] = []
  const mainV = mainNodeVersion()
  if (mainV) out.push({ major: mainV.split('.')[0], version: mainV, main: true, dir: existsSync(join(mainNodeDir(), 'bin', 'node')) ? join(mainNodeDir(), 'bin') : '' })
  let names: string[] = []
  try {
    names = readdirSync(nodeVersionsRoot()).filter((n) => MAJOR.test(n))
  } catch {
    names = []
  }
  for (const major of names) {
    const dir = join(nodeVersionsRoot(), major, 'bin')
    const v = versionOf(dir)
    if (v && !out.some((o) => o.major === major)) out.push({ major, version: v, main: false, dir })
  }
  return out.sort((a, b) => Number(b.major) - Number(a.major))
}

/** The bin folder for a major version, or null when it is not installed. */
export function nodeBinFor(major: string): string | null {
  const n = installedNodes().find((x) => x.major === major)
  if (!n) return null
  return n.dir || null
}

/** The major a site uses: its own choice, then what it asks for, then the main one. */
export function siteNodeChoice(path: string, chosen?: string): { want: string | null; source: string; installed: boolean; bin: string | null } {
  const mainMajor = mainNodeVersion()?.split('.')[0] ?? null
  if (chosen && MAJOR.test(chosen)) {
    const bin = chosen === mainMajor ? null : nodeBinFor(chosen)
    return { want: chosen, source: 'chosen on its page', installed: chosen === mainMajor || !!bin, bin }
  }
  const need = nodeNeed(path)
  if (!need || fits(need, mainMajor)) return { want: need?.major ?? null, source: need?.source ?? '', installed: true, bin: null }
  const bin = nodeBinFor(need.major)
  return { want: need.major, source: need.source, installed: !!bin, bin }
}

/** runtimeEnv() with the site's Node first on PATH. */
export function siteRuntimeEnv(path: string, chosen?: string): NodeJS.ProcessEnv {
  const env = runtimeEnv()
  const { bin } = siteNodeChoice(path, chosen)
  if (bin) env.PATH = [bin, env.PATH].join(delimiter)
  return env
}

/** Newest release of each major line that has a build for this Mac. */
export function newestPerMajor(index: NodeRelease[], arch: 'arm64' | 'x64', minMajor = 16): { major: string; version: string; lts: string | false }[] {
  const seen = new Map<string, { major: string; version: string; lts: string | false }>()
  for (const r of index) {
    if (!r.files.includes(`osx-${arch}-tar`)) continue
    const major = /^v(\d+)\./.exec(r.version)?.[1]
    if (!major || Number(major) < minMajor || seen.has(major)) continue
    seen.set(major, { major, version: r.version.replace(/^v/, ''), lts: r.lts })
  }
  return [...seen.values()].sort((a, b) => Number(b.major) - Number(a.major))
}

async function nodeIndex(): Promise<NodeRelease[]> {
  const res = await fetch('https://nodejs.org/dist/index.json', { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`nodejs.org answered ${res.status}`)
  return (await res.json()) as NodeRelease[]
}

const arch = (): 'arm64' | 'x64' => (process.arch === 'arm64' ? 'arm64' : 'x64')

export async function availableNodes(): Promise<{ major: string; version: string; lts: string | false }[]> {
  return newestPerMajor(await nodeIndex(), arch())
}

/** Installs (or updates to the newest patch of) one major line, checked against nodejs.org's SHASUMS256. */
export async function installNodeMajor(major: string, update: Update = () => {}, into?: string): Promise<string> {
  if (!MAJOR.test(major)) throw new Error('That is not a Node.js version.')
  const rel = newestPerMajor(await nodeIndex(), arch(), 0).find((r) => r.major === major)
  if (!rel) throw new Error(`Node.js ${major} has no build for this Mac.`)
  const file = `node-v${rel.version}-darwin-${arch()}.tar.gz`
  const base = `https://nodejs.org/dist/v${rel.version}`
  const sumsRes = await fetch(`${base}/SHASUMS256.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!sumsRes.ok) throw new Error('The checksums for Node.js could not be downloaded.')
  const sums = await sumsRes.text()
  const want = sums
    .split('\n')
    .map((l) => /^([a-f0-9]{64})\s+(.+)$/i.exec(l.trim()))
    .find((m) => m && m[2] === file)?.[1]
  if (!want) throw new Error('Node.js did not publish a checksum for this download.')
  const tmp = join(dirs.root(), 'downloads')
  mkdirSync(tmp, { recursive: true })
  const archive = join(tmp, file)
  update(0, `Downloading Node.js ${rel.version}`)
  await downloadFile(`${base}/${file}`, archive, (p) => update(p, `Downloading Node.js ${rel.version}`))
  if ((await sha256File(archive)).toLowerCase() !== want.toLowerCase()) {
    rmSync(archive, { force: true })
    throw new Error('The Node.js download did not match its published checksum, so it was not installed.')
  }
  update(null, `Unpacking Node.js ${rel.version}`)
  const target = into ?? join(nodeVersionsRoot(), major)
  mkdirSync(join(target, '..'), { recursive: true })
  const staging = `${target}.new`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  await extract(archive, staging)
  rmSync(archive, { force: true })
  // The archive holds one folder, node-vX-darwin-arch; move its contents up.
  const inner = readdirSync(staging).find((n) => n.startsWith('node-'))
  rmSync(target, { recursive: true, force: true })
  renameSync(inner ? join(staging, inner) : staging, target)
  rmSync(staging, { recursive: true, force: true })
  clearNodeCache()
  return rel.version
}

/** The main Node: Laramac's own copy, when it has one. */
export const mainNodeManaged = (): boolean => existsSync(join(mainNodeDir(), 'bin', 'node'))

/** Updates the main Node to the newest release of the same major line. */
export async function updateMainNode(update: Update = () => {}): Promise<string> {
  const major = mainNodeVersion()?.split('.')[0]
  if (!major || !mainNodeManaged()) throw new Error('The main Node.js was not installed by Laramac, so update it the way you installed it.')
  return installNodeMajor(major, update, mainNodeDir())
}

export function removeNodeMajor(major: string): void {
  if (!MAJOR.test(major)) throw new Error('That is not a Node.js version.')
  rmSync(join(nodeVersionsRoot(), major), { recursive: true, force: true })
}

/** Folder to major version, for the Terminal commands. Written whenever sites change. */
export const nodeMapFile = (): string => join(runtimesRoot(), 'node-map')

export function writeNodeMap(entries: { path: string; major: string }[]): void {
  mkdirSync(runtimesRoot(), { recursive: true })
  const lines = entries.filter((e) => MAJOR.test(e.major) && !/[\t\n]/.test(e.path)).map((e) => `${e.path}\t${e.major}`)
  writeFileSync(nodeMapFile(), lines.join('\n') + (lines.length ? '\n' : ''))
}

/**
 * The node, npm, npx and corepack commands in Laramac's bin folder. Each one looks for the
 * version this folder wants (a site's choice in Laramac, then .nvmrc, .node-version or
 * .tool-versions in this folder or above) and runs it, or the main Node when there is none.
 */
export function nodeShim(tool: string, mainBin: string): string {
  const root = nodeVersionsRoot()
  const map = nodeMapFile()
  return `#!/bin/sh
# Written by Laramac: picks the Node.js version each project asks for.
v=""
if [ -f "${map}" ]; then
  v=$(awk -F '\\t' -v d="$PWD" 'index(d"/", $1"/")==1 { if (length($1) > best) { best = length($1); m = $2 } } END { print m }' "${map}")
fi
if [ -z "$v" ]; then
  d="$PWD"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    for f in .nvmrc .node-version; do
      if [ -f "$d/$f" ]; then v=$(head -n 1 "$d/$f" | tr -d ' v\\r' | cut -d. -f1); break 2; fi
    done
    if [ -f "$d/.tool-versions" ]; then v=$(awk '$1=="nodejs" { print $2 }' "$d/.tool-versions" | tr -d 'v' | cut -d. -f1); [ -n "$v" ] && break; fi
    d=$(dirname "$d")
  done
fi
dir="${mainBin}"
if [ -n "$v" ] && [ -x "${root}/$v/bin/${tool}" ]; then dir="${root}/$v/bin"; fi
PATH="$dir:$PATH" exec "$dir/${tool}" "$@"
`
}
