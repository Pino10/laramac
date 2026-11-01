import type { SetupReport, ServiceId } from '../shared/types'
import { services } from './services'
import { brewPrefix } from './platform'
import { installPhpMyAdmin, refreshShims, toolsStatus } from './tools'
import { phpmyadminInstalled } from './webconf'
import { installResolver, startDnsServer } from './dns'
import { trustCa } from './ssl'
import { getSettings } from './settings'

/**
 * One click from nothing to a working stack: Apache, the newest PHP, MySQL, phpMyAdmin and
 * Mailpit, started, with .test addresses and trusted HTTPS. Each step is independent, so one
 * failure (for example no Homebrew for Apache) does not stop the rest.
 */
export async function setupRecommended(): Promise<SetupReport> {
  const report: SetupReport = { done: [], failed: [] }
  const step = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
      report.done.push(name)
    } catch (err) {
      report.failed.push({ step: name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  const install = (id: ServiceId): Promise<void> => {
    const s = services.list().find((x) => x.id === id)
    return s && s.status !== 'not-installed' ? Promise.resolve() : services.install(id)
  }

  await step('PHP', () => install('php'))
  await step('Apache', async () => {
    if (!brewPrefix()) throw new Error('Apache installs with Homebrew. Get it at brew.sh, then run setup again.')
    await install('apache')
  })
  await step('MySQL', () => install('mysql'))
  await step('Mailpit', () => install('mailpit'))
  await step('phpMyAdmin', async () => {
    if (!phpmyadminInstalled()) await installPhpMyAdmin()
  })
  refreshShims()
  await step('Start services', async () => {
    await services.startAll()
    const failed = services.list().filter((s) => s.status === 'error')
    if (failed.length) throw new Error(failed.map((s) => `${s.name}: ${s.error?.split('\n')[0]}`).join('; '))
  })
  const tools = await toolsStatus()
  if (!tools.dnsReady) {
    await step(`.${getSettings().tld} addresses`, async () => {
      await installResolver(getSettings().tld)
      await startDnsServer(() => getSettings().tld)
    })
  }
  if (!tools.caTrusted) await step('Trusted HTTPS', () => trustCa())
  return report
}
