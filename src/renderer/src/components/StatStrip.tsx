import { useEffect, useRef, useState } from 'react'

export interface Stat {
  label: string
  value: number
  /** Shown after the number, such as "of 4" or "MB". */
  unit?: string
  sub?: string
  tone?: 'ok' | 'warn' | 'bad'
  /** Format the shown number, such as bytes. Receives the animated value. */
  format?: (n: number) => string
}

/** Counts up to a number, once, and again whenever it changes. */
function useCount(target: number): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from.current === target) {
      from.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 700)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(a + (target - a) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

function Tile({ s }: { s: Stat }): React.JSX.Element {
  const n = useCount(s.value)
  return (
    <div className="stat-tile glass" data-tone={s.tone}>
      <span className="stat-label">{s.label}</span>
      <strong className="stat-num">
        {s.format ? s.format(n) : Math.round(n)}
        {s.unit && <small>{s.unit}</small>}
      </strong>
      {s.sub && <span className="stat-sub">{s.sub}</span>}
    </div>
  )
}

/** A row of numbers that animate in: the quick read at the top of a page. */
export default function StatStrip({ stats }: { stats: Stat[] }): React.JSX.Element {
  return (
    <div className="stat-strip" role="group" aria-label="Summary">
      {stats.map((s) => (
        <Tile key={s.label} s={s} />
      ))}
    </div>
  )
}
