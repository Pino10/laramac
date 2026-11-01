import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, removeQuarantine } from '../download'
import { jobs } from '../jobs'
import { meilisearchUrl } from '../versions'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('Meilisearch')
const PORT = 7700
const bin = (): string => join(dirs.bin(), 'meilisearch')
const data = (): string => join(dirs.root(), 'data', 'meilisearch')

/** Fast search engine used by Laravel Scout and many apps. A single binary from GitHub. */
export const meilisearch: ServiceImpl = {
  id: 'meilisearch',
  name: 'Meilisearch',
  description: 'Search engine (Laravel Scout and friends)',
  port: () => PORT,
  installed: () => existsSync(bin()),
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing Meilisearch', async (update) => {
      const tmp = `${bin()}.download`
      rmSync(tmp, { force: true })
      await downloadFile(meilisearchUrl(), tmp, (p) => update(p, 'Downloading Meilisearch'))
      chmodSync(tmp, 0o755)
      rmSync(bin(), { force: true })
      renameSync(tmp, bin())
      await removeQuarantine(bin())
    })
  },

  async start() {
    mkdirSync(data(), { recursive: true })
    await proc.start(
      {
        command: bin(),
        args: ['--db-path', data(), '--http-addr', `127.0.0.1:${PORT}`, '--env', 'development', '--no-analytics'],
        cwd: data(),
        logFile: join(dirs.logs(), 'meilisearch.log')
      },
      PORT,
      30000
    )
  },

  stop: () => proc.stop()
}
