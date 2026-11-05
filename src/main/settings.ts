import { homedir } from 'os'
import { join } from 'path'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { AppSettings } from '../shared/types'
import { dirs } from './paths'

/** Where new installs keep projects. Not in Documents: iCloud syncing would churn vendor and node_modules folders. */
export const DEFAULT_WWW = (): string => join(homedir(), 'Laramac', 'www')
/** Where Laramac 0.5 and earlier kept projects. */
export const LEGACY_WWW = (): string => join(homedir(), 'www')

const defaults = (): AppSettings => ({
  wwwPath: DEFAULT_WWW(),
  tld: 'test',
  glass: true,
  glassStyle: 'studio',
  tourDone: false,
  dumps: false,
  xdebug: false,
  defaultPhp: null,
  phpFlavor: 'full',
  mysqlVersion: 'latest',
  postgresMajor: 'latest',
  primaryServer: 'apache',
  httpPort: 80,
  httpsPort: 443,
  secondaryHttpPort: 8080,
  secondaryHttpsPort: 8443,
  shareProvider: 'cloudflare',
  ngrokToken: '',
  editor: 'cursor',
  allowLan: false,
  notifications: true,
  autoUpdateCheck: true,
  mcpEnabled: false,
  hostLocalhostFolders: true,
  hostDotLocalhost: true,
  aiTool: 'claude',
  siteConfig: {},
  llm: { baseUrl: 'http://127.0.0.1:11434/v1', model: '' }
})

let cache: AppSettings | null = null

const file = (): string => join(dirs.root(), 'settings.json')

export function getSettings(): AppSettings {
  if (cache) return cache
  let loaded: Partial<AppSettings> & Record<string, unknown> = {}
  let fresh = true
  try {
    if (existsSync(file())) {
      loaded = JSON.parse(readFileSync(file(), 'utf8'))
      fresh = false
    }
  } catch {
    // Corrupt settings file: fall back to defaults.
  }
  const migrated = migrate(loaded)
  const base = defaults()
  cache = {
    ...base,
    ...loaded,
    siteConfig: { ...base.siteConfig, ...(loaded.siteConfig ?? {}) },
    llm: { ...base.llm, ...(loaded.llm ?? {}) }
  }
  // Remember the result, so later default changes never move someone's existing setup.
  if (migrated || fresh) persist()
  return cache
}

/**
 * Upgrades settings written by older versions in place. Nothing a user chose is lost:
 * - 0.5 kept projects in ~/www by default. If that folder exists, keep using it.
 * - 0.5 had Nginx on 80/443 and Apache on apachePort. Apache is now primary; the old
 *   "Apache" ports become the second server's ports.
 */
export function migrate(loaded: Partial<AppSettings> & Record<string, unknown>): boolean {
  let changed = false
  if (loaded.wwwPath === undefined && existsSync(LEGACY_WWW())) {
    loaded.wwwPath = LEGACY_WWW()
    changed = true
  }
  if (typeof loaded.apachePort === 'number' && loaded.secondaryHttpPort === undefined) {
    loaded.secondaryHttpPort = loaded.apachePort
    loaded.secondaryHttpsPort = (loaded.apacheHttpsPort as number) ?? 8443
    delete loaded.apachePort
    delete loaded.apacheHttpsPort
    changed = true
  }
  return changed
}

function persist(): void {
  mkdirSync(dirs.root(), { recursive: true, mode: 0o700 })
  writeFileSync(file(), JSON.stringify(cache, null, 2), { mode: 0o600 })
  chmodSync(file(), 0o600)
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  cache = {
    ...current,
    ...patch,
    llm: { ...current.llm, ...(patch.llm ?? {}) }
  }
  // Holds the ngrok token, so only this user may read it.
  persist()
  return cache!
}

export function ensureWww(): string {
  const { wwwPath } = getSettings()
  mkdirSync(wwwPath, { recursive: true })
  return wwwPath
}

/** Test helper: forget cached settings so a new root directory is re-read. */
export function resetSettingsCache(): void {
  cache = null
}
