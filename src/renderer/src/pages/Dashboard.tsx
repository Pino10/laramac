import { useState } from 'react'
import { ArrowUpRight, Database, Info, Mail, Plus, Upload } from 'lucide-react'
import SiteQuickView from '../components/SiteQuickView'
import { useApp } from '../store'
import { SERVICE_SECTIONS } from './Services'
import Doctor from '../components/Doctor'
import { Monogram } from '../ui'
import ServiceRow from '../components/ServiceRow'


function summary(running: number, installed: number, failing: string | null, off: string[]): { title: string; sub: string } {
  if (failing) return { title: `${failing} needs attention`, sub: 'It could not start. The reason is shown in its row below.' }
  if (running === 0) return { title: 'Everything is stopped', sub: 'Start all to bring your sites back up.' }
  if (running === installed) return { title: 'Everything is running', sub: 'Your sites are live on this Mac.' }
  return { title: `${running} of ${installed} services running`, sub: `${off.join(', ')} ${off.length === 1 ? 'is' : 'are'} off.` }
}

export default function Dashboard(): React.JSX.Element {
  const { services, tools, settings, busy, act, setServices, setTools, jobs, setNewProject, setImportOpen, notify, php, setPage } = useApp()
  const api = window.laramac
  const installed = services.filter((s) => s.status !== 'not-installed')
  const running = installed.filter((s) => s.status === 'running').length
  const failing = services.find((s) => s.status === 'error')?.name ?? null
  const installing = jobs.some((j) => j.status === 'running')
  const tld = settings?.tld ?? 'test'
  const mailpit = services.find((s) => s.id === 'mailpit')
  const ready = services.some((s) => s.group === 'web' && s.status !== 'not-installed') && services.some((s) => s.id === 'php' && s.status !== 'not-installed')

  const setup = tools
    ? [
        {
          done: tools.dnsReady,
          key: 'dns',
          title: `Turn on .${tld} addresses`,
          hint: `Lets your browser open names like myblog.${tld}. macOS asks for your password once.`,
          action: 'Turn on',
          run: () => api.invoke('tools:setup-dns').then(setTools)
        },
        {
          done: tools.caTrusted,
          key: 'ca',
          title: 'Trust local HTTPS',
          hint: `Browsers accept the certificates Laramac makes. They only work for .${tld} names.`,
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
      notify({ kind: 'info', text: 'phpMyAdmin is installed. Start MySQL, PHP and Apache, then open it.' })
    }
  }

  const runSetup = async (): Promise<void> => {
    const report = await act('setup', () => api.invoke('setup:recommended'))
    setServices(await api.invoke('services:list'))
    if (!report) return
    notify(
      report.failed.length
        ? { kind: 'error', text: `Set up ${report.done.length} of ${report.done.length + report.failed.length}. ${report.failed.map((f) => `${f.step}: ${f.error}`).join(' ')}` }
        : { kind: 'info', text: 'Your stack is ready.' }
    )
  }

  if (!ready) {
    const latest = php[0]?.latest
    return (
      <div className="onboard">
        <h1 className="page-title">Set up your stack</h1>
        <p className="page-desc">
          Laramac installs everything a PHP site needs, starts it, and gives every folder in your projects folder its own https://name.{tld} address.
        </p>
        <ol className="plan">
          <li>
            <strong>PHP {latest}</strong>
            <span>The newest release, with all common extensions</span>
          </li>
          <li>
            <strong>Apache</strong>
            <span>Serves your sites, with .htaccess support</span>
          </li>
          <li>
            <strong>MySQL 8.4</strong>
            <span>Plus phpMyAdmin, signed in for you</span>
          </li>
          <li>
            <strong>Mailpit</strong>
            <span>Catches every email your apps send</span>
          </li>
          <li>
            <strong>.{tld} addresses and HTTPS</strong>
            <span>macOS asks for your password twice</span>
          </li>
        </ol>
        <div className="onboard-actions">
          <button className="btn btn-primary btn-lg" disabled={busy.has('setup') || installing} onClick={runSetup}>
            {busy.has('setup') ? 'Setting up…' : 'Set up my stack'}
          </button>
          <button className="btn btn-lg" onClick={() => setPage('starters')}>
            Or start a project: Laramac sets up what it needs
          </button>
          <span className="hint">
            {tools && !tools.homebrew ? (
              <>
                Apache installs with{' '}
                <button className="link" onClick={() => api.invoke('tools:open-external', 'https://brew.sh')}>
                  Homebrew
                </button>
                . Everything else downloads directly.
              </>
            ) : (
              'Or install pieces one by one below.'
            )}
          </span>
        </div>
        {SERVICE_SECTIONS.map((g) => {
          const items = g.ids.map((id) => services.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
          if (items.length === 0) return null
          return (
            <section key={g.title}>
              <h2 className="section-title">{g.title}</h2>
              <div className="group">
                {items.map((s) => (
                  <ServiceRow key={s.id} service={s} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  const { title, sub } = summary(
    running,
    installed.length,
    failing,
    installed.filter((s) => s.status !== 'running').map((s) => s.name)
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-desc">{sub}</p>
        </div>
        <div className="page-actions">
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
        </div>
      </div>

      <Doctor quietWhenFine />
      <YourSites />

      {setup.map((step) => (
        <div key={step.key} className="callout">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{step.title}</strong>
            <span>{step.hint}</span>
          </div>
          <button className="btn" disabled={busy.has(step.key)} onClick={() => act(step.key, step.run)}>
            {busy.has(step.key) ? 'Waiting for macOS…' : step.action}
          </button>
        </div>
      ))}

      <section className="ov-block">
        <div className="section-head">
          <h2 className="section-title">Services</h2>
          <button className="link" onClick={() => setPage('services')}>
            Manage <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="svc-tiles">
          {installed.map((s) => (
            <button key={s.id} className="svc-tile" data-s={s.status} onClick={() => setPage('services')} title={s.error ?? undefined}>
              <span className="lamp" data-s={s.status} />
              <span className="svc-tile-text">
                <strong>{s.name}</strong>
                <small>{s.status === 'running' ? (s.port ? `Port ${s.port}` : 'Running') : s.status === 'error' ? 'Could not start' : s.status === 'starting' ? 'Starting…' : 'Off'}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="ov-block">
        <h2 className="section-title">Shortcuts</h2>
        <div className="shortcut-tiles">
          <button className="shortcut" onClick={openPma} disabled={busy.has('tool-phpmyadmin')}>
            <span className="shortcut-icon">
              <Database size={18} />
            </span>
            <strong>phpMyAdmin</strong>
            <small>{busy.has('tool-phpmyadmin') ? 'Installing…' : tools?.phpmyadmin ? `phpmyadmin.${tld}` : 'Install in one click'}</small>
          </button>
          <button
            className="shortcut"
            onClick={() => (mailpit?.status === 'running' ? api.invoke('sites:open-url', 'http://127.0.0.1:8025') : notify({ kind: 'info', text: 'Start Mailpit first, on the Services page.' }))}
          >
            <span className="shortcut-icon">
              <Mail size={18} />
            </span>
            <strong>Mail inbox</strong>
            <small>{mailpit?.status === 'running' ? 'Catching mail on port 1025' : 'Mailpit is off'}</small>
          </button>
          <button className="shortcut" onClick={() => setPage('starters')}>
            <span className="shortcut-icon">
              <Plus size={18} />
            </span>
            <strong>New project</strong>
            <small>React, Laravel, Django, C# and 30 more</small>
          </button>
          <button className="shortcut" onClick={() => setImportOpen(true)}>
            <span className="shortcut-icon">
              <Upload size={18} />
            </span>
            <strong>Import</strong>
            <small>From Laragon, a zip or a .sql dump</small>
          </button>
        </div>
      </section>
    </>
  )
}

/** Your sites at a glance: open one, or start its dev server. */
function YourSites(): React.JSX.Element | null {
  const { sites, showSite, act, setSites, setPage } = useApp()
  const [details, setDetails] = useState<string | null>(null)
  if (!sites.length) return null
  const open = sites.find((s) => s.name === details)
  const list = [...sites].sort((a, b) => Number(!!b.dev?.running) - Number(!!a.dev?.running)).slice(0, 8)
  return (
    <div className="your-sites">
      <div className="section-head">
        <h2 className="section-title">Your sites</h2>
        <button className="link" onClick={() => setPage('sites')}>
          All {sites.length} <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="ys-grid">
        {list.map((s) => (
          <div key={s.name} className="ys-card glass" role="button" tabIndex={0} onClick={() => showSite(s.name)} onKeyDown={(e) => e.key === 'Enter' && showSite(s.name)}>
            <Monogram id={s.kind} />
            <div className="row-main">
              <div className="row-title">{s.name}</div>
              <div className="row-sub">{s.domain}</div>
            </div>
            <button
              className="icon-btn ys-info"
              aria-label={`Details of ${s.name}`}
              data-tip="Details"
              onClick={(e) => {
                e.stopPropagation()
                setDetails(s.name)
              }}
            >
              <Info />
            </button>
            {s.dev ? (
              <button
                className={s.dev.running ? 'pill-live' : 'btn btn-sm'}
                onClick={async (e) => {
                  e.stopPropagation()
                  const r = await act(`dev-${s.name}`, () => window.laramac.invoke(s.dev!.running ? 'dev:stop' : 'dev:start', s.name))
                  if (r) setSites(r)
                }}
              >
                {s.dev.running ? 'Live' : 'Start'}
              </button>
            ) : (
              <span className="pill-live">Live</span>
            )}
          </div>
        ))}
        <button className="ys-card ys-new glass" onClick={() => setPage('starters')}>
          <Plus size={18} /> New project
        </button>
      </div>
      {open && <SiteQuickView site={open} onClose={() => setDetails(null)} />}
    </div>
  )
}
