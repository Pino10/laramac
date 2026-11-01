import { useEffect, useRef, useState } from 'react'
import { Bell, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useApp } from '../store'

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : new Date(at).toLocaleDateString()
}

/** The bell: recent installs, crashes and shares. Mirrors what macOS notifications showed. */
export default function Activity(): React.JSX.Element {
  const { activity, clearActivity } = useApp()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const unseen = activity.filter((a) => a.at > seen)
  const hasError = unseen.some((a) => a.kind === 'error')

  useEffect(() => {
    if (!open) return
    setSeen(Date.now())
    const close = (e: MouseEvent | KeyboardEvent): void => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open, activity.length])

  const now = Date.now()
  return (
    <div ref={ref}>
      <button
        className="btn btn-quiet btn-icon bell"
        aria-label={`Activity${unseen.length ? `, ${unseen.length} new` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={16} />
        {unseen.length > 0 && !open && (
          <span className="badge" data-kind={hasError ? 'error' : undefined}>
            {unseen.length}
          </span>
        )}
      </button>
      {open && (
        <div className="popover glass" role="dialog" aria-label="Activity">
          <div className="popover-head">
            Activity
            {activity.length > 0 && (
              <button className="btn btn-quiet" style={{ height: 26 }} onClick={clearActivity}>
                Clear
              </button>
            )}
          </div>
          <div className="popover-list">
            {activity.length === 0 && (
              <div className="empty dim">Installs, crashes and shared links will show up here.</div>
            )}
            {activity.map((a) => (
              <div key={a.id} className="event">
                <span className="event-icon" style={{ color: a.kind === 'error' ? 'var(--bad)' : a.kind === 'success' ? 'var(--ok)' : 'var(--ink-3)' }}>
                  {a.kind === 'error' ? <CircleAlert size={15} /> : a.kind === 'success' ? <CircleCheck size={15} /> : <Info size={15} />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="event-title">{a.title}</span>
                    <span className="event-time">{ago(a.at, now)}</span>
                  </div>
                  {a.body && <div className="event-body">{a.body}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
