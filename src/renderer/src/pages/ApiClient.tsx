import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Cookie,
  Copy,
  Download,
  FileUp,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Upload,
  Variable,
  X
} from 'lucide-react'
import type {
  ApiAssertion,
  ApiCollection,
  ApiEnvironment,
  ApiExtract,
  ApiImportResult,
  ApiRequest,
  ApiResponse,
  ApiRunResult,
  ApiStore,
  HttpMethod,
  KV, ApiCodeLang } from '@shared/types'
import { useApp } from '../store'
import { formatBytes } from '../ui'
import { useAsk } from '../components/Ask'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const id = (): string => Math.random().toString(16).slice(2, 14).padEnd(12, '0')
const short = (m: HttpMethod): string => (m === 'DELETE' ? 'DEL' : m === 'OPTIONS' ? 'OPT' : m)
const clean = (msg: string): string => msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function blank(name = 'New request', folder?: string): ApiRequest {
  return {
    id: id(),
    name,
    ...(folder ? { folder } : {}),
    method: 'GET',
    url: '{{base}}/',
    query: [],
    headers: [],
    body: { type: 'none', text: '', form: [] },
    auth: { type: 'none', token: '', user: '', pass: '' },
    tests: [],
    extract: []
  }
}

/** Key/value rows with an always-empty last row to type into. */
function KvEditor({ rows, onChange, keyLabel = 'Name', valueLabel = 'Value' }: { rows: KV[]; onChange: (r: KV[]) => void; keyLabel?: string; valueLabel?: string }): React.JSX.Element {
  const all = [...rows, { key: '', value: '', enabled: true }]
  const set = (i: number, patch: Partial<KV>): void => {
    const next = all.map((r, j) => (j === i ? { ...r, ...patch } : r))
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

const SOURCES: { id: ApiAssertion['source']; label: string; needsPath: boolean }[] = [
  { id: 'status', label: 'Status', needsPath: false },
  { id: 'time', label: 'Time (ms)', needsPath: false },
  { id: 'json', label: 'JSON value', needsPath: true },
  { id: 'header', label: 'Header', needsPath: true },
  { id: 'body', label: 'Body text', needsPath: false }
]
const OPS: { id: ApiAssertion['op']; label: string }[] = [
  { id: 'eq', label: 'equals' },
  { id: 'neq', label: 'is not' },
  { id: 'contains', label: 'contains' },
  { id: 'exists', label: 'exists' },
  { id: 'lt', label: 'is below' },
  { id: 'gt', label: 'is above' }
]

function TestsEditor({ rows, onChange }: { rows: ApiAssertion[]; onChange: (r: ApiAssertion[]) => void }): React.JSX.Element {
  const set = (i: number, p: Partial<ApiAssertion>): void => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="kv">
      {rows.length === 0 && <div className="hint">Add checks that run every time you send: the status, how long it took, a header, or a value in the JSON.</div>}
      {rows.map((r, i) => {
        const src = SOURCES.find((x) => x.id === r.source)!
        return (
          <div key={i} className="test-row" data-off={!r.enabled}>
            <input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} aria-label="Include" />
            <select className="input" value={r.source} onChange={(e) => set(i, { source: e.target.value as ApiAssertion['source'] })} aria-label="Check">
              {SOURCES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <input
              className="input mono"
              disabled={!src.needsPath}
              placeholder={r.source === 'header' ? 'Content-Type' : r.source === 'json' ? 'data.items[0].id' : ''}
              value={src.needsPath ? r.path : ''}
              onChange={(e) => set(i, { path: e.target.value })}
              aria-label="Path"
            />
            <select className="input" value={r.op} onChange={(e) => set(i, { op: e.target.value as ApiAssertion['op'] })} aria-label="Condition">
              {OPS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <input className="input mono" disabled={r.op === 'exists'} placeholder="200" value={r.op === 'exists' ? '' : r.value} onChange={(e) => set(i, { value: e.target.value })} aria-label="Expected" />
            <button className="icon-btn" aria-label="Remove check" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <X />
            </button>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <button className="btn btn-tonal btn-sm" onClick={() => onChange([...rows, { enabled: true, source: 'status', path: '', op: 'eq', value: '200' }])}>
          <Plus size={13} /> Status is 200
        </button>
        <button className="btn btn-sm" onClick={() => onChange([...rows, { enabled: true, source: 'time', path: '', op: 'lt', value: '1000' }])}>
          Faster than 1 s
        </button>
        <button className="btn btn-sm" onClick={() => onChange([...rows, { enabled: true, source: 'json', path: '', op: 'exists', value: '' }])}>
          JSON value
        </button>
      </div>
    </div>
  )
}

function ExtractEditor({ rows, onChange }: { rows: ApiExtract[]; onChange: (r: ApiExtract[]) => void }): React.JSX.Element {
  const all = [...rows, { enabled: true, name: '', path: '' }]
  const set = (i: number, p: Partial<ApiExtract>): void => onChange(all.map((r, j) => (j === i ? { ...r, ...p } : r)).filter((r) => r.name || r.path))
  return (
    <div className="kv">
      <div className="hint" style={{ marginBottom: 4 }}>
        After each response, save values into the current environment, such as a login token into {'{{token}}'} for the next requests. Use a JSON path like data.token, or
        header:Location.
      </div>
      {all.map((r, i) => (
        <div key={i} className="kv-row" data-off={!r.enabled}>
          <input type="checkbox" checked={r.enabled} disabled={i === all.length - 1} onChange={(e) => set(i, { enabled: e.target.checked })} aria-label="Include" />
          <input className="input mono" placeholder="Variable, like token" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className="input mono" placeholder="From, like data.token" value={r.path} onChange={(e) => set(i, { path: e.target.value })} />
          {i < all.length - 1 ? (
            <button className="icon-btn" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <X />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
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
      if (m[1])
        out.push(
          <span key={k++} className={m[2] ? 'j-key' : 'j-str'}>
            {m[1]}
          </span>,
          m[2] ?? ''
        )
      else if (m[3])
        out.push(
          <span key={k++} className="j-lit">
            {m[3]}
          </span>
        )
      else
        out.push(
          <span key={k++} className="j-num">
            {m[4]}
          </span>
        )
      last = re.lastIndex
    }
    out.push(text.slice(last))
    return out
  }, [text])
  return <pre className="resp-body">{parts}</pre>
}

type Tab = 'params' | 'headers' | 'body' | 'auth' | 'tests' | 'save'

export default function ApiClient(): React.JSX.Element {
  const { act, busy, notify, sites } = useApp()
  const api = window.laramac
  const [store, setStore] = useState<ApiStore | null>(null)
  const [siteEnvList, setSiteEnvList] = useState<ApiEnvironment[]>([])
  useEffect(() => {
    void api.invoke('api:site-envs').then(setSiteEnvList).catch(() => undefined)
  }, [api, sites])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('params')
  const [respTab, setRespTab] = useState<'body' | 'headers' | 'tests'>('body')
  const [pretty, setPretty] = useState(true)
  const [responses, setResponses] = useState<Record<string, ApiResponse | { error: string }>>({})
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<null | { kind: 'env' } | { kind: 'paste' } | { kind: 'code' } | { kind: 'run'; col: ApiCollection; folder: string | null } | { kind: 'colvars'; col: ApiCollection }>(null)
  const [ask, askDialog] = useAsk()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<ApiStore | null>(null)

  useEffect(() => {
    void api.invoke('api:load').then((s) => {
      setStore(s)
      latest.current = s
      setActiveId(s.collections[0]?.requests[0]?.id ?? null)
    })
  }, [api])

  const update = useCallback(
    (fn: (s: ApiStore) => ApiStore) =>
      setStore((s) => {
        if (!s) return s
        const next = fn(s)
        latest.current = next
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => void api.invoke('api:save', next), 400)
        return next
      }),
    [api]
  )

  /** Saves right away, so the main process sees the latest edits before sending. */
  const flush = async (): Promise<void> => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (latest.current) await api.invoke('api:save', latest.current)
  }
  const fromSite = async (name: string): Promise<void> => {
    await flush()
    const col = await act('api-from-site', () => api.invoke('api:from-site', name))
    if (col) {
      await reload()
      setActiveId(col.requests[0]?.id ?? null)
      notify({ kind: 'info', text: `${col.requests.length} requests from ${name}'s code. The ${name} environment fills in {{base}}.` })
    }
  }
  const reload = async (): Promise<void> => {
    const s = await api.invoke('api:load')
    latest.current = s
    setStore(s)
  }

  if (!store) return <></>
  const siteEnvs = siteEnvList
  const all = store.collections.flatMap((c) => c.requests.map((r) => ({ c, r })))
  const found = all.find((x) => x.r.id === activeId)
  const active = found?.r ?? null
  const activeCol = found?.c ?? null
  const env = store.environments.find((e) => e.id === store.activeEnv) ?? null
  const res = active ? responses[active.id] : undefined

  const patch = (p: Partial<ApiRequest>): void =>
    update((s) => ({ ...s, collections: s.collections.map((c) => ({ ...c, requests: c.requests.map((r) => (r.id === activeId ? { ...r, ...p } : r)) })) }))
  const patchCol = (colId: string, p: Partial<ApiCollection>): void => update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === colId ? { ...c, ...p } : c)) }))

  const add = (collectionId: string, folder?: string): void => {
    const r = blank('New request', folder)
    update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === collectionId ? { ...c, requests: [...c.requests, r] } : c)) }))
    setActiveId(r.id)
    setTab('params')
  }

  const imported = (res: ApiImportResult | null | undefined): void => {
    if (!res) return
    if (res.environment) {
      const e = res.environment
      update((s) => ({ ...s, environments: [...s.environments, e], activeEnv: e.id }))
      notify({ kind: 'info', text: `Added the environment ${e.name} with ${e.vars.length} variables.` })
    }
    if (res.collection) {
      const col = res.collection
      update((s) => ({ ...s, collections: [...s.collections, col] }))
      setActiveId(col.requests[0]?.id ?? activeId)
      notify({ kind: 'info', text: `Imported ${col.requests.length} ${col.requests.length === 1 ? 'request' : 'requests'} into ${col.name}.` })
    }
  }

  const send = async (): Promise<void> => {
    if (!active) return
    try {
      await flush()
      const r = await api.invoke('api:send', active, store.activeEnv, activeCol?.id ?? null)
      setResponses((m) => ({ ...m, [active.id]: r }))
      if (r.tests.length && r.tests.some((t) => !t.pass)) setRespTab('tests')
      if (r.saved.length) notify({ kind: 'info', text: `Saved ${r.saved.map((x) => `{{${x.key}}}`).join(', ')} to ${env?.name ?? 'the environment'}.` })
      await reload()
    } catch (err) {
      setResponses((m) => ({ ...m, [active.id]: { error: clean((err as Error).message) } }))
    }
  }

  const formatted = (r: ApiResponse): string => {
    if (!pretty || !/json/.test(r.contentType)) return r.body
    try {
      return JSON.stringify(JSON.parse(r.body), null, 2)
    } catch {
      return r.body
    }
  }

  // Requests grouped by folder, folders in order of first appearance.
  const grouped = (c: ApiCollection): [string, ApiRequest[]][] => {
    const m = new Map<string, ApiRequest[]>()
    for (const r of c.requests) m.set(r.folder ?? '', [...(m.get(r.folder ?? '') ?? []), r])
    return [...m.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0))
  }
  const toggle = (key: string): void =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const passed = res && !('error' in res) ? res.tests.filter((t) => t.pass).length : 0

  return (
    <div className="apic">
      <aside className="apic-side glass">
        <div className="apic-env">
          <select className="input" value={store.activeEnv ?? ''} onChange={(e) => update((s) => ({ ...s, activeEnv: e.target.value || null }))} aria-label="Environment">
            <option value="">No environment</option>
            <optgroup label="Yours">
              {store.environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
            {siteEnvs.length > 0 && (
              <optgroup label="Your sites">
                {siteEnvs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.vars.find((v) => v.key === 'base')?.value.replace(/^https?:\/\//, '')})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button className="icon-btn" data-tip="Environments and variables" aria-label="Environments" onClick={() => setDialog({ kind: 'env' })}>
            <Variable />
          </button>
        </div>
        <div className="apic-actions">
          <button
            className="btn btn-tonal btn-sm"
            onClick={async () => {
              const name = await ask({ title: 'New collection', label: 'Name', confirm: 'Create' })
              if (name?.trim()) {
                const c: ApiCollection = { id: id(), name: name.trim(), requests: [blank()] }
                update((s) => ({ ...s, collections: [...s.collections, c] }))
                setActiveId(c.requests[0].id)
              }
            }}
          >
            <FolderPlus size={14} /> Collection
          </button>
          <button className="icon-btn" data-tip="Import Postman, Insomnia or OpenAPI" aria-label="Import a file" onClick={async () => imported(await act('api-import', () => api.invoke('api:import-file')))}>
            <FileUp />
          </button>
          <button className="icon-btn" data-tip="Paste cURL or JSON" aria-label="Paste" onClick={() => setDialog({ kind: 'paste' })}>
            <Copy />
          </button>
          <button
            className="icon-btn"
            data-tip={store.cookies === false ? 'Cookies off: each request starts clean' : 'Cookies kept between requests, like a browser. Click to turn off'}
            aria-label="Keep cookies"
            aria-pressed={store.cookies !== false}
            onClick={async () => {
              if (store.cookies !== false) await api.invoke('api:clear-cookies')
              update((s) => ({ ...s, cookies: s.cookies === false }))
            }}
          >
            <Cookie style={{ opacity: store.cookies === false ? 0.4 : 1 }} />
          </button>
        </div>
        {sites.length > 0 && (
          <select
            className="input apic-fromsite"
            value=""
            disabled={busy.has('api-from-site')}
            onChange={(e) => e.target.value && void fromSite(e.target.value)}
            aria-label="Make requests from a site's code"
          >
            <option value="">{busy.has('api-from-site') ? 'Reading the code…' : 'Requests from a site’s code…'}</option>
            {sites.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name}
              </option>
            ))}
          </select>
        )}

        <div className="apic-tree">
          {store.collections.map((c) => (
            <div key={c.id} className="apic-col">
              <div className="apic-col-head">
                <button className="apic-fold" onClick={() => toggle(c.id)} aria-label={closed.has(c.id) ? `Open ${c.name}` : `Close ${c.name}`}>
                  {closed.has(c.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{c.name}</span>
                  <small>{c.requests.length}</small>
                </button>
                <span className="apic-col-tools">
                  <button className="icon-btn" data-tip="Run all" aria-label={`Run ${c.name}`} onClick={() => setDialog({ kind: 'run', col: c, folder: null })}>
                    <Play />
                  </button>
                  <button className="icon-btn" data-tip="Add request" aria-label={`Add a request to ${c.name}`} onClick={() => add(c.id)}>
                    <Plus />
                  </button>
                  <CollectionMenu
                    onRename={async () => {
                      const name = await ask({ title: 'Rename collection', label: 'Name', initial: c.name, confirm: 'Rename' })
                      if (name?.trim()) patchCol(c.id, { name: name.trim() })
                    }}
                    onFolder={async () => {
                      const name = await ask({ title: `New folder in ${c.name}`, label: 'Folder name', confirm: 'Create' })
                      if (name?.trim()) add(c.id, name.trim())
                    }}
                    onVars={() => setDialog({ kind: 'colvars', col: c })}
                    onExport={async () => {
                      await flush()
                      const p = await act('api-export', () => api.invoke('api:export', c.id))
                      if (p) notify({ kind: 'info', text: `Exported as a Postman collection to ${p.split('/').slice(-2).join('/')}.` })
                    }}
                    onDelete={async () => {
                      if (!(await ask({ title: `Delete ${c.name}?`, label: `Its ${c.requests.length} requests are deleted too.`, yesNo: true, confirm: 'Delete', danger: true }))) return
                      update((s) => ({ ...s, collections: s.collections.filter((x) => x.id !== c.id) }))
                      if (c.requests.some((r) => r.id === activeId)) setActiveId(null)
                    }}
                  />
                </span>
              </div>
              {!closed.has(c.id) &&
                grouped(c).map(([folder, reqs]) => (
                  <div key={folder} className={folder ? 'apic-folder' : undefined}>
                    {folder && (
                      <div className="apic-folder-head">
                        <button className="apic-fold" onClick={() => toggle(`${c.id}/${folder}`)}>
                          {closed.has(`${c.id}/${folder}`) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          <span>{folder}</span>
                        </button>
                        <span className="apic-col-tools">
                          <button className="icon-btn" data-tip="Run folder" aria-label={`Run ${folder}`} onClick={() => setDialog({ kind: 'run', col: c, folder })}>
                            <Play />
                          </button>
                          <button className="icon-btn" data-tip="Add request" aria-label={`Add a request to ${folder}`} onClick={() => add(c.id, folder)}>
                            <Plus />
                          </button>
                        </span>
                      </div>
                    )}
                    {!closed.has(`${c.id}/${folder}`) &&
                      reqs.map((r) => {
                        const last = responses[r.id]
                        const state = !last ? null : 'error' in last ? 'fail' : last.tests.length ? (last.tests.every((t) => t.pass) ? 'pass' : 'fail') : null
                        return (
                          <button key={r.id} className="apic-item" aria-current={r.id === activeId} onClick={() => setActiveId(r.id)}>
                            <span className="m-badge" data-m={r.method}>
                              {short(r.method)}
                            </span>
                            <span className="apic-name">{r.name}</span>
                            {state && <span className="test-dot" data-s={state} />}
                          </button>
                        )
                      })}
                  </div>
                ))}
              {!closed.has(c.id) && c.requests.length === 0 && <div className="hint" style={{ padding: '4px 14px 8px' }}>No requests yet.</div>}
            </div>
          ))}
          {store.history.length > 0 && (
            <div className="apic-col">
              <div className="apic-col-head">
                <span className="apic-fold" style={{ cursor: 'default' }}>
                  <span>History</span>
                </span>
                <button className="icon-btn" data-tip="Clear history" aria-label="Clear history" onClick={() => update((s) => ({ ...s, history: [] }))}>
                  <Trash2 />
                </button>
              </div>
              {store.history.slice(0, 10).map((h, i) => (
                <div
                  key={i}
                  className="apic-hist"
                  title={h.request ? `${h.url}\nClick to open it again` : h.url}
                  role={h.request ? 'button' : undefined}
                  tabIndex={h.request ? 0 : undefined}
                  style={{ cursor: h.request ? 'pointer' : undefined }}
                  onClick={() => {
                    if (!h.request) return
                    const r = { ...h.request, id: id(), name: `${h.method} ${h.url.replace(/^https?:\/\/[^/]+/, '') || '/'}` }
                    const colId = store.collections[0]?.id
                    if (!colId) return
                    update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === colId ? { ...c, requests: [...c.requests, r] } : c)) }))
                    setActiveId(r.id)
                  }}
                >
                  <span className="m-badge" data-m={h.method}>
                    {short(h.method)}
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
            <span>Pick a request on the left, create a collection, or import a Postman collection or environment, an Insomnia export, an OpenAPI file or a cURL command.</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" onClick={async () => imported(await act('api-import', () => api.invoke('api:import-file')))}>
                <FileUp size={14} /> Import a file
              </button>
              <button className="btn" onClick={() => setDialog({ kind: 'paste' })}>
                Paste cURL
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="apic-title">
              <div className="apic-crumbs">
                <span>{activeCol?.name}</span>
                {active.folder && <span>/ {active.folder}</span>}
              </div>
              <input className="apic-name-input" value={active.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Request name" />
              <button className="btn btn-quiet btn-sm" onClick={() => setDialog({ kind: 'code' })}>
                <Code2 size={14} /> Code
              </button>
              <button
                className="icon-btn"
                data-tip="Move to a folder"
                aria-label="Move to a folder"
                onClick={async () => {
                  const f = await ask({ title: 'Move to a folder', label: 'Folder (leave empty for none). Use / for subfolders.', initial: active.folder ?? '', confirm: 'Move' })
                  if (f !== null) patch({ folder: f.trim() || undefined })
                }}
              >
                <FolderPlus />
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
                  if (e.key === 'Enter') void act('api-send', send)
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
                  ['params', 'Params', active.query.length],
                  ['headers', 'Headers', active.headers.length],
                  ['body', 'Body', active.body.type === 'none' ? 0 : active.body.type.toUpperCase()],
                  ['auth', 'Auth', active.auth.type === 'none' ? 0 : active.auth.type],
                  ['tests', 'Tests', (active.tests ?? []).length],
                  ['save', 'Save values', (active.extract ?? []).length]
                ] as const
              ).map(([k, label, count]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                  {label}
                  {count ? <span className="tab-count">{count}</span> : null}
                </button>
              ))}
            </div>

            <div className="apic-pane glass">
              {tab === 'params' && <KvEditor rows={active.query} onChange={(query) => patch({ query })} />}
              {tab === 'headers' && <KvEditor rows={active.headers} onChange={(headers) => patch({ headers })} keyLabel="Header" />}
              {tab === 'body' && (
                <>
                  <div className="seg" role="radiogroup" aria-label="Body type" style={{ marginBottom: 10 }}>
                    {(['none', 'json', 'graphql', 'text', 'urlencoded', 'form'] as const).map((t) => (
                      <button key={t} role="radio" aria-checked={active.body.type === t} onClick={() => patch({ body: { ...active.body, type: t } })}>
                        {t === 'none' ? 'None' : t === 'json' ? 'JSON' : t === 'graphql' ? 'GraphQL' : t === 'text' ? 'Text' : t === 'urlencoded' ? 'Form URL' : 'Multipart'}
                      </button>
                    ))}
                    {active.body.type === 'json' && (
                      <button
                        onClick={() => {
                          try {
                            patch({ body: { ...active.body, text: JSON.stringify(JSON.parse(active.body.text), null, 2) } })
                          } catch {
                            notify({ kind: 'error', text: 'The body is not valid JSON yet.' })
                          }
                        }}
                      >
                        Tidy
                      </button>
                    )}
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
                  {active.body.type === 'graphql' && (
                    <div className="apic-gql">
                      <textarea className="input mono apic-body" spellCheck={false} placeholder={'query {\n  users { id name }\n}'} value={active.body.text} onChange={(e) => patch({ body: { ...active.body, text: e.target.value } })} aria-label="GraphQL query" />
                      <textarea className="input mono apic-body" spellCheck={false} placeholder={'Variables (JSON)\n{ "id": 1 }'} value={active.body.variables ?? ''} onChange={(e) => patch({ body: { ...active.body, variables: e.target.value } })} aria-label="GraphQL variables" />
                    </div>
                  )}
                  {active.body.type === 'none' && <div className="hint">This request sends no body.</div>}
                </>
              )}
              {tab === 'auth' && (
                <>
                  <div className="seg" role="radiogroup" aria-label="Auth" style={{ marginBottom: 12 }}>
                    {(['none', 'bearer', 'basic', 'apikey', 'oauth2'] as const).map((t) => (
                      <button key={t} role="radio" aria-checked={active.auth.type === t} onClick={() => patch({ auth: { ...active.auth, type: t } })}>
                        {t === 'none' ? 'None' : t === 'bearer' ? 'Bearer token' : t === 'basic' ? 'Basic' : t === 'apikey' ? 'API key' : 'OAuth 2'}
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
                  {active.auth.type === 'apikey' && (
                    <div className="apic-auth-grid">
                      <input className="input mono" placeholder="Name, like X-API-Key" value={active.auth.keyName ?? ''} onChange={(e) => patch({ auth: { ...active.auth, keyName: e.target.value } })} aria-label="Key name" />
                      <input className="input mono" placeholder="Value or {{apiKey}}" value={active.auth.token} onChange={(e) => patch({ auth: { ...active.auth, token: e.target.value } })} aria-label="Key value" />
                      <select className="input" value={active.auth.keyIn ?? 'header'} onChange={(e) => patch({ auth: { ...active.auth, keyIn: e.target.value as 'header' | 'query' } })} aria-label="Send it in">
                        <option value="header">In a header</option>
                        <option value="query">In the address</option>
                      </select>
                    </div>
                  )}
                  {active.auth.type === 'oauth2' && (
                    <div className="apic-auth-grid">
                      <input className="input mono" style={{ gridColumn: '1 / -1' }} placeholder="Token URL, like https://auth.example.com/oauth/token" value={active.auth.tokenUrl ?? ''} onChange={(e) => patch({ auth: { ...active.auth, tokenUrl: e.target.value } })} aria-label="Token URL" />
                      <input className="input mono" placeholder="Client ID" value={active.auth.clientId ?? ''} onChange={(e) => patch({ auth: { ...active.auth, clientId: e.target.value } })} aria-label="Client ID" />
                      <input className="input mono" type="password" placeholder="Client secret or {{secret}}" value={active.auth.clientSecret ?? ''} onChange={(e) => patch({ auth: { ...active.auth, clientSecret: e.target.value } })} aria-label="Client secret" />
                      <input className="input mono" placeholder="Scope (optional)" value={active.auth.scope ?? ''} onChange={(e) => patch({ auth: { ...active.auth, scope: e.target.value } })} aria-label="Scope" />
                      <div className="hint" style={{ gridColumn: '1 / -1' }}>Client credentials: Laramac gets a token before the request and keeps it until it expires.</div>
                    </div>
                  )}
                  {active.auth.type === 'none' && <div className="hint">No authentication is added. Headers you set still apply.</div>}
                </>
              )}
              {tab === 'tests' && <TestsEditor rows={active.tests ?? []} onChange={(tests) => patch({ tests })} />}
              {tab === 'save' && <ExtractEditor rows={active.extract ?? []} onChange={(extract) => patch({ extract })} />}
            </div>

            <div className="apic-resp glass">
              {!res ? (
                <div className="hint" style={{ padding: 20 }}>
                  Press Send or Return to see the response. Use {'{{name}}'} to fill in variables from {env ? `the ${env.name} environment` : 'an environment'}
                  {activeCol?.variables?.length ? ' or the collection' : ''}.
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
                        Headers <span className="tab-count">{res.headers.length}</span>
                      </button>
                      <button role="tab" aria-selected={respTab === 'tests'} onClick={() => setRespTab('tests')}>
                        Tests{' '}
                        {res.tests.length > 0 && (
                          <span className="tab-count" data-s={passed === res.tests.length ? 'pass' : 'fail'}>
                            {passed}/{res.tests.length}
                          </span>
                        )}
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
                      onClick={() => void api.invoke('clipboard:write', respTab === 'headers' ? res.headers.map(([k, v]) => `${k}: ${v}`).join('\n') : res.body)}
                    >
                      <Copy />
                    </button>
                  </div>
                  {respTab === 'body' &&
                    (/json/.test(res.contentType) && pretty ? <PrettyJson text={formatted(res)} /> : <pre className="resp-body">{res.body || '(empty body)'}</pre>)}
                  {respTab === 'headers' && (
                    <div className="resp-headers">
                      {res.headers.map(([k, v], i) => (
                        <div key={i}>
                          <span className="mono">{k}</span>
                          <span className="mono">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {respTab === 'tests' && (
                    <div className="resp-tests">
                      {res.tests.length === 0 && <div className="hint">No tests on this request yet. Add some on the Tests tab above.</div>}
                      {res.tests.map((t, i) => (
                        <div key={i} className="test-result" data-pass={t.pass}>
                          <span className="test-icon">{t.pass ? <Check size={13} /> : <X size={13} />}</span>
                          <span>{t.name}</span>
                          {!t.pass && <span className="hint">{t.detail}</span>}
                        </div>
                      ))}
                      {res.saved.length > 0 && (
                        <div className="hint" style={{ marginTop: 8 }}>
                          Saved to {env?.name ?? 'the environment'}: {res.saved.map((x) => `{{${x.key}}}`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                  {res.truncated && <div className="hint" style={{ padding: '0 16px 12px' }}>Showing the first 5 MB.</div>}
                </>
              )}
            </div>
          </>
        )}
      </section>

      {dialog?.kind === 'env' && (
        <EnvDialog
          envs={store.environments}
          onClose={() => setDialog(null)}
          onChange={(environments) =>
            update((s) => ({ ...s, environments, activeEnv: environments.some((e) => e.id === s.activeEnv) ? s.activeEnv : (environments[0]?.id ?? null) }))
          }
        />
      )}
      {dialog?.kind === 'colvars' && (
        <VarsDialog
          title={`Variables of ${dialog.col.name}`}
          desc="Used by every request in this collection. The environment wins when it has the same name."
          rows={store.collections.find((c) => c.id === dialog.col.id)?.variables ?? []}
          onChange={(variables) => patchCol(dialog.col.id, { variables })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'paste' && (
        <PasteDialog
          onClose={() => setDialog(null)}
          onImport={async (text) => {
            const r = await act('api-paste', () => api.invoke('api:import', text))
            if (r) {
              imported(r)
              setDialog(null)
            }
          }}
        />
      )}
      {dialog?.kind === 'code' && active && <CodeDialog req={active} envId={store.activeEnv} colId={activeCol?.id ?? null} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'run' && (
        <RunDialog
          col={dialog.col}
          folder={dialog.folder}
          envName={env?.name ?? null}
          onRun={async () => {
            await flush()
            const r = await act(`api-run`, () => api.invoke('api:run', dialog.col.id, store.activeEnv, dialog.folder))
            await reload()
            return r ?? null
          }}
          onOpen={(rid) => {
            setActiveId(rid)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {askDialog}
    </div>
  )
}

function CollectionMenu({ onRename, onFolder, onVars, onExport, onDelete }: Record<'onRename' | 'onFolder' | 'onVars' | 'onExport' | 'onDelete', () => void>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const item = (label: string, icon: React.ReactNode, fn: () => void, danger = false): React.JSX.Element => (
    <button
      className={danger ? 'menu-item danger-text' : 'menu-item'}
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      {icon} {label}
    </button>
  )
  return (
    <span className="menu-wrap">
      <button className="icon-btn" data-tip="More" aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Pencil />
      </button>
      {open && (
        <>
          <span className="menu-catch" onClick={() => setOpen(false)} />
          <span className="menu glass">
            {item('Rename', <Pencil size={14} />, onRename)}
            {item('New folder', <FolderPlus size={14} />, onFolder)}
            {item('Collection variables', <Variable size={14} />, onVars)}
            {item('Export for Postman', <Download size={14} />, onExport)}
            {item('Delete collection', <Trash2 size={14} />, onDelete, true)}
          </span>
        </>
      )}
    </span>
  )
}

function Dialog({ title, desc, onClose, children, wide }: { title: string; desc?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }): React.JSX.Element {
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className={wide ? 'dialog glass snap-dialog push-dialog' : 'dialog glass snap-dialog'} onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">{title}</h2>
            {desc && (
              <p className="page-desc" style={{ marginTop: 4 }}>
                {desc}
              </p>
            )}
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  )
}

function VarsDialog({ title, desc, rows, onChange, onClose }: { title: string; desc: string; rows: KV[]; onChange: (r: KV[]) => void; onClose: () => void }): React.JSX.Element {
  return (
    <Dialog title={title} desc={desc} onClose={onClose}>
      <KvEditor rows={rows} onChange={onChange} keyLabel="Variable" />
      <div className="end" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  )
}

function EnvDialog({ envs, onChange, onClose }: { envs: ApiEnvironment[]; onChange: (e: ApiEnvironment[]) => void; onClose: () => void }): React.JSX.Element {
  const [sel, setSel] = useState(envs[0]?.id ?? '')
  const cur = envs.find((e) => e.id === sel)
  return (
    <Dialog
      title="Environments"
      desc="Write {{name}} in a URL, header or body and it is replaced with the value from the chosen environment. Keep base addresses and tokens here."
      onClose={onClose}
    >
      <div className="seg" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
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
    </Dialog>
  )
}

function PasteDialog({ onImport, onClose }: { onImport: (text: string) => void; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState('')
  return (
    <Dialog
      title="Paste a request or collection"
      desc="A cURL command (Copy as cURL in Chrome DevTools works), or the JSON of a Postman collection or environment, an Insomnia export or an OpenAPI file."
      onClose={onClose}
    >
      <textarea
        className="apic-code mono"
        style={{ minHeight: 200 }}
        autoFocus
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="curl 'https://api.example.com/users' -H 'Accept: application/json'"
      />
      <div className="end" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => onImport(text)}>
          <Upload size={14} /> Import
        </button>
      </div>
    </Dialog>
  )
}

function CodeDialog({ req, envId, colId, onClose }: { req: ApiRequest; envId: string | null; colId: string | null; onClose: () => void }): React.JSX.Element {
  const [lang, setLang] = useState<ApiCodeLang>('curl')
  const [code, setCode] = useState('')
  const { notify } = useApp()
  useEffect(() => {
    void window.laramac.invoke('api:code', req, envId, colId, lang).then(setCode)
  }, [req, envId, colId, lang])
  return (
    <Dialog title={`Code for ${req.name}`} desc="The same request, ready to paste into a terminal or your code. Variables are filled in." onClose={onClose} wide>
      <div className="seg" style={{ marginBottom: 10 }}>
        {(
          [
            ['curl', 'cURL'],
            ['httpie', 'HTTPie'],
            ['fetch', 'fetch'],
            ['axios', 'axios'],
            ['php', 'PHP'],
            ['laravel', 'Laravel'],
            ['python', 'Python'],
            ['go', 'Go']
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={lang === k} onClick={() => setLang(k)}>
            {l}
          </button>
        ))}
      </div>
      <pre className="code-block">{code}</pre>
      <div className="end" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          onClick={async () => {
            await window.laramac.invoke('clipboard:write', code)
            notify({ kind: 'info', text: 'Copied.' })
          }}
        >
          <Copy size={14} /> Copy
        </button>
      </div>
    </Dialog>
  )
}

function RunDialog({
  col,
  folder,
  envName,
  onRun,
  onOpen,
  onClose
}: {
  col: ApiCollection
  folder: string | null
  envName: string | null
  onRun: () => Promise<ApiRunResult[] | null>
  onOpen: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const { busy } = useApp()
  const [results, setResults] = useState<ApiRunResult[] | null>(null)
  const count = col.requests.filter((r) => !folder || r.folder === folder || (r.folder ?? '').startsWith(`${folder}/`)).length
  const tests = (results ?? []).flatMap((r) => r.tests)
  const failed = (results ?? []).filter((r) => r.error || r.tests.some((t) => !t.pass) || (r.status ?? 0) >= 400).length
  return (
    <Dialog
      title={`Run ${folder ? `${col.name} / ${folder}` : col.name}`}
      desc={`Sends ${count} ${count === 1 ? 'request' : 'requests'} in order${envName ? ` with the ${envName} environment` : ''}. Values saved by one request are used by the next.`}
      onClose={onClose}
      wide
    >
      {results && (
        <div className="run-summary" data-ok={failed === 0}>
          {failed === 0 ? <Check size={16} /> : <X size={16} />}
          {failed === 0 ? 'Everything passed' : `${failed} of ${results.length} need a look`}
          <span className="hint">
            {tests.filter((t) => t.pass).length} of {tests.length} tests passed
          </span>
        </div>
      )}
      {results && (
        <div className="run-list">
          {results.map((r) => (
            <button key={r.id} className="run-row" onClick={() => onOpen(r.id)}>
              <span className="status-chip" data-ok={!r.error && (r.status ?? 0) < 400}>
                {r.error ? 'Error' : r.status}
              </span>
              <span className="grow">
                <strong>{r.name}</strong>
                {r.error && <small style={{ color: 'var(--bad)' }}>{r.error}</small>}
                {r.tests
                  .filter((t) => !t.pass)
                  .map((t, i) => (
                    <small key={i} style={{ color: 'var(--bad)' }}>
                      {t.name}: {t.detail}
                    </small>
                  ))}
              </span>
              <span className="hint">{r.ms} ms</span>
              {r.tests.length > 0 && (
                <span className="tab-count" data-s={r.tests.every((t) => t.pass) ? 'pass' : 'fail'}>
                  {r.tests.filter((t) => t.pass).length}/{r.tests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="end" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <button className="btn btn-primary" disabled={busy.has('api-run') || count === 0} onClick={async () => setResults(await onRun())}>
          <Play size={14} /> {busy.has('api-run') ? 'Running…' : results ? 'Run again' : 'Run'}
        </button>
      </div>
    </Dialog>
  )
}
