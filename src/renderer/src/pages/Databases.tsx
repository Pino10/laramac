import { useApp } from '../store'
import { PageHead } from '../ui'
import ServiceRow from '../components/ServiceRow'

type Tool = 'phpmyadmin' | 'adminer'

export default function Databases(): React.JSX.Element {
  const { services, tools, settings, act, busy, setTools } = useApp()
  const api = window.laramac
  const dbs = services.filter((s) => s.group === 'database')
  const tld = settings?.tld ?? 'test'

  const admin: { id: Tool; name: string; hint: string; installed: boolean }[] = [
    {
      id: 'phpmyadmin',
      name: 'phpMyAdmin',
      hint: 'MySQL and MariaDB. Signs in as root automatically.',
      installed: !!tools?.phpmyadmin
    },
    {
      id: 'adminer',
      name: 'Adminer',
      hint: 'MySQL, MariaDB and PostgreSQL in one page. Leave the password empty.',
      installed: !!tools?.adminer
    }
  ]

  return (
    <>
      <PageHead
        title="Databases"
        desc="Run as many engines as you like side by side. Each has its own port, and none needs a password."
      />

      <div className="panel">
        {dbs.map((s) => (
          <ServiceRow key={s.id} service={s} withConnection />
        ))}
      </div>
      <p className="row-sub" style={{ marginTop: 8, whiteSpace: 'normal' }}>
        MariaDB uses port 3307 so it can run next to MySQL. PostgreSQL has no psql command here, so use Adminer or your own client.
      </p>

      <h2 className="section-title">Admin tools</h2>
      <div className="panel">
        {admin.map((t) => (
          <div key={t.id} className="row row-set">
            <div className="row-main">
              <div className="row-title">{t.name}</div>
              <div className="row-sub">{t.hint}</div>
            </div>
            <div className="end no-drag">
              {t.installed ? (
                <button
                  className="btn btn-primary"
                  onClick={() => api.invoke('sites:open-url', `http://${t.id === 'adminer' ? 'adminer' : 'phpmyadmin'}.${tld}`)}
                >
                  Open
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={busy.has(`tool-${t.id}`)}
                  onClick={() => act(`tool-${t.id}`, () => api.invoke('tools:install', t.id).then(setTools))}
                >
                  {busy.has(`tool-${t.id}`) ? 'Installing' : 'Install'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="row-sub" style={{ marginTop: 8, whiteSpace: 'normal' }}>
        Admin tools need Nginx, PHP and a database running. Redis and MongoDB have their own clients, such as Redis Insight or MongoDB Compass.
      </p>
    </>
  )
}
