import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { Page } from '../store'
import { useApp } from '../store'

interface Step {
  /** CSS selector of what to point at; none means a centred card. */
  target?: string
  page?: Page
  title: string
  body: string
}

export const TOUR: Step[] = [
  {
    title: 'Welcome to Laramac',
    body: 'Five quick stops. You can leave at any time and replay this from Settings or the command bar.'
  },
  {
    target: '[data-tour="dashboard"]',
    page: 'dashboard',
    title: 'Overview',
    body: 'Your whole stack on one screen. Green means running. If something fails, the reason and the fix show right there.'
  },
  {
    target: '[data-tour="sites"]',
    page: 'sites',
    title: 'Sites',
    body: 'Every folder in your projects folder is a site at name.test. Click a site for its commands, logs, database, security review and deploy.'
  },
  {
    target: '[data-tour="starters"]',
    page: 'starters',
    title: 'New project',
    body: 'Start in any language: Laravel, WordPress, Next.js, Django, Go and more. Laramac installs what is missing.'
  },
  {
    target: '.search-pill',
    title: 'Do anything with ⌘K',
    body: 'Type what you want: “new react”, “start mysql”, “php 8.4”, a site name. Laramac also lives in the menu bar. Enjoy building.'
  }
]

export default function Tour(): React.JSX.Element | null {
  const { tourOpen, setTourOpen, setPage, settings, updateSettings } = useApp()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = TOUR[i]

  // The tour never opens on its own: the Overview offers it once, and Settings and the command bar replay it.

  useEffect(() => {
    if (tourOpen && step?.page) setPage(step.page)
  }, [tourOpen, i]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!tourOpen || !step?.target) return setRect(null)
    const measure = (): void => {
      const el = document.querySelector(step.target!)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    const t = setTimeout(measure, 120)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
    }
  }, [tourOpen, i, step?.target])

  const close = (): void => {
    setTourOpen(false)
    setI(0)
    if (settings && !settings.tourDone) void updateSettings({ tourDone: true })
  }

  useEffect(() => {
    if (!tourOpen) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI((x) => Math.min(TOUR.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  if (!tourOpen || !step) return null
  const pad = 6
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null
  // The card sits beside what it points at, or in the middle.
  const cardStyle: React.CSSProperties = hole
    ? hole.left < 300
      ? { left: hole.left + hole.width + 18, top: Math.min(Math.max(16, hole.top - 20), window.innerHeight - 260) }
      : { left: Math.min(hole.left, window.innerWidth - 400), top: hole.top + hole.height + 16 }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  const last = i === TOUR.length - 1

  return (
    <div className="tour" role="dialog" aria-label="Tour of Laramac" aria-modal>
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div className="tour-card dialog" style={cardStyle} key={i}>
        <div className="tour-top">
          <span className="tour-count">
            {i + 1} of {TOUR.length}
          </span>
          <button className="icon-btn" aria-label="Close the tour" onClick={close}>
            <X />
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {TOUR.map((_, j) => (
            <span key={j} data-on={j === i} />
          ))}
        </div>
        <div className="tour-actions">
          {i === 0 ? (
            <button className="btn btn-quiet" onClick={close}>
              Skip
            </button>
          ) : (
            <button className="btn" onClick={() => setI(i - 1)}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button className="btn btn-primary" onClick={() => (last ? close() : setI(i + 1))}>
            {last ? 'Finish' : i === 0 ? 'Show me around' : 'Next'} {!last && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
