import { readdirSync, statSync } from 'fs'
import { join, posix, relative, sep } from 'path'
import type { DeployResult, SftpEntry } from '../shared/types'
import type { RemoteFs } from './remotefs'

/**
 * Uploads a site to a server. Only new and changed files go up: a file is
 * sent when the server does not have it, has a different size, or has an
 * older copy. Nothing on the server is deleted.
 */
export const DEFAULT_EXCLUDES = ['node_modules', '.git', '.DS_Store', '.env', '.idea', '.vscode', 'storage/logs', '*.log', '.laramac']

export function cleanRemotePath(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Enter the folder on the server.')
  const p = raw.trim().replace(/\/+$/, '')
  if (!p) throw new Error('Enter the folder on the server, like /var/www/mysite or public_html.')
  if (p === '/' || p === '~' || p === '.') throw new Error('Choose a folder for the site, not the top of the server.')
  if (p.split('/').some((seg) => seg === '..')) throw new Error('The folder cannot contain "..".')
  if (/[\0\r\n]/.test(p)) throw new Error('That folder name is not valid.')
  return p
}

function excluded(rel: string, name: string, patterns: string[]): boolean {
  return patterns.some((pat) => {
    if (pat.startsWith('*.')) return name.endsWith(pat.slice(1))
    return pat.includes('/') ? rel === pat || rel.startsWith(`${pat}/`) : name === pat
  })
}

interface LocalFile {
  rel: string
  size: number
  mtime: number
}

export function localFiles(root: string, patterns = DEFAULT_EXCLUDES): { files: LocalFile[]; dirs: string[] } {
  const files: LocalFile[] = []
  const dirs: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const rel = relative(root, full).split(sep).join('/')
      if (excluded(rel, name, patterns)) continue
      const st = statSync(full, { throwIfNoEntry: false })
      if (!st) continue
      if (st.isDirectory()) {
        dirs.push(rel)
        walk(full)
      } else if (st.isFile()) {
        files.push({ rel, size: st.size, mtime: st.mtimeMs })
      }
    }
  }
  walk(root)
  return { files, dirs }
}

export async function deploy(
  fs: RemoteFs,
  localRoot: string,
  remoteRoot: string,
  opts: { force?: boolean; excludes?: string[] },
  onProgress: (pct: number | null, label: string) => void
): Promise<DeployResult> {
  const started = Date.now()
  const { files, dirs } = localFiles(localRoot, [...DEFAULT_EXCLUDES, ...(opts.excludes ?? [])])
  onProgress(null, 'Comparing with the server')
  await fs.mkdirp(remoteRoot)

  // One listing per folder tells us what the server already has.
  const remote = new Map<string, Map<string, SftpEntry>>()
  const listing = async (dir: string): Promise<Map<string, SftpEntry>> => {
    if (!remote.has(dir)) {
      const entries = await fs.list(dir === '' ? remoteRoot : posix.join(remoteRoot, dir)).catch(() => [] as SftpEntry[])
      remote.set(dir, new Map(entries.map((e) => [e.name, e])))
    }
    return remote.get(dir)!
  }

  for (const d of dirs) {
    const parent = posix.dirname(d) === '.' ? '' : posix.dirname(d)
    const there = (await listing(parent)).get(posix.basename(d))
    if (!there || there.type !== 'dir') await fs.mkdirp(posix.join(remoteRoot, d))
  }

  const todo: LocalFile[] = []
  for (const f of files) {
    if (opts.force) {
      todo.push(f)
      continue
    }
    const parent = posix.dirname(f.rel) === '.' ? '' : posix.dirname(f.rel)
    const there = (await listing(parent)).get(posix.basename(f.rel))
    // Servers report times to the minute at best, so allow some slack.
    const stale = !there || there.type !== 'file' || there.size !== f.size || (there.modified > 0 && f.mtime > there.modified + 60_000)
    if (stale) todo.push(f)
  }

  const total = todo.reduce((n, f) => n + f.size, 0) || 1
  let sent = 0
  for (const [i, f] of todo.entries()) {
    onProgress(Math.min(99, Math.round((sent / total) * 100)), `Uploading ${i + 1} of ${todo.length}: ${f.rel}`)
    await fs.put(join(localRoot, ...f.rel.split('/')), posix.join(remoteRoot, f.rel))
    sent += f.size
  }
  return { uploaded: todo.length, skipped: files.length - todo.length, bytes: todo.reduce((n, f) => n + f.size, 0), seconds: Math.round((Date.now() - started) / 1000) }
}
