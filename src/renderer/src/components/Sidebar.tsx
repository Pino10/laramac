export type Page = 'dashboard' | 'sites' | 'php' | 'tools' | 'assistant' | 'settings'

const items: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◧' },
  { id: 'sites', label: 'Sites', icon: '◍' },
  { id: 'php', label: 'PHP', icon: '⬡' },
  { id: 'tools', label: 'Tools', icon: '✦' },
  { id: 'assistant', label: 'Assistant', icon: '✺' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

export default function Sidebar({
  page,
  onChange
}: {
  page: Page
  onChange: (p: Page) => void
}): React.JSX.Element {
  return (
    <aside className="glass m-3 mr-0 flex w-52 shrink-0 flex-col p-3">
      <div className="drag h-9" />
      <div className="mb-5 px-2">
        <div className="text-lg font-semibold tracking-tight">Laramac</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Local dev, made easy
        </div>
      </div>
      <nav className="no-drag flex flex-col gap-1">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors"
            style={{
              background: page === it.id ? 'var(--glass-bg-strong)' : 'transparent',
              boxShadow: page === it.id ? 'inset 0 1px 0 var(--glass-highlight)' : 'none'
            }}
          >
            <span className="w-4 text-center opacity-80">{it.icon}</span>
            {it.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto px-2 text-xs" style={{ color: 'var(--text-dim)' }}>
        v0.2.0 · Free forever
      </div>
    </aside>
  )
}
