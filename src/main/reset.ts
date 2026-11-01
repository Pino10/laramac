import { execFile } from 'child_process'
import { join } from 'path'
import { rmSync } from 'fs'
import type { ResetOptions } from '../shared/types'
import { dirs } from './paths'
import { getSettings, resetSettingsCache } from './settings'
import { runAsAdmin, resolverFile } from './dns'

/**
 * Clears Laramac without uninstalling it. Your projects folder is never touched.
 * - software: PHP versions, servers and tools Laramac downloaded
 * - data: every database's contents
 * - settings: preferences and per-site settings
 * - system: the .test resolver and the trusted local certificate (asks for your password)
 */
export async function resetLaramac(o: ResetOptions): Promise<void> {
  const root = dirs.root()
  const rm = (p: string): void => rmSync(p, { recursive: true, force: true })

  if (o.system) {
    const tld = getSettings().tld
    await runAsAdmin(`rm -f ${resolverFile(tld)}`, 'Laramac is removing its .' + tld + ' domain setup.').catch(() => undefined)
    for (let i = 0; i < 5; i++) {
      const ok = await new Promise<boolean>((res) =>
        execFile('security', ['delete-certificate', '-c', 'Laramac Local CA'], (err) => res(!err))
      )
      if (!ok) break
    }
    rm(dirs.certs())
  }
  if (o.software) {
    for (const d of ['php', 'mysql', 'postgres', 'mongodb', 'mailpit', 'bin', 'phpmyadmin', 'adminer', 'apache', 'downloads', 'imports', 'composer']) {
      rm(join(root, d))
    }
  }
  if (o.data) rm(join(root, 'data'))
  if (o.settings) {
    rm(join(root, 'settings.json'))
    rm(join(root, 'servers.json'))
    resetSettingsCache()
  }
  for (const d of ['run', 'logs', 'conf']) if (o.software || o.data) rm(join(root, d))
}
