import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, FolderPlus, Plus, Send, TerminalSquare, Trash2, X } from 'lucide-react'
import type { ApiCollection, ApiEnvironment, ApiRequest, ApiResponse, ApiStore, HttpMethod, KV } from '@shared/types'
import { useApp } from '../store'
import { formatBytes } from '../ui'
import { useAsk } from '../components/Ask'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const id = (): string => Math.random().toString(16).slice(2, 14).padEnd(12, '0')

function blank(name = 'New request'): ApiRequest {
  return { id: id(), name, method: 'GET', url: '{{base}}/', query: [], headers: [], body: { type: 'none', text: '', form: [] }, auth: { type: 'none', token: '', user: '', pass: '' } }
}

/** Key/value rows with an always-empty last row to type into. */
function KvEditor({ rows, onChange, keyLabel = 'Name', valueLabel = 'Value' }: { rows: KV[]; onChange: (r: KV[]) => void; keyLabel?: string; valueLabel?: string }): React.JSX.Element {
  const all = [...rows, { key: '', value: '', enabled: true }]
  const set = (i: number, patch: Partial<KV>): void => {
    const next = all.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r, j) => j < all.length - 1 || r.key || r.value)
    onChange(next.filter((r) => r.key || r.value))
  }
  return (
    <div className="kv">
      {all.map((r, i) => {
        const last = i === all.length - 1
        return (
          <div key={i} className="kv-row" data-off={!r.enabled}>
            <input type="checkbox" checked={r.enabled} disabled={last} onChange={(e) => set(i, { enabled: e.target.checked })} aria-label="Include" />
            <input className="input mono" placeholder={keyLabel} value={r.key} onChange={(e) => set(i, { key: e.target.value })} />
            <input className="input mono" placeholder={valueLabel} value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
            {!last ? (
              <button className="icon-btn" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <X />
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** JSON with colour, built from React elements (never raw HTML). */
function PrettyJson({ text }: { text: string }): React.JSX.Element {
  const parts = useMemo(() => {
    const out: React.ReactNode[] = []
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
    let last = 0
    let m: RegExpExecArray | null
    let k = 0
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index))
      if (m[1]) out.push(<span key={k++} className={m[2] ? 'j-key' : 'j-str'}>{m[1]}</span>, m[2] ?? '')
      else if (m[3]) out.push(<span key={k++} className="j-lit">{m[3]}</span>)
      else out.push(<span key={k++} className="j-num">{m[4]}</span>)
      last = re.lastIndex
    }
    out.push(text.slice(last))
    return out
  }, [text])
  return <pre className="resp-body">{parts}</pre>
}

export default function ApiClient(): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [store, setStore] = useState<ApiStore | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params')
  const [respTab, setRespTab] = useState<'body' | 'headers'>('body')
  const [pretty, setPretty] = useState(true)
  const [responses, setResponses] = useState<Record<string, ApiResponse | { error: string }>>({})
  const [envOpen, setEnvOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [ask, askDialog] = useAsk()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void api.invoke('api:load').then((s) => {
      setStore(s)
      setActiveId(s.collections[0]?.requests[0]?.id ?? null)
    })
  }, [api])

  const update = useCallback(
    (fn: (s: ApiStore) => ApiStore) =>
      setStore((s) => {
        if (!s) return s
        const next = fn(s)
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => void api.invoke('api:save', next), 400)
        return next
      }),
    [api]
  )

  if (!store) return <></>
  const all = store.collections.flatMap((c) => c.requests.map((r) => ({ c, r })))
  const active = all.find((x) => x.r.id === activeId)?.r ?? null
  const env = store.environments.find((e) => e.id === store.activeEnv) ?? null
  const res = active ? responses[active.id] : undefined

  const patch = (p: Partial<ApiRequest>): void =>
    update((s) => ({ ...s, collections: s.collections.map((c) => ({ ...c, requests: c.requests.map((r) => (r.id === activeId ? { ...r, ...p } : r)) })) }))

  const add = (collectionId: string): void => {
    const r = blank()
    update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === collectionId ? { ...c, requests: [...c.requests, r] } : c)) }))
    setActiveId(r.id)
  }

  const addCollection = (col: ApiCollection): void => {
    update((s) => ({ ...s, collections: [...s.collections, col] }))
    setActiveId(col.requests[0]?.id ?? activeId)
    notify({ kind: 'info', text: `Imported ${col.requests.length} ${col.requests.length === 1 ? 'request' : 'requests'} into ${col.name}.` })
  }

  const send = async (): Promise<void> => {
    if (!active) return
    try {
      const r = await api.invoke('api:send', active, store.activeEnv)
      setResponses((m) => ({ ...m, [active.id]: r }))
      setStore((s) => (s ? { ...s, history: [{ at: Date.now(), method: active.method, url: r.url, status: r.status, ms: r.ms }, ...s.history].slice(0, 50) } : s))
    } catch (err) {
      setResponses((m) => ({ ...m, [active.id]: { error: (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') } }))
    }
  }

  const curl = (): string => {
    const vars = env?.vars ?? []
    const fill = (t: string): string => t.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => vars.find((v) => v.enabled && v.key === k)?.value ?? m)
    if (!active) return ''
    const q = (t: string): string => `'${t.replace(/'/g, `'\\''`)}'`
    let url = fill(active.url)
    const qs = active.query.filter((x) => x.enabled && x.key).map((x) => `${encodeURIComponent(fill(x.key))}=${encodeURIComponent(fill(x.value))}`)
    if (qs.length) url += (url.includes('?') ? '&' : '?') + qs.join('&')
    const parts = [`curl -X ${active.method} ${q(url)}`]
    for (const h of active.headers) if (h.enabled && h.key) parts.push(`-H ${q(`${fill(h.key)}: ${fill(h.value)}`)}`)
    if (active.auth.type === 'bearer') parts.push(`-H ${q(`Authorization: Bearer ${fill(active.auth.token)}`)}`)
    if (active.auth.type === 'basic') parts.push(`-u ${q(`${fill(active.auth.user)}:${fill(active.auth.pass)}`)}`)
    if (active.body.type === 'json') parts.push(`-H 'Content-Type: application/json' --data ${q(fill(active.body.text))}`)
    if (active.body.type === 'text') parts.push(`--data ${q(fill(active.body.text))}`)
    return parts.join(' \\\n  ')
  }

  const formatted = (r: ApiResponse): string => {
    if (!pretty || !/json/.test(r.contentType)) return r.body
    try {
      return JSON.stringify(JSON.parse(r.body), null, 2)
    } catch {
      return r.body
    }
  }

  return (
    <div className="apic">
      <aside className="apic-side glass">
        <div className="apic-env">
          <select className="input" value={store.activeEnv ?? ''} onChange={(e) => update((s) => ({ ...s, activeEnv: e.target.value || null }))} aria-label="Environment">
            <option value="">No environment</option>
            {store.environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setEnvOpen(true)}>
            Variables
          </button>
        </div>
        <div className="apic-actions">
          <button className="btn btn-tonal btn-sm" onClick={() => add(store.collections[0]?.id ?? '')} disabled={!store.collections.length}>
            <Plus size={14} /> Request
          </button>
          <button
            className="icon-btn"
            data-tip="New collection"
            aria-label="New collection"
            onClick={async () => {
              const name = await ask({ title: 'New collection', label: 'Name', confirm: 'Create' })
              if (name) update((s) => ({ ...s, collections: [...s.collections, { id: id(), name, requests: [] }] }))
            }}
          >
            <FolderPlus />
          </button>
          <button
            className="icon-btn"
            data-tip="Import a file"
            aria-label="Import a file"
            onClick={async () => {
              const col = await act('api-import', () => api.invoke('api:import-file'))
              if (col) addCollection(col)
            }}
          >
            <Download />
          </button>
          <button className="icon-btn" data-tip="Paste cURL or JSON" aria-label="Paste" onClick={() => setPasteOpen(true)}>
            <Copy />
          </button>
        </div>
        <div className="apic-tree">
          {store.collections.map((c) => (
            <div key={c.id} className="apic-col">
              <div className="apic-col-head">
                <span>{c.name}</span>
                <button className="icon-btn" aria-label={`Add a request to ${c.name}`} onClick={() => add(c.id)}>
                  <Plus />
                </button>
              </div>
              {c.requests.map((r) => (
                <button key={r.id} className="apic-item" aria-current={r.id === activeId} onClick={() => setActiveId(r.id)}>
                  <span className="m-badge" data-m={r.method}>
                    {r.method === 'DELETE' ? 'DEL' : r.method === 'OPTIONS' ? 'OPT' : r.method}
                  </span>
                  <span className="apic-name">{r.name}</span>
                </button>
              ))}
              {c.requests.length === 0 && <div className="hint" style={{ padding: '4px 12px 8px' }}>No requests yet.</div>}
            </div>
          ))}
          {store.history.length > 0 && (
            <div className="apic-col">
              <div className="apic-col-head">
                <span>History</span>
              </div>
              {store.history.slice(0, 8).map((h, i) => (
                <div key={i} className="apic-hist">
                  <span className="m-badge" data-m={h.method}>
                    {h.method === 'DELETE' ? 'DEL' : h.method}
                  </span>
                  <span className="apic-name mono">{h.url.replace(/^https?:\/\//, '')}</span>
                  <span className="status-chip" data-ok={h.status < 400}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="apic-main">
        {!active ? (
          <div className="group empty-state" style={{ marginTop: 40 }}>
            <strong>Test an API</strong>
            <span>Create a request, or import a Postman, Insomnia or OpenAPI file, or paste a cURL command.</span>
          </div>
        ) : (
          <>
            <div className="apic-title">
              <input className="apic-name-input" value={active.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Request name" />
              <button className="icon-btn" data-tip="Copy as cURL" aria-label="Copy as cURL" onClick={async () => {
                await api.invoke('clipboard:write', curl())
                notify({ kind: 'info', text: 'Copied as a cURL command.' })
              }}>
                <TerminalSquare />
              </button>
              <button
                className="icon-btn"
                data-tip="Duplicate"
                aria-label="Duplicate"
                onClick={() => {
                  const copy = { ...structuredClone(active), id: id(), name: `${active.name} copy` }
                  update((s) => ({ ...s, collections: s.collections.map((c) => (c.requests.some((r) => r.id === active.id) ? { ...c, requests: [...c.requests, copy] } : c)) }))
                  setActiveId(copy.id)
                }}
              >
                <Copy />
              </button>
              <button
                className="icon-btn danger-text"
                data-tip="Delete"
                aria-label="Delete request"
                onClick={async () => {
                  if (!(await ask({ title: `Delete ${active.name}?`, yesNo: true, confirm: 'Delete', danger: true }))) return
                  update((s) => ({ ...s, collections: s.collections.map((c) => ({ ...c, requests: c.requests.filter((r) => r.id !== active.id) })) }))
                  setActiveId(null)
                }}
              >
                <Trash2 />
              </button>
            </div>

            <div className="apic-bar glass">
              <select className="apic-method" data-m={active.method} value={active.method} onChange={(e) => patch({ method: e.target.value as HttpMethod })} aria-label="Method">
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input
                className="apic-url mono"
                value={active.url}
                placeholder="https://api.example.com/users or {{base}}/users"
                onChange={(e) => patch({ url: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) void act(`api-send`, send)
                }}
                aria-label="URL"
              />
              <button className="btn btn-primary" disabled={busy.has('api-send') || !active.url.trim()} onClick={() => act('api-send', send)}>
                <Send size={14} /> {busy.has('api-send') ? 'Sending…' : 'Send'}
              </button>
            </div>

            <div className="seg-tabs apic-tabs" role="tablist">
              {(
                [
                  ['params', `Params${active.query.length ? ` ${active.query.length}` : ''}`],
                  ['headers', `Headers${active.headers.length ? ` ${active.headers.length}` : ''}`],
                  ['body', `Body${active.body.type !== 'none' ? ` · ${active.body.type}` : ''}`],
                  ['auth', `Auth${active.auth.type !== 'none' ? ` · ${active.auth.type}` : ''}`]
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="apic-pane glass">
              {tab === 'params' && <KvEditor rows={active.query} onChange={(query) => patch({ query })} />}
              {tab === 'headers' && <KvEditor rows={active.headers} onChange={(headers) => patch({ headers })} keyLabel="Header" />}
              {tab === 'body' && (
                <>
                  <div className="seg" role="radiogroup" aria-label="Body type" style={{ marginBottom: 10 }}>
                    {(['none', 'json', 'text', 'urlencoded', 'form'] as const).map((t) => (
                      <button key={t} role="radio" aria-checked={active.body.type === t} onClick={() => patch({ body: { ...active.body, type: t } })}>
                        {t === 'none' ? 'None' : t === 'json' ? 'JSON' : t === 'text' ? 'Text' : t === 'urlencoded' ? 'Form URL' : 'Multipart'}
                      </button>
                    ))}
                  </div>
                  {(active.body.type === 'json' || active.body.type === 'text') && (
                    <textarea
                      className="apic-code mono"
                      spellCheck={false}
                      value={active.body.text}
                      placeholder={active.body.type === 'json' ? '{\n  "name": "Ada"\n}' : ''}
                      onChange={(e) => patch({ body: { ...active.body, text: e.target.value } })}
                    />
                  )}
                  {(active.body.type === 'urlencoded' || active.body.type === 'form') && (
                    <KvEditor rows={active.body.form} onChange={(form) => patch({ body: { ...active.body, form } })} keyLabel="Field" />
                  )}
                  {active.body.type === 'none' && <div className="hint">This request sends no body.</div>}
                </>
              )}
              {tab === 'auth' && (
                <>
                  <div className="seg" role="radiogroup" aria-label="Auth" style={{ marginBottom: 12 }}>
                    {(['none', 'bearer', 'basic'] as const).map((t) => (
                      <button key={t} role="radio" aria-checked={active.auth.type === t} onClick={() => patch({ auth: { ...active.auth, type: t } })}>
                        {t === 'none' ? 'None' : t === 'bearer' ? 'Bearer token' : 'Basic'}
                      </button>
                    ))}
                  </div>
                  {active.auth.type === 'bearer' && (
                    <input className="input mono" style={{ width: '100%' }} placeholder="Token or {{token}}" value={active.auth.token} onChange={(e) => patch({ auth: { ...active.auth, token: e.target.value } })} />
                  )}
                  {active.auth.type === 'basic' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input className="input mono" placeholder="User" value={active.auth.user} onChange={(e) => patch({ auth: { ...active.auth, user: e.target.value } })} />
                      <input className="input mono" placeholder="Password" type="password" value={active.auth.pass} onChange={(e) => patch({ auth: { ...active.auth, pass: e.target.value } })} />
                    </div>
                  )}
                  {active.auth.type === 'none' && <div className="hint">No authentication is added. Headers you set still apply.</div>}
                </>
              )}
            </div>

            <div className="apic-resp glass">
              {!res ? (
                <div className="hint" style={{ padding: 20 }}>
                  Press Send or Return to see the response. Use {'{{name}}'} to fill in variables from the environment{env ? ` "${env.name}"` : ''}.
                </div>
              ) : 'error' in res ? (
                <div className="errbox" style={{ margin: 16, gridColumn: 'auto' }}>
                  {res.error}
                </div>
              ) : (
                <>
                  <div className="resp-head">
                    <span className="status-chip lg" data-ok={res.status < 400} data-warn={res.status >= 300 && res.status < 400}>
                      {res.status} {res.statusText}
                    </span>
                    <span className="hint">{res.ms} ms</span>
                    <span className="hint">{formatBytes(res.bytes)}</span>
                    <div className="seg-tabs" style={{ marginLeft: 'auto' }} role="tablist">
                      <button role="tab" aria-selected={respTab === 'body'} onClick={() => setRespTab('body')}>
                        Body
                      </button>
                      <button role="tab" aria-selected={respTab === 'headers'} onClick={() => setRespTab('headers')}>
                        Headers {res.headers.length}
                      </button>
                    </div>
                    {respTab === 'body' && /json/.test(res.contentType) && (
                      <button className="btn btn-quiet btn-sm" onClick={() => setPretty(!pretty)}>
                        {pretty ? 'Raw' : 'Pretty'}
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      data-tip="Copy"
                      aria-label="Copy response"
                      onClick={() => void api.invoke('clipboard:write', respTab === 'body' ? res.body : res.headers.map(([k, v]) => `${k}: ${v}`).join('\n'))}
                    >
                      <Copy />
                    </button>
                  </div>
                  {respTab === 'body' ? (
                    /json/.test(res.contentType) && pretty ? (
                      <PrettyJson text={formatted(res)} />
                    ) : (
                      <pre className="resp-body">{res.body || '(empty body)'}</pre>
                    )
                  ) : (
                    <div className="resp-headers">
                      {res.headers.map(([k, v], i) => (
                        <div key={i}>
                          <span className="mono">{k}</span>
                          <span className="mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {res.truncated && <div className="hint" style={{ padding: '0 16px 12px' }}>Showing the first 5 MB.</div>}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {envOpen && (
        <EnvDialog
          envs={store.environments}
          onClose={() => setEnvOpen(false)}
          onChange={(environments) => update((s) => ({ ...s, environments, activeEnv: environments.some((e) => e.id === s.activeEnv) ? s.activeEnv : (environments[0]?.id ?? null) }))}
        />
      )}
      {pasteOpen && (
        <PasteDialog
          onClose={() => setPasteOpen(false)}
          onImport={async (text) => {
            const col = await act('api-paste', () => api.invoke('api:import', text))
            if (col) {
              addCollection(col)
              setPasteOpen(false)
            }
          }}
        />
      )}
      {askDialog}
    </div>
  )
}

function EnvDialog({ envs, onChange, onClose }: { envs: ApiEnvironment[]; onChange: (e: ApiEnvironment[]) => void; onClose: () => void }): React.JSX.Element {
  const [sel, setSel] = useState(envs[0]?.id ?? '')
  const cur = envs.find((e) => e.id === sel)
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Variables</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Write {'{{name}}'} in a URL, header or body and it is replaced with the value from the chosen environment. Keep tokens here instead of in each request.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="seg" style={{ margin: '16px 0 12px', flexWrap: 'wrap' }}>
          {envs.map((e) => (
            <button key={e.id} role="radio" aria-checked={e.id === sel} onClick={() => setSel(e.id)}>
              {e.name}
            </button>
          ))}
          <button
            onClick={() => {
              const e = { id: id(), name: `Environment ${envs.length + 1}`, vars: [] }
              onChange([...envs, e])
              setSel(e.id)
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        {cur && (
          <>
            <div className="field">
              <label htmlFor="env-name">Name</label>
              <input id="env-name" className="input" value={cur.name} onChange={(e) => onChange(envs.map((x) => (x.id === cur.id ? { ...x, name: e.target.value } : x)))} />
            </div>
            <KvEditor rows={cur.vars} onChange={(vars) => onChange(envs.map((x) => (x.id === cur.id ? { ...x, vars } : x)))} keyLabel="Variable" />
            <div className="end" style={{ marginTop: 14 }}>
              <button className="btn btn-quiet danger-text" style={{ marginRight: 'auto' }} onClick={() => onChange(envs.filter((x) => x.id !== cur.id))}>
                <Trash2 size={14} /> Delete environment
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PasteDialog({ onImport, onClose }: { onImport: (text: string) => void; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title">Paste a request or collection</h2>
        <p className="page-desc" style={{ margin: '4px 0 14px' }}>
          A cURL command (Copy as cURL in Chrome DevTools works), or the JSON of a Postman collection, an Insomnia export or an OpenAPI file.
        </p>
        <textarea className="apic-code mono" style={{ minHeight: 200 }} autoFocus spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="curl 'https://api.example.com/users' -H 'Accept: application/json'" />
        <div className="end" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => onImport(text)}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
