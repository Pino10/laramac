import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { PhpVersionInfo } from '../shared/types'
import { dirs } from './paths'
import { getSettings, setSettings } from './settings'
import { USER_AGENT, downloadFile, extract, removeQuarantine, sha256File } from './download'
import { execFile } from 'child_process'
import { jobs } from './jobs'
import { PHP_PROBE, compareVersions, fetchPhpNetLatest, hashFor, minorOf, resolvePhpBuilds, type PhpBuild } from './versions'
import { generateFpmConf, generatePhpIni, phpPortFor } from './configgen'
import { ManagedProcess } from './process'

export const phpBinary = (minor: string): string => join(dirs.php(minor), 'php')
export const fpmBinary = (minor: string): string => join(dirs.php(minor), 'php-fpm')
export const phpIniPath = (minor: string): string => join(dirs.conf(), `php-${minor}.ini`)
export const xdebugPath = (minor: string): string => join(dirs.php(minor), 'xdebug.so')
const fpmConfPath = (minor: string): string => join(dirs.conf(), `php-fpm-${minor}.conf`)

export function installedMinors(): string[] {
  if (!existsSync(dirs.php())) return []
  return readdirSync(dirs.php())
    .filter((m) => /^\d+\.\d+$/.test(m) && existsSync(phpBinary(m)) && existsSync(fpmBinary(m)))
    .sort((a, b) => compareVersions(b, a))
}

export function installedPatch(minor: string): string | null {
  try {
    return readFileSync(join(dirs.php(minor), 'VERSION'), 'utf8').trim()
  } catch {
    return existsSync(phpBinary(minor)) ? minor : null
  }
}

export function defaultMinor(): string | null {
  const installed = installedMinors()
  const chosen = getSettings().defaultPhp
  if (chosen && installed.includes(chosen)) return chosen
  return installed[0] ?? null
}

export function installedExtensions(minor: string): string[] {
  try {
    return readFileSync(join(dirs.php(minor), 'EXTENSIONS'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function listVersions(): Promise<PhpVersionInfo[]> {
  const installed = installedMinors()
  const def = defaultMinor()
  const settings = getSettings()
  const [builds, upstream] = await Promise.all([
    resolvePhpBuilds(settings.phpFlavor).catch(() => ({}) as Record<string, PhpBuild>),
    fetchPhpNetLatest().catch(() => ({}) as Record<string, string>)
  ])
  // Only the newest PHP is offered; older versions you add yourself from a download (Add a version).
  const newest = [...new Set([...PHP_PROBE, ...Object.keys(builds)])].filter((m) => /^\d+\.\d+$/.test(m) && (builds[m] || upstream[m])).sort((a, b) => compareVersions(b, a))[0]
  const minors = new Set([...(newest ? [newest] : []), ...installed])
  return [...minors]
    .sort((a, b) => compareVersions(b, a))
    .map((minor) => {
      const have = installed.includes(minor) ? installedPatch(minor) : null
      const latest = builds[minor]?.version ?? have ?? minor
      return {
        minor,
        latest,
        upstream: upstream[minor] ?? null,
        installed: have,
        isDefault: def === minor,
        updateAvailable: !!have && !!builds[minor] && compareVersions(builds[minor].version, have) > 0,
        extensions: have ? installedExtensions(minor) : [],
        xdebug: !!have && existsSync(xdebugPath(minor)),
        xdebugAvailable: !!builds[minor]?.xdebugUrl
      }
    })
}

function runPhp(minor: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(phpBinary(minor), args, { maxBuffer: 1024 * 1024 }, (err, out) => (err ? reject(err) : resolve(out)))
  })
}

/** Installs a PHP version, or updates it to the newest patch. Running sites keep working: FPM restarts on the new build. */
export async function installMinor(minor: string): Promise<void> {
  const settings = getSettings()
  const build = (await resolvePhpBuilds(settings.phpFlavor))[minor]
  if (!build) throw new Error(`PHP ${minor} is not available for this Mac.`)
  const { version } = build
  const wasRunning = runningMinors().includes(minor)

  await jobs.run(`Installing PHP ${version}`, async (update) => {
    const staging = join(dirs.downloads(), `php-${minor}-staging`)
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
    const sums = build.sumsUrl ? await (await fetch(build.sumsUrl, { headers: { 'User-Agent': USER_AGENT } })).text() : null

    const parts: ['cli' | 'fpm' | 'xdebug', string][] = [
      ['cli', build.cliUrl],
      ['fpm', build.fpmUrl],
      ...(build.xdebugUrl ? [['xdebug', build.xdebugUrl] as ['xdebug', string]] : [])
    ]
    for (let i = 0; i < parts.length; i++) {
      const [kind, url] = parts[i]
      const name = url.split('/').pop() ?? `php-${version}-${kind}.tar.gz`
      const archive = join(dirs.downloads(), name)
      await downloadFile(url, archive, (pct) =>
        update(pct === null ? null : Math.round((i * 100 + pct) / parts.length), `Downloading PHP ${version} (${kind})`)
      )
      if (sums) {
        const expected = hashFor(sums, name)
        if (!expected || (await sha256File(archive)) !== expected) {
          rmSync(archive, { force: true })
          throw new Error(`The PHP ${version} download did not match its published checksum and was deleted.`)
        }
      }
      await extract(archive, staging)
      rmSync(archive, { force: true })
    }

    if (wasRunning) await stopFpm(minor)
    const target = dirs.php(minor)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirs.php(), { recursive: true })
    renameSync(staging, target)
    for (const bin of ['php', 'php-fpm']) {
      const p = join(target, bin)
      if (existsSync(p)) chmodSync(p, 0o755)
    }
    await removeQuarantine(target)
    writeFileSync(join(target, 'VERSION'), version)
    writeFileSync(join(target, 'SOURCE'), build.source)
    const modules = await runPhp(minor, ['-n', '-m']).catch(() => '')
    writeFileSync(
      join(target, 'EXTENSIONS'),
      modules
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('['))
        .join('\n')
    )
  })

  if (!getSettings().defaultPhp || !installedMinors().includes(getSettings().defaultPhp!)) {
    setSettings({ defaultPhp: minor })
  }
}

