import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PhpVersionInfo } from '../shared/types'
import { dirs } from './paths'
import { getSettings, setSettings } from './settings'
import { USER_AGENT, downloadFile, extract, removeQuarantine, sha256File } from './download'
import { execFile } from 'child_process'
import { jobs } from './jobs'
import { SUPPORTED_PHP, compareVersions, fetchPhpNetLatest, hashFor, minorOf, resolvePhpBuilds, type PhpBuild } from './versions'
import { generateFpmConf, generatePhpIni, phpPortFor } from './configgen'
import { ManagedProcess } from './process'

export const phpBinary = (minor: string): string => join(dirs.php(minor), 'php')
export const fpmBinary = (minor: string): string => join(dirs.php(minor), 'php-fpm')
export const phpIniPath = (minor: string): string => join(dirs.conf(), `php-${minor}.ini`)
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
  const minors = new Set([...SUPPORTED_PHP.filter((m) => builds[m] || upstream[m]), ...installed])
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
        extensions: have ? installedExtensions(minor) : []
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

    const parts: ['cli' | 'fpm', string][] = [
      ['cli', build.cliUrl],
      ['fpm', build.fpmUrl]
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
      mysqlSocket: join(dirs.run(), 'mysql.sock')
    })
  )
  writeFileSync(
    fpmConfPath(minor),
    generateFpmConf({
      port: phpPortFor(minor),
      pidFile: join(dirs.run(), `php-fpm-${minor}.pid`),
      errorLog: join(dirs.logs(), `php-fpm-${minor}.log`)
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
