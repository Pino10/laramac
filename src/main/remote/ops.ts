import { posix } from 'path'

/**
 * Commands Laramac runs on a server for the file browser: zip, unzip, permissions, search, bin.
 * Everything that comes from you or from the server is checked here and quoted for the server's shell,
 * so a file called `a; rm -rf ~` is just a strange name. Nothing is ever built from raw text.
 */

/** Quotes one value for a POSIX shell. */
export function q(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new Error('That name has a character that cannot be used.')
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** A full path on the server, with nothing odd in it. */
export function cleanPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/')) throw new Error('Use a full path that starts with /.')
  if (/[\0\r\n]/.test(raw)) throw new Error('That path has a character that cannot be used.')
  const p = posix.normalize(raw)
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

/** A single file or folder name, without any folder in it. */
export function plainName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw === '.' || raw === '..' || raw.includes('/') || /[\0\r\n]/.test(raw)) throw new Error('Use a plain name without slashes.')
  return raw
}

export interface ArchivePlan {
  command: string
  archive: string
}

/** Zips files that sit in one folder. Falls back to tar when the server has no zip. */
export function zipCommand(dir: string, names: string[], archiveName: string, hasZip: boolean): ArchivePlan {
  const folder = cleanPath(dir)
  if (names.length === 0) throw new Error('Choose something to zip.')
  const safe = names.map(plainName)
  const base = plainName(archiveName).replace(/\.(zip|tar\.gz|tgz)$/i, '')
  const archive = hasZip ? `${base}.zip` : `${base}.tar.gz`
  const tool = hasZip ? `zip -r -q ${q(archive)} -- ${safe.map(q).join(' ')}` : `tar -czf ${q(archive)} -- ${safe.map(q).join(' ')}`
  return { command: `cd ${q(folder)} && ${tool}`, archive }
}

/** Opens a .zip, .tar, .tar.gz or .tgz into a folder, never keeping the owner from the archive. */
export function unzipCommand(file: string, destDir: string): string {
  const f = cleanPath(file)
  const dest = cleanPath(destDir)
  if (/\.zip$/i.test(f)) return `mkdir -p ${q(dest)} && unzip -o -q ${q(f)} -d ${q(dest)}`
  if (/\.(tar\.gz|tgz)$/i.test(f)) return `mkdir -p ${q(dest)} && tar -xzf ${q(f)} -C ${q(dest)} --no-same-owner`
  if (/\.tar$/i.test(f)) return `mkdir -p ${q(dest)} && tar -xf ${q(f)} -C ${q(dest)} --no-same-owner`
  throw new Error('Laramac can open .zip, .tar, .tar.gz and .tgz files.')
}

export const isArchive = (name: string): boolean => /\.(zip|tar|tar\.gz|tgz)$/i.test(name)

/** What an archive opens into: its name without the ending. */
export const archiveFolder = (name: string): string => name.replace(/\.(zip|tar\.gz|tgz|tar)$/i, '') || 'extracted'

export function chmodCommand(mode: string, path: string, recursive: boolean): string {
  if (!/^[0-7]{3,4}$/.test(mode)) throw new Error('Permissions are three or four digits, like 755 or 644.')
  const p = cleanPath(path)
  if (p === '/') throw new Error('Not on the top of the server.')
  return `chmod ${recursive ? '-R ' : ''}${mode} -- ${q(p)}`
}

/** GNU stat first, then the BSD one, so Linux and BSD servers both answer. */
export function statCommand(path: string): string {
  const p = q(cleanPath(path))
  return `stat -c '%a|%U|%G|%s' -- ${p} 2>/dev/null || stat -f '%Lp|%Su|%Sg|%z' ${p}`
}

export function parseStat(out: string): { mode: string; owner: string; group: string; size: number } {
  const m = /^([0-7]{3,4})\|([^|\n]*)\|([^|\n]*)\|(\d+)/.exec(out.trim())
  if (!m) throw new Error('The server did not say.')
  return { mode: m[1], owner: m[2], group: m[3], size: Number(m[4]) }
}

/** Says a permission number in words anyone can follow. */
export function modeWords(mode: string): string {
  const d = mode.slice(-3).split('').map(Number)
  const who = ['The owner', 'The group', 'Everyone else']
  const can = (n: number): string => {
    const a = [(n & 4) !== 0 && 'read', (n & 2) !== 0 && 'change', (n & 1) !== 0 && 'run'].filter(Boolean) as string[]
    return a.length === 0 ? 'cannot do anything' : a.length === 1 ? `can ${a[0]}` : `can ${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
  }
  return d.map((n, i) => `${who[i]} ${can(n)}`).join('. ') + '.'
}

/** Names find would treat as a pattern are matched as plain text. */
const globSafe = (s: string): string => s.replace(/[*?[\]\\]/g, '\\$&')

export function searchCommand(dir: string, term: string): string {
  const t = term.trim()
  if (t.length < 2 || t.length > 100) throw new Error('Type at least two letters to search for.')
  const base = `${q(cleanPath(dir))} -xdev -maxdepth 8 -iname ${q(`*${globSafe(t)}*`)}`
  // Two plain finds, so Linux and BSD servers both answer.
  return `{ find ${base} -type d 2>/dev/null | sed 's/^/d /'; find ${base} -type f 2>/dev/null | sed 's/^/f /'; } | head -200`
}

export function parseSearch(out: string): { path: string; type: 'file' | 'dir' }[] {
  const hits: { path: string; type: 'file' | 'dir' }[] = []
  for (const line of out.split('\n')) {
    const m = /^([a-z]) (\/.+)$/.exec(line)
    if (m && (m[1] === 'f' || m[1] === 'd')) hits.push({ path: m[2], type: m[1] === 'd' ? 'dir' : 'file' })
  }
  return hits
}

/** Moves something into a bin on the server instead of deleting it, so one wrong click can be undone. */
export function trashCommand(path: string): string {
  const p = cleanPath(path)
  if (p === '/' || p.split('/').filter(Boolean).length < 1) throw new Error('Not on the top of the server.')
  return `d="$HOME/.laramac-trash/$(date +%Y%m%d-%H%M%S)" && mkdir -p "$d" && mv -- ${q(p)} "$d"/ && printf '%s' "$d"`
}

/** Reads the start of a text file. */
export function readCommand(path: string, limit: number): string {
  return `head -c ${Math.max(1, Math.floor(limit))} -- ${q(cleanPath(path))}`
}

export const looksBinary = (s: string): boolean => s.includes('\0')

/** Joins the pieces of a remote path the way the server expects. */
export const joinRemote = (dir: string, name: string): string => posix.join(cleanPath(dir), plainName(name))

/** An item for the transfer bar's name: one file, or "12 files". */
export const countWords = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
