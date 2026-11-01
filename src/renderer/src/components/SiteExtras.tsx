import { useEffect, useMemo, useRef, useState } from 'react'
import { Code, ExternalLink, FileCog, MoreHorizontal, RefreshCw, ScrollText, Search, Stethoscope, Terminal, X } from 'lucide-react'
import type { ProjectFile, ProjectPlan, SiteInfo, SiteLogSource } from '@shared/types'
import { useApp } from '../store'
import { Monogram } from '../ui'

/** The ⋯ menu on each site: logs, the project file and the site doctor. */
export function SiteMenu({ site, onLogs, onProject, onDoctor }: { site: SiteInfo; onLogs: () => void; onProject: () => void; onDoctor: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { act, notify } = useApp()
  const item = (label: string, icon: React.ReactNode, fn: () => void): React.JSX.Element => (
    <button
      className="menu-item"
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      {icon} {label}
    </button>
  )
  return (
    <span className="menu-wrap">
      <button className="icon-btn" data-tip="More" aria-label={`More for ${site.name}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal />
      </button>
      {open && (
        <>
          <span className="menu-catch" onClick={() => setOpen(false)} />
          <span className="menu glass" style={{ minWidth: 240 }}>
            {item('View logs', <ScrollText size={14} />, onLogs)}
            {item('Explain errors with AI', <Stethoscope size={14} />, onDoctor)}
            {site.projectFile
              ? item(site.projectFile === 'new' ? 'Set up from laramac.yml' : 'laramac.yml (applied)', <FileCog size={14} />, onProject)
              : item('Save laramac.yml for the team', <FileCog size={14} />, async () => {
                  const p = await act(`proj-${site.name}`, () => window.laramac.invoke('project:export', site.name))
                  if (p) notify({ kind: 'info', text: 'Saved laramac.yml in the project. Commit it so others get the same setup.' })
                })}
          </span>
        </>
      )}
    </span>
  )
}

const LEVEL = /\b(EMERGENCY|ALERT|CRITICAL|ERROR|FATAL|Fatal error|error|WARNING|Warning|warn|NOTICE|INFO|DEBUG)\b/

function levelOf(line: string): string {
  const m = LEVEL.exec(line)?.[1]?.toLowerCase() ?? ''
  if (/emergency|alert|critical|fatal|error/.test(m)) return 'error'
  if (/warn/.test(m)) return 'warn'
  if (/notice|info/.test(m)) return 'info'
  if (m === 'debug') return 'debug'
  return ''
}

/** Live view of a site's logs, newest at the bottom, with level filter and search. */
export function SiteLogs({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const [sources, setSources] = useState<SiteLogSource[]>([])
  const [sel, setSel] = useState(0)
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<'all' | 'error' | 'warn'>('all')
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.laramac.invoke('sites:logs', site.name).then((s) => alive && setSources(s))
    }
    load()
    const t = setInterval(load, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [site.name])
  const cur = sources[Math.min(sel, Math.max(0, sources.length - 1))]
  const lines = useMemo(() => {
    const all = (cur?.text ?? '').split('\n')
    const q = query.trim().toLowerCase()
    return all.filter((l) => (!q || l.toLowerCase().includes(q)) && (only === 'all' || levelOf(l) === only || (only === 'warn' && levelOf(l) === 'error')))
  }, [cur, query, only])
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines, follow])
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog logs-dialog" role="dialog" aria-label={`Logs of ${site.name}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Logs of {site.name}</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Updates every two seconds. Shared logs show only the lines about this site.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {sources.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <strong>No logs yet</strong>
            <span>When the site writes a log or hits an error, it shows here.</span>
          </div>
        ) : (
          <>
            <div className="logs-bar">
              <div className="seg" role="tablist" aria-label="Log">
                {sources.map((s, i) => (
                  <button key={s.path} role="tab" aria-selected={i === sel} aria-checked={i === sel} onClick={() => setSel(i)} title={s.path}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="logs-bar">
              <label className="searchbox" style={{ flex: 1 }}>
                <Search size={14} />
                <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the log" />
              </label>
              <div className="seg" role="radiogroup" aria-label="Level">
                {(
                  [
                    ['all', 'All'],
                    ['warn', 'Warnings'],
                    ['error', 'Errors']
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={only === k} onClick={() => setOnly(k)}>
                    {l}
                  </button>
                ))}
              </div>
              <label className="check-row">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
              </label>
            </div>
            <div className="logs-view" ref={box}>
              {lines.map((l, i) => (
                <div key={i} className="log-line" data-l={levelOf(l)}>
                  {l || ' '}
                </div>
              ))}
            </div>
            <div className="end" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => cur && window.laramac.invoke('sites:open-log', site.name, cur.path)}>
                Open the file
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Shows what a laramac.yml will do, word for word, before anything runs. */
export function ProjectDialog({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { act, busy, setSites, notify } = useApp()
  const [data, setData] = useState<{ file: ProjectFile; plan: ProjectPlan } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runSetup, setRunSetup] = useState(true)
  useEffect(() => {
    window.laramac
      .invoke('project:plan', site.name)
      .then(setData)
      .catch((e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [site.name])
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" role="dialog" aria-label="laramac.yml" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Set up {site.name} from laramac.yml</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              This project comes with a Laramac setup. Here is everything it will do.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {error && <div className="errbox" style={{ marginTop: 14, gridColumn: 'auto' }}>{error}</div>}
        {data && (
          <>
            <ul className="plan-list">
              {data.plan.steps.length === 0 && <li>Nothing to change; the site already matches.</li>}
              {data.plan.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {data.plan.commands.length > 0 && (
              <>
                <label className="check-row" style={{ margin: '12px 0 8px' }}>
                  <input type="checkbox" checked={runSetup} onChange={(e) => setRunSetup(e.target.checked)} />
                  Also run these commands from the file, in the project folder:
                </label>
                <pre className="code-block">{data.plan.commands.map((c) => `$ ${c}`).join('\n')}</pre>
                <div className="hint" style={{ marginTop: 6 }}>
                  Only run commands from projects you trust: they run with your permissions.
                </div>
              </>
            )}
            <div className="end" style={{ marginTop: 16 }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy.has(`proj-${site.name}`)}
                onClick={async () => {
                  const r = await act(`proj-${site.name}`, () => window.laramac.invoke('project:apply', site.name, runSetup && data.plan.commands.length > 0))
                  if (r) {
                    setSites(r)
                    notify({ kind: 'info', text: `${site.name} is set up.` })
                    onClose()
                  }
                }}
              >
                <FileCog size={14} /> {busy.has(`proj-${site.name}`) ? 'Setting up…' : 'Set it up'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** A live picture of the site, refreshed on request. */
function Thumb({ site }: { site: SiteInfo }): React.JSX.Element {
  const [src, setSrc] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const load = async (refresh: boolean): Promise<void> => {
    setBusy(true)
    setSrc((await window.laramac.invoke('sites:thumbnail', site.name, refresh).catch(() => null)) ?? null)
    setBusy(false)
  }
  useEffect(() => {
    void load(false)
  }, [site.name]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="gal-thumb" data-busy={busy}>
      {src ? <img src={src} alt="" draggable={false} /> : <div className="gal-empty">{src === null ? 'No preview' : ''}</div>}
      <button className="icon-btn gal-refresh" data-tip="Refresh preview" aria-label={`Refresh the preview of ${site.name}`} onClick={() => load(true)}>
        <RefreshCw />
      </button>
    </div>
  )
}

/** Sites as cards with a live preview of each one. */
export function SiteGallery({
  sites,
  kindLabel,
  aiName,
  renderDev,
  renderMenu
}: {
  sites: SiteInfo[]
  kindLabel: Record<string, string>
  aiName: string
  renderDev: (s: SiteInfo) => React.ReactNode
  renderMenu: (s: SiteInfo) => React.ReactNode
}): React.JSX.Element {
  const { act } = useApp()
  const api = window.laramac
  return (
    <div className="gallery">
      {sites.map((s) => (
        <div key={s.path} className="gal-card glass">
          <button className="gal-open" onClick={() => api.invoke('sites:open-url', s.secure ? s.httpsUrl : s.url)} aria-label={`Open ${s.name}`}>
            <Thumb site={s} />
          </button>
          <div className="gal-body">
            <Monogram id={s.kind} />
            <div className="gal-title">
              <strong>{s.name}</strong>
              <span className="mono">{s.shareUrl ? s.shareUrl.replace('https://', '') : s.domain}</span>
            </div>
            <span className="tag">{kindLabel[s.kind]}</span>
          </div>
          <div className="gal-foot">
            {renderDev(s)}
            <span style={{ flex: 1 }} />
            <button className="icon-btn" data-tip="Open in browser" aria-label={`Open ${s.name} in the browser`} onClick={() => api.invoke('sites:open-url', s.secure ? s.httpsUrl : s.url)}>
              <ExternalLink />
            </button>
            <button className="icon-btn" data-tip="Open in editor" aria-label={`Open ${s.name} in your editor`} onClick={() => act(`editor-${s.name}`, () => api.invoke('sites:open-editor', s.path))}>
              <Code />
            </button>
            <button className="icon-btn" data-tip={aiName} aria-label={`${aiName} in ${s.name}`} onClick={() => act(`claude-${s.name}`, () => api.invoke('sites:open-claude', s.path))}>
              <Terminal />
            </button>
            {renderMenu(s)}
          </div>
        </div>
      ))}
    </div>
  )
}
