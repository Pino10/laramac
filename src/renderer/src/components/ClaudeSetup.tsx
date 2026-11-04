import { useEffect, useState } from 'react'
import { Check, Cpu, Sparkles, TerminalSquare, X } from 'lucide-react'
import type { ClaudeSetupStatus } from '@shared/types'
import { useApp } from '../store'

/** One button that sets up claude, claudelm, the Claude app and the skills, with what each is. */
export default function ClaudeSetup(): React.JSX.Element {
  const { act, busy, notify, setPage } = useApp()
  const api = window.laramac
  const [s, setS] = useState<ClaudeSetupStatus | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  useEffect(() => {
    void api.invoke('claude:status').then(setS)
  }, [api])
  const items: { ok: boolean; label: string; text: string }[] = s
    ? [
        { ok: s.claudeCode && s.mcpClaudeCode === 'connected', label: 'claude', text: 'Claude Code with your Claude account, connected to Laramac.' },
        { ok: s.claudeLm.installed, label: 'claudelm', text: s.claudeLm.installed ? `Claude Code on ${s.claudeLm.model?.split('/').pop() ?? 'your model'} in LM Studio. Arguments pass through: claudelm --resume.` : 'Claude Code on your own model in LM Studio. Needs a model chosen in the Assistant.' },
        { ok: s.desktopConnected, label: 'Claude app', text: s.desktopApp ? 'Chats and Claude Code sessions in the Claude desktop app can use Laramac.' : 'Not installed on this Mac.' },
        { ok: s.skills, label: 'Skills', text: 'Laramac’s security skills, for every Claude Code session and the Claude app.' },
        { ok: s.inPath, label: 'Terminal', text: 'laramac, claudelm, node, npm and php in Terminal.' }
      ]
    : []
  const all = items.length > 0 && items.every((i) => i.ok)
  const ctx = s?.context
  return (
    <div className="mcp-card glass claude-setup">
      <span className="mcp-mark" aria-hidden>
        <Sparkles size={20} />
      </span>
      <div className="mcp-body">
        <strong>{all ? 'Claude is set up everywhere' : 'Set up Claude everywhere'}</strong>
        <span>Two Terminal commands, the Claude app and the skills, in one go. Your own Claude setup stays as it is; Laramac only adds its entries.</span>
        <div className="cs-grid">
          {items.map((i) => (
            <div key={i.label} className="cs-item" data-ok={i.ok}>
              {i.ok ? <Check size={14} /> : <X size={14} />}
              <div>
                <code>{i.label}</code>
                <span>{i.text}</span>
              </div>
            </div>
          ))}
        </div>
        {ctx && (
          <div className="cs-ctx" data-ok={ctx.ok}>
            <Cpu size={14} />
            <span>{ctx.note || (ctx.after ? `Your model is loaded with ${ctx.after.toLocaleString('en')} tokens of context: enough for Claude Code.` : 'LM Studio is not running, so the context was not checked.')}</span>
          </div>
        )}
        {(s?.notes.length ?? 0) > 0 && <span className="hint">{s!.notes.join(' ')}</span>}
        {showToken && (
          <input className="input" type="password" placeholder="LM Studio API token (only if you turned on Require authentication)" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        )}
        <div className="mcp-actions">
          <button
            className="btn btn-primary"
            disabled={busy.has('claude-setup')}
            onClick={async () => {
              const r = await act('claude-setup', () => api.invoke('claude:setup', showToken ? { lmToken: token } : {}))
              if (r) {
                setS(r)
                setToken('')
                notify({ kind: 'info', text: 'Done. Open a new Terminal window, then type claude or claudelm. Restart the Claude app to see Laramac there.' })
              }
            }}
          >
            {busy.has('claude-setup') ? 'Setting up…' : all ? 'Set up again' : 'Set up Claude everywhere'}
          </button>
          {s?.claudeLm.installed && (
            <button className="btn" onClick={() => act('claude-open-lm', () => api.invoke('claude:open-lm', null))}>
              <TerminalSquare size={14} /> Open claudelm
            </button>
          )}
          {s?.model && (
            <button className="btn btn-quiet" disabled={busy.has('claude-ctx')} onClick={async () => setS((await act('claude-ctx', () => api.invoke('claude:lm-context'))) ?? s)}>
              {busy.has('claude-ctx') ? 'Checking…' : 'Fix the model’s context'}
            </button>
          )}
          {!s?.model && (
            <button className="btn btn-quiet" onClick={() => setPage('assistant')}>
              Choose a model
            </button>
          )}
          <button className="btn btn-quiet" onClick={() => setShowToken(!showToken)}>
            {showToken ? 'No token' : 'LM Studio token'}
          </button>
        </div>
      </div>
    </div>
  )
}
