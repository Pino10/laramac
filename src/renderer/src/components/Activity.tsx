import { useEffect, useRef, useState } from 'react'
import { Bell, CircleAlert, CircleCheck, Sparkles } from 'lucide-react'
import type { ActivityItem } from '@shared/types'
import { useApp } from '../store'

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : new Date(at).toLocaleDateString()
}

const startOfToday = (): number => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** New events as small toasts under the bell: at most three, each gone after a few seconds. */
function Toasts({ hidden }: { hidden: boolean }): React.JSX.Element | null {
  const { activity } = useApp()
  const [since] = useState(() => Date.now())
  const [shown, setShown] = useState<ActivityItem[]>([])
  const known = useRef(new Set<string>())
  useEffect(() => {
    const fresh = activity.filter((a) => a.at >= since && !known.current.has(a.id))
    if (!fresh.length) return
    for (const a of fresh) known.current.add(a.id)
    setShown((s) => [...fresh.reverse(), ...s].slice(0, 3))
    const ids = fresh.map((a) => a.id)
    const t = setTimeout(() => setShown((s) => s.filter((x) => !ids.includes(x.id))), fresh.some((a) => a.kind === 'error') ? 8000 : 4500)
    return () => clearTimeout(t)
  }, [activity, since])
  if (hidden || shown.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {shown.map((a) => (
        <button key={a.id} className="toast-mini glass" data-kind={a.kind} onClick={() => setShown((s) => s.filter((x) => x.id !== a.id))} title={a.body ?? undefined}>
          <span className="event-icon" data-kind={a.kind}>
            {a.kind === 'error' ? <CircleAlert size={14} /> : a.kind === 'success' ? <CircleCheck size={14} /> : <Sparkles size={14} />}
          </span>
          <span className="toast-text">
            <strong>{a.title}</strong>
            {a.body && <small>{a.body}</small>}
          </span>
        </button>
      ))}
    </div>
  )
}

/** The bell: one quiet line per event, details on click. */
export default function Activity(): React.JSX.Element {
  const { activity, clearActivity } = useApp()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
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
  const today = startOfToday()
  const groups: [string, ActivityItem[]][] = [
    ['Today', activity.filter((a) => a.at >= today)],
    ['Earlier', activity.filter((a) => a.at < today)]
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Toasts hidden={open} />
      <button
        className="bell"
        data-new={unseen.length > 0 && !open}
        aria-label={`Activity${unseen.length ? `, ${unseen.length} new` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={16} strokeWidth={2} />
        {unseen.length > 0 && !open && (
          <span className="badge" data-kind={hasError ? 'error' : undefined}>
            {unseen.length > 9 ? '9+' : unseen.length}
          </span>
        )}
      </button>
      {open && (
        <div className="popover glass activity-pop" role="dialog" aria-label="Activity" style={{ top: 44, right: 0 }}>
          <div className="popover-head">
            Activity
            {activity.length > 0 && (
              <button className="btn btn-quiet" style={{ height: 26 }} onClick={clearActivity}>
                Clear all
              </button>
            )}
          </div>
          <div className="popover-list">
            {activity.length === 0 && (
              <div className="empty dim" style={{ padding: '34px 24px' }}>
                Installs, updates, shared links and anything that stops unexpectedly will show up here.
              </div>
            )}
            {groups.map(([label, items]) =>
              items.length === 0 ? null : (
                <div key={label}>
                  <div className="event-group">{label}</div>
                  {items.slice(0, 40).map((a) => (
                    <button key={a.id} className="event event-line" data-open={expanded === a.id} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                      <span className="event-icon" data-kind={a.kind}>
                        {a.kind === 'error' ? <CircleAlert size={13} /> : a.kind === 'success' ? <CircleCheck size={13} /> : <Sparkles size={13} />}
                      </span>
                      <span className="event-main">
                        <span className="event-title">{a.title}</span>
                        {a.body && expanded === a.id && <span className="event-body">{a.body}</span>}
                      </span>
                      <span className="event-time">{ago(a.at, now)}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
