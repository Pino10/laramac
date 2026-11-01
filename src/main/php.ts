import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PhpVersionInfo } from '../shared/types'
import { dirs } from './paths'
import { getSettings, setSettings } from './settings'
import { downloadFile, extract, removeQuarantine } from './download'
import { jobs } from './jobs'
import { compareVersions, fetchPhpReleases, minorOf, phpDownloadUrl } from './versions'
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

export async function listVersions(): Promise<PhpVersionInfo[]> {
  const installed = installedMinors()
  const def = defaultMinor()
  let releases: Record<string, string> = {}
  try {
    releases = await fetchPhpReleases(getSettings().phpFlavor)
  } catch {
    // Offline: show only what is installed.
  }
  const minors = new Set([...Object.keys(releases), ...installed])
  return [...minors]
    .sort((a, b) => compareVersions(b, a))
    .map((minor) => ({
      minor,
      latest: releases[minor] ?? installedPatch(minor) ?? minor,
      installed: installed.includes(minor) ? installedPatch(minor) : null,
      isDefault: def === minor
    }))
}

export async function installMinor(minor: string): Promise<void> {
  const settings = getSettings()
  const releases = await fetchPhpReleases(settings.phpFlavor)
  const version = releases[minor]
  if (!version) throw new Error(`PHP ${minor} is not available for this Mac.`)

  await jobs.run(`Installing PHP ${version}`, async (update) => {
    const staging = join(dirs.downloads(), `php-${minor}-staging`)
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })

    const parts: ('cli' | 'fpm')[] = ['cli', 'fpm']
    for (let i = 0; i < parts.length; i++) {
      const kind = parts[i]
      const archive = join(dirs.downloads(), `php-${version}-${kind}.tar.gz`)
      await downloadFile(phpDownloadUrl(kind, version, settings.phpFlavor), archive, (pct) =>
        update(pct === null ? null : Math.round((i * 100 + pct) / parts.length), `Downloading PHP ${version} (${kind})`)
      )
      await extract(archive, staging)
      rmSync(archive, { force: true })
    }

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
export function writePhpConfig(minor: string, sendmail?: string): void {
  mkdirSync(dirs.conf(), { recursive: true })
  writeFileSync(
    phpIniPath(minor),
    generatePhpIni({ sendmail, errorLog: join(dirs.logs(), `php-${minor}-error.log`) })
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
