import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, extract, removeQuarantine } from '../download'
import { jobs } from '../jobs'
import { goArch } from '../platform'
import { mailpitUrl } from '../versions'
import { ManagedProcess } from '../process'
import { mailpitBinary } from '../webconf'
import { mailpitRelayArgs } from '../mailrelay'

const proc = new ManagedProcess('Mailpit')

export const mailpit: ServiceImpl = {
  id: 'mailpit',
  name: 'Mailpit',
  description: 'Catches all outgoing mail',
  port: () => 8025,
  installed: () => existsSync(mailpitBinary()),
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing Mailpit', async (update) => {
      const archive = join(dirs.downloads(), 'mailpit.tar.gz')
      const staging = join(dirs.downloads(), 'mailpit-staging')
      rmSync(staging, { recursive: true, force: true })
      await downloadFile(mailpitUrl(goArch()), archive, (p) => update(p, 'Downloading Mailpit'))
      await extract(archive, staging)
      mkdirSync(dirs.mailpit(), { recursive: true })
      renameSync(join(staging, 'mailpit'), mailpitBinary())
      chmodSync(mailpitBinary(), 0o755)
      await removeQuarantine(mailpitBinary())
      rmSync(staging, { recursive: true, force: true })
      rmSync(archive, { force: true })
    })
  },

  async start() {
    await proc.start(
      {
        command: mailpitBinary(),
        args: [
          '--smtp',
          '127.0.0.1:1025',
          '--listen',
          '127.0.0.1:8025',
          '--database',
          join(dirs.mailpit(), 'mailpit.db'),
          ...mailpitRelayArgs()
        ],
        logFile: join(dirs.logs(), 'mailpit.log')
      },
      8025
    )
  },

  stop: () => proc.stop()
}
