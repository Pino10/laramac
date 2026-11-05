import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Download, RefreshCw } from 'lucide-react'
import type { RuntimeId, RuntimeInfo } from '@shared/types'
import { NodeVersionsPanel } from '../components/NodeVersions'
import { useApp } from '../store'
import { PageHead, SubPage } from '../ui'

/** Each language's colour and short mark. */
const LOOK: Record<RuntimeId, { mark: string; color: string }> = {
  php: { mark: 'php', color: '#7a86c8' },
  node: { mark: 'JS', color: '#5fa04e' },
  bun: { mark: 'Bun', color: '#e8c7a0' },
  python: { mark: 'Py', color: '#3d7ab8' },
  dotnet: { mark: '.NET', color: '#7b5cd6' },
  go: { mark: 'Go', color: '#00add8' },
  rust: { mark: 'Rs', color: '#dea584' },
  swift: { mark: 'Sw', color: '#f05138' }
}

/** Languages with more than one version have their own page: PHP and Node.js. */
const VERSIONS: Partial<Record<RuntimeId, string>> = { php: 'PHP versions', node: 'Node.js versions' }

/** Every language Laramac can run. PHP and Node.js open their versions; the others install the newest. */
export default function Languages(): React.JSX.Element {
  const { act, busy, setPage, php } = useApp()
  const api = window.laramac
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([])
  const [latest, setLatest] = useState<Partial<Record<RuntimeId, string>>>({})
  const [view, setView] = useState<'all' | 'node'>('all')
  useEffect(() => {
    void api.invoke('runtimes:list').then(setRuntimes)
    void api.invoke('runtimes:latest').then(setLatest).catch(() => undefined)
  }, [api])

  if (view === 'node')
    return (
      <>
        <button className="back-link" onClick={() => setView('all')}>
          <ArrowLeft size={14} /> Languages
        </button>
        <SubPage.Provider value={true}>
          <PageHead title="Node.js versions" desc="Install the versions your projects ask for, side by side. Each site uses the one in its .nvmrc or package.json, or the one you pick on its page." />
        </SubPage.Provider>
        <NodeVersionsPanel />
      </>
    )

  const phpCount = php.filter((p) => p.installed).length
  // PHP first, then what is installed, then the rest.
  const sorted = [...runtimes].sort((a, b) => Number(b.id === 'php') - Number(a.id === 'php') || Number(b.id === 'node') - Number(a.id === 'node') || Number(b.installed) - Number(a.installed))
  return (
    <>
      <PageHead title="Languages" desc="PHP, Node.js, Bun, Python, .NET, Go, Rust and Swift. Laramac keeps its own copies in its folder, so nothing else on your Mac changes; copies you installed yourself are used when present." />
      <div className="lang-grid">
        {sorted.map((r) => {
          const look = LOOK[r.id]
          const newer = latest[r.id] && r.version && r.managed && r.id !== 'php' && r.id !== 'python' && latest[r.id] !== r.version
          const versions = VERSIONS[r.id]
          const open = (): void => (r.id === 'php' ? setPage('php') : setView('node'))
          return (
            <div key={r.id} className="lang-card" data-on={r.installed} style={{ ['--lang' as string]: look.color }} onClick={versions ? open : undefined} role={versions ? 'button' : undefined} tabIndex={versions ? 0 : undefined} onKeyDown={(e) => versions && e.key === 'Enter' && open()}>
              <div className="lang-top">
                <span className="lang-mark">{look.mark}</span>
                {r.installed ? <span className="tag">{r.managed ? 'Laramac' : 'This Mac'}</span> : <span className="tag tag-dim">Not installed</span>}
              </div>
              <div className="lang-name">{r.name}</div>
              <div className="lang-desc">{r.description}</div>
              <div className="lang-foot">
                <span className="lang-version">
                  {r.id === 'php' && phpCount > 1 ? `${phpCount} versions` : r.installed ? r.version : latest[r.id] ? `Newest ${latest[r.id]}` : ''}
                </span>
                {versions ? (
                  <span className="lang-open">
                    {r.installed ? versions : 'Choose a version'} <ChevronRight size={14} />
                  </span>
                ) : !r.installed || newer ? (
                  <button
                    className={r.installed ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                    disabled={busy.has(`rt-${r.id}`) || !r.canInstall}
                    onClick={(e) => {
                      e.stopPropagation()
                      void act(`rt-${r.id}`, () => api.invoke('runtimes:install', r.id).then(setRuntimes))
                    }}
                  >
                    {r.installed ? <RefreshCw size={13} /> : <Download size={13} />}
                    {busy.has(`rt-${r.id}`) ? 'Installing…' : r.installed ? `Update to ${latest[r.id]}` : 'Install'}
                  </button>
                ) : (
                  <span className="st-ready">
                    <Check size={14} /> Up to date
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