/** Adds xdebug.so to an installed version that does not have it, by updating to a build that does. */
export async function ensureXdebug(minor: string): Promise<boolean> {
  if (existsSync(xdebugPath(minor))) return true
  const build = (await resolvePhpBuilds(getSettings().phpFlavor))[minor]
  if (!build?.xdebugUrl) return false
  await installMinor(minor)
  return existsSync(xdebugPath(minor))
}

export async function removeMinor(minor: string): Promise<void> {
  await stopFpm(minor)
  rmSync(dirs.php(minor), { recursive: true, force: true })
  rmSync(phpIniPath(minor), { force: true })
  rmSync(fpmConfPath(minor), { force: true })
  if (getSettings().defaultPhp === minor) setSettings({ defaultPhp: installedMinors()[0] ?? null })
}

/** Writes php.ini and the FPM pool config for one version. */
/** Your own php.ini lines for one version. Laramac never overwrites this file. */
export const customIniPath = (minor: string): string => join(dirs.conf(), `php-${minor}.custom.ini`)

export function ensureCustomIni(minor: string): string {
  const p = customIniPath(minor)
  if (!existsSync(p)) {
    mkdirSync(dirs.conf(), { recursive: true })
    writeFileSync(
      p,
      `; Your settings for PHP ${minor}. Laramac adds this file after its own defaults, so anything here wins.\n` +
        `; Save, then turn PHP off and on (or restart Laramac) to apply.\n;\n; memory_limit = 1G\n; xdebug.mode = debug\n`
    )
  }
  return p
}

export function writePhpConfig(minor: string, sendmail?: string): void {
  mkdirSync(dirs.conf(), { recursive: true })
  const sessions = join(dirs.run(), `php-${minor}-sessions`)
  mkdirSync(sessions, { recursive: true, mode: 0o700 })
  const custom = existsSync(customIniPath(minor)) ? readFileSync(customIniPath(minor), 'utf8') : ''
  writeFileSync(
    phpIniPath(minor),
    generatePhpIni({
      minor,
      sendmail,
      errorLog: join(dirs.logs(), `php-${minor}-error.log`),
      sessionDir: sessions,
      extensions: installedExtensions(minor),
      custom,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      mysqlSocket: join(dirs.run(), 'mysql.sock'),
      xdebug: (getSettings().xdebug || getSettings().profiler) && existsSync(xdebugPath(minor)) ? xdebugPath(minor) : null,
      debug: getSettings().xdebug,
      profileDir: getSettings().profiler ? join(dirs.root(), 'profiles') : null
    })
  )
  writeFileSync(
    fpmConfPath(minor),
    generateFpmConf({
      port: phpPortFor(minor),
      pidFile: join(dirs.run(), `php-fpm-${minor}.pid`),
      errorLog: join(dirs.logs(), `php-fpm-${minor}.log`),
      // Sends dump() and dd() to Laramac's Dumps window (Symfony's dump server format).
      env: getSettings().dumps ? { VAR_DUMPER_FORMAT: 'server', VAR_DUMPER_SERVER: '127.0.0.1:9912' } : {}
    })
  )
}

const pools = new Map<string, ManagedProcess>()

