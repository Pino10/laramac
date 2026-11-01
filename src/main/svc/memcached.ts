import { existsSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { jobs } from '../jobs'
import { brewPrefix } from '../platform'
import { brew } from '../brew'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('Memcached')
const PORT = 11211

function binary(): string | null {
  const prefix = brewPrefix()
  const p = prefix ? join(prefix, 'bin', 'memcached') : null
  return p && existsSync(p) ? p : null
}

export const memcached: ServiceImpl = {
  id: 'memcached',
  name: 'Memcached',
  description: 'In-memory cache',
  port: () => PORT,
  installed: () => binary() !== null,
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing Memcached with Homebrew', async (update) => {
      await brew(['install', 'memcached'], (line) => update(null, `Memcached: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const bin = binary()
    if (!bin) throw new Error('Memcached is not installed.')
    // -U 0 turns off UDP, which has been abused for amplification attacks.
    await proc.start({ command: bin, args: ['-l', '127.0.0.1', '-p', String(PORT), '-U', '0', '-m', '128'], logFile: join(dirs.logs(), 'memcached.log') }, PORT)
  },

  stop: () => proc.stop()
}
