import DbBrowser from '../components/DbBrowser'
import DbExtras, { BackupsFolderButton } from '../components/DbExtras'
import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Download, Plus, Trash2, Upload, Copy } from 'lucide-react'
import type { DatabaseInfo } from '@shared/types'
import { useApp } from '../store'
import { CopyField, formatBytes, PageHead } from '../ui'
import StatStrip from '../components/StatStrip'
import NextLine from '../components/NextLine'
import ServiceRow from '../components/ServiceRow'
import { useAsk } from '../components/Ask'

type Engine = 'mysql' | 'mariadb'
const ENGINE_NAME: Record<Engine, string> = { mysql: 'MySQL', mariadb: 'MariaDB' }

export default function Databases(): React.JSX.Element {
  const { services, tools, settings, act, busy, setTools, setServices, setImportOpen, notify } = useApp()
  const [browse, setBrowse] = useState<string | null>(null)
  const api = window.laramac
  const tld = settings?.tld ?? 'test'
  const [dbs, setDbs] = useState<DatabaseInfo[] | null>(null)
  const [ask, askDialog] = useAsk()
  const [pw, setPw] = useState<Record<Engine, boolean>>({ mysql: false, mariadb: false })
  useEffect(() => {
    void Promise.all([api.invoke('db:root-password', 'mysql'), api.invoke('db:root-password', 'mariadb')]).then(([a, b]) => setPw({ mysql: a.set, mariadb: b.set }))
  }, [api])

  const engines = services.filter((s) => s.group === 'database')
  const sqlRunning = (['mysql', 'mariadb'] as Engine[]).filter((e) => services.find((s) => s.id === e)?.status === 'running')
  const runningKey = sqlRunning.join(',')

  const load = useCallback(() => void api.invoke('db:list').then(setDbs).catch(() => setDbs([])), [api])
  useEffect(() => {
    load()
  }, [load, runningKey])

  const openOrInstall = async (tool: 'phpmyadmin' | 'adminer'): Promise<void> => {
    const installed = tool === 'phpmyadmin' ? tools?.phpmyadmin : tools?.adminer
    if (installed) {
      await api.invoke('sites:open-url', `http://${tool}.${tld}`)
      return
    }
    const next = await act(`tool-${tool}`, () => api.invoke('tools:install', tool))
    if (next) {
      setTools(next)
      notify({ kind: 'info', text: `${tool === 'phpmyadmin' ? 'phpMyAdmin' : 'Adminer'} is installed. It opens once Apache and PHP are running.` })
    }
  }

  const create = async (engine: Engine): Promise<void> => {
    const name = await ask({ title: `New ${ENGINE_NAME[engine]} database`, label: 'Name (letters, numbers and underscores)', confirm: 'Create' })
    if (!name) return
    const list = await act('db-create', () => api.invoke('db:create', engine, name.trim()))
    if (list) {
      setDbs(list)
      notify({ kind: 'info', text: `Created ${name.trim()}.` })
    }
  }

  const remove = async (d: DatabaseInfo): Promise<void> => {
    const typed = await ask({
      title: `Delete ${d.name}?`,
      label: `This removes ${d.tables} ${d.tables === 1 ? 'table' : 'tables'} and all their data. Type the name to confirm.`,
      confirm: 'Delete database',
      danger: true
    })
    if (typed === null) return
    if (typed.trim() !== d.name) {
      notify({ kind: 'error', text: 'The name did not match, so nothing was deleted.' })
      return
    }
    const list = await act(`db-drop-${d.name}`, () => api.invoke('db:drop', d.engine, d.name))
    if (list) {
      setDbs(list)
      notify({ kind: 'info', text: `Deleted ${d.name}.` })
    }
  }

  const backup = async (d: DatabaseInfo): Promise<void> => {
    const path = await act(`db-export-${d.name}`, () => api.invoke('db:export', d.engine, d.name))
    if (path) notify({ kind: 'info', text: `Backed up ${d.name} to ${path.split('/').slice(-2).join('/')}.` })
  }

  const restore = async (d: DatabaseInfo): Promise<void> => {
    const list = await act(`db-import-${d.name}`, () => api.invoke('db:import', d.engine, d.name))
    if (list) {
      setDbs(list)
      notify({ kind: 'info', text: `Imported into ${d.name}.` })
    }
  }

  return (
    <>
      <PageHead title="Databases" desc="Your databases, the servers they run on, and the tools to manage them.">
        <button className="btn" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> Import a project
        </button>
        <button className="btn btn-primary" disabled={busy.has('tool-phpmyadmin')} onClick={() => openOrInstall('phpmyadmin')}>
          {busy.has('tool-phpmyadmin') ? 'Installing…' : tools?.phpmyadmin ? 'Open phpMyAdmin' : 'Install phpMyAdmin'}
        </button>
      </PageHead>

      <StatStrip
        stats={[
          { label: 'Servers running', value: sqlRunning.length, unit: `of ${engines.length}`, tone: sqlRunning.length ? 'ok' : 'warn' },
          { label: 'Databases', value: (dbs ?? []).length },
          { label: 'Total size', value: (dbs ?? []).reduce((n, d) => n + d.bytes, 0), format: (n) => formatBytes(Math.round(n)) },
          { label: 'Tables', value: (dbs ?? []).reduce((n, d) => n + d.tables, 0), sub: `${(dbs ?? []).reduce((n, d) => n + d.rows, 0).toLocaleString()} rows` }
        ]}
      />
      {sqlRunning.length === 0 && engines.some((x) => x.status !== 'not-installed') && (
        <NextLine
          action="Start it"
          onAction={() => {
            const e = engines.find((x) => x.status === 'stopped' || x.status === 'error')
            if (e) void act(`svc-${e.id}`, () => api.invoke('services:toggle', e.id as never).then(setServices))
          }}
        >
          <strong>No database server is running.</strong> Start MySQL or MariaDB and your databases appear here.
        </NextLine>
      )}
      {sqlRunning.length === 0 ? (
        <div className="group empty-state">
          <strong>Start MySQL or MariaDB to see your databases</strong>
          <span>Turn one on in the list below. Your databases appear here with their size and tables.</span>
        </div>
      ) : (
        sqlRunning.map((engine) => {
          const list = (dbs ?? []).filter((d) => d.engine === engine)
          return (
            <section key={engine}>
              <div className="section-head">
                <h2 className="section-title">{ENGINE_NAME[engine]} databases</h2>
                <button className="btn btn-tonal btn-sm" onClick={() => create(engine)} disabled={busy.has('db-create')}>
                  <Plus size={14} /> New database
                </button>
              </div>
              <div className="group">
                {dbs === null ? (
                  <div className="db-row dim">Loading…</div>
                ) : list.length === 0 ? (
                  <div className="db-row dim">No databases yet. Create one, or import a project with its .sql dump.</div>
                ) : (
                  <>
                    <div className="db-row db-head" aria-hidden>
                      <span>Name</span>
                      <span>Tables</span>
                      <span>Rows</span>
                      <span>Size</span>
                      <span />
                    </div>
                    {list.map((d) => (
                      <div key={d.name}>
                      <div className="db-row">
                        <button className="db-name link-title" title="Browse its tables" onClick={() => setBrowse(browse === `${d.engine}/${d.name}` ? null : `${d.engine}/${d.name}`)}>
                          {d.name}
                        </button>
                        <span className="num">{d.tables}</span>
                        <span className="num">{d.rows.toLocaleString()}</span>
                        <span className="num">
                          {formatBytes(d.bytes)}
                          <div className="db-bar" aria-hidden>
                            <i style={{ width: `${Math.max(3, (d.bytes / Math.max(1, ...list.map((x) => x.bytes))) * 100)}%` }} />
                          </div>
                        </span>
                        <span className="end">
                          <button className="icon-btn" data-tip="Open in phpMyAdmin" aria-label={`Open ${d.name} in phpMyAdmin`} onClick={() => api.invoke('db:open', d.engine, d.name)} disabled={!tools?.phpmyadmin}>
                            <ArrowUpRight />
                          </button>
                          <button className="icon-btn" data-tip="Import a .sql file" aria-label={`Import into ${d.name}`} onClick={() => restore(d)} disabled={busy.has(`db-import-${d.name}`)}>
                            <Upload />
                          </button>
                          <button className="icon-btn" data-tip="Back up" aria-label={`Back up ${d.name}`} onClick={() => backup(d)} disabled={busy.has(`db-export-${d.name}`)}>
                            <Download />
                          </button>
                          <button className="icon-btn" data-tip="Copy connection string" aria-label={`Copy the connection string for ${d.name}`} onClick={() => void api.invoke('clipboard:write', `mysql://root@127.0.0.1:${d.engine === 'mariadb' ? 3307 : 3306}/${d.name}`).then(() => notify({ kind: 'info', text: 'Copied. Add the password if you set one.' }))}>
                            <Copy />
                          </button>
                          <button className="icon-btn danger-text" data-tip="Delete" aria-label={`Delete ${d.name}`} onClick={() => remove(d)}>
                            <Trash2 />
                          </button>
                        </span>
                      </div>
                      {browse === `${d.engine}/${d.name}` && (
                        <div className="db-browse">
                          <DbBrowser engine={d.engine as 'mysql' | 'mariadb'} name={d.name} />
                          <DbExtras db={d} all={dbs ?? []} />
                        </div>
                      )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </section>
          )
        })
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <BackupsFolderButton />
      </div>

      <h2 className="section-title">Servers</h2>
      <div className="group">
        {engines.map((s) => (
          <ServiceRow key={s.id} service={s} withConnection />
        ))}
      </div>

      <h2 className="section-title">Root password</h2>
      <div className="group">
        {(['mysql', 'mariadb'] as Engine[]).map((engine) => {
          const running = sqlRunning.includes(engine)
          return (
            <div key={engine} className="tool-row">
              <span className="tool-main">
                <strong>{ENGINE_NAME[engine]}</strong>
                <small>
                  {pw[engine] ? 'Has a password, kept in your Keychain.' : 'No password: fine on your own Mac, like Laragon.'} phpMyAdmin, Laramac and new projects follow it.
                </small>
              </span>
              <span />
              <button
                className="btn"
                disabled={!running || busy.has(`pw-${engine}`)}
                title={running ? undefined : `Start ${ENGINE_NAME[engine]} first`}
                onClick={async () => {
                  const value = await ask({ title: `${ENGINE_NAME[engine]} root password`, label: 'New password (leave empty to remove it). Projects you already made keep the old one in their .env.', confirm: 'Change password', secret: true })
                  if (value === null) return
                  const r = await act(`pw-${engine}`, () => api.invoke('db:set-root-password', engine, value))
                  if (r) {
                    setPw((x) => ({ ...x, [engine]: r.set }))
                    notify({ kind: 'info', text: r.set ? 'Password changed.' : 'Password removed.' })
                  }
                }}
              >
                {pw[engine] ? 'Change' : 'Set password'}
              </button>
            </div>
          )
        })}
      </div>

      <h2 className="section-title">Tools</h2>
      <div className="group">
        <div className="tool-row">
          <span className="tool-main">
            <strong>phpMyAdmin</strong>
            <small>Browse and edit MySQL and MariaDB. Signs in as root for you.</small>
          </span>
          {tools?.phpmyadmin && <CopyField value={`http://phpmyadmin.${tld}`} />}
          <button className="btn" disabled={busy.has('tool-phpmyadmin')} onClick={() => openOrInstall('phpmyadmin')}>
            {busy.has('tool-phpmyadmin') ? 'Installing…' : tools?.phpmyadmin ? 'Open' : 'Install'}
          </button>
        </div>
        <div className="tool-row">
          <span className="tool-main">
            <strong>Adminer</strong>
            <small>One page for MySQL, MariaDB and PostgreSQL. Sign in as root with your root password, or none.</small>
          </span>
          {tools?.adminer && <CopyField value={`http://adminer.${tld}`} />}
          <button className="btn" disabled={busy.has('tool-adminer')} onClick={() => openOrInstall('adminer')}>
            {busy.has('tool-adminer') ? 'Installing…' : tools?.adminer ? 'Open' : 'Install'}
          </button>
        </div>
      </div>
      <p className="footnote">
        MariaDB runs on port 3307 so it can sit next to MySQL. Backups include tables, data, routines and triggers, and can be imported into any database here.
      </p>
      {askDialog}
    </>
  )
}
