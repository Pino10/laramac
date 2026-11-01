import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, Download, GitCommitHorizontal, Play, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import type { RuntimeId, RuntimeInfo } from '@shared/types'
import { CATEGORIES, STARTERS, starterContext, type Starter, type StarterCategory } from '@shared/starters'
import { useApp } from '../store'
import { PageHead } from '../ui'

const RUNTIME_NAME: Record<RuntimeId, string> = { node: 'Node.js', bun: 'Bun', python: 'Python', dotnet: '.NET', go: 'Go', rust: 'Rust', swift: 'Swift', php: 'PHP' }

function Mark({ s, size = 44 }: { s: Starter; size?: number }): React.JSX.Element {
  return (
    <span className="st-mark" style={{ width: size, height: size, background: s.color, fontSize: size * 0.36 }} aria-hidden>
      {s.mark}
    </span>
  )
}

export default function Starters(): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [tab, setTab] = useState<'starters' | 'runtimes'>('starters')
  const [cat, setCat] = useState<StarterCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([])
  const [latest, setLatest] = useState<Partial<Record<RuntimeId, string>>>({})
  const [versions, setVersions] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Starter | null>(null)

  useEffect(() => {
    void api.invoke('runtimes:list').then(setRuntimes)
    void api.invoke('starters:versions').then(setVersions).catch(() => undefined)
    void api.invoke('runtimes:latest').then(setLatest).catch(() => undefined)
  }, [api])

  const has = (id: RuntimeId): boolean => runtimes.find((r) => r.id === id)?.installed ?? false
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return STARTERS.filter((s) => (cat === 'all' || s.category === cat) && (!q || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)))
  }, [cat, query])

  return (
    <>
      <PageHead title="Starters" desc="Start a project with each framework's own official setup tool, so you always get the newest version. Laramac installs what it needs, sets up the database and gives it a .test address.">
        <div className="seg-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'starters'} onClick={() => setTab('starters')}>
            Starters
          </button>
          <button role="tab" aria-selected={tab === 'runtimes'} onClick={() => setTab('runtimes')}>
            Languages
          </button>
        </div>
      </PageHead>

      {tab === 'starters' ? (
        <>
          <div className="st-filters">
            <label className="searchbox">
              <Search size={15} />
              <input placeholder="Search starters" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search starters" />
            </label>
            <div className="seg st-cats" role="radiogroup" aria-label="Category">
              <button role="radio" aria-checked={cat === 'all'} onClick={() => setCat('all')}>
                All
              </button>
              {CATEGORIES.map((c) => (
                <button key={c.id} role="radio" aria-checked={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="st-grid">
            {shown.map((s) => (
              <button key={s.id} className="st-card glass" onClick={() => setPicked(s)}>
                <div className="st-card-head">
                  <Mark s={s} />
                  <div className="st-card-title">
                    <strong>{s.name}</strong>
                    <span className="hint">{versions[s.id] ? `Latest ${versions[s.id]}` : CATEGORIES.find((c) => c.id === s.category)?.label}</span>
                  </div>
                </div>
                <p>{s.description}</p>
                <div className="st-needs">
                  {s.runtimes.map((r) => (
                    <span key={r} className="st-need" data-ok={has(r)}>
                      {has(r) && <Check size={11} />}
                      {RUNTIME_NAME[r]}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {shown.length === 0 && <div className="empty dim">No starter matches “{query}”.</div>}
          </div>
        </>
      ) : (
        <div className="panel">
          {runtimes.map((r) => {
            const newer = latest[r.id] && r.version && r.managed && r.id !== 'php' && latest[r.id] !== r.version && r.id !== 'python'
            return (
              <div key={r.id} className="rt-row">
                <div className="row-main">
                  <div className="row-title">
                    {r.name}
                    {r.installed && <span className="tag">{r.managed ? 'Laramac' : 'This Mac'}</span>}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                    {r.description}
                  </div>
                </div>
                <div className="rt-version">
                  {r.installed ? <strong>{r.version}</strong> : <span className="hint">Not installed</span>}
                  {latest[r.id] && <span className="hint">Latest {latest[r.id]}</span>}
                </div>
                {r.id === 'php' ? (
                  <span className="hint" style={{ width: 120, textAlign: 'right' }}>
                    On the PHP page
                  </span>
                ) : !r.installed || newer ? (
                  <button
                    className={r.installed ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                    style={{ width: 120 }}
                    disabled={busy.has(`rt-${r.id}`) || !r.canInstall}
                    onClick={() => act(`rt-${r.id}`, () => api.invoke('runtimes:install', r.id).then(setRuntimes))}
                  >
                    {r.installed ? <RefreshCw size={13} /> : <Download size={13} />}
                    {busy.has(`rt-${r.id}`) ? 'Installing' : r.installed ? 'Update' : 'Install'}
                  </button>
                ) : (
                  <span className="st-ready">
                    <Check size={14} /> Ready
                  </span>
                )}
              </div>
            )
          })}
          <div className="hint" style={{ padding: '12px 18px' }}>
            Laramac keeps its own copies in its folder, so nothing else on your Mac changes. Copies you installed yourself (with Homebrew, say) are used when present.
          </div>
        </div>
      )}

      {picked && <CreateDialog starter={picked} runtimes={runtimes} versions={versions} onClose={() => setPicked(null)} />}
    </>
  )
}

function CreateDialog({ starter, runtimes, versions, onClose }: { starter: Starter; runtimes: RuntimeInfo[]; versions: Record<string, string>; onClose: () => void }): React.JSX.Element {
  const { act, busy, settings, setSites, setPage } = useApp()
  const [name, setName] = useState('')
  const [opts, setOpts] = useState<Record<string, string>>(() => Object.fromEntries((starter.options ?? []).map((o) => [o.id, o.default])))
  const [start, setStart] = useState(true)
  const [git, setGit] = useState(true)
  const working = busy.has('starter-create')
  const ctx = starterContext(name.trim() || 'my-app', settings?.tld ?? 'test')
  const dev = starter.dev?.(opts)
  const missing = starter.runtimes.filter((r) => !runtimes.find((x) => x.id === r)?.installed)
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,60}$/.test(name.trim())

  const create = async (): Promise<void> => {
    const sites = await act('starter-create', () => window.laramac.invoke('starters:create', { starter: starter.id, name: name.trim(), options: opts, start, git }))
    if (sites) {
      setSites(sites)
      onClose()
      setPage('sites')
    }
  }

  return (
    <div className="scrim" onMouseDown={() => !working && onClose()}>
      <div className="dialog glass snap-dialog st-dialog" role="dialog" aria-label={`New ${starter.name} project`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Mark s={starter} size={48} />
            <div>
              <h2 className="page-title">New {starter.name} project</h2>
              <p className="page-desc" style={{ marginTop: 2 }}>
                {versions[starter.id] ? `Uses the newest release, ${versions[starter.id]}. ` : ''}
                <a className="link" href={starter.docs} target="_blank" rel="noreferrer">
                  Docs <ArrowUpRight size={12} />
                </a>
              </p>
            </div>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose} disabled={working}>
            <X />
          </button>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="st-name">Folder name</label>
          <input
            id="st-name"
            className="input"
            autoFocus
            placeholder="my-app"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && !working && void create()}
          />
          <span className="hint">
            In your www folder, opens at {ctx.domain}
            {dev && !dev.proxy && starter.runtimes.includes('php') ? ' with Vite running beside it' : ''}
          </span>
        </div>

        {(starter.options ?? []).map((o) => (
          <div key={o.id} className="field">
            <label>{o.label}</label>
            <div className="seg" role="radiogroup" aria-label={o.label} style={{ flexWrap: 'wrap' }}>
              {o.choices.map((c) => (
                <button key={c.id} role="radio" aria-checked={opts[o.id] === c.id} onClick={() => setOpts({ ...opts, [o.id]: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="st-toggles">
          {dev && (
            <label className="check-row">
              <input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} />
              <Play size={14} /> Start the dev server when it is ready
            </label>
          )}
          <label className="check-row">
            <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} />
            <GitCommitHorizontal size={14} /> Make the first Git commit
          </label>
        </div>

        <div className="st-plan">
          <Sparkles size={14} />
          <div>
            {missing.length > 0 && <div>Installs {missing.map((m) => RUNTIME_NAME[m]).join(' and ')} first.</div>}
            <div>Runs the official setup tool{starter.steps(ctx, opts).some((s) => 'database' in s) ? ', creates the database' : ''}{dev?.proxy ? ' and gives it its own dev server' : ''}.</div>
            {starter.note && <div className="hint">{starter.note}</div>}
          </div>
        </div>

        <div className="end" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid || working} onClick={create}>
            {working ? 'Creating… this can take a few minutes' : `Create ${starter.name} project`}
          </button>
        </div>
      </div>
    </div>
  )
}
