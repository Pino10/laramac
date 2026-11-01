import { Database, Upload } from 'lucide-react'
import { useApp } from '../store'
import { CopyField, Lamp, Monogram, PageHead, Switch, statusText } from '../ui'

export default function Databases(): React.JSX.Element {
  const { services, tools, settings, act, busy, setTools, setServices, setImportOpen, notify } = useApp()
  const api = window.laramac
  const dbs = services.filter((s) => s.group === 'database')
  const tld = settings?.tld ?? 'test'

  const openOrInstall = async (tool: 'phpmyadmin' | 'adminer'): Promise<void> => {
    const installed = tool === 'phpmyadmin' ? tools?.phpmyadmin : tools?.adminer
    if (installed) {
      await api.invoke('sites:open-url', `http://${tool}.${tld}`)
      return
    }
    const next = await act(`tool-${tool}`, () => api.invoke('tools:install', tool))
    if (next) {
      setTools(next)
      notify({ kind: 'info', text: `${tool === 'phpmyadmin' ? 'phpMyAdmin' : 'Adminer'} is installed. It opens once Nginx and PHP are running.` })
    }
  }

  return (
    <>
      <PageHead title="Databases" desc="Run any mix of engines side by side. Each has its own port and none needs a password on this Mac.">
        <button className="btn" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> Import a dump
        </button>
      </PageHead>

      <button className="feature" style={{ width: '100%', textAlign: 'left', marginBottom: 12 }} onClick={() => openOrInstall('phpmyadmin')} disabled={busy.has('tool-phpmyadmin')}>
        <span className="tile-icon" style={{ background: 'var(--accent)', color: '#fff', width: 40, height: 40, borderRadius: 12 }}>
          <Database size={18} />
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>phpMyAdmin</span>
          <span className="row-sub">
            {tools?.phpmyadmin
              ? `Browse MySQL and MariaDB at phpmyadmin.${tld}. Signs in as root for you.`
              : 'Install it in one click. Works with MySQL and MariaDB, signs in for you.'}
          </span>
        </span>
        <span className="btn" style={{ background: 'transparent', color: 'inherit', borderColor: 'color-mix(in srgb, currentColor 30%, transparent)' }}>
          {busy.has('tool-phpmyadmin') ? 'Installing' : tools?.phpmyadmin ? 'Open' : 'Install'}
        </span>
      </button>

      <div className="grid-2">
        {dbs.map((s) => {
          const installing = busy.has(`install-${s.id}`)
          return (
            <div key={s.id} className="card glass">
              <div className="card-head">
                <Monogram id={s.id} large />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">
                    {s.name}
                    {s.version && <span className="tag">{s.version}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lamp status={s.status} />
                    <span className="status" data-s={s.status}>
                      {statusText[s.status]}
                    </span>
                    <span className="hint">· port {s.port}</span>
                  </div>
                </div>
                {s.status === 'not-installed' ? (
                  <button
                    className="btn"
                    disabled={installing}
                    onClick={() =>
                      act(`install-${s.id}`, async () => {
                        await api.invoke('services:install', s.id)
                        setServices(await api.invoke('services:list'))
                      })
                    }
                  >
                    {installing ? 'Installing' : 'Install'}
                  </button>
                ) : (
                  <Switch
                    on={s.status === 'running' || s.status === 'starting'}
                    disabled={s.status === 'starting'}
                    label={`${s.name} on or off`}
                    onChange={() => act(`toggle-${s.id}`, () => api.invoke('services:toggle', s.id).then(setServices))}
                  />
                )}
              </div>
              <div className="hint">{s.description}</div>
              {s.connection && <CopyField value={s.connection} />}
              {s.status === 'error' && s.error && <div className="errbox" style={{ gridColumn: 'auto' }}>{s.error}</div>}
            </div>
          )
        })}

        <div className="card glass">
          <div className="card-head">
            <span className="mono-tile lg" style={{ ['--hue' as string]: '#34567a' }} aria-hidden>
              Ad
            </span>
            <div style={{ flex: 1 }}>
              <div className="card-title">Adminer</div>
              <div className="hint">One page for MySQL, MariaDB and PostgreSQL. Leave the password empty.</div>
            </div>
            <button className="btn" disabled={busy.has('tool-adminer')} onClick={() => openOrInstall('adminer')}>
              {busy.has('tool-adminer') ? 'Installing' : tools?.adminer ? 'Open' : 'Install'}
            </button>
          </div>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 14, maxWidth: '76ch' }}>
        MariaDB uses port 3307 so it can run next to MySQL. PostgreSQL ships without psql, so use Adminer or your own client. For Redis and
        MongoDB, Redis Insight and MongoDB Compass connect with the addresses above.
      </p>
    </>
  )
}
