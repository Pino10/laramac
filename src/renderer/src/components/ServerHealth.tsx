import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle2, Clock, Cpu, HardDrive, MemoryStick, RefreshCw } from 'lucide-react'
import type { ServerHealth as Health, SshServer } from '@shared/types'
import { formatBytes } from '../ui'

const api = (): Window['laramac'] => window.laramac
const EVERY = 10_000

const uptime = (s: number): string => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}
const level = (pct: number): 'ok' | 'warn' | 'bad' => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : 'ok')

/** A ring that fills smoothly when the number changes. */
function Ring({ pct, label, sub, icon }: { pct: number; label: string; sub: string; icon: React.ReactNode }): React.JSX.Element {
  const p = Math.max(0, Math.min(100, pct))
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <div className="hl-ring" data-level={level(p)}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle className="hl-track" cx="50" cy="50" r={r} />
        <circle className="hl-fill" cx="50" cy="50" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 50 50)" />
      </svg>
      <div className="hl-center">
        <strong>{Math.round(p)}%</strong>
      </div>
      <div className="hl-label">
        {icon} {label}
      </div>
      <small>{sub}</small>
    </div>
  )
}

function Spark({ values, max }: { values: number[]; max: number }): React.JSX.Element {
  const w = 240
  const h = 44
  const top = Math.max(max, ...values, 0.01)
  const pts = values.map((v, i) => `${values.length < 2 ? w : (i / (values.length - 1)) * w},${h - 3 - (v / top) * (h - 8)}`).join(' ')
  return (
    <svg className="hl-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {values.length > 1 && <polyline points={pts} fill="none" />}
    </svg>
  )
}

/** Live health of a Linux server over SSH: it reads, and never changes anything. */
export default function ServerHealth({ server, passphrase, onUnknownHost }: { server: SshServer; passphrase: string | null; onUnknownHost: (fp: string, retry: () => void) => void }): React.JSX.Element {
  const [h, setH] = useState<Health | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(false)
  const sid = useRef<string | null>(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const sample = async (): Promise<void> => {
      if (!live || !sid.current) return
      if (!pausedRef.current) {
        try {
          const next = await api().invoke('health:sample', sid.current)
          if (!live) return
          setH(next)
          setError(null)
          setHistory((x) => [...x.slice(-39), next.load[0]])
        } catch (e) {
          if (live) setError(String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        }
      }
      if (live) timer = setTimeout(sample, EVERY)
    }
    void api()
      .invoke('health:open', server.id, passphrase)
      .then((res) => {
        if (!live) {
          if (res.status === 'connected') void api().invoke('health:close', res.session)
          return
        }
        if (res.status === 'unknown-host') return onUnknownHost(res.fingerprint, () => setAttempt((n) => n + 1))
        sid.current = res.session
        void sample()
      })
      .catch((e: Error) => live && setError(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    return () => {
      live = false
      if (timer) clearTimeout(timer)
      if (sid.current) void api().invoke('health:close', sid.current)
      sid.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, passphrase, attempt])

  if (!h)
    return (
      <div className="panel pad hint">
        {error ? (
          <>
            {error}{' '}
            <button className="link" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </>
        ) : (
          'Reading the server…'
        )}
      </div>
    )
  const memPct = h.memTotalKb ? (h.memUsedKb / h.memTotalKb) * 100 : 0
  const diskPct = h.diskTotalKb ? (h.diskUsedKb / h.diskTotalKb) * 100 : 0
  const cpuPct = (h.load[0] / h.cores) * 100
  return (
    <div className="hl">
      {error && <div className="hint" style={{ color: 'var(--warn)' }}>Last read failed: {error}</div>}
      <div className="hl-rings">
        <Ring pct={cpuPct} label="Busy" sub={`Load ${h.load.map((x) => x.toFixed(2)).join(' · ')} on ${h.cores} ${h.cores === 1 ? 'core' : 'cores'}`} icon={<Cpu size={13} />} />
        <Ring pct={memPct} label="Memory" sub={`${formatBytes(h.memUsedKb * 1024)} of ${formatBytes(h.memTotalKb * 1024)}`} icon={<MemoryStick size={13} />} />
        <Ring pct={diskPct} label="Disk" sub={`${formatBytes(h.diskUsedKb * 1024)} of ${formatBytes(h.diskTotalKb * 1024)}`} icon={<HardDrive size={13} />} />
      </div>
      <div className="hl-grid">
        <div className="hl-card glass">
          <div className="hl-label">
            <Activity size={13} /> Load, last {history.length} reads
          </div>
          <Spark values={history} max={h.cores} />
          <small>The line tops out at the number of cores ({h.cores}). Above it, the server is waiting on work.</small>
        </div>
        <div className="hl-card glass">
          <div className="hl-label">
            <Clock size={13} /> Up for
          </div>
          <strong className="hl-big">{uptime(h.uptimeSec)}</strong>
          <small>{h.os || 'Linux'}</small>
          {h.swapTotalKb > 0 && <small>Swap {formatBytes(h.swapUsedKb * 1024)} of {formatBytes(h.swapTotalKb * 1024)}</small>}
        </div>
        <div className="hl-card glass">
          <div className="hl-label">
            <CheckCircle2 size={13} /> Running
          </div>
          {h.services.length === 0 ? (
            <small>No web, database or other known services found, or this server does not use systemd.</small>
          ) : (
            <div className="hl-tags">
              {h.services.map((s) => (
                <span key={s.unit} className="tag tag-ok" title={s.unit}>
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="hl-foot">
        <small>Read {new Date(h.at).toLocaleTimeString()}. Every {EVERY / 1000} seconds, over one quiet connection. Nothing on the server is changed.</small>
        <button className="btn btn-quiet btn-sm" onClick={() => setPaused((p) => !p)}>
          <RefreshCw size={12} /> {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  )
}
