import { useEffect, useState } from 'react'
import { Check, KeyRound, Network, RefreshCw, TerminalSquare, X } from 'lucide-react'
import type { FreeLlmInfo } from '@shared/types'
import { useApp } from '../store'

/**
 * Free LLM API: the app that keeps your free keys (Google AI Studio, Groq, NVIDIA, OpenRouter and
 * the rest) behind one address. Paste its unified key once; claudefree, code reviews and the
 * Assistant can then use it. The key goes to the Keychain and never comes back to this window.
 */
export default function FreeLlm(): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [s, setS] = useState<FreeLlmInfo | null>(null)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState('')
  const [model, setModel] = useState('auto')
  useEffect(() => {
    void api.invoke('freellm:get').then((r) => {
      setS(r)
      setUrl(r.baseUrl)
      setModel(r.model)
      if (r.hasKey) void api.invoke('freellm:check').then(setS)
    })
  }, [api])
  const save = async (k?: string | null): Promise<void> => {
    const r = await act('freellm-save', () => api.invoke('freellm:save', { baseUrl: url, model, ...(k !== undefined ? { key: k } : {}) }))
    if (!r) return
    setS(r)
    setKey('')
    notify({ kind: 'info', text: r.ok ? (r.claudefree ? 'Connected. Open a new Terminal window and type claudefree.' : 'Connected. Install Claude Code to get claudefree too.') : r.note })
  }
  const ok = s?.ok === true
  return (
    <div className="mcp-card glass freellm">
      <span className="mcp-mark" aria-hidden>
        <Network size={20} />
      </span>
      <div className="mcp-body">
        <strong>{ok ? 'Free LLM API is connected' : 'Free LLM API'}</strong>
        <span>
          Use all the free keys you added to Free LLM API through one address. Laramac gives you a third way to run Claude Code next to <code>claude</code> (your Claude account) and <code>claudelm</code> (LM Studio):{' '}
          <code>claudefree</code>. Code reviews and the Assistant can use it too.
        </span>
        {s && (
          <div className="cs-grid">
            <div className="cs-item" data-ok={s.hasKey}>
              {s.hasKey ? <Check size={14} /> : <X size={14} />}
              <div>
                <code>Key</code>
                <span>{s.hasKey ? 'Kept in the Keychain.' : 'Paste the unified key from Free LLM API’s Keys page.'}</span>
              </div>
            </div>
            <div className="cs-item" data-ok={ok}>
              {ok ? <Check size={14} /> : <X size={14} />}
              <div>
                <code>Server</code>
                <span>{s.ok === null ? 'Not checked yet.' : s.note}</span>
              </div>
            </div>
            <div className="cs-item" data-ok={s.claudefree}>
              {s.claudefree ? <Check size={14} /> : <X size={14} />}
              <div>
                <code>claudefree</code>
                <span>{s.claudefree ? `Claude Code on ${s.model}. Arguments pass through: claudefree --resume.` : s.claudeCode ? 'Written as soon as the key is saved.' : 'Needs Claude Code: set up Claude everywhere above.'}</span>
              </div>
            </div>
          </div>
        )}
        <div className="fl-fields">
          <label className="field">
            <span>Address</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:31415/v1" spellCheck={false} />
          </label>
          <label className="field">
            <span>Model</span>
            <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
              {(s?.models.includes(model) ? s.models : [model, ...(s?.models ?? [])]).map((m) => (
                <option key={m} value={m}>
                  {m === 'auto' ? 'auto: your routing chain' : m === 'auto:fast' ? 'auto:fast: the fastest model' : m}
                </option>
              ))}
            </select>
          </label>
          <label className="field fl-key">
            <span>
              <KeyRound size={12} /> Unified key
            </span>
            <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s?.hasKey ? 'Saved. Paste a new one to replace it.' : 'freellmapi-…'} autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className="mcp-actions">
          <button className="btn btn-primary" disabled={busy.has('freellm-save') || (!key.trim() && !s?.hasKey)} onClick={() => save(key.trim() ? key.trim() : undefined)}>
            {busy.has('freellm-save') ? 'Connecting…' : s?.hasKey ? 'Save' : 'Connect'}
          </button>
          {s?.hasKey && (
            <button className="btn" disabled={busy.has('freellm-check')} onClick={async () => setS((await act('freellm-check', () => api.invoke('freellm:check'))) ?? s)}>
              <RefreshCw size={14} /> {busy.has('freellm-check') ? 'Checking…' : 'Check'}
            </button>
          )}
          {s?.claudefree && (
            <button className="btn" onClick={() => act('claude-open-free', () => api.invoke('claude:open-free', null))}>
              <TerminalSquare size={14} /> Open claudefree
            </button>
          )}
          {s?.hasKey && (
            <button className="btn btn-quiet" onClick={() => save(null)}>
              Forget the key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
