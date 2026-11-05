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
    body: 'A one-minute tour of where everything is. You can leave at any time and replay it from Settings or the command bar.'
  },
  {
    target: '[data-tour="dashboard"]',
    page: 'dashboard',
    title: 'Overview',
    body: 'Your whole stack on one screen. Start all turns on the web server, PHP and databases. Green means running; if something fails, the reason shows right there.'
  },
  {
    target: '[data-tour="sites"]',
    page: 'sites',
    title: 'Sites',
    body: 'Every folder in your www folder is a site at name.test. Each row has buttons to open it, edit it, push it to GitHub, deploy it, snapshot it, and the stethoscope, which asks your local AI what is wrong.'
  },
  {
    target: '[data-tour="starters"]',
    page: 'starters',
    title: 'Starters',
    body: 'New projects in any language: React, Next.js, Laravel, Django, C#, Go, Rust, Swift and more. Laramac installs what is missing and starts it at name.test.'
  },
  {
    target: '[data-tour="languages"]',
    page: 'languages',
    title: 'Languages and databases',
    body: 'PHP, Node.js and every other language, each with the versions you want. Open PHP for its versions, settings and tools. Databases has MySQL, PostgreSQL, Redis and the rest, with backups, imports and phpMyAdmin.'
  },
  {
    target: '[data-tour="servers"]',
    page: 'servers',
    title: 'Servers',
    body: 'Save your hosting servers once, then open a terminal, browse files over SFTP or FTP, and deploy a site in one click.'
  },
  {
    target: '[data-tour="api"]',
    page: 'api',
    title: 'API client and GitHub',
    body: 'Test APIs like in Postman, import your Postman collections, and manage your GitHub repositories without leaving the app.'
  },
  {
    target: '[data-tour="security"]',
    page: 'security',
    title: 'Security',
    body: 'Have Claude Code or your own model review the code of a site, a GitHub repository or an Azure DevOps repository, and scan your sites with Nuclei for known problems.'
  },
  {
    target: '[data-tour="tools"]',
    page: 'tools',
    title: 'Tools and AI',
    body: 'Claude Code, Codex, OpenCode and local models like LM Studio, Ollama and vMLX. Each card shows whether it is working and has a Test button.'
  },
  {
    target: '.search-pill',
    title: 'Do anything with ⌘K',
    body: 'Type what you want: “new react”, “start mysql”, “php 8.4”, a site name. It finds the action and runs it.'
  },
  {
    title: 'You are set',
    body: 'Laramac also lives in the menu bar, where you can start services and dev servers and open sites without opening this window. Enjoy building.'
  }
]

export default function Tour(): React.JSX.Element | null {
  const { tourOpen, setTourOpen, setPage, settings, updateSettings } = useApp()
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = TOUR[i]

  // Opens by itself the first time.
  useEffect(() => {
    if (settings && !settings.tourDone) setTourOpen(true)
  }, [settings?.tourDone]) // eslint-disable-line react-hooks/exhaustive-deps

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
