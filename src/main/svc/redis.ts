import { chmodSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, extract, removeQuarantine, urlExists } from '../download'
import { jobs } from '../jobs'
import { brewPrefix, goArch } from '../platform'
import { brew } from '../brew'
import { bundledBinaryUrl } from '../versions'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('Redis')
const PORT = 6379

export function redisBinary(): string | null {
  const own = join(dirs.bin(), 'redis-server')
  if (existsSync(own)) return own
  const prefix = brewPrefix()
  if (prefix && existsSync(join(prefix, 'bin', 'redis-server'))) return join(prefix, 'bin', 'redis-server')
  return null
}

export const redis: ServiceImpl = {
  id: 'redis',
  name: 'Redis',
  description: 'In-memory cache and queue',
  port: () => PORT,
  installed: () => redisBinary() !== null,
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing Redis', async (update) => {
      const url = bundledBinaryUrl('redis', goArch())
      if (await urlExists(url)) {
        const archive = join(dirs.downloads(), 'redis.tar.gz')
        await downloadFile(url, archive, (p) => update(p, 'Downloading Redis'))
        await extract(archive, dirs.bin())
        chmodSync(join(dirs.bin(), 'redis-server'), 0o755)
        await removeQuarantine(join(dirs.bin(), 'redis-server'))
        rmSync(archive, { force: true })
        return
      }
      update(null, 'Installing Redis with Homebrew')
      await brew(['install', 'redis'], (line) => update(null, `Redis: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const bin = redisBinary()
    if (!bin) throw new Error('Redis is not installed.')
    mkdirSync(dirs.redisData(), { recursive: true })
    await proc.start(
      {
        command: bin,
        args: ['--port', String(PORT), '--bind', '127.0.0.1', '--dir', dirs.redisData(), '--daemonize', 'no'],
        logFile: join(dirs.logs(), 'redis.log')
      },
      PORT
    )
  },

  stop: () => proc.stop()
}
