import { mysqlArch, phpArch } from './platform'
import { urlExists } from './download'

/** Compares dotted numeric versions: 8.4.10 is newer than 8.4.8. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function minorOf(version: string): string {
  return version.split('.').slice(0, 2).join('.')
}

export type PhpFlavor = 'full' | 'light'

const flavorDir = (flavor: PhpFlavor): string => (flavor === 'full' ? 'bulk' : 'common')

export function phpDownloadUrl(
  kind: 'cli' | 'fpm',
  version: string,
  flavor: PhpFlavor,
  arch = phpArch()
): string {
  return `https://dl.static-php.dev/static-php-cli/${flavorDir(flavor)}/php-${version}-${kind}-macos-${arch}.tar.gz`
}

/**
 * Reads the static-php-cli directory listing and returns the newest patch release of each
 * PHP minor version that has both CLI and FPM builds for this CPU.
 */
export function parsePhpListing(
  entries: { name: string }[],
  arch = phpArch()
): Record<string, string> {
  const cli = new Set<string>()
  const fpm = new Set<string>()
  const re = new RegExp(`^php-(\\d+\\.\\d+\\.\\d+)-(cli|fpm)-macos-${arch}\\.tar\\.gz$`)
  for (const { name } of entries) {
    const m = re.exec(name)
    if (!m) continue
    ;(m[2] === 'cli' ? cli : fpm).add(m[1])
  }
  const latest: Record<string, string> = {}
  for (const v of cli) {
    if (!fpm.has(v)) continue
    const minor = minorOf(v)
    if (!latest[minor] || compareVersions(v, latest[minor]) > 0) latest[minor] = v
  }
  return latest
}

const cache = new Map<string, { at: number; data: Record<string, string> }>()

export async function fetchPhpReleases(flavor: PhpFlavor): Promise<Record<string, string>> {
  const key = flavor
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data

  const res = await fetch(`https://dl.static-php.dev/static-php-cli/${flavorDir(flavor)}/?format=json`)
  if (!res.ok) throw new Error(`Could not list PHP versions (${res.status})`)
  const entries = (await res.json()) as { name: string }[]
  const data = parsePhpListing(entries)
  cache.set(key, { at: Date.now(), data })
  return data
}

/** Known-good MySQL LTS releases. Newer patches are discovered by probing. */
export const KNOWN_MYSQL = ['8.4.9', '8.4.6']

export function mysqlUrls(version: string): string[] {
  const series = minorOf(version)
  const arch = mysqlArch()
  return ['macos15', 'macos14'].map(
    (tag) => `https://dev.mysql.com/get/Downloads/MySQL-${series}/mysql-${version}-${tag}-${arch}.tar.gz`
  )
}

export async function resolveMysqlUrl(version: string): Promise<string> {
  for (const url of mysqlUrls(version)) {
    if (await urlExists(url)) return url
  }
  throw new Error(`MySQL ${version} is not available for this Mac.`)
}

/** Probes for a newer MySQL patch release than the ones we know about. */
export async function latestMysql(): Promise<string> {
  const base = KNOWN_MYSQL[0]
  const [major, minor, patch] = base.split('.').map((n) => parseInt(n, 10))
  let best = base
  for (let p = patch + 1; p <= patch + 4; p++) {
    const candidate = `${major}.${minor}.${p}`
    const found = (await Promise.all(mysqlUrls(candidate).map(urlExists))).some(Boolean)
    if (found) best = candidate
  }
  return best
}

export function mailpitUrl(arch: 'arm64' | 'amd64'): string {
  return `https://github.com/axllent/mailpit/releases/latest/download/mailpit-darwin-${arch}.tar.gz`
}

export function cloudflaredUrl(arch: 'arm64' | 'amd64'): string {
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arch}.tgz`
}

export function ngrokUrl(arch: 'arm64' | 'amd64'): string {
  return `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-${arch}.zip`
}

export const PHPMYADMIN_URL = 'https://www.phpmyadmin.net/downloads/phpMyAdmin-latest-english.zip'
export const COMPOSER_URL = 'https://getcomposer.org/download/latest-stable/composer.phar'
export const WORDPRESS_URL = 'https://wordpress.org/latest.zip'

/** Where prebuilt Nginx and Apache binaries are published by this repo's CI. */
export const BINARIES_REPO = 'Pino10/laramac'

export function bundledBinaryUrl(name: 'nginx' | 'httpd' | 'redis', arch: 'arm64' | 'amd64'): string {
  return `https://github.com/${BINARIES_REPO}/releases/download/binaries/${name}-darwin-${arch}.tar.gz`
}

export const ADMINER_URL = 'https://www.adminer.org/latest.php'

// ---- PostgreSQL: prebuilt binaries published to Maven Central by the zonkyio project.

export function postgresArtifact(
  platform: string = process.platform,
  arch: string = process.arch
): string {
  if (platform === 'linux') return 'linux-amd64'
  return arch === 'arm64' ? 'darwin-arm64v8' : 'darwin-amd64'
}

const MAVEN = 'https://repo1.maven.org/maven2/io/zonky/test/postgres'

export function postgresJarUrl(version: string, artifact = postgresArtifact()): string {
  const id = `embedded-postgres-binaries-${artifact}`
  return `${MAVEN}/${id}/${version}/${id}-${version}.jar`
}

/** Reads maven-metadata.xml and returns the newest release of each PostgreSQL major version. */
export function parseMavenVersions(xml: string): Record<string, string> {
  const latest: Record<string, string> = {}
  for (const m of xml.matchAll(/<version>(\d+\.\d+(?:\.\d+)?)<\/version>/g)) {
    const v = m[1]
    const major = v.split('.')[0]
    if (!latest[major] || compareVersions(v, latest[major]) > 0) latest[major] = v
  }
  return latest
}

export async function fetchPostgresVersions(): Promise<Record<string, string>> {
  const id = `embedded-postgres-binaries-${postgresArtifact()}`
  const res = await fetch(`${MAVEN}/${id}/maven-metadata.xml`)
  if (!res.ok) throw new Error(`Could not list PostgreSQL versions (${res.status})`)
  return parseMavenVersions(await res.text())
}

// ---- MongoDB: official community tarballs.

export const MONGODB_VERSION = '8.0.12'

export function mongodbUrl(version = MONGODB_VERSION, arch: string = process.arch): string {
  const a = arch === 'arm64' ? 'arm64' : 'x86_64'
  return `https://fastdl.mongodb.org/osx/mongodb-macos-${a}-${version}.tgz`
}
