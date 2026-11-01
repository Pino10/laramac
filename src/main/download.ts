import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { dirname } from 'path'
import { execFile } from 'child_process'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export type ProgressFn = (percent: number | null, note?: string) => void

/**
 * Downloads a URL to a file, following redirects, reporting progress.
 * Writes to a temporary file first so a cancelled download never leaves a corrupt file.
 */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: ProgressFn
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`)

  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  const tmp = `${dest}.part`

  const source = Readable.fromWeb(res.body as never)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.(total ? Math.min(99, Math.round((received / total) * 100)) : null)
  })

  try {
    await pipeline(source, createWriteStream(tmp))
    renameSync(tmp, dest)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  onProgress?.(100)
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 1024 * 1024 * 32 }, (err, _out, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      else resolve()
    })
  })
}

/** Extracts .tar.gz / .tgz / .zip using the system tools that ship with macOS. */
export async function extract(archive: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  if (archive.endsWith('.zip')) await run('unzip', ['-q', '-o', archive, '-d', destDir])
  else await run('tar', ['-xzf', archive, '-C', destDir])
}

/** Cheap check that a URL exists, used to probe for versions we cannot list. */
export async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
    const ok = res.status === 200 || res.status === 206
    await res.body?.cancel()
    return ok && !(res.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

export function makeExecutable(path: string): Promise<void> {
  return run('chmod', ['+x', path])
}

export function removeQuarantine(path: string): Promise<void> {
  // Binaries downloaded by the app are not quarantined, but this keeps archives from elsewhere safe.
  return run('xattr', ['-dr', 'com.apple.quarantine', path]).catch(() => undefined)
}

export function fileExists(path: string): boolean {
  return existsSync(path)
}
