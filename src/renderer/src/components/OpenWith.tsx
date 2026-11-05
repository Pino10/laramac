import { useState } from 'react'
import { ChevronDown, Code2 } from 'lucide-react'
import { useApp } from '../store'

/** The code button: your editor in one click, and "Open with…" for any other one this time. */
export default function OpenWith({ path, compact }: { path: string; compact?: boolean }): React.JSX.Element {
  const { tools, act } = useApp()
  const [open, setOpen] = useState(false)
  const api = window.laramac
  const name = tools?.editor ?? 'Laramac Code'
  const others = [{ id: 'laramac', name: 'Laramac Code' }, ...(tools?.editors ?? [])].filter((e) => e.name !== name)
  return (
    <span className="split-btn menu-wrap">
      <button className={compact ? 'btn btn-sm split-main' : 'btn split-main'} onClick={() => act('open-editor', () => api.invoke('sites:open-editor', path))}>
        <Code2 size={compact ? 13 : 14} /> {name}
      </button>
      <button className={compact ? 'btn btn-sm split-more' : 'btn split-more'} aria-label="Open with another editor" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <span className="menu-catch" onClick={() => setOpen(false)} />
          <span className="menu glass" style={{ minWidth: 220 }}>
            <span className="menu-label">Open with</span>
            {others.map((e) => (
              <button
                key={e.id}
                className="menu-item"
                onClick={() => {
                  setOpen(false)
                  void act('open-with', () => api.invoke('sites:open-with', path, e.id))
                }}
              >
                <Code2 size={14} /> {e.name}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  )
}
