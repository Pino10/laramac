import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Archive, Mail, ShieldCheck, Timer } from 'lucide-react'
import type { OverviewPulse, ServiceInfo, SiteInfo } from '@shared/types'
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

/** The Overview's two live cards: today's traffic, and the orbit of your sites and services. */
export default function Pulse(): React.JSX.Element {
  const { setPage, services, sites } = useApp()
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
      <Orbit services={services} sites={sites} rate={p ? p.perMinute.slice(-3).reduce((a, b) => a + b, 0) / 3 : 0} />
    </section>
  )
}

interface OrbitNode {
  id: string
  label: string
  sub: string
  x: number
  y: number
  live: boolean
  kind: 'site' | 'svc'
  onClick: () => void
}

/**
 * Your stack as an orbit: this Mac in the middle, the running services around it, and your sites
 * on the outer ring. Requests travel from the sites in, faster when there is more traffic.
 */
function Orbit({ services, sites, rate }: { services: ServiceInfo[]; sites: SiteInfo[]; rate: number }): React.JSX.Element {
  const { setPage, showSite } = useApp()
  const W = 560
  const H = 340
  const cx = W / 2
  const cy = H / 2
  const motion = !reduced()
  const { svc, site } = useMemo(() => {
    const inst = services.filter((s) => s.status !== 'not-installed').slice(0, 7)
    const svc: OrbitNode[] = inst.map((s, i) => {
      const a = (i / Math.max(1, inst.length)) * Math.PI * 2 - Math.PI / 2
      return { id: s.id, label: s.name, sub: s.status === 'running' ? (s.port ? `:${s.port}` : 'running') : s.status === 'error' ? 'stopped' : 'off', x: cx + Math.cos(a) * 112, y: cy + Math.sin(a) * 82, live: s.status === 'running', kind: 'svc', onClick: () => setPage('services') }
    })
    const list = [...sites].sort((a, b) => Number(!!b.dev?.running) - Number(!!a.dev?.running)).slice(0, 8)
    const site: OrbitNode[] = list.map((s, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2 + Math.PI / Math.max(2, list.length)
      return { id: s.name, label: s.name, sub: s.domain, x: cx + Math.cos(a) * 236, y: cy + Math.sin(a) * 140, live: !s.dev || !!s.dev.running, kind: 'site', onClick: () => showSite(s.name) }
    })
    return { svc, site }
  }, [services, sites, cx, cy, setPage, showSite])
  const runningSvc = svc.filter((n) => n.live).length
  const liveSites = site.filter((n) => n.live).length
  // Busier traffic sends more, quicker requests; a quiet Mac still shows a slow heartbeat.
  const speed = Math.max(1.1, 3.4 - Math.min(2.3, rate / 6))
  const curve = (a: OrbitNode, b: { x: number; y: number }): string => {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    return `M${a.x},${a.y} Q${mx - dy * 0.18},${my + dx * 0.18} ${b.x},${b.y}`
  }
  // Each site's requests reach the nearest running service, then the centre.
  const nearest = (n: OrbitNode): OrbitNode | { x: number; y: number } => {
    const live = svc.filter((s) => s.live)
    if (!live.length) return { x: cx, y: cy }
    return live.reduce((best, s) => (Math.hypot(s.x - n.x, s.y - n.y) < Math.hypot(best.x - n.x, best.y - n.y) ? s : best))
  }
  return (
    <div className="ov-card ov-orbit" style={{ ['--i' as string]: 1 }}>
      <div className="ov-orbit-head">
        <span className="ov-label">
          <span className="ov-live-dot" data-on={runningSvc > 0} /> Live on this Mac
        </span>
        <span className="ov-sub">
          {liveSites} {liveSites === 1 ? 'site' : 'sites'} · {runningSvc} {runningSvc === 1 ? 'service' : 'services'} running
          {rate >= 0.5 ? ` · ${Math.round(rate)} requests a minute` : ''}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="orbit-svg" role="img" aria-label={`${liveSites} sites and ${runningSvc} services running`}>
        <defs>
          <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={cx} cy={cy} rx="236" ry="140" className="orbit-ring orbit-ring-out" />
        <ellipse cx={cx} cy={cy} rx="112" ry="82" className="orbit-ring" />
        {svc.map((n) => (
          <path key={`c-${n.id}`} d={curve(n, { x: cx, y: cy })} className="orbit-link" data-live={n.live} />
        ))}
        {site.map((n) => {
          const t = nearest(n)
          return <path key={`l-${n.id}`} id={`orbit-p-${n.id}`} d={curve(n, t)} className="orbit-link orbit-link-site" data-live={n.live} />
        })}
        {motion &&
          site
            .filter((n) => n.live && runningSvc > 0)
            .map((n, i) => (
              <g key={`m-${n.id}`}>
                {[0, 1].map((k) => (
                  <circle key={k} r={k ? 2.2 : 3} className="orbit-packet" opacity={k ? 0.55 : 1}>
                    <animateMotion dur={`${(speed + (i % 3) * 0.35).toFixed(2)}s`} begin={`${(i * 0.45 + k * speed * 0.5).toFixed(2)}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1">
                      <mpath href={`#orbit-p-${n.id}`} />
                    </animateMotion>
                  </circle>
                ))}
              </g>
            ))}
        <circle cx={cx} cy={cy} r="54" fill="url(#orbit-core)" className="orbit-core-glow" />
        {motion && runningSvc > 0 && (
          <>
            <circle cx={cx} cy={cy} r="26" className="orbit-wave" />
            <circle cx={cx} cy={cy} r="26" className="orbit-wave orbit-wave-2" />
          </>
        )}
        <g className="orbit-core">
          <circle cx={cx} cy={cy} r="26" />
          <text x={cx} y={cy + 4} textAnchor="middle">
            Mac
          </text>
        </g>
        {[...svc, ...site].map((n) => (
          <g key={`${n.kind}-${n.id}`} className="orbit-node" data-kind={n.kind} data-live={n.live} transform={`translate(${n.x},${n.y})`} onClick={n.onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && n.onClick()}>
            <title>{`${n.label}: ${n.sub}`}</title>
            <circle r={n.kind === 'svc' ? 7 : 9} className="orbit-dot" />
            <text y={n.kind === 'svc' ? -13 : n.y < cy ? -16 : 24} textAnchor="middle" className="orbit-name">
              {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
