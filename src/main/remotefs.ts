import { createWriteStream, createReadStream, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, posix } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { SFTPWrapper } from 'ssh2'
import { Client as FtpClient, FileType } from 'basic-ftp'
import type { SftpEntry } from '../shared/types'

/**
 * One way to work with files on a server, whether it speaks SFTP or FTP.
 * The file browser and Deploy both use this.
 */
export interface RemoteFs {
  realpath: (path: string) => Promise<string>
  list: (dir: string) => Promise<SftpEntry[]>
  get: (remote: string, local: string) => Promise<void>
  put: (local: string, remote: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  /** Creates the folder and any missing parents. */
  mkdirp: (path: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  remove: (path: string, isDir: boolean) => Promise<void>
  close: () => void
  /** How many files this kind of server takes at once. FTP is one. */
  parallel: number
  /** Copies with progress, and stops when the signal fires (SFTP only; FTP finishes the file it is on). */
  getTracked: (remote: string, local: string, onBytes: (n: number) => void | Promise<void>, signal: AbortSignal) => Promise<void>
  putTracked: (local: string, remote: string, onBytes: (n: number) => void | Promise<void>, signal: AbortSignal) => Promise<void>
  /** Runs one command on the server. Only SSH servers have it. */
  exec?: (command: string, timeoutMs?: number) => Promise<ExecResult>
}

export interface ExecResult {
  out: string
  err: string
  code: number
}

/**
 * The permissions a file gets on a server: yours, but never writable by anyone else.
 * (SFTP's own default is 666, which would let every user on the server change what you upload.)
 */
export const uploadMode = (localMode: number): number => (localMode & 0o755) | 0o600

/** Counts what passes. A callback that returns a promise holds the stream back until it settles, which is how the speed limit works. */
const counter = (onBytes: (n: number) => void | Promise<void>): Transform =>
  new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const wait = onBytes(chunk.length)
      if (wait && typeof wait.then === 'function') wait.then(() => cb(null, chunk), cb)
      else cb(null, chunk)
    }
  })

const sortEntries = (list: SftpEntry[]): SftpEntry[] =>
  list.sort((a, b) => ((a.type === 'dir') !== (b.type === 'dir') ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)))

const typeOf = (mode: number): SftpEntry['type'] => {
  const t = mode & 0o170000
  return t === 0o040000 ? 'dir' : t === 0o100000 ? 'file' : t === 0o120000 ? 'link' : 'other'
}

export function sftpFs(sftp: SFTPWrapper, end: () => void, exec?: RemoteFs['exec']): RemoteFs {
  const op = (fn: (cb: (err?: Error | null) => void) => void): Promise<void> => new Promise((res, rej) => fn((err) => (err ? rej(err) : res())))
  const fs: RemoteFs = {
    realpath: (path) => new Promise((res, rej) => sftp.realpath(path, (e, real) => (e ? rej(new Error(`Cannot open ${path}.`)) : res(real)))),
    list: (dir) =>
      new Promise((res, rej) =>
        sftp.readdir(dir, (err, list) =>
          err
            ? rej(new Error(`Cannot read ${dir}: ${err.message}`))
            : res(sortEntries(list.map((f) => ({ name: f.filename, type: typeOf(f.attrs.mode), size: f.attrs.size, modified: f.attrs.mtime * 1000 }))))
        )
      ),
    get: (remote, local) => op((cb) => sftp.fastGet(remote, local, cb)),
    put: (local, remote) => op((cb) => sftp.fastPut(local, remote, cb)),
    mkdir: (path) => op((cb) => sftp.mkdir(path, cb)),
    mkdirp: async (path) => {
      const parts = path.split('/').filter(Boolean)
      let cur = path.startsWith('/') ? '' : '.'
      for (const p of parts) {
        cur = `${cur}/${p}`
        const exists = await new Promise<boolean>((res) => sftp.stat(cur, (err, st) => res(!err && st.isDirectory())))
        if (!exists) await fs.mkdir(cur)
      }
    },
    rename: (from, to) => op((cb) => sftp.rename(from, to, cb)),
    remove: (path, isDir) => op((cb) => (isDir ? sftp.rmdir(path, cb) : sftp.unlink(path, cb))),
    close: end,
    parallel: 3,
    exec,
    getTracked: async (remote, local, onBytes, signal) => {
      mkdirSync(dirname(local), { recursive: true })
      const part = `${local}.laramac-part`
      try {
        await pipeline(sftp.createReadStream(remote), counter(onBytes), createWriteStream(part), { signal })
        renameSync(part, local)
      } catch (err) {
        rmSync(part, { force: true })
        throw err
      }
    },
    putTracked: async (local, remote, onBytes, signal) => {
      const part = `${remote}.laramac-part`
      try {
        await pipeline(createReadStream(local), counter(onBytes), sftp.createWriteStream(part, { mode: uploadMode(statSync(local).mode) }), { signal })
        await op((cb) => sftp.unlink(remote, () => cb()))
        await op((cb) => sftp.rename(part, remote, cb))
      } catch (err) {
        await op((cb) => sftp.unlink(part, () => cb())).catch(() => undefined)
        throw err
      }
    }
  }
  return fs
}

/** basic-ftp runs one command at a time, so calls are queued. */
export function ftpFs(client: FtpClient): RemoteFs {
  let chain: Promise<unknown> = Promise.resolve()
  const q = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.catch(() => undefined)
    return next
  }
  const fs: RemoteFs = {
    realpath: (path) =>
      q(async () => {
        if (path === '.' || path === '') return client.pwd()
        return posix.normalize(path.startsWith('/') ? path : posix.join(await client.pwd(), path))
      }),
    list: (dir) =>
      q(async () =>
        sortEntries(
          (await client.list(dir))
            .filter((f) => f.name !== '.' && f.name !== '..')
            .map((f) => ({
              name: f.name,
              type: f.type === FileType.Directory ? 'dir' : f.type === FileType.File ? 'file' : f.type === FileType.SymbolicLink ? 'link' : 'other',
              size: f.size,
              modified: f.modifiedAt ? f.modifiedAt.getTime() : 0
            }))
        )
      ),
    get: (remote, local) => q(async () => void (await client.downloadTo(local, remote))),
    put: (local, remote) => q(async () => void (await client.uploadFrom(local, remote))),
    mkdir: (path) => q(async () => void (await client.send(`MKD ${path}`))),
    mkdirp: (path) =>
      q(async () => {
        const back = await client.pwd()
        await client.ensureDir(path)
        await client.cd(back)
      }),
    rename: (from, to) => q(async () => void (await client.rename(from, to))),
    remove: (path, isDir) => q(async () => void (isDir ? await client.send(`RMD ${path}`) : await client.remove(path))),
    close: () => client.close(),
    parallel: 1,
    getTracked: (remote, local, onBytes) =>
      q(async () => {
        mkdirSync(dirname(local), { recursive: true })
        let last = 0
        client.trackProgress((info) => {
          onBytes(info.bytes - last)
          last = info.bytes
        })
        try {
          await client.downloadTo(local, remote)
        } finally {
          client.trackProgress()
        }
      }),
    putTracked: (local, remote, onBytes) =>
      q(async () => {
        let last = 0
        client.trackProgress((info) => {
          onBytes(info.bytes - last)
          last = info.bytes
        })
        try {
          await client.uploadFrom(local, remote)
        } finally {
          client.trackProgress()
        }
      })
  }
  return fs
}
