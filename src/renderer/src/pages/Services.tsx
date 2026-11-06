import type { ServiceId, ServiceInfo } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'
import StatStrip from '../components/StatStrip'
import NextLine from '../components/NextLine'
import ServiceRow from '../components/ServiceRow'
import StackMap from '../components/StackMap'
import Tools from './Tools'

/** What each service is for, in the order the page shows them. */
export const SERVICE_SECTIONS: { title: string; hint: string; ids: ServiceId[] }[] = [
  { title: 'Web servers', hint: 'They answer at your .test addresses. One is enough; Apache reads .htaccess files.', ids: ['apache', 'nginx'] },
  { title: 'PHP', hint: 'Runs your PHP sites. Versions and extensions are on the PHP page.', ids: ['php'] },
  { title: 'Databases', hint: 'Manage their databases, users and backups on the Databases page.', ids: ['mysql', 'mariadb', 'postgres', 'mongodb'] },
  { title: 'Cache, search and queues', hint: 'For sessions, jobs and fast search.', ids: ['redis', 'memcached', 'meilisearch', 'rabbitmq'] },
  { title: 'File storage', hint: 'S3-compatible storage for uploads, on this Mac.', ids: ['s3'] },
  { title: 'Mail', hint: 'Catches every email your apps send, so nothing reaches real people.', ids: ['mailpit'] },
  { title: 'AI models', hint: 'Local models with an OpenAI-compatible address.', ids: ['ollama'] }
]

export function sectionOf(id: ServiceId): string {
  return SERVICE_SECTIONS.find((s) => s.ids.includes(id))?.title ?? 'Other'
}

/** Every service Laramac runs, grouped by what it is for, with one place to start and stop them. */
export default function Services(): React.JSX.Element {
  const { services, busy, act, setServices, jobs } = useApp()
  const api = window.laramac
  const installed = services.filter((s) => s.status !== 'not-installed')
  const running = installed.filter((s) => s.status === 'running').length
  const installing = jobs.some((j) => j.status === 'running')
  const known = new Set(SERVICE_SECTIONS.flatMap((s) => s.ids))
  const others = services.filter((s) => !known.has(s.id))
  const sections: { title: string; hint: string; items: ServiceInfo[] }[] = [
    ...SERVICE_SECTIONS.map((sec) => ({ title: sec.title, hint: sec.hint, items: sec.ids.map((id) => services.find((s) => s.id === id)).filter((s): s is ServiceInfo => !!s) })),
    { title: 'Other', hint: '', items: others }
  ].filter((s) => s.items.length > 0)

  return (
    <>
      <PageHead title="Services" desc={installed.length ? `${running} of ${installed.length} running. Each one runs from Laramac's own folder and only answers on this Mac.` : 'Install what your projects need. Each one runs from Laramac’s own folder and only answers on this Mac.'}>
        <button className="btn" disabled={busy.has('stop-all') || running === 0} onClick={() => act('stop-all', () => api.invoke('services:stop-all').then(setServices))}>
          Stop all
        </button>
        <button
          className="btn btn-primary"
          disabled={busy.has('start-all') || installing || installed.length === 0 || running === installed.length}
          onClick={() => act('start-all', () => api.invoke('services:start-all').then(setServices))}
        >
          {busy.has('start-all') ? 'Starting…' : 'Start all'}
        </button>
      </PageHead>

      {installed.length > 0 && (
        <StatStrip
          stats={[
            { label: 'Running', value: running, unit: `of ${installed.length}`, tone: running === installed.length ? 'ok' : running === 0 ? 'bad' : 'warn' },
            { label: 'Stopped', value: installed.filter((x) => x.status === 'stopped').length },
            { label: 'Failed', value: installed.filter((x) => x.status === 'error').length, tone: installed.some((x) => x.status === 'error') ? 'bad' : undefined },
            { label: 'Not installed', value: services.filter((x) => x.status === 'not-installed').length, sub: 'Add them below when a project needs one' }
          ]}
        />
      )}
      {installed.length > 0 && running < installed.length && !installing && !installed.some((x) => x.status === 'error') && (
        <NextLine action="Start all" onAction={() => void act('start-all', () => api.invoke('services:start-all').then(setServices))}>
          <strong>{installed.length - running} {installed.length - running === 1 ? 'service is' : 'services are'} off.</strong> Sites that need {installed.length - running === 1 ? 'it' : 'them'} will not open until {installed.length - running === 1 ? 'it runs' : 'they run'}.
        </NextLine>
      )}
      {installed.length > 0 && <StackMap />}

      {sections.map((sec) => (
        <section key={sec.title} className="svc-section">
          <div className="section-head">
            <h2 className="section-title">{sec.title}</h2>
            {sec.hint && <span className="hint">{sec.hint}</span>}
          </div>
          <div className="group">
            {sec.items.map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
          </div>
        </section>
      ))}

      <Tools part="mail" />
    </>
  )
}
