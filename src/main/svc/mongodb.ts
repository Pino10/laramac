import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, extract, removeQuarantine } from '../download'
import { jobs } from '../jobs'
import { latestMongodb } from '../versions'
import { readFileSync, writeFileSync } from 'fs'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('MongoDB')
const PORT = 27017

const mongod = (): string => join(dirs.mongodb(), 'bin', 'mongod')

export const mongodb: ServiceImpl = {
  id: 'mongodb',
  name: 'MongoDB',
  description: 'Document database (Community Edition)',
  port: () => PORT,
  installed: () => existsSync(mongod()),
  version: () => {
    try {
      return readFileSync(join(dirs.mongodb(), 'VERSION'), 'utf8').trim()
    } catch {
      return undefined
    }
  },
  running: () => proc.running,

  async install() {
    await jobs.run('Installing MongoDB', async (update) => {
      update(null, 'Finding the newest MongoDB')
      const { version, url } = await latestMongodb()
      const archive = join(dirs.downloads(), 'mongodb.tgz')
      const staging = join(dirs.downloads(), 'mongodb-staging')
      rmSync(staging, { recursive: true, force: true })
      await downloadFile(url, archive, (p) => update(p, `Downloading MongoDB ${version}`))
      update(null, 'Unpacking MongoDB')
      await extract(archive, staging)
      const inner = readdirSync(staging).find((d) => d.startsWith('mongodb-'))
      if (!inner) throw new Error('Unexpected MongoDB archive layout.')
      rmSync(dirs.mongodb(), { recursive: true, force: true })
      renameSync(join(staging, inner), dirs.mongodb())
      chmodSync(mongod(), 0o755)
      writeFileSync(join(dirs.mongodb(), 'VERSION'), version)
      await removeQuarantine(dirs.mongodb())
      rmSync(staging, { recursive: true, force: true })
      rmSync(archive, { force: true })
    })
  },

  async start() {
    if (!existsSync(mongod())) throw new Error('MongoDB is not installed.')
    mkdirSync(dirs.mongoData(), { recursive: true })
    await proc.start(
      {
        command: mongod(),
        args: [
          '--dbpath',
          dirs.mongoData(),
          '--bind_ip',
          '127.0.0.1',
          '--port',
          String(PORT),
          '--logpath',
          join(dirs.logs(), 'mongodb-server.log'),
          '--pidfilepath',
          join(dirs.run(), 'mongodb.pid')
        ],
        logFile: join(dirs.logs(), 'mongodb.log')
      },
      PORT,
      30000
    )
  },

  stop: () => proc.stop(10000)
}
