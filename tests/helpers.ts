import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureDirs, setRoot } from '../src/main/paths'
import { resetSettingsCache, setSettings } from '../src/main/settings'

/** Points the app at a fresh temporary data directory and www folder. */
export function freshEnv(): { root: string; www: string } {
  const root = mkdtempSync(join(tmpdir(), 'laramac-root-'))
  const www = mkdtempSync(join(tmpdir(), 'laramac-www-'))
  setRoot(root)
  resetSettingsCache()
  ensureDirs()
  setSettings({ wwwPath: www })
  return { root, www }
}
