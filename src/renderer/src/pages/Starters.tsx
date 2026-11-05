import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, Download, GitCommitHorizontal, Play, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import type { RuntimeId, RuntimeInfo, StarterReadiness } from '@shared/types'
import { CATEGORIES, STARTERS, starterContext, type Starter, type StarterCategory } from '@shared/starters'
import { useApp } from '../store'
import { PageHead } from '../ui'

const RUNTIME_NAME: Record<RuntimeId, string> = { node: 'Node.js', bun: 'Bun', python: 'Python', dotnet: '.NET', go: 'Go', rust: 'Rust', swift: 'Swift', php: 'PHP' }

/** Whole apps, not just frameworks: a starter with the right choices already made. */
const RECIPES: { id: string; title: string; text: string; starter: string; options: Record<string, string>; color: string }[] = [
  { id: 'saas', title: 'SaaS app', text: 'Next.js, TypeScript, Tailwind and Supabase for sign-in and data.', starter: 'nextjs', options: { lang: 'ts', tailwind: 'yes', data: 'supabase' }, color: '#7c3aed' },
  { id: 'admin', title: 'App with an admin panel', text: 'Laravel with React and the Filament admin, on MySQL.', starter: 'laravel', options: { kit: 'react', admin: 'filament', db: 'mysql' }, color: '#ef4444' },
  { id: 'realtime', title: 'Real-time app', text: 'React and Vite with Firebase Auth and Firestore emulators.', starter: 'react', options: { lang: 'ts', data: 'firebase' }, color: '#f59e0b' },
  { id: 'blog', title: 'Blog or docs', text: 'Astro’s blog template, fast and simple to host.', starter: 'astro', options: { template: 'blog' }, color: '#22c55e' },
  { id: 'api', title: 'API with a database', text: 'NestJS on PostgreSQL, ready for routes and tests.', starter: 'nestjs', options: { data: 'pgsql' }, color: '#0ea5e9' }
]

function Mark({ s, size = 44 }: { s: Starter; size?: number }): React.JSX.Element {
  return (
    <span className="st-mark" style={{ width: size, height: size, background: s.color, fontSize: size * 0.36 }} aria-hidden>
      {s.mark}
    </span>
  )
}

export default function Starters(): React.JSX.Element {
  const { pendingStarter, setPendingStarter, setPage } = useApp()
  const api = window.laramac
  const [cat, setCat] = useState<StarterCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([])
  const [versions, setVersions] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Starter | null>(null)
  const [preset, setPreset] = useState<Record<string, string> | undefined>(undefined)
  const { setImportOpen } = useApp()

  useEffect(() => {
    void api.invoke('runtimes:list').then(setRuntimes)
    void api.invoke('starters:versions').then(setVersions).catch(() => undefined)
  }, [api])

  useEffect(() => {
    if (!pendingStarter) return
    const s = STARTERS.find((x) => x.id === pendingStarter)
    if (s) setPicked(s)
    setPendingStarter(null)
  }, [pendingStarter, setPendingStarter])

  const has = (id: RuntimeId): boolean => runtimes.find((r) => r.id === id)?.installed ?? false
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return STARTERS.filter((s) => (cat === 'all' || s.category === cat) && (!q || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q)))
  }, [cat, query])

  return (
    <>
      <PageHead title="New project" desc="Start a project with each framework's own official setup tool, so you always get the newest version. Laramac installs what it needs, sets up the database and gives it a .test address.">
        <button className="btn" onClick={() => setPage('languages')}>
          Languages
        </button>
      </PageHead>

          <div className="recipes">
            {RECIPES.map((r) => {
              const s = STARTERS.find((x) => x.id === r.starter)
              if (!s) return null
              return (
                <button
                  key={r.id}
                  className="recipe glass"
                  style={{ ['--rc' as string]: r.color }}
                  onClick={() => {
                    setPreset(r.options)
                    setPicked(s)
                  }}
                >
                  <strong>{r.title}</strong>
                  <span>{r.text}</span>
                </button>
              )
            })}
            <button className="recipe glass" style={{ ['--rc' as string]: '#64748b' }} onClick={() => setImportOpen(true)}>
              <strong>From a Git repository</strong>
              <span>Clone a project from GitHub or any Git address, and set it up.</span>
            </button>
          </div>
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

      {picked && (
        <CreateDialog
          starter={picked}
          runtimes={runtimes}
          versions={versions}
          preset={preset}
          onClose={() => {
            setPicked(null)
            setPreset(undefined)
          }}
        />
      )}
    </>
  )
}

