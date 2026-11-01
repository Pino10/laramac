import { posix } from 'path'
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
}

const sortEntries = (list: SftpEntry[]): SftpEntry[] =>
  list.sort((a, b) => ((a.type === 'dir') !== (b.type === 'dir') ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name)))

const typeOf = (mode: number): SftpEntry['type'] => {
  const t = mode & 0o170000
  return t === 0o040000 ? 'dir' : t === 0o100000 ? 'file' : t === 0o120000 ? 'link' : 'other'
}

export function sftpFs(sftp: SFTPWrapper, end: () => void): RemoteFs {
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
    close: end
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
    close: () => client.close()
  }
  return fs
}
