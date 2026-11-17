import { useEffect, useState } from 'react'
import { Bot, ClipboardList, Download, ShieldCheck } from 'lucide-react'
import type { ServerAuditEntry, SshConfigHost, SshServer } from '@shared/types'
import { useApp } from '../../store'

const api = (): Window['laramac'] => window.laramac
const clean = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const ACTIONS: Record<string, string> = {
  upload: 'Uploaded',
  download: 'Downloaded',
  zip: 'Zipped',
  unzip: 'Opened an archive',
  delete: 'Deleted',
  bin: 'Moved to the bin',
  rename: 'Renamed',
  'new folder': 'New folder',
  permissions: 'Changed permissions',
  edit: 'Saved a file',
  key: 'Added a key',
  claude: 'Asked Claude'
}

/** What was done to a server from Laramac. Kept on this Mac, with no passwords in it. */
export function AuditDialog({ server, onClose }: { server: SshServer; onClose: () => void }): React.JSX.Element {
  const [rows, setRows] = useState<ServerAuditEntry[] | null>(null)
  useEffect(() => void api().invoke('ssh:audit', server.id).then(setRows), [server.id])
  return (
    <div className="scrim" style={{ zIndex: 60 }} onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 640 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 6 }}>
          What was done on {server.name}
        </h2>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          Uploads, downloads, deletes, zips and more, started from Laramac. It stays on this Mac and holds no passwords. Commands you type in the terminal are not recorded.
        </p>
        <div className="audit-list">
          {rows === null && <div className="dim">Loading…</div>}
          {rows?.length === 0 && <div className="empty dim">Nothing yet.</div>}
          {rows?.map((r, i) => (
            <div key={i} className="audit-row">
              <span className="hint">{new Date(r.at).toLocaleString()}</span>
              <strong>{ACTIONS[r.action] ?? r.action}</strong>
              <span className="audit-detail">{r.detail}</span>
            </div>
          ))}
        </div>
        <div className="end" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/** Ask Claude about a server, or have it look for trouble. Claude gets a cleaned, read only report, never a way in. */
export function ClaudeDialog({
  server,
  passphrase,
  kind,
  onUnknownHost,
  onClose
}: {
  server: SshServer
  passphrase: string | null
  kind: 'ask' | 'troubleshoot'
  onUnknownHost: (fingerprint: string, retry: () => void) => void
  onClose: () => void
}): React.JSX.Element {
  const { act } = useApp()
  const [question, setQuestion] = useState('')
  const [where, setWhere] = useState<'terminal' | 'desktop'>('terminal')
  const [ready, setReady] = useState(true)
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState('')
  useEffect(() => void api().invoke('ssh:claude-ready').then((r) => (setReady(r.ready), r.ready || setWhere('desktop'))), [])

  const go = async (): Promise<void> => {
    setFailed('')
    try {
      const r = await act('ssh-claude', () => api().invoke('ssh:claude-help', { id: server.id, kind, question: question.trim() || null, where, passphrase }))
      if (!r) return
      if (r.status === 'unknown-host') return onUnknownHost(r.fingerprint, () => void go())
      setDone(r.where === 'terminal' ? 'Claude Code is open in Terminal, reading the report.' : 'The request is copied. In the Claude app, open the Code tab and paste.')
    } catch (e) {
      setFailed(clean(e))
    }
  }

  return (
    <div className="scrim" style={{ zIndex: 60 }} onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 6 }}>
          {kind === 'ask' ? `Ask Claude about ${server.name}` : `Troubleshoot ${server.name}`}
        </h2>
        <div className="claude-safe">
          <ShieldCheck size={15} />
          <div>
            Laramac looks at the server with a fixed set of read only commands: disk, memory, busy programs, failed services and the end of the error logs. Passwords, keys and tokens are removed, and the result is saved as a report on this Mac.
            <strong> Claude reads the report. It is never given a password, a key or a way into the server.</strong> If a fix is needed, it writes the command for you to read and run yourself.
          </div>
        </div>
        {kind === 'ask' && (
          <div className="field">
            <label htmlFor="cl-q">What do you want to know?</label>
            <textarea id="cl-q" className="input" rows={3} placeholder="Why is the site slow since yesterday?" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
        )}
        <div className="field">
          <span className="field-label">Open it in</span>
          <div className="seg" role="radiogroup" aria-label="Open it in" style={{ alignSelf: 'flex-start' }}>
            <button role="radio" aria-checked={where === 'terminal'} disabled={!ready} onClick={() => setWhere('terminal')}>
              Claude Code in Terminal
            </button>
            <button role="radio" aria-checked={where === 'desktop'} onClick={() => setWhere('desktop')}>
              Claude desktop app
            </button>
          </div>
          {!ready && <span className="hint">Claude Code is not installed. Set it up under AI tools, or use the desktop app.</span>}
        </div>
        {failed && <div className="errbox">{failed}</div>}
        {done && <div className="okbox">{done}</div>}
        <div className="end" style={{ marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button className="btn btn-primary" disabled={where === 'terminal' && !ready} onClick={() => void go()}>
              <Bot size={14} /> Read the server and open Claude
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Hosts found in ~/.ssh/config, to add with a click. */
export function ImportConfigDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (list: SshServer[]) => void }): React.JSX.Element {
  const { act } = useApp()
  const [hosts, setHosts] = useState<SshConfigHost[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(
    () =>
      void api()
        .invoke('ssh:config-import')
        .then((h) => (setHosts(h), setPicked(new Set(h.filter((x) => x.user).map((x) => x.alias))))),
    []
  )
  const add = async (): Promise<void> => {
    let last: SshServer[] | null = null
    for (const h of hosts ?? []) {
      if (!picked.has(h.alias)) continue
      last = await act('ssh-save', () => api().invoke('ssh:save', { name: h.alias, host: h.host, port: h.port, user: h.user, auth: h.keyPath ? 'key' : 'agent', keyPath: h.keyPath, protocol: 'sftp' })) ?? last
    }
    if (last) onAdded(last)
    onClose()
  }
  return (
    <div className="scrim" style={{ zIndex: 60 }} onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 520 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 6 }}>
          Add servers from your SSH settings
        </h2>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          These are the servers in your ~/.ssh/config that Laramac does not have yet. Only the address, user and key file are read.
        </p>
        {hosts === null && <div className="dim">Looking…</div>}
        {hosts?.length === 0 && <div className="empty dim">Nothing new to add.</div>}
        <div className="import-list">
          {hosts?.map((h) => (
            <label key={h.alias} className="check">
              <input
                type="checkbox"
                checked={picked.has(h.alias)}
                disabled={!h.user}
                onChange={(e) => setPicked((s) => (e.target.checked ? new Set([...s, h.alias]) : new Set([...s].filter((x) => x !== h.alias))))}
              />
              <span>
                <strong>{h.alias}</strong> <span className="hint mono">{h.user ? `${h.user}@` : ''}{h.host}{h.port !== 22 ? `:${h.port}` : ''}</span>
                {!h.user && <span className="hint"> (no user in the file, so add it by hand)</span>}
              </span>
            </label>
          ))}
        </div>
        <div className="end" style={{ marginTop: 12 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={picked.size === 0} onClick={() => void add()}>
            <Download size={14} /> Add {picked.size || ''}
          </button>
        </div>
      </div>
    </div>
  )
}

export const RecordIcon = ClipboardList
