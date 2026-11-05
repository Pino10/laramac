import { useEffect, useRef, useState } from 'react'
import { Activity, Archive, Mail, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { OverviewPulse } from '@shared/types'
import { useApp } from '../store'

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts up to a number the first time it appears, then follows it. */
function useCount(value: number): number {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(shown)
  useEffect(() => {
    if (reduced()) {
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number): void => {
      const k = Math.min(1, (t - start) / 900)
      const eased = 1 - Math.pow(1 - k, 3)
      const v = Math.round(a + (value - a) * eased)
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return shown
}

function Spark({ data }: { data: number[] }): React.JSX.Element {
  const w = 220
  const h = 46
  const max = Math.max(1, ...data)
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 4 - (v / max) * (h - 10)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" className="spark-area" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="spark-line" pathLength={1} />
      {last && <circle cx={last[0]} cy={last[1]} r="3.2" fill="var(--accent)" className="spark-dot" />}
    </svg>
  )
}

const ago = (iso: string): string => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

/** The Overview's live strip: traffic, errors, mail, backups and security, refreshed every few seconds. */
export default function Pulse(): React.JSX.Element {
  const { setPage } = useApp()
  const [p, setP] = useState<OverviewPulse | null>(null)
  useEffect(() => {
    let alive = true
    const load = (): void => void window.laramac.invoke('overview:pulse').then((r) => alive && setP(r)).catch(() => undefined)
    load()
    const t = setInterval(load, 8000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const today = useCount(p?.today ?? 0)
  const errors = useCount(p?.errorsToday ?? 0)
  const mail = useCount(p?.mail ?? 0)
  const lastMinutes = p ? p.perMinute.slice(-5).reduce((a, b) => a + b, 0) : 0
  const sev = p?.review ? (p.review.critical ? 'critical' : p.review.high ? 'high' : 'ok') : 'none'
  return (
    <section className="pulse" aria-label="Today on this Mac">
      <div className="pulse-glow" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="pulse-tile pulse-traffic" style={{ ['--i' as string]: 0 }}>
        <span className="pulse-label">
          <Activity size={14} /> Requests today
        </span>
        <b className="pulse-num">{today.toLocaleString('en')}</b>
        <span className="pulse-sub">{p ? (lastMinutes ? `${lastMinutes} in the last 5 minutes · median ${p.medianMs} ms` : 'Quiet right now') : '…'}</span>
        <Spark data={p?.perMinute ?? new Array(30).fill(0)} />
      </div>
      <button className="pulse-tile" data-tone={p && p.errorsToday ? 'bad' : undefined} style={{ ['--i' as string]: 1 }} onClick={() => setPage('sites')}>
        <span className="pulse-label">
          <TriangleAlert size={14} /> Server errors
        </span>
        <b className="pulse-num">{errors}</b>
        <span className="pulse-sub">{p && p.errorsToday ? 'Today. Open a site’s Requests tab to see them.' : 'None today'}</span>
      </button>
      <button className="pulse-tile" style={{ ['--i' as string]: 2 }} onClick={() => void window.laramac.invoke('sites:open-url', 'http://127.0.0.1:8025')}>
        <span className="pulse-label">
          <Mail size={14} /> Mail caught
        </span>
        <b className="pulse-num">{p?.mail === null ? '·' : mail}</b>
        <span className="pulse-sub">{p?.mail === null ? 'Mailpit is off' : 'Safely kept on this Mac'}</span>
      </button>
      <button className="pulse-tile" style={{ ['--i' as string]: 3 }} onClick={() => setPage('databases')}>
        <span className="pulse-label">
          <Archive size={14} /> Last backup
        </span>
        <b className="pulse-num pulse-word">{p?.lastBackup ? ago(p.lastBackup) : 'None yet'}</b>
        <span className="pulse-sub">{p?.lastBackup ? 'Daily backups on the Databases page' : 'Turn on daily backups for a database'}</span>
      </button>
      <button className="pulse-tile" data-tone={sev === 'critical' ? 'bad' : sev === 'high' ? 'warn' : undefined} style={{ ['--i' as string]: 4 }} onClick={() => setPage('security')}>
        <span className="pulse-label">
          <ShieldCheck size={14} /> Security
        </span>
        <b className="pulse-num pulse-word">{!p?.review ? 'Not reviewed' : p.review.critical ? `${p.review.critical} critical` : p.review.high ? `${p.review.high} high` : 'Clean'}</b>
        <span className="pulse-sub">{p?.review ? `${p.review.title.split(',')[0]}, ${ago(p.review.at)}` : 'Run a code review'}</span>
      </button>
    </section>
  )
}
