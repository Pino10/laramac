import { useEffect, useState } from 'react'
import { Check, Download, RefreshCw } from 'lucide-react'
import type { RuntimeId, RuntimeInfo } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'

/** Every language Laramac can run, with the version you have and the newest one. */
export default function Languages(): React.JSX.Element {
  const { act, busy, setPage } = useApp()
  const api = window.laramac
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([])
  const [latest, setLatest] = useState<Partial<Record<RuntimeId, string>>>({})
  useEffect(() => {
    void api.invoke('runtimes:list').then(setRuntimes)
    void api.invoke('runtimes:latest').then(setLatest).catch(() => undefined)
  }, [api])
  return (
    <>
      <PageHead title="Languages" desc="Node.js, Bun, Python, .NET, Go, Rust, Swift and PHP. Laramac keeps its own copies in its folder, and uses the ones you installed yourself when they are there." />
        <div className="panel">
          {runtimes.map((r) => {
            const newer = latest[r.id] && r.version && r.managed && r.id !== 'php' && latest[r.id] !== r.version && r.id !== 'python'
            return (
              <div key={r.id} className="rt-row">
                <div className="row-main">
                  <div className="row-title">
                    {r.name}
                    {r.installed && <span className="tag">{r.managed ? 'Laramac' : 'This Mac'}</span>}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                    {r.description}
                  </div>
                </div>
                <div className="rt-version">
                  {r.installed ? <strong>{r.version}</strong> : <span className="hint">Not installed</span>}
                  {latest[r.id] && <span className="hint">Latest {latest[r.id]}</span>}
                </div>
                {r.id === 'php' ? (
                  <button className="btn btn-sm" style={{ width: 120 }} onClick={() => setPage('php')}>
                    PHP versions
                  </button>
                ) : !r.installed || newer ? (
                  <button
                    className={r.installed ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
                    style={{ width: 120 }}
                    disabled={busy.has(`rt-${r.id}`) || !r.canInstall}
                    onClick={() => act(`rt-${r.id}`, () => api.invoke('runtimes:install', r.id).then(setRuntimes))}
                  >
                    {r.installed ? <RefreshCw size={13} /> : <Download size={13} />}
                    {busy.has(`rt-${r.id}`) ? 'Installing' : r.installed ? 'Update' : 'Install'}
                  </button>
                ) : (
                  <span className="st-ready">
                    <Check size={14} /> Ready
                  </span>
                )}
              </div>
            )
          })}
          <div className="hint" style={{ padding: '12px 18px' }}>
            Laramac keeps its own copies in its folder, so nothing else on your Mac changes. Copies you installed yourself (with Homebrew, say) are used when present.
          </div>
        </div>
    </>
  )
}
