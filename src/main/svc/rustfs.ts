import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs'
import { githubApi } from '../seckit/ghapi'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, extract, removeQuarantine, USER_AGENT } from '../download'
import { jobs } from '../jobs'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('S3 storage')
const PORT = 9000
export const RUSTFS_CONSOLE = 9001
/** Local-only credentials, the same for everyone, like MySQL's root without a password. */
export const S3_KEY = 'laramac'
export const S3_SECRET = 'laramac-secret'
const bin = (): string => join(dirs.root(), 'runtimes', 'rustfs', 'rustfs')
const data = (): string => join(dirs.root(), 'data', 's3')

/** S3-compatible storage (RustFS), so apps can use "s3" disks without an AWS account. */
export const rustfs: ServiceImpl = {
  id: 's3',
  name: 'S3 storage',
  description: 'S3-compatible file storage (RustFS), with a web console',
  port: () => PORT,
  installed: () => existsSync(bin()),
  version: () => undefined,
  running: () => proc.running,

  async install() {
    if (process.arch !== 'arm64') throw new Error('RustFS only publishes builds for Apple Silicon Macs.')
    await jobs.run('Installing S3 storage (RustFS)', async (update) => {
      const releases = await githubApi<{ assets: { name: string; browser_download_url: string }[] }[]>('/repos/rustfs/rustfs/releases?per_page=5')
      const asset = releases.flatMap((r) => r.assets).find((a) => /^rustfs-macos-aarch64.*\.zip$/.test(a.name))
      if (!asset) throw new Error('No RustFS build for this Mac was found.')
      const archive = join(dirs.downloads(), asset.name)
      await downloadFile(asset.browser_download_url, archive, (p) => update(p, 'Downloading RustFS'))
      const staging = `${archive}-staging`
      rmSync(staging, { recursive: true, force: true })
      await extract(archive, staging)
      const found = readdirSync(staging, { recursive: true }).map(String).find((f) => f.split('/').pop() === 'rustfs')
      if (!found) throw new Error('The RustFS archive did not contain the program.')
      mkdirSync(join(dirs.root(), 'runtimes', 'rustfs'), { recursive: true })
      rmSync(bin(), { force: true })
      renameSync(join(staging, found), bin())
      chmodSync(bin(), 0o755)
      await removeQuarantine(bin())
      rmSync(staging, { recursive: true, force: true })
      rmSync(archive, { force: true })
    })
  },

  async start() {
    mkdirSync(data(), { recursive: true })
    await proc.start(
      {
        command: bin(),
        args: ['server', data(), '--address', `127.0.0.1:${PORT}`, '--console-enable', 'true', '--console-address', `127.0.0.1:${RUSTFS_CONSOLE}`],
        env: { RUSTFS_ACCESS_KEY: S3_KEY, RUSTFS_SECRET_KEY: S3_SECRET, RUSTFS_ROOT_USER: S3_KEY, RUSTFS_ROOT_PASSWORD: S3_SECRET },
        logFile: join(dirs.logs(), 's3.log')
      },
      PORT,
      30000
    )
  },

  stop: () => proc.stop()
}
