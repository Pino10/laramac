import { existsSync } from 'fs'
import type { ServiceImpl } from './types'
import {
  defaultMinor,
  installMinor,
  installedMinors,
  installedPatch,
  listVersions,
  phpPortFor,
  runningMinors,
  startFpm,
  stopAllFpm
} from '../php'
import { scanSites } from '../sites'
import { mailpitBinary } from '../webconf'

/** Versions that need a running FPM pool: the default plus any per-site overrides. */
export function neededMinors(): string[] {
  const needed = new Set<string>()
  const def = defaultMinor()
  if (def) needed.add(def)
  for (const site of scanSites()) if (site.php) needed.add(site.php)
  return [...needed]
}

function sendmailCommand(): string | undefined {
  return existsSync(mailpitBinary())
    ? `'${mailpitBinary()}' sendmail --smtp-addr 127.0.0.1:1025`
    : undefined
}

export async function ensurePhpRunning(): Promise<void> {
  const sendmail = sendmailCommand()
  for (const minor of neededMinors()) await startFpm(minor, sendmail)
}

export const php: ServiceImpl = {
  id: 'php',
  name: 'PHP',
  description: 'PHP-FPM, any version downloaded on demand',
  port: () => {
    const def = defaultMinor()
    return def ? phpPortFor(def) : undefined
  },
  installed: () => installedMinors().length > 0,
  version: () => {
    const def = defaultMinor()
    return def ? (installedPatch(def) ?? def) : undefined
  },
  running: () => runningMinors().length > 0,

  async install() {
    // Pick a sensible first version: 8.4 if offered, otherwise the newest available.
    const versions = await listVersions()
    const choice = versions.find((v) => v.minor === '8.4') ?? versions[0]
    if (!choice) throw new Error('No PHP versions are available right now. Check your connection.')
    await installMinor(choice.minor)
  },

  start: ensurePhpRunning,
  stop: stopAllFpm,
  reload: ensurePhpRunning
}
