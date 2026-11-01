import { mysqlArch, phpArch } from './platform'
import { releasesApi } from './distribution'
import { USER_AGENT, urlExists } from './download'

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

const cache = new Map<string, { at: number; data: unknown }>()
const TEN_MINUTES = 10 * 60 * 1000

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.data as T
  const data = await load()
  cache.set(key, { at: Date.now(), data })
  return data
}

export function clearVersionCache(): void {
  cache.clear()
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  return (await res.json()) as T
}

/** static-php.dev's ready-made builds (newest patch per minor). */
export function fetchPhpReleases(flavor: PhpFlavor): Promise<Record<string, string>> {
  return cached(`spc-${flavor}`, async () =>
    parsePhpListing(await getJson<{ name: string }[]>(`https://dl.static-php.dev/static-php-cli/${flavorDir(flavor)}/?format=json`))
  )
}

/** PHP versions Laramac offers. php.net is asked for the newest release of each. */
export const SUPPORTED_PHP = ['8.5', '8.4', '8.3', '8.2', '8.1', '8.0']

/** The newest release of each PHP version according to php.net itself. */
export function fetchPhpNetLatest(minors: string[] = SUPPORTED_PHP): Promise<Record<string, string>> {
  return cached('php.net', async () => {
    const out: Record<string, string> = {}
    await Promise.all(
      minors.map(async (m) => {
        try {
          const d = await getJson<{ version?: string }>(`https://www.php.net/releases/?json&version=${m}`)
          if (d.version && /^\d+\.\d+\.\d+$/.test(d.version)) out[m] = d.version
        } catch {
          // php.net unreachable: fall back to what the build sources offer.
        }
      })
    )
    return out
  })
}

