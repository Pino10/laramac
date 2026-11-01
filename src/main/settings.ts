import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { AppSettings } from '../shared/types'
import { dirs } from './paths'

const defaults = (): AppSettings => ({
  wwwPath: join(homedir(), 'www'),
  tld: 'test',
  glass: true,
  defaultPhp: null,
  phpFlavor: 'full',
  mysqlVersion: '8.4.9',
  httpPort: 80,
  httpsPort: 443,
  apachePort: 8080,
  apacheHttpsPort: 8443,
  shareProvider: 'cloudflare',
  ngrokToken: '',
  editor: 'cursor',
  siteConfig: {},
  llm: { baseUrl: 'http://127.0.0.1:11434/v1', model: '' }
})

let cache: AppSettings | null = null

const file = (): string => join(dirs.root(), 'settings.json')

export function getSettings(): AppSettings {
  if (cache) return cache
  let loaded: Partial<AppSettings> = {}
  try {
    if (existsSync(file())) loaded = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    // Corrupt settings file: fall back to defaults.
  }
  const base = defaults()
  cache = {
    ...base,
    ...loaded,
    siteConfig: { ...base.siteConfig, ...(loaded.siteConfig ?? {}) },
    llm: { ...base.llm, ...(loaded.llm ?? {}) }
  }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  cache = {
    ...current,
    ...patch,
    llm: { ...current.llm, ...(patch.llm ?? {}) }
  }
  mkdirSync(dirs.root(), { recursive: true })
  writeFileSync(file(), JSON.stringify(cache, null, 2))
  return cache
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
