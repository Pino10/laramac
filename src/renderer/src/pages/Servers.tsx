import { useEffect, useRef, useState } from 'react'
import { Activity, Bot, ClipboardList, ExternalLink, FileText, Folder, KeyRound, Lock, Pencil, Plus, ShieldAlert, ShieldCheck, SquareTerminal, Trash2, X } from 'lucide-react'
import type { SshServer, SshServerInput } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'
import { useAsk } from '../components/Ask'
import ServerHealth from '../components/ServerHealth'
import FileBrowser from '../components/remote/FileBrowser'
import TerminalTabs from '../components/remote/Terminal'
import { AuditDialog, ClaudeDialog, ImportConfigDialog } from '../components/remote/ServerTools'

const api = (): Window['laramac'] => window.laramac

const toInput = (s: SshServer): SshServerInput => ({
  id: s.id,
  name: s.name,
  host: s.host,
  port: s.port,
  user: s.user,
  auth: s.auth,
  keyPath: s.keyPath,
  protocol: s.protocol,
  tag: s.tag,
  group: s.group,
  readOnly: s.readOnly,
  notes: s.notes,
  startDir: s.startDir
})

/** Left the Remote page at this time, so coming back after a while asks for Touch ID again. */
let leftAt = 0

/** Servers under their group names, groups in order, the ones without a group last. */
function groupsOf(list: SshServer[]): [string, SshServer[]][] {
  const by = new Map<string, SshServer[]>()
  for (const s of list) by.set(s.group ?? '', [...(by.get(s.group ?? '') ?? []), s])
  return [...by.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
}

export default function Servers(): React.JSX.Element {
  const { act } = useApp()
  const [servers, setServers] = useState<SshServer[]>([])
  const [editing, setEditing] = useState<SshServerInput | null>(null)
  const [workspace, setWorkspace] = useState<{
    server: SshServer
    tab: 'terminal' | 'files' | 'health'
    passphrase: string | null
    key: number
  } | null>(null)
  const [trust, setTrust] = useState<{
    server: SshServer
    fingerprint: string
    retry: () => void
  } | null>(null)
  const [ask, askDialog] = useAsk()
  const [importing, setImporting] = useState(false)
  const { settings } = useApp()
  const lockAfter = settings?.remoteLockMinutes ?? 0
  const [locked, setLocked] = useState(() => lockAfter > 0 && leftAt > 0 && Date.now() - leftAt > lockAfter * 60_000)
  const lastSeen = useRef(Date.now())

  useEffect(() => {
    api().invoke('ssh:list').then(setServers)
  }, [])

  // Touch ID again after a quiet while, or after being away from this page for as long.
  useEffect(() => {
    if (lockAfter <= 0) return
    const touch = (): void => {
      lastSeen.current = Date.now()
    }
    window.addEventListener('mousemove', touch)
    window.addEventListener('keydown', touch)
    const id = setInterval(() => {
      if (Date.now() - lastSeen.current > lockAfter * 60_000) setLocked(true)
    }, 15_000)
    return () => {
      window.removeEventListener('mousemove', touch)
      window.removeEventListener('keydown', touch)
      clearInterval(id)
      leftAt = Date.now()
    }
  }, [lockAfter])
  const lockView = locked && lockAfter > 0 && (
    <div className="remote-lock glass" role="dialog" aria-label="Remote servers are locked">
      <Lock size={26} />
      <strong>Remote servers are locked</strong>
      <span className="hint">Locked after {lockAfter} quiet {lockAfter === 1 ? 'minute' : 'minutes'}. Connections stay open behind this.</span>
      <button
        className="btn btn-primary"
        onClick={async () => {
          const r = await api().invoke('remote:touchid')
          if (r === 'ok') {
            lastSeen.current = Date.now()
            setLocked(false)
          } else if (r === 'unavailable') setLocked(false)
        }}
      >
        Unlock with Touch ID
      </button>
    </div>
  )

  const openWorkspace = async (srv: SshServer, tab: 'terminal' | 'files' | 'health'): Promise<void> => {
    let passphrase: string | null = null
    if (srv.auth === 'key') {
      const pass = await ask({
        title: `Connect to ${srv.name}`,
        label: 'Key passphrase (leave empty if it has none)',
        secret: true,
        confirm: 'Connect'
      })
      if (pass === null) return
      passphrase = pass || null
    }
    setWorkspace({ server: srv, tab, passphrase, key: Date.now() })
  }

  const trustDialog = trust && (
    <div className="scrim" onMouseDown={() => setTrust(null)}>
      <div className="dialog glass" style={{ width: 500 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18 }}>
          Is this really {trust.server.host}?
        </h2>
        <p className="page-desc" style={{ margin: '6px 0 14px' }}>
          This is the first connection to this server. Check that its fingerprint matches the one your host shows (for example with{' '}
          <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code> on the server). Laramac remembers it and refuses to connect if it ever changes.
        </p>
        <div className="copyfield" style={{ height: 'auto', padding: '10px 12px' }}>
          <span className="mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
            {trust.fingerprint}
          </span>
        </div>
        <div className="end" style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => setTrust(null)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const list = await act('ssh-trust', () => api().invoke('ssh:trust', trust.server.id, trust.fingerprint))
              const retry = trust.retry
              setTrust(null)
              if (list) {
                setServers(list)
                retry()
              }
            }}
          >
            Trust and connect
          </button>
        </div>
      </div>
    </div>
  )

  if (workspace) {
    const srv = servers.find((x) => x.id === workspace.server.id) ?? workspace.server
    return (
      <>
        <Workspace
          key={workspace.key}
          server={srv}
          tab={workspace.tab}
          passphrase={workspace.passphrase}
          onTab={(tab) => setWorkspace({ ...workspace, tab })}
          onUnknownHost={(fingerprint, retry) => setTrust({ server: srv, fingerprint, retry })}
          onClose={() => setWorkspace(null)}
        />
        {trustDialog}
        {lockView}
      </>
    )
  }

  return (
    <>
      {lockView}
      <PageHead title="Remote servers" desc="Your remote machines in one place: open a terminal over SSH, or browse and move files over SFTP.">
        <button className="btn" title="Add servers you already use with ssh in Terminal" onClick={() => setImporting(true)}>
          From SSH settings
        </button>
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditing({
              name: '',
              host: '',
              port: 22,
              user: '',
              auth: 'agent'
            })
          }
        >
          <Plus size={14} /> Add server
        </button>
      </PageHead>

      {servers.length === 0 ? (
        <div className="panel empty" style={{ padding: '56px 24px' }}>
          <strong style={{ fontSize: 15 }}>No servers yet</strong>
          <p className="dim" style={{ margin: '4px auto 18px', maxWidth: '50ch' }}>
            Add a VPS, a staging box or a Raspberry Pi on your network. Laramac uses your SSH keys, the SSH agent, or a password kept in the macOS Keychain.
          </p>
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditing({
                name: '',
                host: '',
                port: 22,
                user: '',
                auth: 'agent'
              })
            }
          >
            <Plus size={14} /> Add server
          </button>
        </div>
      ) : (
        <>
          {groupsOf(servers).map(([group, list]) => (
            <div key={group || 'none'}>
              {groupsOf(servers).length > 1 && <div className="srv-group">{group || 'Other servers'}</div>}
              <div className="grid-3" style={{ marginBottom: 14 }}>
          {list.map((s) => (
            <div key={s.id} className="server-card glass" data-tag={s.tag}>
              <div className="card-head">
                <span className="mono-tile lg" style={{ ['--hue' as string]: '#4a7bb5' }} aria-hidden>
                  {s.name.slice(0, 2)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">{s.name}</div>
                  <div className="hint mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.user}@{s.host}
                    {s.port !== 22 ? `:${s.port}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-quiet btn-icon"
                  aria-label={`Edit ${s.name}`}
                  title="Edit"
                  onClick={() => setEditing(toInput(s))}
                >
                  <Pencil size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.tag && (
                  <span className="tag srv-tag" data-tag={s.tag}>
                    {s.tag === 'production' ? <ShieldAlert size={11} style={{ marginRight: 3 }} /> : null}
                    {s.tag === 'production' ? 'Production' : s.tag === 'staging' ? 'Staging' : 'Development'}
                  </span>
                )}
                {s.readOnly && (
                  <span className="tag">
                    <Lock size={11} style={{ marginRight: 3 }} /> Read only
                  </span>
                )}
                <span className="tag tag-accent">{s.protocol === 'sftp' ? 'SSH' : s.protocol.toUpperCase()}</span>
                <span className="tag">
                  {s.auth === 'agent' ? 'SSH agent' : s.auth === 'key' ? 'Key file' : s.hasPassword ? 'Password in Keychain' : 'Password'}
                </span>
                {s.hostKey ? (
                  <span className="tag tag-ok" title={s.hostKey}>
                    <ShieldCheck size={11} style={{ marginRight: 3 }} /> Identity pinned
                  </span>
                ) : (
                  <span className="tag">Not connected yet</span>
                )}
              </div>
              {s.notes && <div className="hint srv-notes">{s.notes}</div>}
              <div className="card-foot">
                {s.protocol === 'sftp' && !s.readOnly ? (
                  <button className="btn" onClick={() => openWorkspace(s, 'terminal')}>
                    <SquareTerminal size={14} /> Terminal
                  </button>
                ) : (
                  <span />
                )}
                {s.protocol === 'sftp' && (
                  <button className="btn" onClick={() => openWorkspace(s, 'health')}>
                    <Activity size={14} /> Health
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => openWorkspace(s, 'files')}>
                  <Folder size={14} /> Files
                </button>
              </div>
            </div>
          ))}
              </div>
            </div>
          ))}
        </>
      )}

      {editing && (
        <ServerDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(list) => {
            setServers(list)
            setEditing(null)
          }}
          onDelete={
            editing.id
              ? async () => {
                  const list = await act('ssh-delete', () => api().invoke('ssh:delete', editing.id!))
                  if (list) setServers(list)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}

      {importing && <ImportConfigDialog onClose={() => setImporting(false)} onAdded={setServers} />}
      {askDialog}
      {trustDialog}
    </>
  )
}

type Unknown = (fingerprint: string, retry: () => void) => void

function Workspace({
  server,
  tab,
  passphrase,
  onTab,
  onUnknownHost,
  onClose
}: {
  server: SshServer
  tab: 'terminal' | 'files' | 'health'
  passphrase: string | null
  onTab: (t: 'terminal' | 'files' | 'health') => void
  onUnknownHost: Unknown
  onClose: () => void
}): React.JSX.Element {
  const { act, settings } = useApp()
  const [tool, setTool] = useState<null | 'audit' | 'ask' | 'troubleshoot'>(null)
  // Each pane connects the first time it is shown and stays alive while you switch.
  const [seen, setSeen] = useState<Set<string>>(new Set([tab]))
  // "Open a terminal here" from the file browser: the terminal moves to that folder.
  const [cd, setCd] = useState<{ path: string; n: number } | null>(null)
  useEffect(() => setSeen((s) => (s.has(tab) ? s : new Set([...s, tab]))), [tab])

  return (
    <>
      <PageHead
        title={server.name}
        desc={
          <span className="mono">
            {server.user}@{server.host}
            {server.port !== 22 ? `:${server.port}` : ''}
          </span>
        }
      >
        <div className="seg-tabs" role="tablist">
          {server.protocol === 'sftp' && !server.readOnly && (
            <button role="tab" aria-selected={tab === 'terminal'} onClick={() => onTab('terminal')}>
              <SquareTerminal size={14} /> Terminal
            </button>
          )}
          <button role="tab" aria-selected={tab === 'files'} onClick={() => onTab('files')}>
            <Folder size={14} /> Files
          </button>
          {server.protocol === 'sftp' && (
            <button role="tab" aria-selected={tab === 'health'} onClick={() => onTab('health')}>
              <Activity size={14} /> Health
            </button>
          )}
        </div>
        {settings?.serversClaude && server.protocol === 'sftp' && (
          <>
            <button className="btn btn-quiet" title="Have Claude look for trouble. It reads a cleaned, read only report and never gets a way in." onClick={() => setTool('troubleshoot')}>
              <Bot size={14} /> Troubleshoot
            </button>
            <button className="btn btn-quiet" onClick={() => setTool('ask')}>
              <Bot size={14} /> Ask Claude
            </button>
          </>
        )}
        <button className="btn btn-quiet" title="What was done on this server from Laramac" onClick={() => setTool('audit')}>
          <ClipboardList size={14} /> Record
        </button>
        {server.protocol === 'sftp' && !server.readOnly && (
          <button
            className="btn btn-quiet"
            title="Open in the macOS Terminal app"
            onClick={() => act(`ssh-${server.id}`, () => api().invoke('ssh:terminal', server.id))}
          >
            <ExternalLink size={14} /> Terminal app
          </button>
        )}
        <button className="btn" onClick={onClose}>
          <X size={14} /> Disconnect
        </button>
      </PageHead>
      <div style={{ display: tab === 'terminal' ? 'block' : 'none' }}>
        {seen.has('terminal') && <TerminalTabs server={server} passphrase={passphrase} visible={tab === 'terminal'} onUnknownHost={onUnknownHost} cd={cd} />}
      </div>
      <div style={{ display: tab === 'files' ? 'block' : 'none' }}>
        {seen.has('files') && <FilesPane server={server} passphrase={passphrase} onUnknownHost={onUnknownHost} onTerminalHere={server.protocol === 'sftp' && !server.readOnly ? (path) => (setCd({ path, n: Date.now() }), onTab('terminal')) : undefined} />}
      </div>
      {tab === 'health' && <ServerHealth server={server} passphrase={passphrase} onUnknownHost={onUnknownHost} />}
      {tool === 'audit' && <AuditDialog server={server} onClose={() => setTool(null)} />}
      {(tool === 'ask' || tool === 'troubleshoot') && <ClaudeDialog server={server} passphrase={passphrase} kind={tool} onUnknownHost={onUnknownHost} onClose={() => setTool(null)} />}
    </>
  )
}

function FilesPane({ server, passphrase, onUnknownHost, onTerminalHere }: { server: SshServer; passphrase: string | null; onUnknownHost: Unknown; onTerminalHere?: (path: string) => void }): React.JSX.Element {
  const { act } = useApp()
  const [conn, setConn] = useState<{ session: string; home: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    let sid: string | null = null
    setFailed(false)
    void act(`sftp-${server.id}`, () => api().invoke('sftp:connect', server.id, passphrase)).then((res) => {
      if (!res) return live && setFailed(true)
      if (res.status === 'unknown-host') return onUnknownHost(res.fingerprint, () => setAttempt((n) => n + 1))
      sid = res.session
      if (live) setConn({ session: res.session, home: res.home })
      else void api().invoke('sftp:disconnect', res.session)
    })
    return () => {
      live = false
      if (sid) void api().invoke('sftp:disconnect', sid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, passphrase, attempt])

  if (!conn)
    return (
      <div className="fb glass">
        <div className="term-empty" style={{ color: 'var(--ink-3)' }}>
          {failed ? (
            <>
              Could not open the files.
              <button className="btn" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </>
          ) : (
            'Connecting…'
          )}
        </div>
      </div>
    )
  return <FileBrowser server={server} session={conn.session} home={conn.home} onTerminalHere={onTerminalHere} />
}

export function ServerDialog({
  initial,
  onClose,
  onSaved,
  onDelete
}: {
  initial: SshServerInput
  onClose: () => void
  onSaved: (list: SshServer[]) => void
  onDelete?: () => void
}): React.JSX.Element {
  const { act, busy } = useApp()
  const [v, setV] = useState<SshServerInput>(initial)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [ask, askDialog] = useAsk()
  const set = (patch: Partial<SshServerInput>): void => setV((x) => ({ ...x, ...patch }))

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 500 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>
          {initial.id ? 'Edit server' : 'Add a server'}
        </h2>
        <div className="field">
          <span className="field-label">Connect with</span>
          <div className="seg" role="radiogroup" aria-label="Protocol" style={{ alignSelf: 'flex-start' }}>
            {(['sftp', 'ftps', 'ftp'] as const).map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={(v.protocol ?? 'sftp') === p}
                onClick={() =>
                  set({
                    protocol: p,
                    auth: p === 'sftp' ? v.auth : 'password',
                    port: v.port === 22 || v.port === 21 ? (p === 'sftp' ? 22 : 21) : v.port
                  })
                }
              >
                {p === 'sftp' ? 'SSH and SFTP' : p.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="hint">
            {(v.protocol ?? 'sftp') === 'sftp'
              ? 'Terminal and files. Most VPS and cloud servers.'
              : v.protocol === 'ftps'
                ? 'Files over encrypted FTP. Most shared hosting with cPanel offers this.'
                : 'Plain FTP sends your password unencrypted. Use FTPS if your host supports it.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor="sv-name">Name</label>
          <input id="sv-name" className="input" autoFocus placeholder="Production" value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
          <div className="field">
            <label htmlFor="sv-host">Host</label>
            <input id="sv-host" className="input" placeholder="203.0.113.10 or example.com" value={v.host} onChange={(e) => set({ host: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sv-port">Port</label>
            <input id="sv-port" className="input num" inputMode="numeric" value={v.port} onChange={(e) => set({ port: parseInt(e.target.value, 10) || 0 })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sv-user">User</label>
          <input id="sv-user" className="input" placeholder="deploy" value={v.user} onChange={(e) => set({ user: e.target.value })} />
        </div>
        <div className="field">
          <span className="field-label">Sign in with</span>
          <div className="seg" role="radiogroup" aria-label="Sign in with" style={{ alignSelf: 'flex-start' }}>
            {((v.protocol ?? 'sftp') === 'sftp' ? (['agent', 'key', 'password'] as const) : (['password'] as const)).map((a) => (
              <button key={a} role="radio" aria-checked={v.auth === a} onClick={() => set({ auth: a })}>
                {a === 'agent' ? 'SSH agent' : a === 'key' ? 'Key file' : 'Password'}
              </button>
            ))}
          </div>
          <span className="hint">
            {v.auth === 'agent'
              ? 'Uses the keys already loaded in your SSH agent. Nothing is stored.'
              : v.auth === 'key'
                ? 'The path to your private key. Laramac reads it only when connecting.'
                : 'Encrypted with the macOS Keychain and never shown again.'}
          </span>
        </div>
        {v.auth === 'key' && (
          <div className="field">
            <label htmlFor="sv-key">
              <KeyRound size={12} /> Private key
            </label>
            <input
              id="sv-key"
              className="input mono"
              placeholder="/Users/you/.ssh/id_ed25519"
              value={v.keyPath ?? ''}
              onChange={(e) => set({ keyPath: e.target.value })}
            />
            <div className="keymaker">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const pass = await ask({ title: 'A passphrase for the new key', label: 'Recommended: it protects the key if your Mac is ever lost. Leave empty for none.', secret: true, confirm: 'Make the key' })
                  if (pass === null) return
                  const made = await act('ssh-keygen', () => api().invoke('ssh:keygen', v.name || 'server', pass || null))
                  if (made) {
                    set({ keyPath: made.keyPath })
                    setNewKey(made.publicKey)
                  }
                }}
              >
                <KeyRound size={13} /> Make a new key
              </button>
              <span className="hint">Saved in ~/.ssh and readable only by you.</span>
            </div>
            {newKey && (
              <div className="okbox">
                Key made. To use it, add this public line to the server's ~/.ssh/authorized_keys (or open the server with a password and use More, Add my key to this server):
                <div className="copyfield" style={{ height: 'auto', padding: '8px 10px', marginTop: 6 }}>
                  <span className="mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all', fontSize: 11 }}>
                    {newKey}
                  </span>
                  <button className="btn btn-quiet btn-sm" onClick={() => void api().invoke('clipboard:write', newKey)}>
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {v.auth === 'password' && (
          <div className="field">
            <label htmlFor="sv-pass">Password</label>
            <input
              id="sv-pass"
              className="input"
              type="password"
              placeholder={initial.id ? 'Leave empty to keep the saved one' : ''}
              onChange={(e) => set({ password: e.target.value })}
            />
          </div>
        )}
        <details className="fold" style={{ marginTop: 6 }}>
          <summary>Organise and protect</summary>
          <div className="field">
            <span className="field-label">What is it for?</span>
            <div className="seg" role="radiogroup" aria-label="What is it for" style={{ alignSelf: 'flex-start' }}>
              {([undefined, 'production', 'staging', 'development'] as const).map((t) => (
                <button key={t ?? 'none'} role="radio" aria-checked={v.tag === t} onClick={() => set({ tag: t })}>
                  {t === undefined ? 'Not set' : t === 'production' ? 'Production' : t === 'staging' ? 'Staging' : 'Development'}
                </button>
              ))}
            </div>
            <span className="hint">Production shows a red bar and asks before uploads, deletes and risky commands.</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={v.readOnly === true} onChange={(e) => set({ readOnly: e.target.checked })} /> Read only: browse and download, no changes, no terminal
          </label>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="sv-group">Group</label>
            <input id="sv-group" className="input" placeholder="A client or project name" maxLength={40} value={v.group ?? ''} onChange={(e) => set({ group: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sv-start">Open the files in this folder</label>
            <input id="sv-start" className="input mono" placeholder="/var/www" value={v.startDir ?? ''} onChange={(e) => set({ startDir: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sv-notes">Notes</label>
            <textarea id="sv-notes" className="input" rows={2} maxLength={2000} placeholder="What runs here, who to call" value={v.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </details>
        <div className="end" style={{ marginTop: 8 }}>
          {onDelete && (
            <button className="btn btn-quiet" style={{ marginRight: 'auto', color: 'var(--bad)' }} onClick={onDelete}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy.has('ssh-save') || !v.name || !v.host || !v.user}
            onClick={async () => {
              const list = await act('ssh-save', () => api().invoke('ssh:save', v))
              if (list) onSaved(list)
            }}
          >
            Save
          </button>
        </div>
      </div>
      {askDialog}
    </div>
  )
}
