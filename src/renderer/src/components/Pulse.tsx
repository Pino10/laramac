import { useEffect, useRef, useState } from 'react'
import { Activity, Archive, Mail, ShieldCheck, Timer } from 'lucide-react'
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
      const k = Math.min(1, (t - start) / 1100)
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
  const w = 320
  const h = 84
  const max = Math.max(1, ...data)
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 6 - (v / max) * (h - 16)] as const)
  // A smooth curve through the points.
  const line = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`
      const [px, py] = pts[i - 1]
      const mx = (px + x) / 2
      return `C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} className="spark-grid" />
      ))}
      <path d={area} fill="url(#spark-fill)" className="spark-area" />
      <path d={line} fill="none" stroke="url(#spark-stroke)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" className="spark-line" pathLength={1} />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="7" fill="var(--accent)" className="spark-halo" />
          <circle cx={last[0]} cy={last[1]} r="3.4" fill="var(--accent)" className="spark-dot" />
        </>
      )}
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

/** The Overview's two live cards: today's traffic, and what is running on this Mac now. */
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
  const lastMinutes = p ? p.perMinute.slice(-5).reduce((a, b) => a + b, 0) : 0
  const sev = p?.review ? (p.review.critical ? 'critical' : p.review.high ? 'high' : 'ok') : 'none'
  return (
    <section className="ov-hero" aria-label="Today on this Mac">
      <div className="ov-card ov-traffic" style={{ ['--i' as string]: 0 }}>
        <div className="ov-card-glow" aria-hidden />
        <span className="ov-label">
          <Activity size={14} /> Requests today
        </span>
        <b className="ov-big">{today.toLocaleString('en')}</b>
        <span className="ov-sub">
          {p ? (lastMinutes ? `${lastMinutes} in the last 5 minutes` : 'Quiet right now') : '…'}
          {p && p.errorsToday > 0 && (
            <button className="ov-err" onClick={() => setPage('sites')}>
              {p.errorsToday} {p.errorsToday === 1 ? 'error' : 'errors'}
            </button>
          )}
        </span>
        <Spark data={p?.perMinute ?? new Array(30).fill(0)} />
        <div className="ov-axis">
          <span>30 min ago</span>
          <span>now</span>
        </div>
        <div className="ov-chips">
          <span className="ov-chip">
            <Timer size={13} /> {p?.medianMs ? `${p.medianMs} ms` : '·'}
            <small>median</small>
          </span>
          <button className="ov-chip" onClick={() => void window.laramac.invoke('sites:open-url', 'http://127.0.0.1:8025')}>
            <Mail size={13} /> {p?.mail ?? '·'}
            <small>{p?.mail === null ? 'Mailpit off' : 'mails caught'}</small>
          </button>
          <button className="ov-chip" onClick={() => setPage('databases')}>
            <Archive size={13} /> {p?.lastBackup ? ago(p.lastBackup) : 'No backup'}
            <small>last backup</small>
          </button>
          <button className="ov-chip" data-tone={sev === 'critical' ? 'bad' : sev === 'high' ? 'warn' : sev === 'ok' ? 'ok' : undefined} onClick={() => setPage('security')}>
            <ShieldCheck size={13} /> {!p?.review ? 'Not reviewed' : p.review.critical ? `${p.review.critical} critical` : p.review.high ? `${p.review.high} high` : 'Clean'}
            <small>security</small>
          </button>
        </div>
      </div>
      <Live p={p} />
    </section>
  )
}

const uptime = (sec: number): string => {
  if (!sec) return ''
  if (sec < 60) return `${sec} s`
  if (sec < 3600) return `${Math.floor(sec / 60)} min`
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`
  return `${Math.floor(sec / 86400)} d ${Math.floor((sec % 86400) / 3600)} h`
}
const mem = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)

/** A small line of one site's last half hour. */
function Lane({ data }: { data: number[] }): React.JSX.Element {
  const w = 120
  const h = 26
  const max = Math.max(1, ...data)
  const pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 6)).toFixed(1)}`)
  return (
    <svg className="lane" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="lane-area" />
      <polyline points={pts.join(' ')} className="lane-line" pathLength={1} />
    </svg>
  )
}

/**
 * What is running on this Mac now, measured: each service and dev server with its CPU, memory and
 * uptime (with everything it started), and each site's own traffic over the last half hour.
 */
function Live({ p }: { p: OverviewPulse | null }): React.JSX.Element {
  const { setPage, sites, showSite } = useApp()
  const procs = p?.processes ?? []
  const lanes = p?.bySite ?? []
  const totalMem = procs.reduce((n, x) => n + x.memMb, 0)
  const totalCpu = procs.reduce((n, x) => n + x.cpu, 0)
  const siteFor = (host: string): string | undefined => sites.find((x) => x.domain === host || host.endsWith(`.${x.domain}`) || x.aliases?.includes(host))?.name
  return (
    <div className="ov-card ov-live" style={{ ['--i' as string]: 1 }}>
      <div className="ov-live-head">
        <span className="ov-label">
          <span className="ov-live-dot" data-on={procs.length > 0} /> Live on this Mac
        </span>
        <span className="ov-sub">{procs.length ? `${procs.length} running · ${totalCpu.toFixed(1)}% CPU · ${mem(totalMem)}` : 'Nothing running'}</span>
      </div>
      <div className="live-cols">
        <div className="live-procs" role="table" aria-label="Running services">
          <div className="live-row live-th" role="row">
            <span>Process</span>
            <span>CPU</span>
            <span>Memory</span>
            <span>Up</span>
          </div>
          {procs.length === 0 && (
            <button className="live-empty" onClick={() => setPage('services')}>
              Start your services and they show here, with what each one uses.
            </button>
          )}
          {procs.slice(0, 7).map((x, i) => (
            <div key={x.name} className="live-row" role="row" style={{ ['--r' as string]: i }} title={x.count > 1 ? `${x.count} processes` : undefined}>
              <span className="live-name">
                <i className="lamp" data-s="running" /> {x.name}
              </span>
              <span className="live-cpu">
                <b style={{ width: `${Math.min(100, x.cpu)}%` }} />
                <em>{x.cpu.toFixed(1)}%</em>
              </span>
              <span className="live-num">{mem(x.memMb)}</span>
              <span className="live-num live-up">{uptime(x.uptimeSec)}</span>
            </div>
          ))}
        </div>
        <div className="live-sites">
          <div className="live-th live-th-sites">
            <span>Traffic, last 30 minutes</span>
            <span>Today</span>
          </div>
          {lanes.length === 0 && <div className="live-empty">No requests yet today. Open one of your sites and its traffic appears here.</div>}
          {lanes.map((l, i) => {
            const name = siteFor(l.host)
            return (
              <button key={l.host} className="live-lane" style={{ ['--r' as string]: i }} onClick={() => (name ? showSite(name, 'requests') : setPage('sites'))}>
                <span className="live-host">
                  <strong>{l.host}</strong>
                  <small>
                    {l.medianMs ? `${l.medianMs} ms median` : ''}
                    {l.errors ? <em> · {l.errors} {l.errors === 1 ? 'error' : 'errors'}</em> : null}
                  </small>
                </span>
                <Lane data={l.perMinute} />
                <span className="live-num">{l.today.toLocaleString('en')}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
