import { join } from 'path'
import { dirs } from './paths'

/**
 * The little commands Laramac writes (laramac, claudelm, claudefree) are Node scripts.
 * The packaged app has Electron's "run as Node" switch turned off for safety, so they cannot
 * borrow the app as Node. They look for a real Node each time they start instead: the one
 * Laramac installs, then the Mac's own. While developing, the app's own binary is the last resort.
 */
const q = (s: string): string => `"${s.replace(/(["\\$`])/g, '\\$1')}"`

/** The Node used for tests and `npm run dev`, where the run-as-Node switch is still on. */
export function devHost(host: string): string | null {
  const inDev = !process.versions.electron || (process as unknown as { defaultApp?: boolean }).defaultApp === true
  return inDev ? host : null
}

export function nodeWrapper(script: string, note: string, host: string, managedNode = join(dirs.root(), 'runtimes', 'node', 'bin', 'node')): string {
  const dev = devHost(host)
  const lines = [
    '#!/bin/sh',
    `# Written by Laramac: ${note}`,
    `for n in ${q(managedNode)} "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do`,
    `  if [ -n "$n" ] && [ -x "$n" ]; then exec "$n" ${q(script)} "$@"; fi`,
    'done',
    ...(dev ? [`ELECTRON_RUN_AS_NODE=1 exec ${q(dev)} ${q(script)} "$@"`] : []),
    'echo "This command needs Node.js. Open Laramac, go to Languages, install Node.js, then try again." >&2',
    'exit 127',
    ''
  ]
  return lines.join('\n')
}
