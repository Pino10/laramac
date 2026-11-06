import { useEffect, useState } from 'react'
import { ArrowUpRight, Bug, Download, ShieldCheck, Sparkles, Terminal, Wand2 } from 'lucide-react'
import type { IdeStatus } from '@shared/types'
import { useApp } from '../store'
import { Monogram } from '../ui'
import LaramacCode from '../components/LaramacCode'
import CodeLooks from '../components/CodeLooks'
import codeIcon from '../assets/code-icon.png'

const FEATURES: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <Sparkles size={16} />, title: 'AI in the side panel', text: 'Claude Code with your Claude account, and Cline with your local model, Free LLM API or a key. Show or hide the panel from the title bar.' },
  { icon: <Wand2 size={16} />, title: 'PHP that understands your code', text: 'Intelephense for completion and errors as you type, Phpactor for rename, extract and generate. Both free.' },
  { icon: <ShieldCheck size={16} />, title: 'Checks when you save', text: 'PHP’s own check, PHPStan and Psalm, with Laravel’s skills for AI reviews. Semgrep too when MacSec is installed.' },
  { icon: <Bug size={16} />, title: 'Breakpoints', text: 'Xdebug, Blade, .env, Tailwind, Vue, ESLint and Prettier are set up for you.' },
  { icon: <Terminal size={16} />, title: 'A terminal that knows Laramac', text: 'php, composer, node, artisan and claude just work, with each site’s own versions.' }
]

/** Laramac Code's home in Laramac: install it, open it, or open a site in it. The editor is its own app. */
export default function Code(): React.JSX.Element {
  const { act, busy, jobs, sites } = useApp()
  const api = window.laramac
  const [s, setS] = useState<IdeStatus | null>(null)
  useEffect(() => {
    void api.invoke('ide:status').then(setS)
  }, [api, jobs.length])
  if (!s) return <></>
  const job = jobs.find((j) => j.status === 'running' && /Laramac Code/.test(j.label))
  const open = (path: string | null): Promise<unknown> => act(`ide-open-${path ?? 'app'}`, () => api.invoke('ide:open', path))

  return (
    <div className="code-home">
      <section className="code-hero">
        <img className="code-hero-icon" src={codeIcon} alt="" width={112} height={112} />
        <div className="code-hero-text">
          <h1>Laramac Code</h1>
          <p>A code editor of its own, with its own icon in the Dock, set up for PHP and Laravel first and for JavaScript, Vue and React right after. Built on the open-source VS Code.</p>
          <div className="code-hero-actions">
            {s.installed ? (
              <button className="btn btn-primary btn-lg" disabled={busy.has('ide-open-app') || !!job} onClick={() => open(null)}>
                <ArrowUpRight size={16} /> {busy.has('ide-open-app') ? 'Opening…' : 'Open Laramac Code'}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" disabled={!!job || busy.has('ide-install')} onClick={async () => setS((await act('ide-install', () => api.invoke('ide:install'))) ?? s)}>
                <Download size={16} /> {job ? 'Installing…' : 'Install Laramac Code'}
              </button>
            )}
            <span className="hint">
              {s.installed
                ? s.appVersion
                  ? `Version ${s.appVersion}, in your Applications.`
                  : 'The app is added to your Applications the first time you open it.'
                : 'About 300 MB with the extensions. Every download is checked against its published checksum.'}
            </span>
          </div>
          {job && (
            <div className="ide-progress">
              <span>
                {job.label}
                {job.percent !== null ? `, ${job.percent}%` : '…'}
              </span>
              <div className="upd-bar">
                <span style={{ width: `${job.percent ?? 8}%` }} />
              </div>
            </div>
          )}
        </div>
      </section>

      {s.installed && sites.length > 0 && (
        <section>
          <h2 className="section-title">Open a site</h2>
          <div className="code-sites">
            {sites.map((x) => (
              <button key={x.name} className="code-site" disabled={busy.has(`ide-open-${x.path}`)} onClick={() => open(x.path)}>
                <Monogram id={x.kind} />
                <span>
                  <strong>{x.name}</strong>
                  <small>{x.path.replace(/^\/Users\/[^/]+/, '~')}</small>
                </span>
                <ArrowUpRight size={15} className="code-site-go" />
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Choose a look</h2>
        <p className="hint" style={{ margin: '0 0 12px' }}>Ten looks: each one arranges the editor differently, with its own buttons, tabs and colours. If Laramac Code is open, it changes within a minute. You can switch any time.</p>
        <CodeLooks />
      </section>

      <section>
        <h2 className="section-title">Inside</h2>
        <div className="code-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="code-feature">
              <span className="code-feature-icon">{f.icon}</span>
              <strong>{f.title}</strong>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </section>

      {s.installed && (
        <section>
          <h2 className="section-title">Fonts and extensions</h2>
          <LaramacCode />
        </section>
      )}
    </div>
  )
}
