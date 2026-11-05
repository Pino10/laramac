import { useEffect, useState } from 'react'
import { Gauge, Play, Trash2 } from 'lucide-react'
import type { ProfileReport, ProfilerInfo, SiteInfo } from '@shared/types'
import { useApp } from '../store'

const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : n >= 10 ? `${Math.round(n)} ms` : `${n.toFixed(n >= 1 ? 1 : 2)} ms`)
const when = (t: number): string => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * The free profiler: Xdebug's, switched on only when wanted. Profile a page and see which
 * functions took the time, slowest first.
 */
export default function SiteProfiler({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [info, setInfo] = useState<ProfilerInfo | null>(null)
  const [path, setPath] = useState('/')
  const [report, setReport] = useState<ProfileReport | null>(null)
  const [file, setFile] = useState('')
  const [order, setOrder] = useState<'self' | 'incl'>('self')
  const [mine, setMine] = useState(false)

  useEffect(() => {
    void api.invoke('profiler:info', site.name).then(setInfo)
  }, [api, site.name])

  const toggle = async (): Promise<void> => {
    const r = await act('profiler-set', () => api.invoke('profiler:set', !info?.on, site.name))
    if (r) setInfo(r)
  }
  const profile = async (): Promise<void> => {
    const r = await act('profiler-run', () => api.invoke('profiler:run', site.name, path.startsWith('/') ? path : `/${path}`))
    if (!r) return
    setReport(r.report)
    setFile(r.file)
    setInfo(await api.invoke('profiler:info', site.name))
  }
  const open = async (f: string): Promise<void> => {
    const r = await act('profiler-read', () => api.invoke('profiler:read', site.name, f))
    if (r) {
      setReport(r)
      setFile(f)
    }
  }

  if (info && !info.php) {
    return (
      <div className="panel pad">
        <div className="row-title">The profiler is for PHP sites</div>
        <div className="row-sub">This site does not run on PHP.</div>
      </div>
    )
  }

  const rows = (report?.functions ?? []).filter((f) => !mine || (!f.internal && !/\/vendor\//.test(f.file))).sort((a, b) => (order === 'self' ? b.selfMs - a.selfMs : b.inclMs - a.inclMs))
  const top = Math.max(0.001, ...rows.map((r) => (order === 'self' ? r.selfMs : r.inclMs)))

  return (
    <div className="prof">
      <div className={`prof-switch glass${info?.on ? ' on' : ''}`}>
        <span className="icon-chip">
          <Gauge size={16} />
        </span>
        <div className="row-main">
          <div className="row-title">Profiler {info?.on ? <span className="tag">On</span> : null}</div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>
            {info?.on
              ? 'Only pages you profile are measured, so the rest stay fast. While it is on, the Xdebug debugger also waits for its trigger (the Xdebug Helper browser extension).'
              : 'Free and off by default. It shows which functions make a page slow. Switching it on restarts PHP.'}
          </div>
        </div>
        <button className={info?.on ? 'btn' : 'btn btn-primary'} disabled={busy.has('profiler-set')} onClick={toggle}>
          {busy.has('profiler-set') ? 'One moment…' : info?.on ? 'Switch off' : 'Switch on'}
        </button>
      </div>

      {info?.on && (
        <>
          <div className="cmd-bar">
            <span className="prof-host mono">{site.domain}</span>
            <input className="cmd-input" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void profile()} aria-label="Page to profile" spellCheck={false} placeholder="/dashboard" />
            <button className="btn btn-primary" disabled={busy.has('profiler-run') || !info.ready} onClick={profile}>
              <Play size={14} /> {busy.has('profiler-run') ? 'Profiling…' : 'Profile this page'}
            </button>
          </div>
          {!info.ready && <p className="cmd-hint">Xdebug is not in this site’s PHP {site.php} yet. Update PHP on the PHP page, then try again.</p>}
          <p className="cmd-hint">
            Laramac loads the page once with the profiler’s cookie. For pages behind a login, set the cookie XDEBUG_PROFILE=1 in your browser (the Xdebug Helper extension does it) and they show up below too.
          </p>

          <div className="prof-body">
            <aside className="prof-list">
              <div className="cmd-group-head">
                <span>Profiles</span>
                {!!info.items.length && (
                  <button className="link" onClick={async () => setInfo((await act('profiler-clear', () => api.invoke('profiler:clear', site.name))) ?? info)}>
                    <Trash2 size={12} /> Clear
                  </button>
                )}
              </div>
              {!info.items.length && <div className="cmd-empty">None yet. Profile a page to see where its time goes.</div>}
              {info.items.map((p) => (
                <button key={p.file} className="prof-item" aria-pressed={p.file === file} onClick={() => open(p.file)}>
                  <strong className="mono">{p.path}</strong>
                  <small>
                    {when(p.at)} · {(p.size / 1024).toFixed(0)} KB
                  </small>
                </button>
              ))}
            </aside>
            <section className="prof-report panel">
              {!report && <div className="cmd-empty">{file === '' && busy.has('profiler-run') ? 'Loading the page…' : 'Pick a profile, or profile a page.'}</div>}
              {report && (
                <>
                  <div className="prof-sum">
                    <div>
                      <span className="prof-big">{ms(report.totalMs)}</span>
                      <small>in PHP, while profiling (it runs slower than usual)</small>
                    </div>
                    <div>
                      <span className="prof-big">{report.count}</span>
                      <small>functions ran</small>
                    </div>
                    <div className="prof-tools">
                      <div className="seg-tabs" role="tablist">
                        <button role="tab" aria-selected={order === 'self'} onClick={() => setOrder('self')} title="Time spent in the function itself">
                          Own time
                        </button>
                        <button role="tab" aria-selected={order === 'incl'} onClick={() => setOrder('incl')} title="Including everything it called">
                          With calls
                        </button>
                      </div>
                      <label className="check">
                        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only my code
                      </label>
                    </div>
                  </div>
                  <table className="prof-table">
                    <thead>
                      <tr>
                        <th>Function</th>
                        <th className="num">Calls</th>
                        <th className="num">Own</th>
                        <th className="num">With calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((f, i) => {
                        const v = order === 'self' ? f.selfMs : f.inclMs
                        const rel = f.file.startsWith(site.path + '/') ? f.file.slice(site.path.length + 1) : f.file
                        return (
                          <tr key={`${f.name}-${i}`}>
                            <td>
                              <div className="prof-fn">
                                <i style={{ width: `${Math.max(2, (v / top) * 100)}%` }} data-internal={f.internal} />
                                <span className="mono">{f.name}</span>
                              </div>
                              {rel && (
                                <button className="link prof-file mono" onClick={() => api.invoke('dumps:open-file', f.file, f.line)} disabled={!f.file.startsWith(site.path + '/')}>
                                  {rel}:{f.line}
                                </button>
                              )}
                            </td>
                            <td className="num">{f.calls.toLocaleString('en-GB')}</td>
                            <td className="num">{ms(f.selfMs)}</td>
                            <td className="num">{ms(f.inclMs)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