/** Everything Laramac will set up first, so the new project opens straight away. */
function Prep({ ready, web, data, db }: { ready: StarterReadiness; web: 'apache' | 'nginx'; data?: string; db?: string }): React.JSX.Element | null {
  const b = ready.backends
  const items: string[] = []
  if (ready.web.installed.length === 0) items.push(`Installs and starts ${web === 'apache' ? 'Apache' : 'Nginx'}`)
  else if (!ready.web.running) items.push(`Starts ${ready.web.installed[0] === 'apache' ? 'Apache' : 'Nginx'}`)
  if (!ready.dns) items.push('Sets up .test addresses (your Mac asks for your password once)')
  if ((data === 'mysql' || db === 'mysql') && !ready.mysql) items.push('Installs MySQL')
  if ((data === 'pgsql' || db === 'pgsql') && !ready.postgres) items.push('Installs PostgreSQL')
  if (data === 'supabase') {
    if (!b.supabaseCli) items.push('Installs the Supabase CLI')
    if (!b.docker) items.push(b.dockerApp ? `Starts ${b.dockerApp} for Supabase's containers` : 'Installs Colima, a free container runtime, for Supabase')
    items.push('Starts Supabase on this Mac and writes its keys to .env (the first start downloads a few GB)')
  }
  if (data === 'firebase') {
    if (!b.java) items.push('Installs Java for the Firebase emulators')
    items.push('Sets up the Firebase emulators (Auth, Firestore, Storage) with a demo project, and writes .env')
  }
  if (!items.length) return null
  const needsBrew = !b.homebrew && (ready.web.installed.length === 0 || data === 'supabase' || data === 'firebase')
  return (
    <>
      <div style={{ marginTop: 6 }}>First, it gets this Mac ready:</div>
      <ul className="st-prep">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {needsBrew && (
        <div className="hint" style={{ color: 'var(--bad)' }}>
          This needs Homebrew. Install it from brew.sh first, then come back.
        </div>
      )}
    </>
  )
}

function CreateDialog({ starter, runtimes, versions, preset, onClose }: { starter: Starter; runtimes: RuntimeInfo[]; versions: Record<string, string>; preset?: Record<string, string>; onClose: () => void }): React.JSX.Element {
  const { act, busy, settings, setSites, setPage } = useApp()
  const [name, setName] = useState('')
  const [opts, setOpts] = useState<Record<string, string>>(() => ({ ...Object.fromEntries((starter.options ?? []).map((o) => [o.id, o.default])), ...Object.fromEntries(Object.entries(preset ?? {}).filter(([k, v]) => starter.options?.some((o) => o.id === k && o.choices.some((c) => c.id === v)))) }))
  const [start, setStart] = useState(true)
  const [git, setGit] = useState(true)
  const [web, setWeb] = useState<'apache' | 'nginx'>('apache')
  const [ready, setReady] = useState<StarterReadiness | null>(null)
  useEffect(() => {
    void window.laramac.invoke('starters:readiness').then(setReady).catch(() => undefined)
  }, [])
  const working = busy.has('starter-create')
  const ctx = starterContext(name.trim() || 'my-app', settings?.tld ?? 'test')
  const dev = starter.dev?.(opts)
  const missing = starter.runtimes.filter((r) => !runtimes.find((x) => x.id === r)?.installed)
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,60}$/.test(name.trim())

  const create = async (): Promise<void> => {
    const sites = await act('starter-create', () => window.laramac.invoke('starters:create', { starter: starter.id, name: name.trim(), options: opts, start, git, web }))
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

        {ready && ready.web.installed.length === 0 && (
          <div className="field">
            <label>Web server</label>
            <div className="seg" role="radiogroup" aria-label="Web server">
              {(['apache', 'nginx'] as const).map((w) => (
                <button key={w} role="radio" aria-checked={web === w} onClick={() => setWeb(w)}>
                  {w === 'apache' ? 'Apache' : 'Nginx'}
                </button>
              ))}
            </div>
            <span className="hint">You have no web server yet. Laramac installs this one and starts it, so {ctx.domain} opens.</span>
          </div>
        )}

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
            {ready && <Prep ready={ready} web={web} data={opts.data} db={opts.db} />}
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
