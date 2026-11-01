import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { jobs } from '../jobs'
import { brewPrefix } from '../platform'
import { brew } from '../brew'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('RabbitMQ')
const PORT = 5672
export const RABBIT_UI = 15672

function binary(): string | null {
  const prefix = brewPrefix()
  const p = prefix ? join(prefix, 'sbin', 'rabbitmq-server') : null
  return p && existsSync(p) ? p : null
}

/** Message queues for background jobs and events. Installed with Homebrew, which brings Erlang. */
export const rabbitmq: ServiceImpl = {
  id: 'rabbitmq',
  name: 'RabbitMQ',
  description: 'Message queues, with the management dashboard',
  port: () => PORT,
  installed: () => binary() !== null,
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing RabbitMQ with Homebrew', async (update) => {
      await brew(['install', 'rabbitmq'], (line) => update(null, `RabbitMQ: ${line.slice(0, 60)}`))
    })
  },

  async start() {
    const bin = binary()
    if (!bin) throw new Error('RabbitMQ is not installed.')
    const base = join(dirs.root(), 'data', 'rabbitmq')
    mkdirSync(base, { recursive: true })
    await proc.start(
      {
        command: bin,
        args: [],
        env: {
          RABBITMQ_NODE_IP_ADDRESS: '127.0.0.1',
          RABBITMQ_NODE_PORT: String(PORT),
          RABBITMQ_NODENAME: 'laramac@localhost',
          RABBITMQ_MNESIA_BASE: join(base, 'mnesia'),
          RABBITMQ_LOG_BASE: dirs.logs(),
          RABBITMQ_ENABLED_PLUGINS: 'rabbitmq_management',
          RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS: `-rabbitmq_management listener [{port,${RABBIT_UI}},{ip,"127.0.0.1"}]`,
          RABBITMQ_DIST_PORT: '25672',
          ERL_EPMD_ADDRESS: '127.0.0.1'
        },
        logFile: join(dirs.logs(), 'rabbitmq.log')
      },
      PORT,
      60000
    )
  },

  stop: () => proc.stop()
}
