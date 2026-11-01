import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, mkdtempSync, renameSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import type { UpdateInfo } from '../shared/types'
import { USER_AGENT, downloadFile, sha256File } from './download'
import { dirs } from './paths'
import { BINARIES_REPO, hashFor } from './versions'
import { dmgArch, pickUpdate, type Release } from './updatecheck'

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((res, rej) =>
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024 }, (err, out, errOut) => (err ? rej(new Error(errOut.trim() || err.message)) : res(out)))
  )
}

let pending: { info: UpdateInfo; dmg: string; sums: string } | null = null

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const res = await fetch(`https://api.github.com/repos/${BINARIES_REPO}/releases?per_page=30`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub answered ${res.status} while checking for updates.`)
  pending = pickUpdate((await res.json()) as Release[], app.getVersion())
  return pending?.info ?? null
}

/** The .app bundle this process runs from. */
function currentBundle(): string {
  return resolve(dirname(app.getPath('exe')), '..', '..')
}

/**
 * Downloads the new DMG, checks it against the release's SHA256SUMS.txt, checks the app inside is
 * a correctly signed Laramac, swaps it in place of the running copy and restarts. Your settings,
 * PHP versions, databases and sites live outside the app and are untouched.
 */
export async function installUpdate(update: (pct: number | null, label?: string) => void): Promise<void> {
  if (!pending) await checkForUpdate()
  if (!pending) throw new Error('Laramac is up to date.')
  const { info, dmg, sums } = pending

  const bundle = currentBundle()
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) {
    throw new Error('Move Laramac to your Applications folder first, then update.')
  }

  const file = join(dirs.downloads(), `Laramac-${info.version}-${dmgArch()}.dmg`)
  await downloadFile(dmg, file, (p) => update(p, `Downloading Laramac ${info.version}`))

  update(null, 'Checking the download')
  const list = await (await fetch(sums, { headers: { 'User-Agent': USER_AGENT } })).text()
  const expected = hashFor(list, `Laramac-${info.version}-${dmgArch()}.dmg`)
  if (!expected || (await sha256File(file)) !== expected) {
    rmSync(file, { force: true })
    throw new Error('The update did not match its published checksum and was deleted.')
  }

  const mount = mkdtempSync(join(tmpdir(), 'laramac-update-'))
  await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, file])
  try {
    const fresh = join(mount, 'Laramac.app')
    if (!existsSync(fresh)) throw new Error('The update does not contain Laramac.app.')
    await run('codesign', ['--verify', '--deep', '--strict', fresh])
    const id = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(fresh, 'Contents', 'Info.plist')])).trim()
    if (id !== 'dev.laramac.app') throw new Error('The update is not a Laramac build.')

    update(null, 'Installing the update')
    const incoming = `${bundle}.new`
    const previous = `${bundle}.old`
    rmSync(incoming, { recursive: true, force: true })
    rmSync(previous, { recursive: true, force: true })
    await run('ditto', [fresh, incoming])
    renameSync(bundle, previous)
    try {
      renameSync(incoming, bundle)
    } catch (err) {
      renameSync(previous, bundle)
      throw err
    }
    rmSync(previous, { recursive: true, force: true })
  } finally {
    await run('hdiutil', ['detach', mount, '-quiet']).catch(() => undefined)
    rmSync(file, { force: true })
  }

  update(100, 'Restarting')
  app.relaunch()
  app.quit()
}
