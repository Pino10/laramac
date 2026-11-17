import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, join, posix, resolve, sep } from 'path'
import type { RemoteFileText, RemoteSearchHit, SftpEntry } from '../../shared/types'
import { DEFAULT_EXCLUDES, localFiles } from '../deploy'
import type { RemoteFs } from '../remotefs'
import * as ssh from '../ssh'
import { installKeyCommand } from './keys'
import * as audit from './audit'
import { archiveFolder, chmodCommand, cleanPath, countWords, isArchive, joinRemote, looksBinary, parseSearch, parseStat, plainName, readCommand, searchCommand, statCommand, trashCommand, unzipCommand, zipCommand } from './ops'
import { throttle, transfers, type TransferTask } from './transfers'

/** What the file browser does on a server. Every change checks read only first and writes a line in the record. */

const MAX_FILES = 200_000
const EDIT_LIMIT = 1_000_000

/** Folders on this Mac that hold keys and sign-ins. A file dropped from one of these is refused. */
const SECRET_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.config/gcloud', '.config/gh', 'Library/Keychains', 'Library/Application Support/Claude']

export function checkLocalSource(raw: unknown, home = homedir()): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.includes('\0')) throw new Error('That file cannot be found.')
  if (!existsSync(raw)) throw new Error(`${basename(raw)} cannot be found.`)
  const real = realpathSync(raw)
  for (const d of SECRET_DIRS) {
    const dir = join(realpathSync(existsSync(home) ? home : '/'), d)
    if (real === dir || real.startsWith(dir + sep)) throw new Error(`${basename(raw)} is kept private on this Mac (${d}), so it is not copied to a server.`)
  }
  return real
}

const fsOf = (sid: string): RemoteFs => ssh.sessionFs(sid)
const parallelFor = (fs: RemoteFs): number => Math.max(1, Math.min(fs.parallel, transfers.parallel))

function unique(existing: Set<string>, name: string): string {
  if (!existing.has(name)) return name
  const dot = name.search(/(\.tar\.gz|\.[^./]+)$/)
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 1000; i++) if (!existing.has(`${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`
  return `${stem} ${Date.now()}${ext}`
}
export { unique as uniqueName }

async function names(fs: RemoteFs, dir: string): Promise<Set<string>> {
  return new Set((await fs.list(dir)).map((e) => e.name))
}

// ---------------------------------------------------------------- upload

interface UpPlan {
  tasks: TransferTask[]
  skipped: number
  files: number
}

/** Plans an upload of files and folders into a folder on the server. Same size and not newer means it is already there. */
export async function planUpload(sid: string, remoteDir: string, localPaths: string[]): Promise<UpPlan> {
  const fs = fsOf(sid)
  const dir = cleanPath(remoteDir)
  const tasks: TransferTask[] = []
  let skipped = 0
  let count = 0
  const listed = new Map<string, Map<string, SftpEntry>>()
  const there = async (d: string): Promise<Map<string, SftpEntry>> => {
    if (!listed.has(d)) listed.set(d, new Map((await fs.list(d).catch(() => [] as SftpEntry[])).map((e) => [e.name, e])))
    return listed.get(d)!
  }
  const add = async (local: string, remote: string, size: number, mtime: number): Promise<void> => {
    count++
    const entry = (await there(posix.dirname(remote))).get(posix.basename(remote))
    if (entry && entry.type === 'file' && entry.size === size && !(entry.modified > 0 && mtime > entry.modified + 60_000)) {
      skipped++
      return
    }
    tasks.push({ name: posix.basename(remote), size, run: (onBytes, signal) => fs.putTracked(local, remote, onBytes, signal) })
  }
  for (const raw of localPaths) {
    const local = checkLocalSource(raw)
    const st = statSync(local)
    const name = plainName(basename(local))
    if (st.isDirectory()) {
      const root = posix.join(dir, name)
      await fs.mkdirp(root)
      const walked = localFiles(local, DEFAULT_EXCLUDES)
      if (walked.files.length + count > MAX_FILES) throw new Error(`That is more than ${MAX_FILES.toLocaleString()} files. Zip it first, then upload the zip.`)
      for (const d of walked.dirs) await fs.mkdirp(posix.join(root, d))
      for (const f of walked.files) await add(join(local, ...f.rel.split('/')), posix.join(root, f.rel), f.size, f.mtime)
    } else if (st.isFile()) {
      await add(local, posix.join(dir, name), st.size, st.mtimeMs)
    }
  }
  return { tasks, skipped, files: count }
}

export async function startUpload(sid: string, remoteDir: string, localPaths: string[]): Promise<string> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const fs = fsOf(sid)
  const plan = await planUpload(sid, remoteDir, localPaths)
  const label = localPaths.length === 1 ? `Uploading ${basename(localPaths[0])}` : `Uploading ${countWords(localPaths.length, 'item')}`
  audit.record(info.name, 'upload', `${countWords(plan.files, 'file')} to ${remoteDir}${plan.skipped ? `, ${plan.skipped} already there` : ''}`)
  if (plan.tasks.length === 0) return `${countWords(plan.files, 'file')} already up to date.`
  const slow = throttle(transfers.limitBps)
  const tasks = plan.tasks.map((t) => ({ ...t, run: async (onBytes: (n: number) => void, signal: AbortSignal) => t.run((n) => (onBytes(n), slow(n)), signal) }))
  transfers.start({ label, server: info.name, direction: 'upload', tasks, parallel: parallelFor(fs), doneLabel: localPaths.length === 1 ? `Uploaded ${basename(localPaths[0])}` : `Uploaded ${countWords(localPaths.length, 'item')}` })
  return `${countWords(plan.tasks.length, 'file')} queued${plan.skipped ? `, ${plan.skipped} already up to date` : ''}.`
}

