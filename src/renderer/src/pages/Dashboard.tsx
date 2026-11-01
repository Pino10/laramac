import { Database, Mail, Plus, Upload } from 'lucide-react'
import type { ServiceGroup } from '@shared/types'
import { useApp } from '../store'
import StackMap from '../components/StackMap'
import ServiceRow from '../components/ServiceRow'

const groups: { id: ServiceGroup; title: string }[] = [
  { id: 'web', title: 'Web servers' },
  { id: 'runtime', title: 'Runtime' },
  { id: 'database', title: 'Databases' },
  { id: 'mail', title: 'Mail' }
]

function headline(running: number, installed: number, failing: boolean): { title: string; sub: string } {
  if (installed === 0) return { title: 'Set up your stack.', sub: 'Install PHP, a web server and a database. Each takes one click.' }
  if (failing) return { title: 'Something needs a look.', sub: 'A service could not start. The details are below.' }
  if (running === 0) return { title: 'Everything is off.', sub: 'Start all to bring your sites up.' }
  if (running === installed) return { title: 'Everything is running.', sub: 'Your sites are live on this Mac.' }
  return { title: `${running} of ${installed} services running.`, sub: 'Start the rest when you need them.' }
}

export default function Dashboard(): React.JSX.Element {
  const { services, tools, settings, busy, act, setServices, setTools, jobs, setNewProject, setImportOpen, notify, sites } = useApp()
  const api = window.laramac
  const installed = services.filter((s) => s.status !== 'not-installed')
  const running = installed.filter((s) => s.status === 'running').length
  const failing = services.some((s) => s.status === 'error')
  const installing = jobs.some((j) => j.status === 'running')
  const tld = settings?.tld ?? 'test'
  const mailpit = services.find((s) => s.id === 'mailpit')
  const { title, sub } = headline(running, installed.length, failing)

  const setup = tools
    ? [
        {
          done: tools.dnsReady,
          key: 'dns',
          title: `Turn on .${tld} addresses`,
          hint: `So your browser can open names like ${sites[0]?.domain ?? `myblog.${tld}`}. macOS asks for your password once.`,
          action: 'Turn on',
          run: () => api.invoke('tools:setup-dns').then(setTools)
        },
        {
          done: tools.caTrusted,
          key: 'ca',
          title: 'Trust local HTTPS',
          hint: `Browsers will accept certificates Laramac makes. They only work for .${tld} names.`,
          action: 'Trust',
          run: () => api.invoke('tools:trust-ca').then(setTools)
        }
      ].filter((s) => !s.done)
    : []

  const openPma = async (): Promise<void> => {
    if (tools?.phpmyadmin) {
      await api.invoke('sites:open-url', `http://phpmyadmin.${tld}`)
      return
    }
    const next = await act('tool-phpmyadmin', () => api.invoke('tools:install', 'phpmyadmin'))
    if (next) {
      setTools(next)
      notify({ kind: 'info', text: 'phpMyAdmin is installed. Start MySQL, PHP and Nginx, then open it.' })
    }
  }

  return (
    <>
      <div className="hero">
        <div>
          <h1 className="hero-title">{title}</h1>
          <p className="hero-sub">{sub}</p>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            disabled={busy.has('stop-all') || running === 0}
            onClick={() => act('stop-all', () => api.invoke('services:stop-all').then(setServices))}
          >
            Stop all
          </button>
          <button
            className="btn btn-primary"
            disabled={busy.has('start-all') || installing || installed.length === 0 || running === installed.length}
            onClick={() => act('start-all', () => api.invoke('services:start-all').then(setServices))}
          >
            {busy.has('start-all') ? 'Starting' : 'Start all'}
          </button>
        </div>
      </div>

      {setup.map((step) => (
        <div key={step.key} className="notice glass">
          <div className="notice-body">
            <div className="notice-title">{step.title}</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {step.hint}
            </div>
          </div>
          <button className="btn" disabled={busy.has(step.key)} onClick={() => act(step.key, step.run)}>
            {busy.has(step.key) ? 'Waiting for macOS' : step.action}
          </button>
        </div>
      ))}

      <StackMap />

      <div className="launch" style={{ marginTop: 12 }}>
        <button className="tile glass tile-primary" onClick={openPma} disabled={busy.has('tool-phpmyadmin')}>
          <span className="tile-icon">
            <Database size={16} />
          </span>
          <span>
            <span className="tile-name" style={{ display: 'block' }}>
              phpMyAdmin
            </span>
            <span className="tile-sub">
              {busy.has('tool-phpmyadmin') ? 'Installing' : tools?.phpmyadmin ? `phpmyadmin.${tld}` : 'Install in one click'}
            </span>
          </span>
        </button>
        <button
          className="tile glass"
          onClick={() =>
            mailpit?.status === 'running'
              ? api.invoke('sites:open-url', 'http://127.0.0.1:8025')
              : notify({ kind: 'info', text: 'Start Mailpit first. It is under Mail below.' })
          }
        >
          <span className="tile-icon">
            <Mail size={16} />
          </span>
          <span>
            <span className="tile-name" style={{ display: 'block' }}>
              Mail inbox
            </span>
            <span className="tile-sub">{mailpit?.status === 'running' ? 'Catching mail' : 'Mailpit is off'}</span>
          </span>
        </button>
        <button className="tile glass" onClick={() => setNewProject(true)}>
          <span className="tile-icon">
            <Plus size={16} />
          </span>
          <span>
            <span className="tile-name" style={{ display: 'block' }}>
              New project
            </span>
            <span className="tile-sub">WordPress, Laravel or PHP</span>
          </span>
        </button>
        <button className="tile glass" onClick={() => setImportOpen(true)}>
          <span className="tile-icon">
            <Upload size={16} />
          </span>
          <span>
            <span className="tile-name" style={{ display: 'block' }}>
              Import
            </span>
            <span className="tile-sub">From Laragon, a zip or a .sql</span>
          </span>
        </button>
      </div>

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
