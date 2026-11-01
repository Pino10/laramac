import { ArrowDownToLine, Database, FolderGit2, Send, Globe, Package, LayoutDashboard, MessageSquare, Server, Settings as SettingsIcon, Terminal, Wrench } from 'lucide-react'
import { useApp, type Page } from '../store'
import icon from '../assets/icon-128.png'

type Item = { id: Page; label: string; icon: React.ReactNode }

export const NAV: Item[][] = [
  [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'sites', label: 'Sites', icon: <Globe size={16} /> }
  ],
  [
    { id: 'php', label: 'PHP', icon: <Terminal size={16} /> },
    { id: 'databases', label: 'Databases', icon: <Database size={16} /> },
    { id: 'servers', label: 'Servers', icon: <Server size={16} /> },
    { id: 'api', label: 'API client', icon: <Send size={16} /> },
    { id: 'github', label: 'GitHub', icon: <FolderGit2 size={16} /> },
    { id: 'tools', label: 'Tools', icon: <Wrench size={16} /> },
    { id: 'packages', label: 'Packages', icon: <Package size={16} /> }
  ],
  [
    { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={16} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={16} /> },
    { id: 'updates', label: 'Updates', icon: <ArrowDownToLine size={16} /> }
  ]
]

export const PAGE_ORDER: Page[] = NAV.flat().map((i) => i.id)

export default function Sidebar(): React.JSX.Element {
  const { page, setPage, services, sites, update } = useApp()
  const installed = services.filter((s) => s.status !== 'not-installed')
  const running = installed.filter((s) => s.status === 'running').length
  const failing = services.some((s) => s.status === 'error')

  return (
    <aside className="sidebar glass">
      <div className="sidebar-top drag" />
      <div className="brand">
        <img className="brand-icon" src={icon} alt="" draggable={false} />
        <span>
          Laramac
        </span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((items, i) => (
          <div key={i} className="nav">
            {i > 0 && <div className="nav-gap" />}
            {items.map((it) => (
              <button
                key={it.id}
                className="nav-item"
                aria-current={page === it.id ? 'page' : undefined}
                onClick={() => setPage(it.id)}
              >
                {it.icon}
                {it.label}
                {it.id === 'updates' && update ? (
                  <span className="nav-dot" aria-label="Update available" />
                ) : PAGE_ORDER.indexOf(it.id) < 9 ? (
                  <span className="nav-key" aria-hidden>
                    ⌘{PAGE_ORDER.indexOf(it.id) + 1}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="lamp" data-s={failing ? 'error' : running > 0 ? 'running' : 'stopped'} />
        <div>
          <strong>{installed.length === 0 ? 'Not set up yet' : `${running} of ${installed.length} running`}</strong>
          {sites.length} {sites.length === 1 ? 'site' : 'sites'}
        </div>
      </div>
    </aside>
  )
}