export interface PhpBuild {
  version: string
  cliUrl: string
  fpmUrl: string
  /** SHA-256 list covering both archives, when the source publishes one. */
  sumsUrl: string | null
  source: 'laramac' | 'static-php'
  /** xdebug.so for this exact build, when it was built. */
  xdebugUrl?: string
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** Builds published by this repo's "Build latest PHP" workflow, newest patch per minor. */
export function parseLaramacPhpAssets(assets: ReleaseAsset[], arch = phpArch()): Record<string, PhpBuild> {
  const byName = new Map(assets.map((a) => [a.name, a.browser_download_url]))
  const out: Record<string, PhpBuild> = {}
  const re = new RegExp(`^php-(\\d+\\.\\d+\\.\\d+)-fpm-macos-${arch}\\.tar\\.gz$`)
  for (const a of assets) {
    const m = re.exec(a.name)
    if (!m) continue
    const v = m[1]
    const cli = byName.get(`php-${v}-cli-macos-${arch}.tar.gz`)
    const sums = byName.get(`php-${v}-macos-${arch}.sha256`)
    // Only offer a build whose checksum list was published with it.
    if (!cli || !sums) continue
    const minor = minorOf(v)
    if (out[minor] && compareVersions(out[minor].version, v) >= 0) continue
    const xdebug = byName.get(`php-${v}-xdebug-macos-${arch}.tar.gz`)
    out[minor] = { version: v, cliUrl: cli, fpmUrl: a.browser_download_url, sumsUrl: sums, source: 'laramac', ...(xdebug ? { xdebugUrl: xdebug } : {}) }
  }
  return out
}

export function fetchLaramacPhpBuilds(): Promise<Record<string, PhpBuild>> {
  return cached('laramac-php', async () => {
    try {
      const rel = await releasesApi<{ assets: ReleaseAsset[] }>('releases/tags/php-builds')
      return parseLaramacPhpAssets(rel.assets)
    } catch {
      return {}
    }
  })
}

/** For each PHP version, the newest build available from Laramac's own builds or static-php.dev. */
export async function resolvePhpBuilds(flavor: PhpFlavor): Promise<Record<string, PhpBuild>> {
  const [own, spc] = await Promise.all([
    flavor === 'full' ? fetchLaramacPhpBuilds() : Promise.resolve({} as Record<string, PhpBuild>),
    fetchPhpReleases(flavor).catch(() => ({}) as Record<string, string>)
  ])
  const out: Record<string, PhpBuild> = {}
  for (const [minor, version] of Object.entries(spc)) {
    out[minor] = { version, cliUrl: phpDownloadUrl('cli', version, flavor), fpmUrl: phpDownloadUrl('fpm', version, flavor), sumsUrl: null, source: 'static-php' }
  }
  for (const [minor, build] of Object.entries(own)) {
    if (!out[minor] || compareVersions(build.version, out[minor].version) >= 0) out[minor] = build
  }
  return out
}

/** Reads "hash  filename" lines and returns the hash for one file. */
export function hashFor(list: string, filename: string): string | null {
  for (const line of list.split('\n')) {
    const m = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (m && m[2].split('/').pop() === filename) return m[1].toLowerCase()
  }
  return null
}

/**
 * MySQL 8.4 LTS builds come from Oracle's CDN. dev.mysql.com/get refuses requests that do not
 * come from a browser (it answers 403), so Laramac asks the CDN directly: current releases
 * live under /Downloads, older ones move to /archives.
 */
const MYSQL_CDN = 'https://cdn.mysql.com'
const MYSQL_PATCH_RANGE = { from: 6, to: 40 }

export function mysqlUrls(version: string, arch: string = mysqlArch()): string[] {
  const series = minorOf(version)
  const urls: string[] = []
  for (const tag of ['macos15', 'macos14']) {
    const file = `mysql-${version}-${tag}-${arch}.tar.gz`
    urls.push(`${MYSQL_CDN}/Downloads/MySQL-${series}/${file}`, `${MYSQL_CDN}/archives/mysql-${series}/${file}`)
  }
  return urls
}

export interface MysqlBuild {
  version: string
  url: string
}

/** Finds every MySQL 8.4 build available for this Mac, newest first. */
export async function findMysqlBuilds(arch: string = mysqlArch()): Promise<MysqlBuild[]> {
  const versions: string[] = []
  for (let p = MYSQL_PATCH_RANGE.from; p <= MYSQL_PATCH_RANGE.to; p++) versions.push(`8.4.${p}`)
  const found = await Promise.all(
    versions.map(async (version) => {
      for (const url of mysqlUrls(version, arch)) if (await urlExists(url)) return { version, url }
      return null
    })
  )
  return found.filter((b): b is MysqlBuild => b !== null).sort((a, b) => compareVersions(b.version, a.version))
}

/** The build to install: the version asked for if it exists, otherwise the newest. */
export function chooseMysqlBuild(builds: MysqlBuild[], wanted: string): MysqlBuild | null {
  if (builds.length === 0) return null
  if (wanted !== 'latest') {
    const exact = builds.find((b) => b.version === wanted)
    if (exact) return exact
  }
  return builds[0]
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
/** Public repository with Laramac's downloads: app releases, PHP builds and server builds. The source can stay private. */
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

export const MONGODB_FALLBACK = '9.0.4'

/** The newest MongoDB Community release for this Mac, from MongoDB's own version feed. */
export async function latestMongodb(arch: string = process.arch): Promise<{ version: string; url: string }> {
  const a = arch === 'arm64' ? 'arm64' : 'x86_64'
  try {
    const feed = await getJson<{ versions: { version: string; production_release?: boolean; downloads: { target?: string; arch?: string; archive: { url: string } }[] }[] }>(
      'https://downloads.mongodb.org/current.json'
    )
    for (const v of feed.versions) {
      if (v.production_release === false) continue
      const d = v.downloads.find((x) => x.target === 'macos' && x.arch === a && x.archive.url.startsWith('https://fastdl.mongodb.org/'))
      if (d) return { version: v.version, url: d.archive.url }
    }
  } catch {
    // Feed unreachable: use the known release.
  }
  return { version: MONGODB_FALLBACK, url: mongodbUrl(MONGODB_FALLBACK, arch) }
}

export function meilisearchUrl(arch: string = process.arch): string {
  return `https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch-macos-${arch === 'arm64' ? 'apple-silicon' : 'amd64'}`
}

export function mongodbUrl(version: string = MONGODB_FALLBACK, arch: string = process.arch): string {
  const a = arch === 'arm64' ? 'arm64' : 'x86_64'
  return `https://fastdl.mongodb.org/osx/mongodb-macos-${a}-${version}.tgz`
}
