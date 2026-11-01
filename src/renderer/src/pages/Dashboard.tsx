import type { ServiceInfo, ServiceStatus } from '@shared/types'
import { useApp } from '../store'

const statusLabel: Record<ServiceStatus, string> = {
  'not-installed': 'Not installed',
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  error: 'Error'
}

const statusColor: Record<ServiceStatus, string> = {
  'not-installed': 'var(--text-dim)',
  stopped: 'var(--warn)',
  starting: 'var(--warn)',
  running: 'var(--ok)',
  error: 'var(--bad)'
}

export default function Dashboard(): React.JSX.Element {
  const { services, tools, settings, busy, act, setServices, setTools, jobs } = useApp()
  const api = window.laramac
  const running = services.filter((s) => s.status === 'running').length
  const installing = jobs.some((j) => j.status === 'running')
  const tld = settings?.tld ?? 'test'

  const setup = tools
    ? [
        {
          done: tools.dnsReady,
          title: `Open .${tld} domains`,
          hint: 'One-time step so names like myblog.test work in your browser.',
          action: 'Set up',
          key: 'dns',
          run: () => api.invoke('tools:setup-dns').then(setTools)
        },
        {
          done: tools.caTrusted,
          title: 'Trust local HTTPS',
          hint: 'Lets browsers accept the certificates Laramac creates for your sites.',
          action: 'Trust',
          key: 'ca',
          run: () => api.invoke('tools:trust-ca').then(setTools)
        }
      ]
    : []
  const pending = setup.filter((s) => !s.done)

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            {running} of {services.length} services running
          </p>
        </div>
        <div className="no-drag flex gap-2">
          <button
            className="btn"
            disabled={busy.has('stop-all')}
            onClick={() => act('stop-all', () => api.invoke('services:stop-all').then(setServices))}
          >
            Stop All
          </button>
          <button
            className="btn btn-primary"
            disabled={busy.has('start-all') || installing}
            onClick={() => act('start-all', () => api.invoke('services:start-all').then(setServices))}
          >
            Start All
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="glass mb-4 p-4">
          <div className="mb-2 text-sm font-medium">Finish setting up</div>
          <div className="flex flex-col gap-2">
            {pending.map((step) => (
              <div key={step.key} className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm">{step.title}</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {step.hint}
                  </div>
                </div>
                <button className="btn no-drag" disabled={busy.has(step.key)} onClick={() => act(step.key, step.run)}>
                  {busy.has(step.key) ? 'Working…' : step.action}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            macOS will ask for your password. Laramac never sees it.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {services.map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </div>
  )
}

function ServiceCard({ service: s }: { service: ServiceInfo }): React.JSX.Element {
  const { busy, act, setServices } = useApp()
  const api = window.laramac
  const installing = busy.has(`install-${s.id}`)

  return (
    <div className="glass flex flex-col gap-2 p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{s.name}</span>
            {s.version && (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {s.version}
              </span>
            )}
            {s.port ? (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                :{s.port}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs" style={{ color: 'var(--text-dim)' }}>
            {s.description}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor[s.status] }} />
            <span style={{ color: statusColor[s.status] }}>{statusLabel[s.status]}</span>
          </div>
        </div>
        {s.status === 'not-installed' ? (
          <button
            className="btn no-drag"
            disabled={installing}
            onClick={() =>
              act(`install-${s.id}`, async () => {
                await api.invoke('services:install', s.id)
                setServices(await api.invoke('services:list'))
              })
            }
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        ) : (
          <button
            className={`toggle no-drag ${s.status === 'running' ? 'on' : ''}`}
            disabled={s.status === 'starting' || busy.has(`toggle-${s.id}`)}
            onClick={() => act(`toggle-${s.id}`, () => api.invoke('services:toggle', s.id).then(setServices))}
            aria-label={`Toggle ${s.name}`}
          />
        )}
      </div>
      {s.status === 'error' && s.error && (
        <pre
          className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11px]"
          style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--bad)', userSelect: 'text' }}
        >
          {s.error}
        </pre>
      )}
    </div>
  )
}
