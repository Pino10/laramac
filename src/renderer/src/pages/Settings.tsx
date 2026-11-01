import { useEffect, useState } from 'react'
import { FolderOpen, RotateCcw } from 'lucide-react'
import type { AppSettings, ResetOptions } from '@shared/types'
import { useApp } from '../store'
import { PageHead, Switch } from '../ui'

function SiteNames(): React.JSX.Element | null {
  const { sites, settings, act, busy, setSites, notify } = useApp()
  const api = window.laramac
  const [draft, setDraft] = useState<Record<string, string>>({})
  if (!settings || sites.length === 0) return null
  const save = async (name: string, aliases: string[]): Promise<void> => {
    const next = await act(`alias-${name}`, () => api.invoke('sites:set-config', name, { aliases }))
    if (next) {
      setSites(next)
      setDraft((d) => ({ ...d, [name]: '' }))
    }
  }
  return (
    <>
      <h2 className="section-title">
        Extra names for your sites <small>Any name works, like shop.local or api.shop.test. macOS asks for your password once to add it.</small>
      </h2>
      <div className="panel">
        {sites.map((site) => {
          const own = settings.siteConfig[site.name]?.aliases ?? []
          const value = draft[site.name] ?? ''
          return (
            <div key={site.name} className="row alias-row">
              <div className="row-main">
                <div className="row-title">{site.name}</div>
                <div className="alias-chips">
                  <span className="chip-static">{site.domain}</span>
                  {site.aliases
                    .filter((a) => !own.includes(a))
                    .map((a) => (
                      <span key={a} className="chip-static">
                        {a}
                      </span>
                    ))}
                  {own.map((a) => (
                    <span key={a} className="chip-own">
                      {a}
                      <button aria-label={`Remove ${a}`} onClick={() => save(site.name, own.filter((x) => x !== a))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <form
                className="alias-add"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const v = value.trim()
                  if (!v) return
                  await save(site.name, [...own, v])
                  notify({ kind: 'info', text: `${site.name} now also opens at http://${v.toLowerCase()}` })
                }}
              >
                <input className="input" placeholder="Add a name" value={value} onChange={(e) => setDraft((d) => ({ ...d, [site.name]: e.target.value }))} aria-label={`Extra name for ${site.name}`} />
                <button className="btn btn-tonal btn-sm" disabled={!value.trim() || busy.has(`alias-${site.name}`)}>
                  Add
                </button>
              </form>
            </div>
          )
        })}
      </div>
      <p className="footnote">HTTPS covers your .{settings.tld} addresses. Extra names open over plain http.</p>
    </>
  )
}

export default function Settings(): React.JSX.Element {
  const { settings, updateSettings, tools, appInfo, act, busy, setUpdate, notify } = useApp()
  const api = window.laramac
  const [resetOpen, setResetOpen] = useState(false)
  if (!settings) return <></>
  const other = settings.primaryServer === 'apache' ? 'Nginx' : 'Apache'
  const main = settings.primaryServer === 'apache' ? 'Apache' : 'Nginx'

  return (
    <>
      <PageHead title="Settings" desc="Everything here is saved outside the app, so updates keep it." />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        Sites
      </h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Projects folder</div>
            <div className="row-sub mono">{settings.wwwPath}</div>
          </div>
          <div className="end">
            <button className="btn btn-quiet" onClick={() => api.invoke('www:reveal')}>
              Show
            </button>
            <button
              className="btn"
              onClick={() =>
                act('choose-www', async () => {
                  const next = await api.invoke('settings:choose-www')
                  if (next) notify({ kind: 'info', text: `Projects folder is now ${next.wwwPath}` })
                })
              }
            >
              <FolderOpen size={14} /> Change
            </button>
          </div>
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Domain suffix</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {tools?.dnsReady ? 'Sites open at name.suffix.' : 'After changing it, turn on addresses again from the Overview.'} Only reserved names are offered, so
              real websites are never affected.
            </div>
          </div>
          <select className="input" aria-label="Domain suffix" value={settings.tld} onChange={(e) => updateSettings({ tld: e.target.value })}>
            {['test', 'internal', 'lan', 'example'].map((t) => (
              <option key={t} value={t}>
                .{t}
              </option>
            ))}
          </select>
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Open to other devices</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Lets phones and computers on your network open your sites. Off keeps everything on this Mac.
            </div>
          </div>
          <Switch on={settings.allowLan} label="Open to other devices" onChange={() => updateSettings({ allowLan: !settings.allowLan })} />
        </div>
      </div>

      <h2 className="section-title">Addresses</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Projects at localhost/folder</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Every project also opens at http://localhost/name and http://127.0.0.1/name, the way Laragon and XAMPP do.
            </div>
          </div>
          <Switch on={settings.hostLocalhostFolders} label="Projects at localhost/folder" onChange={() => updateSettings({ hostLocalhostFolders: !settings.hostLocalhostFolders })} />
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">name.localhost addresses</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Every site also answers at http://name.localhost. Browsers know these without any setup.
            </div>
          </div>
          <Switch on={settings.hostDotLocalhost} label="name.localhost addresses" onChange={() => updateSettings({ hostDotLocalhost: !settings.hostDotLocalhost })} />
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Database host names</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Projects can connect to MySQL with localhost, 127.0.0.1 or localhost:3306, and nothing in their config needs changing. MariaDB is on
              127.0.0.1:3307.
            </div>
          </div>
          <span className="tag tag-ok">Always on</span>
        </div>
      </div>
      <SiteNames />

      <h2 className="section-title">Web servers</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Main web server</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Serves your sites at their normal addresses. {other} can run beside it on its own ports.
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Main web server">
            {(['apache', 'nginx'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={settings.primaryServer === s} onClick={() => updateSettings({ primaryServer: s })}>
                {s === 'apache' ? 'Apache' : 'Nginx'}
              </button>
            ))}
          </div>
        </div>
        <NumberRow label={`${main} HTTP port`} value={settings.httpPort} onSave={(v) => updateSettings({ httpPort: v })} />
        <NumberRow label={`${main} HTTPS port`} value={settings.httpsPort} onSave={(v) => updateSettings({ httpsPort: v })} />
        <NumberRow label={`${other} HTTP port`} value={settings.secondaryHttpPort} onSave={(v) => updateSettings({ secondaryHttpPort: v })} />
        <NumberRow label={`${other} HTTPS port`} value={settings.secondaryHttpsPort} onSave={(v) => updateSettings({ secondaryHttpsPort: v })} />
      </div>

      <h2 className="section-title">Downloads</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">PHP build</div>
            <div className="row-sub">Full adds intl, gd, pgsql, redis, soap and more. Applies to new installs.</div>
          </div>
          <select
            className="input"
            aria-label="PHP build"
            value={settings.phpFlavor}
            onChange={(e) => updateSettings({ phpFlavor: e.target.value as AppSettings['phpFlavor'] })}
          >
            <option value="full">Full</option>
            <option value="light">Lightweight</option>
          </select>
        </div>
        <TextRow label="MySQL version" hint="latest picks the newest build for your Mac, or pin one such as 8.4.11." value={settings.mysqlVersion} onSave={(v) => updateSettings({ mysqlVersion: v })} />
        <TextRow label="PostgreSQL version" hint="latest, or a major version such as 17." value={settings.postgresMajor} onSave={(v) => updateSettings({ postgresMajor: v })} />
      </div>

      <h2 className="section-title">Connections</h2>
      <div className="panel">
        <TextRow label="ngrok authtoken" hint="Only needed when sharing with ngrok." value={settings.ngrokToken} secret wide onSave={(v) => updateSettings({ ngrokToken: v })} />
        <TextRow
          label="Local model address"
          hint="Any OpenAI-compatible server, such as Ollama, LM Studio or vMLX."
          value={settings.llm.baseUrl}
          wide
          onSave={(v) => updateSettings({ llm: { ...settings.llm, baseUrl: v } })}
        />
      </div>

      <h2 className="section-title">Appearance and alerts</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Notifications</div>
            <div className="row-sub">Tell me when installs finish, updates arrive, links are shared, or a service stops on its own.</div>
          </div>
          <Switch on={settings.notifications} label="Notifications" onChange={() => updateSettings({ notifications: !settings.notifications })} />
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Glass style</div>
            <div className="row-sub">Smoked is dark, tinted glass everywhere. Frosted is light glass that follows your Mac's light and dark mode.</div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Glass style">
            {(
              [
                ['smoke', 'Smoked'],
                ['frost', 'Frosted']
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={(settings.glassStyle ?? 'smoke') === id} onClick={() => updateSettings({ glassStyle: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Liquid Glass</div>
            <div className="row-sub">Native glass on macOS 26 and later, following your system transparency slider. Restart to apply.</div>
          </div>
          <Switch on={settings.glass} label="Liquid Glass" onChange={() => updateSettings({ glass: !settings.glass })} />
        </div>
      </div>

      <h2 className="section-title">Updates</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Laramac {appInfo?.version}</div>
            <div className="row-sub">Updates replace only the app. Settings, PHP versions, databases and sites are kept.</div>
          </div>
          <button
            className="btn"
            disabled={busy.has('check-update')}
            onClick={async () => {
              const info = await act('check-update', () => api.invoke('app:check-update'))
              setUpdate(info ?? null)
              if (info === null) notify({ kind: 'info', text: `Laramac ${appInfo?.version} is the newest version.` })
            }}
          >
            {busy.has('check-update') ? 'Checking' : 'Check now'}
          </button>
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Check automatically</div>
            <div className="row-sub">Looks for new Laramac and PHP releases at launch and every few hours.</div>
          </div>
          <Switch on={settings.autoUpdateCheck} label="Check for updates automatically" onChange={() => updateSettings({ autoUpdateCheck: !settings.autoUpdateCheck })} />
        </div>
      </div>

      <h2 className="section-title">Start over</h2>
      <div className="panel danger">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Reset Laramac</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              Clear settings, downloads, databases or system changes without uninstalling. Your projects folder is never touched.
            </div>
          </div>
          <button className="btn" style={{ color: 'var(--bad)' }} onClick={() => setResetOpen(true)}>
            <RotateCcw size={14} /> Reset…
          </button>
        </div>
      </div>

      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} />}
    </>
  )
}

function ResetDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const [o, setO] = useState<ResetOptions>({ settings: true, software: false, data: false, system: false })
  const [typed, setTyped] = useState('')
  const items: { key: keyof ResetOptions; title: string; hint: string }[] = [
    { key: 'settings', title: 'Settings', hint: 'Preferences, per-site PHP and HTTPS choices, saved servers.' },
    { key: 'software', title: 'Downloaded software', hint: 'PHP versions, MySQL, PostgreSQL, MongoDB, Mailpit, phpMyAdmin and tools. Download them again any time.' },
    { key: 'data', title: 'All database contents', hint: 'Every database in MySQL, MariaDB, PostgreSQL, Redis and MongoDB. This cannot be undone.' },
    { key: 'system', title: 'System changes', hint: 'The .test address setup and the trusted local certificate. macOS asks for your password.' }
  ]
  const destructive = o.data
  const ready = Object.values(o).some(Boolean) && (!destructive || typed === 'reset')

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18 }}>
          Reset Laramac
        </h2>
        <p className="page-desc" style={{ margin: '4px 0 12px' }}>
          Choose what to clear. Laramac stops everything, clears it, and restarts. Your projects folder stays as it is.
        </p>
        {items.map((it) => (
          <label key={it.key} className="check">
            <input type="checkbox" checked={o[it.key]} onChange={(e) => setO((x) => ({ ...x, [it.key]: e.target.checked }))} />
            <span>
              {it.title}
              <span className="hint" style={{ display: 'block' }}>
                {it.hint}
              </span>
            </span>
          </label>
        ))}
        {destructive && (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="reset-confirm">
              Type <code>reset</code> to delete all database contents
            </label>
            <input id="reset-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <div className="end" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={!ready || busy.has('reset')} onClick={() => act('reset', () => window.laramac.invoke('app:reset', o))}>
            {busy.has('reset') ? 'Resetting' : 'Reset and restart'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TextRow({
  label,
  hint,
  value,
  onSave,
  secret,
  wide
}: {
  label: string
  hint: string
  value: string
  onSave: (v: string) => void
  secret?: boolean
  wide?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = (): void => {
    if (draft.trim() !== value) onSave(draft.trim())
  }
  return (
    <div className="row row-set">
      <div className="row-main">
        <div className="row-title">{label}</div>
        <div className="row-sub">{hint}</div>
      </div>
      <input
        className="input"
        style={{ width: wide ? 300 : 150 }}
        aria-label={label}
        type={secret ? 'password' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}

function NumberRow({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  const commit = (): void => {
    const n = parseInt(draft, 10)
    if (n > 0 && n < 65536 && n !== value) onSave(n)
    else setDraft(String(value))
  }
  return (
    <div className="row row-set" style={{ minHeight: 48 }}>
      <div className="row-title">{label}</div>
      <input
        className="input num"
        style={{ width: 86 }}
        aria-label={label}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}