// -------------------------------------------------------------- download

interface DownEntry {
  remote: string
  rel: string
  size: number
}

async function walkRemote(fs: RemoteFs, remote: string, rel: string, out: DownEntry[], dirsOut: string[]): Promise<void> {
  dirsOut.push(rel)
  for (const e of await fs.list(remote)) {
    const name = plainName(e.name)
    if (out.length > MAX_FILES) throw new Error(`That folder has more than ${MAX_FILES.toLocaleString()} files. Zip it on the server, then download the zip.`)
    if (e.type === 'dir') await walkRemote(fs, posix.join(remote, name), posix.join(rel, name), out, dirsOut)
    else if (e.type === 'file') out.push({ remote: posix.join(remote, name), rel: posix.join(rel, name), size: e.size })
    // Links and special files are left out, so a link can never lead a download somewhere unexpected.
  }
}

export async function startDownload(sid: string, remotePaths: string[], localDir: string, kinds: Map<string, 'file' | 'dir'>): Promise<string> {
  const info = ssh.sessionInfo(sid)
  const fs = fsOf(sid)
  const tasks: TransferTask[] = []
  const slow = throttle(transfers.limitBps)
  const used = new Set<string>()
  let files = 0
  for (const raw of remotePaths) {
    const remote = cleanPath(raw)
    const base = unique(used, plainName(posix.basename(remote)))
    used.add(base)
    const target = join(localDir, base)
    if (kinds.get(remote) === 'dir') {
      const list: DownEntry[] = []
      const dirsOut: string[] = []
      await walkRemote(fs, remote, '', list, dirsOut)
      for (const f of list) {
        files++
        const dest = join(target, ...f.rel.split('/'))
        if (!resolve(dest).startsWith(resolve(target) + sep)) throw new Error('A name in that folder would land outside the download folder, so it was stopped.')
        tasks.push({ name: posix.basename(f.rel), size: f.size, run: (onBytes, signal) => fs.getTracked(f.remote, dest, (n) => (onBytes(n), slow(n)), signal) })
      }
    } else {
      files++
      const size = (await fs.list(posix.dirname(remote))).find((e) => e.name === posix.basename(remote))?.size ?? 0
      tasks.push({ name: base, size, run: (onBytes, signal) => fs.getTracked(remote, target, (n) => (onBytes(n), slow(n)), signal) })
    }
  }
  audit.record(info.name, 'download', `${countWords(files, 'file')} from ${posix.dirname(cleanPath(remotePaths[0]))}`)
  if (tasks.length === 0) return 'There was nothing to download in that folder.'
  const label = remotePaths.length === 1 ? `Downloading ${posix.basename(remotePaths[0])}` : `Downloading ${countWords(remotePaths.length, 'item')}`
  transfers.start({ label, server: info.name, direction: 'download', tasks, parallel: parallelFor(fs), reveal: localDir, doneLabel: remotePaths.length === 1 ? `Downloaded ${posix.basename(remotePaths[0])}` : `Downloaded ${countWords(remotePaths.length, 'item')}` })
  return `${countWords(tasks.length, 'file')} queued.`
}

// ----------------------------------------------------------- on the server

function needExec(sid: string): NonNullable<RemoteFs['exec']> {
  const fs = fsOf(sid)
  if (!fs.exec) throw new Error('This needs an SSH server. FTP servers can only browse and copy.')
  return fs.exec
}

export async function zip(sid: string, dir: string, items: string[], archiveName: string): Promise<string> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const exec = needExec(sid)
  const fs = fsOf(sid)
  const hasZip = (await exec('command -v zip', 10_000)).code === 0
  const taken = await names(fs, cleanPath(dir))
  const wanted = plainName(archiveName).replace(/\.(zip|tar\.gz|tgz)$/i, '') + (hasZip ? '.zip' : '.tar.gz')
  const finalName = unique(taken, wanted)
  const plan = zipCommand(dir, items, finalName, hasZip)
  audit.record(info.name, 'zip', `${countWords(items.length, 'item')} into ${plan.archive} in ${dir}`)
  transfers.start({
    label: `Zipping into ${plan.archive}`,
    doneLabel: `Zipped into ${plan.archive}`,
    server: info.name,
    direction: 'archive',
    parallel: 1,
    retries: 0,
    tasks: [
      {
        name: plan.archive,
        size: 0,
        run: async () => {
          const r = await exec(plan.command, 30 * 60_000)
          if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server could not make the archive.')
        }
      }
    ]
  })
  return plan.archive
}

