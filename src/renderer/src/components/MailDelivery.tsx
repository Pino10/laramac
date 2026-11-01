import { useEffect, useState } from 'react'
import { Send, X } from 'lucide-react'
import type { MailRelay, MailRelayInput } from '@shared/types'
import { MAIL_PRESETS } from '@shared/mail'
import { useApp } from '../store'

export function relaySummary(r: MailRelay | null): string {
  if (!r || r.mode === 'catch') return 'Kept in Mailpit, never sent'
  const name = MAIL_PRESETS.find((p) => p.id === r.preset)?.name ?? r.host
  return r.mode === 'all' ? `Kept in Mailpit and sent for real through ${name}` : `Kept in Mailpit; released mail goes through ${name}`
}

/** Choose whether mail only lands in Mailpit, or also reaches real inboxes through a provider. */
export default function MailDelivery({ onClose, onSaved }: { onClose: () => void; onSaved: (r: MailRelay) => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const [r, setR] = useState<MailRelayInput | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [testTo, setTestTo] = useState('')
  useEffect(() => {
    void window.laramac.invoke('mail:relay').then(({ hasPassword: h, ...rest }) => {
      setR(rest)
      setHasPassword(h)
    })
  }, [])
  if (!r) return <></>
  const preset = MAIL_PRESETS.find((p) => p.id === r.preset) ?? MAIL_PRESETS[MAIL_PRESETS.length - 1]
  const set = (p: Partial<MailRelayInput>): void => setR({ ...r, ...p })
  const save = async (): Promise<boolean> => {
    const saved = await act('mail-save', () => window.laramac.invoke('mail:save-relay', { ...r, ...(password ? { password } : {}) }))
    if (saved) {
      setHasPassword(saved.hasPassword)
      setPassword('')
      onSaved(saved)
      return true
    }
    return false
  }
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" role="dialog" aria-label="Mail delivery" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Mail delivery</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Your apps always send to 127.0.0.1:1025 and Mailpit keeps a copy. Choose whether it also passes mail on to real inboxes.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div role="radiogroup" aria-label="Delivery" style={{ margin: '16px 0 12px' }}>
          {(
            [
              ['catch', 'Only catch it', 'Nothing leaves your Mac. Best while building.'],
              ['release', 'Send what I release', 'Mail stays in Mailpit until you press Release on a message.'],
              ['all', 'Send everything for real', 'Every message also goes to its real recipients through your provider.']
            ] as const
          ).map(([id, title, hint]) => (
            <button key={id} className="choice" role="radio" aria-checked={r.mode === id} onClick={() => set({ mode: id })}>
              <div style={{ fontWeight: 500 }}>{title}</div>
              <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                {hint}
              </div>
            </button>
          ))}
        </div>
        {r.mode !== 'catch' && (
          <>
            <div className="field">
              <label>Provider</label>
              <div className="seg" role="radiogroup" aria-label="Provider" style={{ flexWrap: 'wrap' }}>
                {MAIL_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={r.preset === p.id}
                    onClick={() => set({ preset: p.id, host: p.host || r.host, port: p.port, security: p.security, username: p.username ?? (p.id === r.preset ? r.username : '') })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <span className="hint">{preset.help}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 150px', gap: 10 }}>
              <div className="field">
                <label htmlFor="mr-host">SMTP server</label>
                <input id="mr-host" className="input mono" value={r.host} placeholder="smtp.example.com" onChange={(e) => set({ host: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="mr-port">Port</label>
                <input id="mr-port" className="input mono" value={r.port} onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </div>
              <div className="field">
                <label htmlFor="mr-sec">Security</label>
                <select id="mr-sec" className="input" value={r.security} onChange={(e) => set({ security: e.target.value as MailRelayInput['security'] })}>
                  <option value="starttls">STARTTLS</option>
                  <option value="tls">TLS (465)</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label htmlFor="mr-user">User</label>
                <input id="mr-user" className="input mono" value={r.username} onChange={(e) => set({ username: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="mr-pass">Password or API key {hasPassword ? '(saved)' : ''}</label>
                <input id="mr-pass" className="input mono" type="password" autoComplete="off" placeholder={hasPassword ? '••••••••' : ''} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mr-from">Send as (optional)</label>
              <input id="mr-from" className="input mono" placeholder="hello@yourdomain.com" value={r.from} onChange={(e) => set({ from: e.target.value })} />
              <span className="hint">Most providers only accept a sender on a domain you verified with them.</span>
            </div>
          </>
        )}
        <div className="doctor-input" style={{ marginTop: 6 }}>
          <input className="input" placeholder="Send a test email to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button
            className="btn"
            disabled={!testTo.trim() || busy.has('mail-test') || busy.has('mail-save')}
            onClick={async () => {
              if (!(await save())) return
              const ok = await act('mail-test', () => window.laramac.invoke('mail:test', testTo.trim()).then(() => true))
              if (ok)
                notify({
                  kind: 'info',
                  text: r.mode === 'all' ? `Sent. It is in Mailpit and on its way to ${testTo.trim()}.` : r.mode === 'release' ? 'Sent to Mailpit. Release it there to deliver it.' : 'Sent. Open the inbox to see it.'
                })
            }}
          >
            <Send size={13} /> Test
          </button>
          <button
            className="btn btn-primary"
            disabled={busy.has('mail-save')}
            onClick={async () => {
              if (await save()) onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
