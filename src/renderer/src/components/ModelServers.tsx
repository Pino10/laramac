import { useEffect, useState } from 'react'
import { Globe2, KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { LlmTest, LocalLlm, ModelApi, ModelServer, ModelServerInput } from '@shared/types'
import { useApp } from '../store'

const PRESETS: { label: string; name: string; baseUrl: string; api: ModelApi; key?: boolean }[] = [
  { label: 'LM Studio', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', api: 'openai' },
  { label: 'Ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', api: 'openai' },
  { label: 'vMLX (OpenAI)', name: 'vMLX', baseUrl: 'http://127.0.0.1:8000/v1', api: 'openai' },
  { label: 'vMLX (Anthropic)', name: 'vMLX Anthropic', baseUrl: 'http://127.0.0.1:8000', api: 'anthropic' },
  { label: 'oMLX', name: 'oMLX', baseUrl: 'http://127.0.0.1:8000/v1', api: 'openai' },
  { label: 'Anthropic API', name: 'Claude API', baseUrl: 'https://api.anthropic.com', api: 'anthropic', key: true },
  { label: 'OpenAI API', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', api: 'openai', key: true },
  { label: 'OpenRouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', api: 'openai', key: true },
  { label: 'Other', name: '', baseUrl: 'http://127.0.0.1:', api: 'openai' }
]

/** Every model server Laramac can talk to: found on this Mac, or added by you. */
export default function ModelServers(): React.JSX.Element {
  const { llms, refreshLlms, act, busy, updateSettings, setPage, settings } = useApp()
  const api = window.laramac
  const [saved, setSaved] = useState<ModelServer[]>([])
  const [editing, setEditing] = useState<ModelServer | 'new' | null>(null)
  const [tests, setTests] = useState<Record<string, LlmTest>>({})
  useEffect(() => {
    void api.invoke('llm:servers').then(setSaved)
  }, [api])

  const key = (l: LocalLlm): string => `${l.api}:${l.baseUrl}`
  return (
    <>
      <div className="section-row">
        <h2 className="section-title">Model servers</h2>
        <button className="btn btn-sm btn-tonal" onClick={() => setEditing('new')}>
          <Plus size={13} /> Add server
        </button>
      </div>
      <p className="hint" style={{ margin: '-4px 0 12px' }}>
        Laramac looks for LM Studio, Ollama, vMLX, oMLX, Jan and llama.cpp on their usual ports. Add any other address, the Anthropic format, or a cloud API with its key.
        The Assistant, the site doctor and code review use whichever you pick.
      </p>
      <div className="panel">
        {llms.length === 0 && <div className="empty dim">No model server is answering. Start one, or add its address.</div>}
        {llms.map((l) => {
          const t = tests[key(l)]
          const model = l.loaded[0] ?? l.models[0]
          const current = settings?.llm.baseUrl === l.baseUrl
          const state = t ? (t.ok ? 'ok' : 'bad') : l.saved && l.online === false ? 'bad' : 'on'
          const sv = l.id ? saved.find((s) => s.id === l.id) : undefined
          return (
            <div key={key(l)} className="ms-row">
              <span className="ai-live-dot" data-s={state}>
                <span className="llm-dot" />
              </span>
              <div className="row-main">
                <div className="row-title">
                  {l.provider}
                  <span className="tag">{l.api === 'anthropic' ? 'Anthropic' : 'OpenAI'} format</span>
                  {l.remote && (
                    <span className="tag" title="Prompts are sent off this Mac">
                      <Globe2 size={11} /> Cloud
                    </span>
                  )}
                  {sv?.hasKey && (
                    <span className="tag">
                      <KeyRound size={11} /> Key
                    </span>
                  )}
                  {current && <span className="tag tag-accent">In use</span>}
                </div>
                <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                  <span className="mono">{l.baseUrl}</span>
                  {' · '}
                  {t
                    ? t.ok
                      ? `${model} answered in ${(t.ms / 1000).toFixed(1)} s`
                      : t.error
                    : l.saved && l.online === false
                      ? 'Not answering'
                      : `${l.models.length} chat ${l.models.length === 1 ? 'model' : 'models'}${l.loaded.length && l.loaded.length < l.models.length ? `, ${l.loaded.length} loaded` : ''}`}
                </div>
              </div>
              <button
                className="btn btn-sm"
                disabled={!model || busy.has(`ms-${key(l)}`)}
                onClick={async () => {
                  const r = await act(`ms-${key(l)}`, () => api.invoke('ai:test', l.baseUrl, model!))
                  if (r) setTests((x) => ({ ...x, [key(l)]: r }))
                }}
              >
                {busy.has(`ms-${key(l)}`) ? 'Testing…' : 'Test'}
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={!model}
                onClick={async () => {
                  await updateSettings({ llm: { baseUrl: l.baseUrl, model: model! } })
                  setPage('assistant')
                }}
              >
                Use
              </button>
              {sv ? (
                <>
                  <button className="icon-btn" data-tip="Edit" aria-label={`Edit ${l.provider}`} onClick={() => setEditing(sv)}>
                    <Pencil />
                  </button>
                  <button
                    className="icon-btn danger-text"
                    data-tip="Remove"
                    aria-label={`Remove ${l.provider}`}
                    onClick={async () => {
                      const r = await act('ms-del', () => api.invoke('llm:delete', sv.id))
                      if (r) {
                        setSaved(r)
                        refreshLlms()
                      }
                    }}
                  >
                    <Trash2 />
                  </button>
                </>
              ) : (
                <span style={{ width: 76 }} />
              )}
            </div>
          )
        })}
      </div>
      {editing && (
        <ServerDialog
          server={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(list) => {
            setSaved(list)
            setEditing(null)
            refreshLlms()
          }}
        />
      )}
    </>
  )
}

function ServerDialog({ server, onClose, onSaved }: { server: ModelServer | null; onClose: () => void; onSaved: (l: ModelServer[]) => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const [name, setName] = useState(server?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(server?.baseUrl ?? 'http://127.0.0.1:')
  const [apiKind, setApiKind] = useState<ModelApi>(server?.api ?? 'openai')
  const [keyText, setKeyText] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const remote = !/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(baseUrl)
  const save = async (): Promise<void> => {
    const input: ModelServerInput = { ...(server ? { id: server.id } : {}), name, baseUrl, api: apiKind, ...(removeKey ? { key: null } : keyText.trim() ? { key: keyText.trim() } : {}) }
    const r = await act('ms-save', () => window.laramac.invoke('llm:save', input))
    if (r) onSaved(r)
  }
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" role="dialog" aria-label="Model server" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">{server ? `Edit ${server.name}` : 'Add a model server'}</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Any server that speaks the OpenAI or Anthropic format: on this Mac, on your network, or in the cloud.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {!server && (
          <div className="seg" role="radiogroup" aria-label="Start from" style={{ flexWrap: 'wrap', margin: '16px 0 4px' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                role="radio"
                aria-checked={baseUrl === p.baseUrl && apiKind === p.api && name === p.name}
                onClick={() => {
                  setName(p.name)
                  setBaseUrl(p.baseUrl)
                  setApiKind(p.api)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="ms-name">Name</label>
          <input id="ms-name" className="input" value={name} placeholder="vMLX on 8000" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ms-url">Address</label>
          <input id="ms-url" className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <span className="hint">
            Just the address and port is enough, like http://127.0.0.1:8000. Laramac adds /v1 for the OpenAI format itself. Add a path only if your server uses an unusual one.
          </span>
        </div>
        <div className="field">
          <label>Format</label>
          <div className="seg" role="radiogroup" aria-label="Format">
            <button role="radio" aria-checked={apiKind === 'openai'} onClick={() => setApiKind('openai')}>
              OpenAI (/v1/chat/completions)
            </button>
            <button role="radio" aria-checked={apiKind === 'anthropic'} onClick={() => setApiKind('anthropic')}>
              Anthropic (/v1/messages)
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ms-key">API key {server?.hasKey ? '(saved; type to replace)' : '(only if the server asks for one)'}</label>
          <input id="ms-key" className="input mono" type="password" autoComplete="off" value={keyText} disabled={removeKey} placeholder={server?.hasKey ? '••••••••••••' : 'sk-…'} onChange={(e) => setKeyText(e.target.value)} />
          <span className="hint">Kept encrypted in your Mac’s Keychain. It is never shown again or sent anywhere but this server.</span>
          {server?.hasKey && (
            <label className="check-row" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} /> Remove the saved key
            </label>
          )}
        </div>
        {remote && /^https?:\/\/[^/]*\.[a-z]{2,}/i.test(baseUrl) && (
          <div className="st-plan" style={{ marginBottom: 12 }}>
            <Globe2 size={14} />
            <div>This server is outside your Mac. When you use it, your messages (and, for the site doctor, logs with secrets blanked) are sent there.</div>
          </div>
        )}
        <div className="end">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || busy.has('ms-save')} onClick={save}>
            {server ? 'Save' : 'Add server'}
          </button>
        </div>
      </div>
    </div>
  )
}
