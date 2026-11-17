import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CircleAlert, CircleCheck, FolderOpen, Pause, Play, X, FileArchive } from 'lucide-react'
import type { TransferInfo } from '@shared/types'
import { formatBytes } from '../ui'

const api = (): Window['laramac'] => window.laramac

const timeLeft = (s: number | null): string => {
  if (s === null) return ''
  if (s < 5) return 'a few seconds left'
  if (s < 60) return `${s} seconds left`
  if (s < 3600) return `${Math.round(s / 60)} min left`
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min left`
}

/** The words under a copy's bar: how much is done, how fast, how long it will take. */
export function transferLine(t: TransferInfo): string {
  if (t.status === 'paused') return `Paused · ${t.filesDone} of ${t.files} files done`
  if (t.status === 'queued') return 'Getting ready…'
  if (t.status === 'cancelled') return 'Stopped'
  if (t.status === 'error') return t.error ?? 'It did not finish'
  if (t.status === 'done') return t.direction === 'archive' ? 'Done' : `Done · ${t.files} ${t.files === 1 ? 'file' : 'files'}${t.total ? `, ${formatBytes(t.total)}` : ''}`
  if (t.direction === 'archive') return 'Working on the server…'
  const parts = [`${t.filesDone} of ${t.files} ${t.files === 1 ? 'file' : 'files'}`]
  if (t.total) parts.push(`${formatBytes(t.done)} of ${formatBytes(t.total)}`)
  if (t.speed > 0) parts.push(`${formatBytes(t.speed)}/s`)
  const left = timeLeft(t.eta)
  if (left) parts.push(left)
  return parts.join(' · ')
}

const icon = (t: TransferInfo): React.JSX.Element =>
  t.status === 'error' ? <CircleAlert size={15} /> : t.status === 'done' ? <CircleCheck size={15} /> : t.direction === 'upload' ? <ArrowUpFromLine size={15} /> : t.direction === 'download' ? <ArrowDownToLine size={15} /> : <FileArchive size={15} />

function Row({ t }: { t: TransferInfo }): React.JSX.Element {
  const active = t.status === 'running' || t.status === 'queued' || t.status === 'paused'
  const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : null
  const unknown = active && (pct === null || t.direction === 'archive') && t.status === 'running'
  return (
    <div className="xfer" data-status={t.status}>
      <span className="xfer-icon" data-status={t.status}>
        {icon(t)}
      </span>
      <div className="xfer-main">
        <div className="xfer-top">
          <strong title={t.label}>{t.label}</strong>
          <span className="hint">on {t.server}</span>
          {pct !== null && t.status !== 'error' && t.status !== 'cancelled' && <span className="num xfer-pct">{t.status === 'done' ? 100 : pct}%</span>}
        </div>
        <div className="progress xfer-bar" role="progressbar" aria-label={t.label} aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
          <div className={unknown ? 'bar indeterminate' : 'bar'} data-status={t.status} style={unknown ? undefined : { width: `${t.status === 'done' ? 100 : pct ?? 0}%` }} />
        </div>
        <div className="xfer-line" title={t.current ?? undefined}>
          {transferLine(t)}
          {t.status === 'running' && t.current && t.direction !== 'archive' && <span className="xfer-file"> · {t.current}</span>}
        </div>
      </div>
      <div className="xfer-actions">
        {t.status === 'running' && t.direction !== 'archive' && (
          <button className="icon-btn" title="Pause" aria-label="Pause" onClick={() => void api().invoke('transfers:pause', t.id)}>
            <Pause size={14} />
          </button>
        )}
        {t.status === 'paused' && (
          <button className="icon-btn" title="Continue" aria-label="Continue" onClick={() => void api().invoke('transfers:resume', t.id)}>
            <Play size={14} />
          </button>
        )}
        {t.status === 'done' && t.reveal && (
          <button className="icon-btn" title="Show in Finder" aria-label="Show in Finder" onClick={() => void api().invoke('transfers:reveal', t.id)}>
            <FolderOpen size={14} />
          </button>
        )}
        {(active || t.status === 'queued') && (
          <button className="icon-btn" title="Stop" aria-label="Stop" onClick={() => void api().invoke('transfers:cancel', t.id)}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The copy bar at the bottom of the window. Every upload, download and zip shows here with how far along it is,
 * how fast, and how long is left, and can be paused or stopped. Finished ones fade after a few seconds;
 * ones that failed stay until you dismiss them.
 */
export default function TransferDock(): React.JSX.Element | null {
  const [list, setList] = useState<TransferInfo[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void api().invoke('transfers:list').then(setList)
    return api().on('transfers:changed', setList)
  }, [])

  const active = useMemo(() => list.filter((t) => ['queued', 'running', 'paused'].includes(t.status)), [list])
  const settled = list.length - active.length
  // When nothing is running any more, finished and stopped ones clear themselves. Failures wait for you.
  useEffect(() => {
    if (active.length > 0 || settled === 0 || list.some((t) => t.status === 'error')) return
    const id = setTimeout(() => void api().invoke('transfers:clear'), 6000)
    return () => clearTimeout(id)
  }, [active.length, settled, list])

  // Leave room under the page so the bar never hides the last rows of a list.
  useEffect(() => {
    document.documentElement.dataset.dock = list.length > 0 ? 'true' : 'false'
    return () => {
      document.documentElement.dataset.dock = 'false'
    }
  }, [list.length])
  if (list.length === 0) return null
  const ordered = [...active, ...list.filter((t) => !active.includes(t)).reverse()]
  const shown = open ? ordered : ordered.slice(0, 2)
  const overall = active.length > 1 && active.every((t) => t.total > 0) ? Math.round((active.reduce((n, t) => n + t.done, 0) / Math.max(1, active.reduce((n, t) => n + t.total, 0))) * 100) : null

  return (
    <div className="transfer-dock glass no-drag" role="region" aria-label="Copies in progress" aria-live="polite">
      {shown.map((t) => (
        <Row key={t.id} t={t} />
      ))}
      {(ordered.length > 2 || settled > 0) && (
        <div className="xfer-foot">
          {ordered.length > 2 && (
            <button className="btn btn-quiet btn-sm" onClick={() => setOpen((o) => !o)}>
              {open ? 'Show less' : `Show ${ordered.length - 2} more`}
            </button>
          )}
          {overall !== null && <span className="hint">All together {overall}%</span>}
          {settled > 0 && (
            <button className="btn btn-quiet btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void api().invoke('transfers:clear')}>
              Clear finished
            </button>
          )}
        </div>
      )}
    </div>
  )
}
