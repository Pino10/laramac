import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CircleAlert, CircleCheck, Copy, Sparkles, X } from 'lucide-react'
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

const iconFor = (kind: ActivityItem['kind'], size: number): React.JSX.Element => (kind === 'error' ? <CircleAlert size={size} /> : kind === 'success' ? <CircleCheck size={size} /> : <Sparkles size={size} />)

/** One notification in full: the whole message, when it happened, and a way to copy it. */
function Detail({ item, onClose }: { item: ActivityItem; onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const text = `${item.title}${item.body ? `\n\n${item.body}` : ''}`
  return createPortal(
    <div className="notice-back" onMouseDown={onClose}>
      <div className="notice-card glass" role="dialog" aria-modal="true" aria-label={item.title} data-kind={item.kind} onMouseDown={(e) => e.stopPropagation()}>
        <div className="notice-top">
          <span className="event-icon" data-kind={item.kind}>
            {iconFor(item.kind, 16)}
          </span>
          <div className="notice-title">
            <strong>{item.title}</strong>
            <small>
              {item.kind === 'error' ? 'Something went wrong' : item.kind === 'success' ? 'Done' : 'For your information'} · {new Date(item.at).toLocaleString()}
            </small>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="notice-body">{item.body || 'There is nothing more to say about this one.'}</div>
        <div className="notice-actions">
          <button
            className="btn btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              })
            }}
          >
            <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * New events as toasts at the top right of the window, in front of everything (they are placed on
 * the page itself, so no panel can hide them). Errors stay until you close them; the others stay
 * a while longer, and stay as long as the pointer is on them. Click one to read it in full.
 */
function Toasts({ hidden, onOpen }: { hidden: boolean; onOpen: (a: ActivityItem) => void }): React.JSX.Element | null {
  const { activity } = useApp()
  const [since] = useState(() => Date.now())
  const [shown, setShown] = useState<ActivityItem[]>([])
  const [hover, setHover] = useState(false)
  const known = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const drop = (id: string): void => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setShown((s) => s.filter((x) => x.id !== id))
  }
  useEffect(() => {
    const fresh = activity.filter((a) => a.at >= since && !known.current.has(a.id))
    if (!fresh.length) return
    for (const a of fresh) known.current.add(a.id)
    setShown((s) => [...fresh.reverse(), ...s].slice(0, 4))
  }, [activity, since])
  // Each toast has its own clock, paused while the pointer is on the stack. Errors have none.
  useEffect(() => {
    if (hover) {
      for (const t of timers.current.values()) clearTimeout(t)
      timers.current.clear()
      return
    }
    for (const a of shown) {
      if (a.kind === 'error' || timers.current.has(a.id)) continue
      timers.current.set(a.id, setTimeout(() => drop(a.id), a.body && a.body.length > 90 ? 12000 : 8000))
    }
  }, [shown, hover])
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), [])
  if (hidden || shown.length === 0) return null
  return createPortal(
    <div className="toasts" role="status" aria-live="polite" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {shown.map((a) => (
        <div key={a.id} className="toast-mini glass" data-kind={a.kind}>
          <button
            className="toast-open"
            onClick={() => {
              drop(a.id)
              onOpen(a)
            }}
            title="Read it in full"
          >
            <span className="event-icon" data-kind={a.kind}>
              {iconFor(a.kind, 15)}
            </span>
            <span className="toast-text">
              <strong>{a.title}</strong>
              {a.body && <small>{a.body}</small>}
              <em>Click to read it in full</em>
            </span>
          </button>
          <button className="icon-btn toast-x" aria-label="Dismiss" onClick={() => drop(a.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}

/** The bell: one quiet line per event, details on click. */
export default function Activity(): React.JSX.Element {
  const { activity, clearActivity } = useApp()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const [detail, setDetail] = useState<ActivityItem | null>(null)
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
      <Toasts hidden={false} onOpen={(a) => setDetail(a)} />
      {detail && <Detail item={detail} onClose={() => setDetail(null)} />}
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
                    <button
                      key={a.id}
                      className="event event-line"
                      title="Read it in full"
                      onClick={() => {
                        setOpen(false)
                        setDetail(a)
                      }}
                    >
                      <span className="event-icon" data-kind={a.kind}>
                        {iconFor(a.kind, 13)}
                      </span>
                      <span className="event-main">
                        <span className="event-title">{a.title}</span>
                        {a.body && <span className="event-preview">{a.body}</span>}
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
