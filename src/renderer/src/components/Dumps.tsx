import { useEffect, useMemo, useState } from 'react'
import { Bug, Search, Trash2, X } from 'lucide-react'
import type { DumpItem } from '@shared/types'
import { useApp } from '../store'
import { Switch } from '../ui'

/** Symfony's dump styles, recoloured for dark glass; scripts never run in the frame. */
const FRAME_CSS = `
html,body{background:#110e1a}body{margin:0;padding:10px 12px;color:#e7e4f2;font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
pre.sf-dump{background:transparent!important;padding:0!important;margin:0!important;white-space:pre-wrap;word-break:break-word;font:inherit!important;color:#e7e4f2!important}
.sf-dump-compact{display:inline!important}
.sf-dump-toggle,.sf-dump-ref{color:#a78bfa!important;text-decoration:none}
.sf-dump-str{color:#86efac!important}.sf-dump-num,.sf-dump-const{color:#fcd34d!important}
.sf-dump-key,.sf-dump-index{color:#7dd3fc!important}.sf-dump-note{color:#c4b5fd!important}
.sf-dump-public,.sf-dump-protected,.sf-dump-private,.sf-dump-meta{color:#f0abfc!important}
.sf-dump-ellipsis{color:#a1a1aa!important}
`

function frameDoc(html: string): string {
  const safe = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${FRAME_CSS}</style>${safe}`
}

const ago = (at: number): string => {
  const s = Math.round((Date.now() - at) / 1000)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : new Date(at).toLocaleTimeString()
}

/** The bug button in the top bar and the drawer it opens. */
export default function Dumps(): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<DumpItem[]>([])
  const [unseen, setUnseen] = useState(0)
  const [status, setStatus] = useState<{ enabled: boolean; running: boolean }>({ enabled: false, running: false })
  const [query, setQuery] = useState('')

  useEffect(() => {
    void api.invoke('dumps:list').then(setItems)
    void api.invoke('dumps:status').then(setStatus)
    return api.on('dumps:new', (d) => {
      setItems((x) => [d, ...x].slice(0, 300))
      setUnseen((n) => n + 1)
    })
  }, [api])
  useEffect(() => {
    if (open) setUnseen(0)
  }, [open, items.length])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((d) => `${d.text} ${d.file ?? ''} ${d.uri ?? ''}`.toLowerCase().includes(q)) : items
  }, [items, query])

  return (
    <>
      <button className="bell" aria-label={`Dumps${unseen ? `, ${unseen} new` : ''}`} data-tip="Dumps" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bug size={16} strokeWidth={2} />
        {unseen > 0 && !open && <span className="badge">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      {open && (
        <aside className="dumps glass" role="dialog" aria-label="Dumps">
          <div className="dumps-head">
            <div>
              <strong>Dumps</strong>
              <span className="hint">{status.enabled ? (status.running ? 'Catching dump() and dd() from your sites' : 'Starting…') : 'Off: dumps show on the page as usual'}</span>
            </div>
            <span title="Catch dumps">
              <Switch
                on={status.enabled}
                label="Catch dump() and dd()"
                disabled={busy.has('dumps')}
                onChange={async () => {
                  const r = await act('dumps', () => api.invoke('dumps:enable', !status.enabled))
                  if (r) {
                    setStatus(r)
                    notify({ kind: 'info', text: r.enabled ? 'dump() and dd() now land here. PHP was restarted to pick it up.' : 'Dumps show on the page again.' })
                  }
                }}
              />
            </span>
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          <div className="dumps-tools">
            <label className="searchbox" style={{ flex: 1 }}>
              <Search size={14} />
              <input placeholder="Filter dumps" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter dumps" />
            </label>
            <button
              className="icon-btn"
              data-tip="Clear"
              aria-label="Clear dumps"
              disabled={items.length === 0}
              onClick={async () => {
                await api.invoke('dumps:clear')
                setItems([])
              }}
            >
              <Trash2 />
            </button>
          </div>
          <div className="dumps-list">
            {shown.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <strong>{items.length ? 'Nothing matches' : 'No dumps yet'}</strong>
                <span>
                  {status.enabled
                    ? 'Call dump($user) or dd($request->all()) in a Laravel or Symfony site and reload the page.'
                    : 'Turn on the switch above, then call dump() or dd() in a Laravel or Symfony site.'}
                </span>
              </div>
            )}
            {shown.map((d) => (
              <div key={d.id} className="dump">
                <div className="dump-meta">
                  {d.file ? (
                    <button className="link mono" title={d.file} onClick={() => act('dump-open', () => api.invoke('dumps:open-file', d.file!, d.line))}>
                      {d.name ?? d.file.split('/').pop()}
                      {d.line ? `:${d.line}` : ''}
                    </button>
                  ) : (
                    <span className="mono">dump</span>
                  )}
                  <span className="hint grow mono">{d.method && d.uri ? `${d.method} ${d.uri.replace(/^https?:\/\/[^/]+/, '')}` : (d.command ?? '')}</span>
                  <span className="hint">{ago(d.at)}</span>
                </div>
                <iframe className="dump-frame" sandbox="allow-same-origin" title="Dump" srcDoc={frameDoc(d.html)} onLoad={(e) => {
                  const f = e.currentTarget
                  try {
                    f.style.height = `${Math.min(420, (f.contentDocument?.body.scrollHeight ?? 60) + 4)}px`
                  } catch {
                    f.style.height = '160px'
                  }
                }} />
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  )
}
