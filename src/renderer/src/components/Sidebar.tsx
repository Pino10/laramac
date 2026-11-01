import {
  Database,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Settings as SettingsIcon,
  Terminal,
  Wrench
} from 'lucide-react'
import { useApp } from '../store'

export type Page = 'dashboard' | 'sites' | 'php' | 'databases' | 'tools' | 'assistant' | 'settings'

type Item = { id: Page; label: string; icon: React.ReactNode }

const groups: Item[][] = [
  [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { id: 'sites', label: 'Sites', icon: <Globe size={16} /> }
  ],
  [
    { id: 'php', label: 'PHP', icon: <Terminal size={16} /> },
    { id: 'databases', label: 'Databases', icon: <Database size={16} /> },
    { id: 'tools', label: 'Tools', icon: <Wrench size={16} /> }
  ],
  [
    { id: 'assistant', label: 'Assistant', icon: <MessageSquare size={16} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={16} /> }
  ]
]

export default function Sidebar({
  page,
  onChange
}: {
  page: Page
  onChange: (p: Page) => void
}): React.JSX.Element {
  const { services } = useApp()
  const running = services.filter((s) => s.status === 'running').length
  const installed = services.filter((s) => s.status !== 'not-installed').length

  return (
    <aside className="sidebar">
      <div className="sidebar-top drag" />
      <div className="brand">
        <span className="brand-mark">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2 1.5v9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        </span>
        Laramac
      </div>
      <nav className="nav no-drag" aria-label="Main">
        {groups.map((items, i) => (
          <div key={i} className="nav">
            {i > 0 && <div className="nav-gap" />}
            {items.map((it) => (
              <button
                key={it.id}
                className="nav-item"
                aria-current={page === it.id ? 'page' : undefined}
                onClick={() => onChange(it.id)}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span className="lamp" data-s={running > 0 ? 'running' : 'stopped'} />
        {installed === 0 ? 'Nothing installed yet' : `${running} of ${installed} running`}
      </div>
    </aside>
  )
}