export async function unzip(sid: string, file: string, intoDir: string): Promise<string> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const exec = needExec(sid)
  const fs = fsOf(sid)
  const parent = cleanPath(intoDir)
  const name = posix.basename(cleanPath(file))
  if (!isArchive(name)) throw new Error('Laramac can open .zip, .tar, .tar.gz and .tgz files.')
  const folder = unique(await names(fs, parent), archiveFolder(name))
  const dest = joinRemote(parent, folder)
  const command = unzipCommand(file, dest)
  audit.record(info.name, 'unzip', `${name} into ${dest}`)
  transfers.start({
    label: `Opening ${name}`,
    doneLabel: `Opened ${name}`,
    server: info.name,
    direction: 'archive',
    parallel: 1,
    retries: 0,
    tasks: [
      {
        name,
        size: 0,
        run: async () => {
          const r = await exec(command, 30 * 60_000)
          if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server could not open the archive.')
        }
      }
    ]
  })
  return folder
}

export async function chmod(sid: string, path: string, mode: string, recursive: boolean): Promise<void> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const r = await needExec(sid)(chmodCommand(mode, path, recursive), 60_000)
  if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server did not allow that change.')
  audit.record(info.name, 'permissions', `${mode}${recursive ? ' (inside too)' : ''} on ${path}`)
}

export async function stat(sid: string, path: string): Promise<{ mode: string; owner: string; group: string; size: number }> {
  const r = await needExec(sid)(statCommand(path), 15_000)
  return parseStat(r.out)
}

export async function search(sid: string, dir: string, term: string): Promise<RemoteSearchHit[]> {
  const r = await needExec(sid)(searchCommand(dir, term), 60_000)
  return parseSearch(r.out)
}

/** Moves to a bin folder on the server instead of deleting. Returns where it went. */
export async function trash(sid: string, path: string): Promise<string> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const r = await needExec(sid)(trashCommand(path), 60_000)
  if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server could not move that to the bin.')
  audit.record(info.name, 'bin', `${path} moved to ${r.out.trim()}`)
  return r.out.trim()
}

export function audited(sid: string, action: string, detail: string): void {
  audit.record(ssh.sessionInfo(sid).name, action, detail)
}

// ------------------------------------------------------------------ text

export async function readText(sid: string, path: string): Promise<RemoteFileText> {
  const fs = fsOf(sid)
  const p = cleanPath(path)
  const size = (await fs.list(posix.dirname(p))).find((e) => e.name === posix.basename(p))?.size ?? 0
  let text: string
  if (fs.exec) {
    const r = await fs.exec(readCommand(p, EDIT_LIMIT), 30_000)
    if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server would not let that be read.')
    text = r.out
  } else {
    const tmp = mkdtempSync(join(tmpdir(), 'laramac-read-'))
    try {
      await fs.getTracked(p, join(tmp, 'f'), () => undefined, new AbortController().signal)
      text = readFileSync(join(tmp, 'f')).subarray(0, EDIT_LIMIT).toString('utf8')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  if (looksBinary(text)) throw new Error('That looks like a program or a picture, not text, so it is not opened here.')
  return { text, truncated: size > EDIT_LIMIT, size }
}

export async function writeText(sid: string, path: string, text: string): Promise<void> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  if (text.length > EDIT_LIMIT) throw new Error('That file is too big to save from here.')
  const fs = fsOf(sid)
  const p = cleanPath(path)
  const tmp = mkdtempSync(join(tmpdir(), 'laramac-write-'))
  try {
    writeFileSync(join(tmp, 'f'), text, { mode: 0o600 })
    // The saved copy replaces the file, so remember its permissions and put them back.
    const before = fs.exec ? await stat(sid, p).catch(() => null) : null
    await fs.putTracked(join(tmp, 'f'), p, () => undefined, new AbortController().signal)
    if (before && fs.exec) await fs.exec(chmodCommand(before.mode, p, false), 15_000).catch(() => undefined)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  audit.record(info.name, 'edit', `${p} saved`)
}

/** Puts a public key from ~/.ssh on the server so it can be signed in to with the key instead of a password. */
export async function installKey(sid: string, pubPath: string): Promise<string> {
  ssh.assertWritable(sid)
  const info = ssh.sessionInfo(sid)
  const exec = needExec(sid)
  const real = realpathSync(pubPath)
  if (!real.endsWith('.pub') || !real.startsWith(join(realpathSync(homedir()), '.ssh') + sep)) throw new Error('Choose a .pub file from your ~/.ssh folder.')
  const r = await exec(installKeyCommand(readFileSync(real, 'utf8')), 30_000)
  if (r.code !== 0) throw new Error(r.err.trim().split('\n')[0] || 'The server did not accept the key.')
  audit.record(info.name, 'key', `Added ${basename(real)} to authorized_keys`)
  return basename(real)
}
