import { useEffect, useState } from 'react'
import { Bell, Command, Copy, Workflow } from 'lucide-react'
import type { IntegrationsInfo } from '@shared/types'
import { useApp } from '../store'

type Kind = 'slack' | 'teams' | 'discord' | 'generic'
const NAMES: Record<Kind, string> = { slack: 'Slack', teams: 'Teams', discord: 'Discord', generic: 'Other' }

/** Webhooks, Raycast and Apple Shortcuts: Laramac from everywhere else. */
export default function Integrations({ app }: { app: 'Laramac' | 'MacSec' }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = (window as unknown as { laramac?: typeof window.laramac }).laramac ?? (window as unknown as { macsec: typeof window.laramac }).macsec
  const [info, setInfo] = useState<IntegrationsInfo | null>(null)
  const [kind, setKind] = useState<Kind>('slack')
  const [events, setEvents] = useState<'errors' | 'all'>('errors')
  const [url, setUrl] = useState('')
  useEffect(() => {
    void api.invoke('integrations:get').then((i) => {
      setInfo(i)
      if (i.webhook) {
        setKind(i.webhook.kind)
        setEvents(i.webhook.events)
      }
    })
  }, [api])
  if (!info) return <></>
  const copy = (t: string): void => {
    void navigator.clipboard.writeText(t)
    notify({ kind: 'info', text: 'Copied.' })
  }
  return (
    <div className="panel integrations">
      <div className="int-block">
        <div className="row-title">
          <Bell size={14} /> Messages to your team {info.webhook?.saved && <span className="tag tag-ok">{NAMES[info.webhook.kind]}</span>}
        </div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>{app} posts when something fails{events === 'all' ? ', and when work finishes' : ''}. The webhook address is kept in the Keychain.</div>
        <div className="int-form">
          <div className="seg" role="radiogroup">
            {(Object.keys(NAMES) as Kind[]).map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {NAMES[k]}
              </button>
            ))}
          </div>
          <select className="input select" value={events} onChange={(e) => setEvents(e.target.value as 'errors' | 'all')} aria-label="What to send">
            <option value="errors">Only problems</option>
            <option value="all">Problems and finished work</option>
          </select>
          <input className="input mono" type="password" placeholder={info.webhook?.saved ? 'Saved (paste a new address to replace it)' : 'Webhook address'} value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        </div>
        <div className="end">
          {info.webhook && (
            <button className="btn btn-sm btn-quiet" onClick={async () => setInfo((await act('hook-off', () => api.invoke('webhook:set', null, null))) ?? info)}>
              Turn off
            </button>
          )}
          {info.webhook?.saved && (
            <button className="btn btn-sm" onClick={async () => { if ((await act('hook-test', () => api.invoke('webhook:test'))) !== undefined) notify({ kind: 'info', text: 'Sent a test message.' }) }}>
              Send a test
            </button>
          )}
          <button className="btn btn-sm btn-primary" disabled={busy.has('hook')} onClick={async () => { const r = await act('hook', () => api.invoke('webhook:set', { kind, events }, url || null)); if (r) { setInfo(r); setUrl('') } }}>
            Save
          </button>
        </div>
      </div>
      <div className="int-block">
        <div className="row-title">
          <Command size={14} /> Raycast {info.raycastInstalled && <span className="tag tag-ok">Ready</span>}
        </div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>
          Script commands for Raycast. After you press the button, in Raycast open Settings, Extensions, Script Commands, Add Directories, and choose the folder that opens: <span className="mono">{info.raycastDir.replace(/^\/Users\/[^/]+/, '~')}</span>
        </div>
        <div className="end">
          <button className="btn btn-sm" onClick={async () => setInfo((await act('raycast', () => api.invoke('raycast:install'))) ?? info)}>
            {info.raycastInstalled ? 'Write them again' : 'Add Raycast commands'}
          </button>
        </div>
      </div>
      <div className="int-block">
        <div className="row-title">
          <Workflow size={14} /> Apple Shortcuts
        </div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>In the Shortcuts app, add a “Run Shell Script” action and paste one of these. Add --json to read the answer in later actions.</div>
        {info.shortcuts.map((s) => (
          <div key={s.title} className="int-cmd">
            <span>{s.title}</span>
            <code className="mono">{s.command}</code>
            <button className="icon-btn" aria-label={`Copy ${s.title}`} onClick={() => copy(s.command)}>
              <Copy />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
