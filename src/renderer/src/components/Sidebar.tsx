import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  Database,
  FolderGit2,
  Send,
  Globe,
  Package,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings as SettingsIcon,
  Terminal,
  Layers,
  Sparkles,
  Rocket,
  ShieldCheck,
  Code2,
  Radar
} from 'lucide-react'
import { useApp, type Page } from '../store'
import icon from '../assets/icon-128.png'

type Item = { id: Page; label: string; icon: React.ReactNode }
type Group = { id: string; label: string | null; items: Item[] }

const I = 17
/** Grouped by what you are doing: run your stack, check it, ship it, and AI. */
export const GROUPS: Group[] = [
  {
    id: 'home',
    label: null,
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={I} /> },
      { id: 'sites', label: 'Sites', icon: <Globe size={I} /> },
      { id: 'starters', label: 'New project', icon: <Rocket size={I} /> }
    ]
  },
  {
    id: 'run',
    label: 'Run',
    items: [
      { id: 'services', label: 'Services', icon: <Layers size={I} /> },
      { id: 'php', label: 'PHP', icon: <Terminal size={I} /> },
      { id: 'languages', label: 'Languages', icon: <Code2 size={I} /> },
      { id: 'databases', label: 'Databases', icon: <Database size={I} /> }
    ]
  },
  {
    id: 'check',
    label: 'Check',
    items: [
      { id: 'security', label: 'Code review', icon: <ShieldCheck size={I} /> },
      { id: 'recon', label: 'Recon', icon: <Radar size={I} /> }
    ]
  },
  {
    id: 'ship',
    label: 'Ship',
    items: [
      { id: 'github', label: 'Git', icon: <FolderGit2 size={I} /> },
      { id: 'servers', label: 'Remote servers', icon: <Server size={I} /> },
      { id: 'api', label: 'API client', icon: <Send size={I} /> }
    ]
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={I} /> },
      { id: 'tools', label: 'AI tools', icon: <Sparkles size={I} /> }
    ]
  }
]

const FOOT: Item[] = [
  { id: 'packages', label: 'Packages and disk space', icon: <Package size={16} /> },
  { id: 'updates', label: 'Updates', icon: <ArrowDownToLine size={16} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={16} /> }
]

/** Kept for the command bar: every page, grouped. */
export const NAV: Item[][] = [...GROUPS.map((g) => g.items), FOOT]
/** ⌘1 to ⌘9 follow the order on screen. */
export const PAGE_ORDER: Page[] = NAV.flat().map((i) => i.id)

function stored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function store(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // Not remembered; it still works.
  }
}

export default function Sidebar(): React.JSX.Element {
  const { page, setPage, services, sites, update, updates } = useApp()
  const [chosenSlim, setSlim] = useState<boolean>(() => stored('sidebar-slim', false))
  // Narrow windows get the slim sidebar on their own, so the page keeps its room.
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1080px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1080px)')
    const on = (): void => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const slim = chosenSlim || narrow
  const [folded, setFolded] = useState<string[]>(() => stored('sidebar-folded', []))
  const installed = services.filter((s) => s.status !== 'not-installed')
  const running = installed.filter((s) => s.status === 'running').length
  const failing = services.some((s) => s.status === 'error')
  const devOn = sites.filter((s) => s.dev?.running).length

  useEffect(() => store('sidebar-slim', chosenSlim), [chosenSlim])
  useEffect(() => store('sidebar-folded', folded), [folded])
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setSlim((s) => !s)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const badge = (id: Page): React.ReactNode => {
    if (id === 'sites' && sites.length) {
      return (
        <span className="nav-count" aria-label={`${sites.length} sites${devOn ? `, ${devOn} dev servers running` : ''}`}>
          {devOn > 0 && <span className="nav-live" />}
          {sites.length}
        </span>
      )
    }
    if (id === 'dashboard' && failing) return <span className="nav-alert" aria-label="A service failed" />
    return null
  }

  const navItem = (it: Item): React.JSX.Element => (
    <button
      key={it.id}
      className="nav-item"
      data-tour={it.id}
      data-tip={slim ? it.label : undefined}
      aria-label={slim ? it.label : undefined}
      aria-current={page === it.id ? 'page' : undefined}
      onClick={() => setPage(it.id)}
    >
      <span className="nav-icon">{it.icon}</span>
      <span className="nav-label">{it.label}</span>
      {badge(it.id)}
    </button>
  )

  return (
    <aside className="sidebar glass" data-slim={slim}>
      <div className="sidebar-top drag" />
      <div className="brand">
        <img className="brand-icon" src={icon} alt="" draggable={false} />
        <span className="nav-label">Laramac</span>
        <button className="icon-btn slim-toggle" data-tip={slim ? 'Expand (⌘\\)' : 'Make slim (⌘\\)'} aria-label={slim ? 'Expand the sidebar' : 'Make the sidebar slim'} onClick={() => setSlim(!slim)}>
          {slim ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
      <nav className="nav nav-scroll" aria-label="Main">
        {GROUPS.map((g) => {
          const isFolded = folded.includes(g.id) && !slim && !g.items.some((i) => i.id === page)
          return (
            <div key={g.id} className="nav-group" data-folded={isFolded}>
              {g.label &&
                (slim ? (
                  <div className="nav-sep" />
                ) : (
                  <button
                    className="nav-head"
                    aria-expanded={!isFolded}
                    onClick={() => setFolded((f) => (f.includes(g.id) ? f.filter((x) => x !== g.id) : [...f, g.id]))}
                  >
                    {g.label}
                    <ChevronDown size={13} />
                  </button>
                ))}
              <div className="nav-items">{g.items.map(navItem)}</div>
            </div>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-foot" onClick={() => setPage('dashboard')} data-tip={slim ? `${running} of ${installed.length} running` : undefined} aria-label="Overview of services">
          <span className="lamp" data-s={failing ? 'error' : running > 0 ? 'running' : 'stopped'} />
          <div className="nav-label">
            <strong>{installed.length === 0 ? 'Not set up yet' : `${running} of ${installed.length} running`}</strong>
            {sites.length} {sites.length === 1 ? 'site' : 'sites'}
            {devOn > 0 ? `, ${devOn} dev ${devOn === 1 ? 'server' : 'servers'}` : ''}
          </div>
        </button>
        <div className="foot-row">
          {FOOT.map((it) => (
            <button
              key={it.id}
              className="foot-btn"
              data-tour={it.id}
              data-tip={it.label}
              aria-label={it.label}
              aria-current={page === it.id ? 'page' : undefined}
              onClick={() => setPage(it.id)}
            >
              {it.icon}
              {it.id === 'updates' && (update || !!updates?.items.length) && <span className="nav-dot" aria-label="Updates available" />}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
