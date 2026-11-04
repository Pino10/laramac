import { useCallback, useEffect, useState } from 'react'
import { Bug, Container, Play, Plus, QrCode, RefreshCw, Rocket, Square, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import type { HostingConfig, RequestSummary, SiteInfo, TestSummary, WorkersInfo, WorkerConfig } from '@shared/types'
import { useApp } from '../store'
import { Switch } from '../ui'

const api = (): typeof window.laramac => window.laramac

/** The site's latest requests from the web server's log, with timings. */
export function RequestsTab({ site }: { site: SiteInfo }): React.JSX.Element {
  const [r, setR] = useState<RequestSummary | null>(null)
  const [only, setOnly] = useState<'all' | 'errors' | 'slow'>('all')
  const load = useCallback(() => void api().invoke('site:requests', site.name).then(setR), [site.name])
  useEffect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])
  if (!r) return <div className="panel pad hint">Reading the web server’s log…</div>
  const lines = r.lines.filter((l) => only === 'all' || (only === 'errors' ? l.status >= 400 : l.ms >= Math.max(300, r.p95)))
  return (
    <div className="site-grid">
      <div className="req-stats">
        <div className="panel pad"><span className="hint">Requests</span><strong>{r.count}</strong></div>
        <div className="panel pad"><span className="hint">Typical time</span><strong>{r.p50} ms</strong></div>
        <div className="panel pad"><span className="hint">Slowest 5%</span><strong>{r.p95} ms</strong></div>
        <div className="panel pad" data-bad={r.errors > 0}><span className="hint">Server errors</span><strong>{r.errors}</strong></div>
      </div>
      {r.slowest.length > 0 && (
        <div className="panel">
          <div className="panel-title">Slowest addresses (average)</div>
          {r.slowest.slice(0, 5).map((s) => (
            <div key={`${s.method} ${s.path}`} className="req-row">
              <span className="m-badge" data-m={s.method}>{s.method}</span>
              <span className="mono grow">{s.path}</span>
              <span className="hint">{s.count}×</span>
              <strong>{s.ms} ms</strong>
            </div>
          ))}
        </div>
      )}
      <div className="panel">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Latest
          <div className="seg" style={{ marginLeft: 'auto' }}>
            {(['all', 'errors', 'slow'] as const).map((k) => (
              <button key={k} role="radio" aria-checked={only === k} onClick={() => setOnly(k)}>
                {k === 'all' ? 'All' : k === 'errors' ? 'Errors' : 'Slow'}
              </button>
            ))}
          </div>
        </div>
        {lines.length === 0 && <div className="empty dim">No requests yet. Open the site and they appear here, live.</div>}
        {lines.slice(0, 150).map((l, i) => (
          <div key={i} className="req-row" data-status={l.status >= 500 ? 'bad' : l.status >= 400 ? 'warn' : 'ok'}>
            <span className="hint mono">{l.at.slice(11, 19)}</span>
            <span className="m-badge" data-m={l.method}>{l.method}</span>
            <span className="mono grow" title={l.path}>{l.path}</span>
            <span className="status-chip" data-ok={l.status < 400}>{l.status}</span>
            <span className="mono" style={{ width: 70, textAlign: 'right' }}>{l.ms} ms</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Queue workers, schedulers and other background commands for the site. */
export function WorkersTab({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy } = useApp()
  const [w, setW] = useState<WorkersInfo | null>(null)
  const [log, setLog] = useState<{ id: string; text: string } | null>(null)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    void api().invoke('workers:list', site.name).then(setW)
  }, [site.name])
  useEffect(() => {
    if (!log) return
    const t = setInterval(() => void api().invoke('workers:logs', site.name, log.id).then((text) => setLog({ id: log.id, text })), 2000)
    return () => clearInterval(t)
  }, [log, site.name])
  if (!w) return <div className="panel pad hint">Loading…</div>
  const save = async (list: WorkerConfig[]): Promise<void> => setW((await act(`workers-${site.name}`, () => api().invoke('workers:save', site.name, list))) ?? w)
  return (
    <div className="site-grid">
      <div className="panel">
        <div className="panel-title">Workers</div>
        {w.configured.length === 0 && <div className="empty dim">No workers yet. Add one of the suggestions, or your own command.</div>}
        {w.configured.map((x) => {
          const on = w.running.includes(x.id)
          return (
            <div key={x.id} className="rt-row">
              <span className={on ? 'dot dot-on' : 'dot'} />
              <div className="row-main">
                <div className="row-title">{x.name}</div>
                <div className="row-sub mono">{x.command.join(' ')}</div>
              </div>
              <button className="btn btn-sm btn-quiet" onClick={async () => setLog({ id: x.id, text: await api().invoke('workers:logs', site.name, x.id) })}>
                Log
              </button>
              <button className={on ? 'btn btn-sm' : 'btn btn-sm btn-primary'} disabled={busy.has(`w-${x.id}`)} onClick={async () => setW((await act(`w-${x.id}`, () => api().invoke(on ? 'workers:stop' : 'workers:start', site.name, x.id))) ?? w)}>
                {on ? <Square size={12} /> : <Play size={12} />} {on ? 'Stop' : 'Start'}
              </button>
              <button className="icon-btn" aria-label={`Remove ${x.name}`} disabled={on} onClick={() => save(w.configured.filter((c) => c.id !== x.id))}>
                <Trash2 />
              </button>
            </div>
          )
        })}
      </div>
      {w.suggested.length > 0 && (
        <div className="panel">
          <div className="panel-title">Suggested for this project</div>
          {w.suggested.map((x) => (
            <div key={x.id} className="rt-row">
              <div className="row-main">
                <div className="row-title">{x.name}</div>
                <div className="row-sub mono">{x.command.join(' ')}</div>
              </div>
              <button className="btn btn-sm" onClick={() => save([...w.configured, x])}>
                <Plus size={12} /> Add
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="panel pad"
        style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault()
          const words = draft.trim().split(/\s+/).filter(Boolean)
          if (!words.length) return
          void save([...w.configured, { id: `custom-${Date.now().toString(36)}`, name: words.slice(0, 3).join(' '), command: words }]).then(() => setDraft(''))
        }}
      >
        <input className="input mono" style={{ flex: 1 }} placeholder="Your own command, such as php artisan queue:work redis" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn" disabled={!draft.trim()}>
          <Plus size={13} /> Add
        </button>
      </form>
      <p className="hint">Workers run the project’s own code with its PHP and Node versions, and stop when Laramac quits.</p>
      {log && (
        <div className="panel">
          <div className="panel-title" style={{ display: 'flex' }}>
            Log: {w.configured.find((c) => c.id === log.id)?.name}
            <button className="link" style={{ marginLeft: 'auto' }} onClick={() => setLog(null)}>
              Close
            </button>
          </div>
          <pre className="code-block log-view">{log.text || 'Nothing yet.'}</pre>
        </div>
      )}
    </div>
  )
}

/** The project's own tests, run from here, with the results. */
export function TestsTab({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy } = useApp()
  const [runners, setRunners] = useState<{ id: string; name: string; command: string[] }[] | null>(null)
  const [res, setRes] = useState<Record<string, { summary: TestSummary; output: string; ms: number }>>({})
  const [show, setShow] = useState<string | null>(null)
  useEffect(() => {
    void api().invoke('tests:runners', site.name).then(setRunners)
  }, [site.name])
  if (!runners) return <div className="panel pad hint">Looking for tests…</div>
  if (!runners.length) return <div className="panel pad hint">No test runner was found. Laramac looks for Pest, PHPUnit, Vitest, Jest, Playwright, npm test, pytest, go test and cargo test (install the project’s packages first).</div>
  return (
    <div className="site-grid">
      <div className="panel">
        {runners.map((r) => {
          const x = res[r.id]
          return (
            <div key={r.id} className="rt-row">
              <div className="row-main">
                <div className="row-title">
                  {r.name}
                  {x && (x.summary.failed ? <span className="tag tag-bad">{x.summary.failed} failed</span> : <span className="tag tag-ok">{x.summary.passed} passed</span>)}
                </div>
                <div className="row-sub mono">{r.command.join(' ')}{x ? ` · ${(x.ms / 1000).toFixed(1)} s` : ''}</div>
              </div>
              {x && (
                <button className="btn btn-sm btn-quiet" onClick={() => setShow(show === r.id ? null : r.id)}>
                  {show === r.id ? 'Hide output' : 'Output'}
                </button>
              )}
              <button
                className="btn btn-sm btn-primary"
                disabled={busy.has(`test-${r.id}`)}
                onClick={async () => {
                  const out = await act(`test-${r.id}`, () => api().invoke('tests:run', site.name, r.id))
                  if (out) {
                    setRes({ ...res, [r.id]: out })
                    if (out.summary.failed) setShow(r.id)
                  }
                }}
              >
                <Play size={12} /> {busy.has(`test-${r.id}`) ? 'Running…' : 'Run'}
              </button>
            </div>
          )
        })}
      </div>
      {show && res[show] && (
        <div className="panel">
          {res[show].summary.failures.length > 0 && (
            <div className="pad">
              <div className="row-title">Failing</div>
              <ul className="fail-list">
                {res[show].summary.failures.map((f) => (
                  <li key={f} className="mono">{f}</li>
                ))}
              </ul>
            </div>
          )}
          <pre className="code-block log-view">{res[show].output}</pre>
        </div>
      )}
      <p className="hint">Tests run the project’s own code, with its PHP and Node versions.</p>
    </div>
  )
}

/** CORS, debugging, other devices and Docker Compose, on the site's overview. */
export function SiteExtras({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy, settings, setPage } = useApp()
  const [cors, setCors] = useState(!!settings?.siteConfig?.[site.name]?.cors)
  const [lan, setLan] = useState<{ urls: string[]; allowLan: boolean; folders: boolean; share: string | null } | null>(null)
  const [qr, setQr] = useState<{ url: string; img: string } | null>(null)
  const [compose, setCompose] = useState<{ file: string | null; docker: boolean; services: { name: string; state: string; status: string; ports: string }[] } | null>(null)
  useEffect(() => {
    void api().invoke('compose:status', site.name).then(setCompose).catch(() => undefined)
  }, [site.name])
  const isPhp = !!site.php || ['laravel', 'wordpress', 'symfony', 'php'].includes(site.kind)
  const showQr = async (url: string): Promise<void> => setQr({ url, img: await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#111111', light: '#ffffff' } }) })
  return (
    <div className="panel">
      <div className="row row-set">
        <div className="row-main">
          <div className="row-title">Cross-origin requests (CORS)</div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>Let pages on localhost and .{settings?.tld ?? 'test'} addresses call this site, with cookies. Useful when the front end and the API are separate sites. Pages on the internet still cannot.</div>
        </div>
        <Switch on={cors} label="Cross-origin requests" onChange={async () => { const r = await act(`cors-${site.name}`, () => api().invoke('site:cors', site.name, !cors)); if (r !== undefined) setCors(r) }} />
      </div>
      {isPhp && (
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Step-through debugging</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>Turns on Xdebug and adds “Listen for Xdebug” to .vscode/launch.json (VS Code and Cursor). Press F5 in the editor, then load the page.</div>
          </div>
          <button className="btn btn-sm" disabled={busy.has(`debug-${site.name}`)} onClick={() => act(`debug-${site.name}`, () => api().invoke('site:debug-setup', site.name))}>
            <Bug size={13} /> {busy.has(`debug-${site.name}`) ? 'Setting up…' : 'Set up debugging'}
          </button>
        </div>
      )}
      <div className="row row-set">
        <div className="row-main">
          <div className="row-title">Open on your phone</div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>
            {lan === null
              ? 'A QR code for this site on your Wi-Fi, or its public share link.'
              : lan.urls.length
                ? 'Scan with your phone’s camera, on the same Wi-Fi.'
                : lan.share
                  ? 'Your phone can open the public share link.'
                  : 'Turn on “Open to other devices” and “Projects at localhost/folder” in Settings, or share a public link on the Ship tab.'}
          </div>
        </div>
        {lan && !lan.urls.length && !lan.share ? (
          <button className="btn btn-sm" onClick={() => setPage('settings')}>Settings</button>
        ) : (
          <button className="btn btn-sm" onClick={async () => { const l = await api().invoke('site:lan', site.name); setLan(l); const u = l.urls[0] ?? l.share; if (u) await showQr(u) }}>
            <QrCode size={13} /> Show QR code
          </button>
        )}
      </div>
      {qr && (
        <div className="qr-box">
          <img src={qr.img} alt={`QR code for ${qr.url}`} width={180} height={180} />
          <div>
            <div className="mono">{qr.url}</div>
            {lan && lan.urls.length > 1 && (
              <div className="hint" style={{ marginTop: 6 }}>
                Other addresses: {lan.urls.slice(1).map((u) => <button key={u} className="link mono" onClick={() => showQr(u)}>{u}</button>)}
              </div>
            )}
          </div>
        </div>
      )}
      {compose?.file && (
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">
              <Container size={14} /> Docker Compose ({compose.file})
            </div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {!compose.docker ? 'Install OrbStack, Docker Desktop or Colima to run these containers.' : compose.services.length ? compose.services.map((s) => `${s.name}: ${s.state}${s.ports ? ` (${s.ports})` : ''}`).join(' · ') : 'Not running.'}
            </div>
          </div>
          {compose.docker && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="icon-btn" aria-label="Refresh containers" onClick={() => void api().invoke('compose:status', site.name).then(setCompose)}>
                <RefreshCw />
              </button>
              {compose.services.some((s) => s.state === 'running') ? (
                <button className="btn btn-sm" disabled={busy.has(`compose-${site.name}`)} onClick={async () => { await act(`compose-${site.name}`, () => api().invoke('compose:down', site.name)); setCompose(await api().invoke('compose:status', site.name)) }}>
                  <Square size={12} /> Stop
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={busy.has(`compose-${site.name}`)} onClick={async () => { await act(`compose-${site.name}`, () => api().invoke('compose:up', site.name)); setCompose(await api().invoke('compose:status', site.name)) }}>
                  <Play size={12} /> Start containers
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Where the site is hosted, and a Deploy button for it. */
export function HostingPanel({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy, settings, notify } = useApp()
  const saved = settings?.siteConfig?.[site.name]?.hosting
  const [kind, setKind] = useState<HostingConfig['kind']>(saved?.kind ?? 'forge')
  const [hook, setHook] = useState('')
  const [app, setApp] = useState(saved?.app ?? '')
  const [group, setGroup] = useState(saved?.group ?? '')
  const [current, setCurrent] = useState<HostingConfig | undefined>(saved)
  const NAMES: Record<HostingConfig['kind'], string> = { forge: 'Laravel Forge', ploi: 'Ploi', vercel: 'Vercel', netlify: 'Netlify', azure: 'Azure App Service' }
  return (
    <div className="panel pad hosting">
      <div className="row-title">
        <Rocket size={14} /> Hosting {current && <span className="tag tag-ok">{NAMES[current.kind]}</span>}
      </div>
      <div className="seg" role="radiogroup" style={{ margin: '10px 0', display: 'flex', width: 'fit-content' }}>
        {(Object.keys(NAMES) as HostingConfig['kind'][]).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
            {NAMES[k]}
          </button>
        ))}
      </div>
      {(kind === 'forge' || kind === 'ploi') && (
        <input className="input mono" type="password" placeholder={current?.kind === kind && current.hookSaved ? 'Deploy hook saved in the Keychain (paste a new one to replace it)' : kind === 'forge' ? 'Forge Deployment trigger URL' : 'Ploi deploy webhook URL'} value={hook} onChange={(e) => setHook(e.target.value)} autoComplete="off" />
      )}
      {kind === 'azure' && (
        <div className="az-form">
          <input className="input mono" placeholder="App Service name" value={app} onChange={(e) => setApp(e.target.value)} />
          <input className="input mono" placeholder="Resource group (optional)" value={group} onChange={(e) => setGroup(e.target.value)} />
        </div>
      )}
      <p className="hint">
        {kind === 'forge' || kind === 'ploi'
          ? 'Deploy calls their deploy hook; the address is kept in the Keychain and sent only to them.'
          : kind === 'azure'
            ? 'Deploy opens Terminal with az webapp up (sign in with az login once).'
            : `Deploy opens Terminal with the official ${NAMES[kind]} command, so you can sign in and see every step.`}
      </p>
      <div className="end">
        <button
          className="btn"
          disabled={busy.has(`host-${site.name}`)}
          onClick={async () => {
            const r = await act(`host-${site.name}`, () => api().invoke('hosting:set', site.name, { kind, app, group }, hook || null))
            if (r) {
              setCurrent(r)
              setHook('')
              notify({ kind: 'info', text: `${site.name} deploys to ${NAMES[r.kind]}.` })
            }
          }}
        >
          Save
        </button>
        {current && (
          <>
            {current.kind !== 'forge' && current.kind !== 'ploi' && current.kind !== 'azure' && (
              <button className="btn" onClick={() => act(`deploy-${site.name}`, () => api().invoke('hosting:deploy', site.name, false))}>
                Preview deploy
              </button>
            )}
            <button className="btn btn-primary" disabled={busy.has(`deploy-${site.name}`)} onClick={() => act(`deploy-${site.name}`, () => api().invoke('hosting:deploy', site.name, true))}>
              <Rocket size={13} /> Deploy to {NAMES[current.kind]}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
