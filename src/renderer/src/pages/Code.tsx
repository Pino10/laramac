import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AppWindow, Check, Code2, ExternalLink, FolderOpen, Settings2, ShieldCheck, Sparkles, Square, Terminal, Bug, Wand2, X } from 'lucide-react'
import type { IdeStatus, ViewRect } from '@shared/types'
import { useApp } from '../store'
import LaramacCode from '../components/LaramacCode'

const FEATURES: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Wand2 size={16} />, title: 'PHP that understands your code', text: 'Intelephense for completion and errors as you type, Phpactor for rename, extract and generate. Both free.' },
  { icon: <ShieldCheck size={16} />, title: 'Checks when you save', text: 'PHP’s own syntax check, PHPStan and Psalm, in the editor. Semgrep too when MacSec is installed.' },
  { icon: <Sparkles size={16} />, title: 'Reviews with skills', text: 'Claude Code, your local model or Free LLM API reads a file or the project with Laravel’s and the security teams’ skills. It never changes your code.' },
  { icon: <Bug size={16} />, title: 'Breakpoints', text: 'Xdebug, Blade, .env, Tailwind, Vue, ESLint and Prettier are set up for you.' },
  { icon: <Terminal size={16} />, title: 'A terminal that knows Laramac', text: 'php, composer, node, artisan and claude just work, with each site’s own versions.' }
]

/** Laramac Code, inside Laramac's window. */
export default function Code(): React.JSX.Element {
  const { act, busy, jobs, sites, codeUrl, paletteOpen, newProject, importOpen } = useApp()
  const api = window.laramac
  const [s, setS] = useState<IdeStatus | null>(null)
  const [prefs, setPrefs] = useState(false)
  const [current, setCurrent] = useState<string>('')
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void api.invoke('ide:status').then(setS)
  }, [api, jobs.length])

  const covered = prefs || paletteOpen || newProject || importOpen
  const show = !!s?.installed && !covered
  const rect = (): ViewRect | null => {
    const el = area.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: Math.max(200, window.innerHeight - r.top - 14) }
  }

  // Shows the editor over the area below the toolbar, and follows the window's size.
  useLayoutEffect(() => {
    if (!show) {
      void api.invoke('ide:unembed')
      return
    }
    const r = rect()
    if (r) void act('ide-embed', () => api.invoke('ide:embed', codeUrl?.url ?? null, r)).then((v) => v && setCurrent(v.url))
    const resize = (): void => {
      const n = rect()
      if (n) void api.invoke('ide:embed-bounds', n)
    }
    const ro = new ResizeObserver(resize)
    if (area.current) ro.observe(area.current)
    window.addEventListener('resize', resize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
    // codeUrl.at changes for every "Open in editor", even for the same folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, codeUrl?.at])
  useEffect(() => () => void api.invoke('ide:unembed'), [api])

  if (!s) return <></>
  const folder = (() => {
    try {
      return new URL(current).searchParams.get('folder') ?? ''
    } catch {
      return ''
    }
  })()
  const site = sites.find((x) => folder && (folder === x.path || folder.startsWith(`${x.path}/`)))

  if (!s.installed)
    return (
      <div className="code-intro">
        <div className="code-hero">
          <span className="code-hero-mark">
            <Code2 size={30} />
          </span>
          <h1>Laramac Code</h1>
          <p>A code editor that lives in Laramac, set up for PHP and Laravel first, and for JavaScript, Vue, React and the rest right after. Built on the open-source VS Code, dressed in Laramac’s look.</p>
        </div>
        <div className="code-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="code-feature">
              <span className="code-feature-icon">{f.icon}</span>
              <strong>{f.title}</strong>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
        <LaramacCode />
      </div>
    )

  return (
    <div className="code-page">
      <div className="code-bar">
        <span className="code-bar-mark">
          <Code2 size={16} />
        </span>
        <div className="code-bar-title">
          <strong>{site ? site.name : folder ? folder.split('/').pop() : 'Laramac Code'}</strong>
          <span>{folder ? folder.replace(/^\/Users\/[^/]+/, '~') : 'Your www folder'}</span>
        </div>
        <label className="code-open">
          <FolderOpen size={14} />
          <select
            aria-label="Open a site"
            value=""
            onChange={(e) => {
              const p = e.target.value
              if (p) void act('ide-open-site', () => api.invoke('sites:open-with', p, 'laramac'))
            }}
          >
            <option value="">Open a site…</option>
            {sites.map((x) => (
              <option key={x.name} value={x.path}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="code-bar-actions">
          <button className="icon-btn" data-tip="Open in its own window" aria-label="Open in its own window" onClick={() => act('ide-detach', () => api.invoke('ide:detach'))}>
            <ExternalLink size={15} />
          </button>
          <button className={s.shortcut ? 'icon-btn' : 'btn btn-sm'} data-tip={s.shortcut ? 'In your Applications. Click to remove.' : undefined} aria-label={s.shortcut ? 'Remove Laramac Code from Applications' : 'Add Laramac Code to Applications'} disabled={busy.has('ide-shortcut')} onClick={async () => setS((await act('ide-shortcut', () => api.invoke('ide:shortcut', !s.shortcut))) ?? s)}>
            {s.shortcut ? <Check size={15} /> : <AppWindow size={14} />}
            {!s.shortcut && 'Add to Applications'}
          </button>
          <button className="icon-btn" data-tip={prefs ? 'Back to the editor' : 'Fonts and extensions'} aria-label="Fonts and extensions" aria-pressed={prefs} onClick={() => setPrefs(!prefs)}>
            {prefs ? <X size={15} /> : <Settings2 size={15} />}
          </button>
          {s.running && (
            <button className="icon-btn" data-tip="Stop Laramac Code" aria-label="Stop Laramac Code" onClick={async () => setS((await act('ide-stop', () => api.invoke('ide:stop'))) ?? s)}>
              <Square size={14} />
            </button>
          )}
        </div>
      </div>
      {prefs ? (
        <div className="code-prefs">
          <LaramacCode />
        </div>
      ) : (
        <div ref={area} className="code-area" aria-label="Laramac Code">
          <div className="code-loading">
            <span className="code-hero-mark">
              <Code2 size={22} />
            </span>
            <span>{busy.has('ide-embed') ? 'Starting Laramac Code…' : covered ? '' : 'Laramac Code'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
