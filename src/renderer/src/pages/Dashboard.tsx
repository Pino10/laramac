import type { ServiceGroup } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'
import ServiceRow from '../components/ServiceRow'

const groups: { id: ServiceGroup; title: string }[] = [
  { id: 'web', title: 'Web servers' },
  { id: 'runtime', title: 'Runtime' },
  { id: 'database', title: 'Databases' },
  { id: 'mail', title: 'Mail' }
]

export default function Dashboard(): React.JSX.Element {
  const { services, tools, settings, busy, act, setServices, setTools, jobs } = useApp()
  const api = window.laramac
  const installing = jobs.some((j) => j.status === 'running')
  const running = services.filter((s) => s.status === 'running').length
  const tld = settings?.tld ?? 'test'

  const setup = tools
    ? [
        {
          done: tools.dnsReady,
          key: 'dns',
          title: `Turn on .${tld} domains`,
          hint: `Lets your browser open names like myblog.${tld}. Asks for your Mac password once.`,
          action: 'Turn on',
          run: () => api.invoke('tools:setup-dns').then(setTools)
        },
        {
          done: tools.caTrusted,
          key: 'ca',
          title: 'Trust local HTTPS certificates',
          hint: 'Stops browsers warning about HTTPS sites that Laramac creates.',
          action: 'Trust',
          run: () => api.invoke('tools:trust-ca').then(setTools)
        }
      ].filter((s) => !s.done)
    : []

  return (
    <>
      <PageHead
        title="Dashboard"
        desc={running === 0 ? 'Nothing is running. Install what you need, then start it.' : `${running} running`}
      >
        <button
          className="btn"
          disabled={busy.has('stop-all') || running === 0}
          onClick={() => act('stop-all', () => api.invoke('services:stop-all').then(setServices))}
        >
          Stop all
        </button>
        <button
          className="btn btn-primary"
          disabled={busy.has('start-all') || installing}
          onClick={() => act('start-all', () => api.invoke('services:start-all').then(setServices))}
        >
          Start all
        </button>
      </PageHead>

      {setup.map((step) => (
        <div key={step.key} className="notice">
          <div className="notice-body">
            <div className="notice-title">{step.title}</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {step.hint}
            </div>
          </div>
          <button className="btn no-drag" disabled={busy.has(step.key)} onClick={() => act(step.key, step.run)}>
            {busy.has(step.key) ? 'Working' : step.action}
          </button>
        </div>
      ))}

      {groups.map((g) => {
        const items = services.filter((s) => s.group === g.id)
        if (items.length === 0) return null
        return (
          <section key={g.id}>
            <h2 className="section-title">{g.title}</h2>
            <div className="panel">
              {items.map((s) => (
                <ServiceRow key={s.id} service={s} />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
