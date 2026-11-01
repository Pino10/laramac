import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { join } from 'path'
import type { ToolsStatus } from '../shared/types'
import { dirs } from './paths'
import { downloadFile, extract, makeExecutable, removeQuarantine, verifySha256 } from './download'
import { jobs } from './jobs'
import { brewPrefix, goArch, isMac } from './platform'
import {
  ADMINER_URL,
  COMPOSER_URL,
  PHPMYADMIN_URL,
  cloudflaredUrl,
  ngrokUrl
} from './versions'
import { generatePmaConfig } from './configgen'
import { dbPassword } from './secrets'
import { getSettings } from './settings'
import { isResolverInstalled } from './dns'
import { isCaTrusted } from './ssl'
import { defaultMinor, phpBinary } from './php'
import { activeMysql, mysqlClientPath } from './svc/mysql'
import { adminerInstalled, phpmyadminInstalled } from './webconf'

export const composerPhar = (): string => join(dirs.bin(), 'composer.phar')
export const cloudflaredBinary = (): string => join(dirs.bin(), 'cloudflared')
export const ngrokBinary = (): string => join(dirs.bin(), 'ngrok')

async function fetchAndUnpack(url: string, name: string, label: string, update: (p: number | null, l?: string) => void): Promise<string> {
  const archive = join(dirs.downloads(), name)
  const staging = join(dirs.downloads(), `${name}-staging`)
  rmSync(staging, { recursive: true, force: true })
  await downloadFile(url, archive, (p) => update(p, `Downloading ${label}`))
  await extract(archive, staging)
  rmSync(archive, { force: true })
  return staging
}

/** phpMyAdmin signs in with Laramac's root passwords, so it keeps working after you set one. */
export function writePmaConfig(): void {
  if (!existsSync(dirs.phpmyadmin())) return
  writeFileSync(join(dirs.phpmyadmin(), 'config.inc.php'), generatePmaConfig(randomBytes(24).toString('hex'), { mysql: dbPassword('mysql'), mariadb: dbPassword('mariadb') }), { mode: 0o600 })
}

export async function installPhpMyAdmin(): Promise<void> {
  await jobs.run('Installing phpMyAdmin', async (update) => {
    const staging = await fetchAndUnpack(PHPMYADMIN_URL, 'phpmyadmin.zip', 'phpMyAdmin', update)
    const inner = readdirSync(staging).find((d) => d.toLowerCase().startsWith('phpmyadmin'))
    if (!inner) throw new Error('Unexpected phpMyAdmin archive layout.')
    rmSync(dirs.phpmyadmin(), { recursive: true, force: true })
    renameSync(join(staging, inner), dirs.phpmyadmin())
    writePmaConfig()
    mkdirSync(join(dirs.phpmyadmin(), 'tmp'), { recursive: true })
    rmSync(staging, { recursive: true, force: true })
  })
}

/** Adminer is one PHP file. The wrapper lets it sign in to local servers that have no password. */
const ADMINER_WRAPPER = `<?php
function adminer_object() {
    class LaramacAdminer extends Adminer {
        function login($login, $password) {
            return true;
        }
    }
    return new LaramacAdminer;
}
include __DIR__ . '/adminer.php';
`

export async function installAdminer(): Promise<void> {
  await jobs.run('Installing Adminer', async (update) => {
    mkdirSync(dirs.adminer(), { recursive: true })
    await downloadFile(ADMINER_URL, join(dirs.adminer(), 'adminer.php'), (p) => update(p, 'Downloading Adminer'))
    writeFileSync(join(dirs.adminer(), 'index.php'), ADMINER_WRAPPER)
  })
}

export async function installComposer(): Promise<void> {
  await jobs.run('Installing Composer', async (update) => {
    await downloadFile(COMPOSER_URL, composerPhar(), (p) => update(p, 'Downloading Composer'))
    await verifySha256(composerPhar(), `${COMPOSER_URL}.sha256sum`)
  })
  refreshShims()
}

async function installSingleBinary(
  url: string,
  archiveName: string,
  binaryName: string,
  target: string,
  label: string
): Promise<void> {
  await jobs.run(`Installing ${label}`, async (update) => {
    const staging = await fetchAndUnpack(url, archiveName, label, update)
    const found = readdirSync(staging).find((f) => f === binaryName)
    if (!found) throw new Error(`${label} archive did not contain ${binaryName}.`)
    rmSync(target, { force: true })
    renameSync(join(staging, found), target)
    await makeExecutable(target)
    await removeQuarantine(target)
    rmSync(staging, { recursive: true, force: true })
  })
}

export const installCloudflared = (): Promise<void> =>
  installSingleBinary(cloudflaredUrl(goArch()), 'cloudflared.tgz', 'cloudflared', cloudflaredBinary(), 'Cloudflare Tunnel')

export const installNgrok = (): Promise<void> =>
  installSingleBinary(ngrokUrl(goArch()), 'ngrok.zip', 'ngrok', ngrokBinary(), 'ngrok')

function relink(link: string, target: string | null): void {
  try {
    unlinkSync(link)
  } catch {
    // Link did not exist.
  }
  if (target && existsSync(target)) symlinkSync(target, link)
}

/**
 * Keeps ~/.laramac/bin up to date with `php`, `composer` and `mysql` commands so a terminal
 * (or Claude Code) launched from Laramac uses the same versions the sites use.
 */
export function refreshShims(): void {
  mkdirSync(dirs.bin(), { recursive: true })
  const def = defaultMinor()
  relink(join(dirs.bin(), 'php'), def ? phpBinary(def) : null)

  const mysqlVersion = activeMysql()
  relink(join(dirs.bin(), 'mysql'), mysqlVersion ? mysqlClientPath(mysqlVersion) : null)

  if (existsSync(composerPhar()) && def) {
    const script = `#!/bin/sh\nexec "${join(dirs.bin(), 'php')}" "${composerPhar()}" "$@"\n`
    const file = join(dirs.bin(), 'composer')
    writeFileSync(file, script)
    chmodSync(file, 0o755)
  }
}

export async function toolsStatus(): Promise<ToolsStatus> {
  const editorApp = (name: string): boolean =>
    existsSync(`/Applications/${name}.app`) || existsSync(join(process.env.HOME ?? '', 'Applications', `${name}.app`))
  return {
    dnsReady: isResolverInstalled(getSettings().tld),
    caTrusted: await isCaTrusted(),
    phpmyadmin: phpmyadminInstalled(),
    adminer: adminerInstalled(),
    cloudflared: existsSync(cloudflaredBinary()),
    ngrok: existsSync(ngrokBinary()),
    composer: existsSync(composerPhar()),
    homebrew: brewPrefix() !== null,
    editors: { cursor: editorApp('Cursor'), vscode: editorApp('Visual Studio Code') },
    claude: claudeInstalled(),
    platform: isMac ? 'darwin' : process.platform
  }
}

export function claudePath(): string | null {
  const home = process.env.HOME ?? ''
  for (const p of [
    join(home, '.claude', 'local', 'claude'),
    join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]) {
    if (existsSync(p)) return p
  }
  return null
}

export const claudeInstalled = (): boolean => claudePath() !== null