export async function startFpm(minor: string, sendmail?: string): Promise<void> {
  let pool = pools.get(minor)
  if (pool?.running) return
  writePhpConfig(minor, sendmail)
  pool = pool ?? new ManagedProcess(`PHP ${minor}`)
  pools.set(minor, pool)
  await pool.start(
    {
      command: fpmBinary(minor),
      args: ['-y', fpmConfPath(minor), '-c', phpIniPath(minor), '-F'],
      logFile: join(dirs.logs(), `php-fpm-${minor}.log`)
    },
    phpPortFor(minor)
  )
}

export async function stopFpm(minor: string): Promise<void> {
  await pools.get(minor)?.stop()
}

export async function stopAllFpm(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.stop()))
}

export function runningMinors(): string[] {
  return [...pools.entries()].filter(([, p]) => p.running).map(([m]) => m)
}

export { minorOf, phpPortFor }

/** Finds a regular file (never a link) with this exact name, a few folders deep. */
function findBinary(dir: string, name: string, depth = 0): string | null {
  if (depth > 5) return null
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const st = lstatSync(p)
    if (st.isFile() && f === name) return p
    if (st.isDirectory()) {
      const hit = findBinary(p, name, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

function untar(archive: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true })
  const zip = /\.zip$/i.test(archive)
  return new Promise((resolve, reject) =>
    execFile(zip ? 'unzip' : 'tar', zip ? ['-q', '-o', archive, '-d', dest] : ['-xf', archive, '-C', dest], { timeout: 5 * 60 * 1000 }, (err) =>
      err ? reject(new Error(`${basename(archive)} could not be opened. Choose a .tar.gz, .tar.xz or .zip.`)) : resolve()
    )
  )
}

/**
 * Adds a PHP version from files you downloaded (the Laragon way): a static PHP build for macOS,
 * such as the "cli" and "fpm" downloads from static-php.dev, as archives or a folder.
 */
export async function importPhp(paths: string[]): Promise<string> {
  if (paths.length === 0) throw new Error('Choose the PHP download first.')
  const staging = join(dirs.downloads(), `php-import-${Date.now()}`)
  mkdirSync(staging, { recursive: true, mode: 0o700 })
  try {
    for (const [i, p] of paths.entries()) {
      const dest = join(staging, String(i))
      if (statSync(p).isDirectory()) cpSync(p, dest, { recursive: true, filter: (src) => !lstatSync(src).isSymbolicLink() })
      else await untar(p, dest)
    }
    const php = findBinary(staging, 'php')
    const fpm = findBinary(staging, 'php-fpm')
    if (!php || !fpm) {
      throw new Error(
        !php && !fpm
          ? 'No PHP was found in what you chose. Choose a PHP build for macOS (static-php.dev has them).'
          : `Found ${php ? 'php' : 'php-fpm'} but not ${php ? 'php-fpm' : 'php'}. Sites need both: choose the cli and the fpm downloads together.`
      )
    }
    chmodSync(php, 0o755)
    chmodSync(fpm, 0o755)
    await removeQuarantine(staging)
    const ask = (bin: string, args: string[]): Promise<string> =>
      new Promise((resolve, reject) =>
        execFile(bin, args, { timeout: 15000 }, (err, out) => (err ? reject(new Error('That PHP does not run on this Mac. Check it is a macOS build for your chip (Apple Silicon or Intel).')) : resolve(String(out))))
      )
    const version = (await ask(php, ['-n', '-r', 'echo PHP_VERSION;'])).trim()
    if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error('That does not look like PHP.')
    const fpmVersion = /PHP (\d+\.\d+\.\d+)/.exec(await ask(fpm, ['-n', '-v']))?.[1]
    if (fpmVersion !== version.replace(/[^0-9.].*$/, '')) throw new Error(`php is ${version} but php-fpm is ${fpmVersion ?? 'unknown'}. Choose matching downloads.`)
    const minor = minorOf(version)

    const wasRunning = runningMinors().includes(minor)
    if (wasRunning) await stopFpm(minor)
    const target = dirs.php(minor)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    cpSync(php, join(target, 'php'))
    cpSync(fpm, join(target, 'php-fpm'))
    chmodSync(join(target, 'php'), 0o755)
    chmodSync(join(target, 'php-fpm'), 0o755)
    writeFileSync(join(target, 'VERSION'), version)
    writeFileSync(join(target, 'SOURCE'), 'imported')
    const modules = await runPhp(minor, ['-n', '-m']).catch(() => '')
    writeFileSync(join(target, 'EXTENSIONS'), modules.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('[')).join('\n'))
    if (!getSettings().defaultPhp) setSettings({ defaultPhp: minor })
    return version
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
