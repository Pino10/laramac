import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUp,
  Download,
  File,
  Folder,
  FolderPlus,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type { SftpEntry, SftpListing, SshServer, SshServerInput } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, PageHead } from '../ui'
import { useAsk } from '../components/Ask'

const api = (): Window['laramac'] => window.laramac

export default function Servers(): React.JSX.Element {
  const { act } = useApp()
  const [servers, setServers] = useState<SshServer[]>([])
  const [editing, setEditing] = useState<SshServerInput | null>(null)
  const [browsing, setBrowsing] = useState<{ server: SshServer; session: string; home: string } | null>(null)
  const [trust, setTrust] = useState<{ server: SshServer; fingerprint: string } | null>(null)
  const [ask, askDialog] = useAsk()

  useEffect(() => {
    api().invoke('ssh:list').then(setServers)
  }, [])

  const openFiles = async (s: SshServer, passphrase: string | null = null): Promise<void> => {
    const res = await act(`sftp-${s.id}`, () => api().invoke('sftp:connect', s.id, passphrase))
    if (!res) return
    if (res.status === 'unknown-host') setTrust({ server: s, fingerprint: res.fingerprint })
    else setBrowsing({ server: s, session: res.session, home: res.home })
  }

  if (browsing) {
    return (
      <FileBrowser
        server={browsing.server}
        session={browsing.session}
        home={browsing.home}
        onClose={() => {
          void api().invoke('sftp:disconnect', browsing.session)
          setBrowsing(null)
        }}
      />
    )
  }

  return (
    <>
      <PageHead title="Servers" desc="Your remote machines in one place: open a terminal over SSH, or browse and move files over SFTP.">
        <button className="btn btn-primary" onClick={() => setEditing({ name: '', host: '', port: 22, user: '', auth: 'agent' })}>
          <Plus size={14} /> Add server
        </button>
      </PageHead>

      {servers.length === 0 ? (
        <div className="panel empty" style={{ padding: '56px 24px' }}>
          <strong style={{ fontSize: 15 }}>No servers yet</strong>
          <p className="dim" style={{ margin: '4px auto 18px', maxWidth: '50ch' }}>
            Add a VPS, a staging box or a Raspberry Pi on your network. Laramac uses your SSH keys, the SSH agent, or a password kept in the
            macOS Keychain.
          </p>
          <button className="btn btn-primary" onClick={() => setEditing({ name: '', host: '', port: 22, user: '', auth: 'agent' })}>
            <Plus size={14} /> Add server
          </button>
        </div>
      ) : (
        <div className="grid-3">
          {servers.map((s) => (
            <div key={s.id} className="server-card glass">
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
                  onClick={() => setEditing({ id: s.id, name: s.name, host: s.host, port: s.port, user: s.user, auth: s.auth, keyPath: s.keyPath })}
                >
                  <Pencil size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
              <div className="card-foot">
                <button className="btn" onClick={() => act(`ssh-${s.id}`, () => api().invoke('ssh:terminal', s.id))}>
                  <SquareTerminal size={14} /> Terminal
                </button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    if (s.auth === 'key') {
                      const pass = await ask({ title: `Connect to ${s.name}`, label: 'Key passphrase (leave empty if it has none)', secret: true, confirm: 'Connect' })
                      if (pass === null) return
                      await openFiles(s, pass || null)
                    } else await openFiles(s)
                  }}
                >
                  <Folder size={14} /> Files
                </button>
              </div>
            </div>
          ))}
        </div>
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

      {askDialog}
      {trust && (
        <div className="scrim" onMouseDown={() => setTrust(null)}>
          <div className="dialog glass" style={{ width: 500 }} onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: 18 }}>
              Is this really {trust.server.host}?
            </h2>
            <p className="page-desc" style={{ margin: '6px 0 14px' }}>
              This is the first connection to this server. Check that its fingerprint matches the one your host shows (for example with{' '}
              <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code> on the server). Laramac remembers it and refuses to connect if it ever
              changes.
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
                  setTrust(null)
                  if (list) {
                    setServers(list)
                    const s = list.find((x) => x.id === trust.server.id)
                    if (s) await openFiles(s)
                  }
                }}
              >
                Trust and connect
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ServerDialog({
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
  const set = (patch: Partial<SshServerInput>): void => setV((x) => ({ ...x, ...patch }))

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 500 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>
          {initial.id ? 'Edit server' : 'Add a server'}
        </h2>
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
            {(['agent', 'key', 'password'] as const).map((a) => (
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
            <input id="sv-key" className="input mono" placeholder="/Users/you/.ssh/id_ed25519" value={v.keyPath ?? ''} onChange={(e) => set({ keyPath: e.target.value })} />
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
    </div>
  )
}

function FileBrowser({ server, session, home, onClose }: { server: SshServer; session: string; home: string; onClose: () => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const [listing, setListing] = useState<SftpListing | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ask, askDialog] = useAsk()

  const load = useCallback(
    async (path: string) => {
      const l = await act('sftp-list', () => api().invoke('sftp:list', session, path))
      if (l) {
        setListing(l)
        setSelected(new Set())
      }
    },
    [act, session]
  )

  useEffect(() => {
    void load(home)
  }, [load, home])

  const path = listing?.path ?? home
  const join = (name: string): string => (path.endsWith('/') ? path + name : `${path}/${name}`)
  const parts = path.split('/').filter(Boolean)
  const chosen = (listing?.entries ?? []).filter((e) => selected.has(e.name))

  const open = (e: SftpEntry): void => {
    if (e.type === 'dir' || e.type === 'link') void load(join(e.name))
  }

  return (
    <>
      <PageHead
        title={server.name}
        desc={
          <span className="mono">
            {server.user}@{server.host}
          </span>
        }
      >
        <button className="btn" onClick={() => act(`ssh-${server.id}`, () => api().invoke('ssh:terminal', server.id))}>
          <SquareTerminal size={14} /> Terminal
        </button>
        <button className="btn" onClick={onClose}>
          <X size={14} /> Disconnect
        </button>
      </PageHead>

      <div className="fb glass">
        <div className="fb-bar">
          <button className="btn btn-quiet btn-icon" title="Up one folder" aria-label="Up one folder" disabled={path === '/'} onClick={() => load(path.replace(/\/[^/]+\/?$/, '') || '/')}>
            <ArrowUp size={15} />
          </button>
          <div className="crumbs" aria-label="Path">
            <button className="crumb" onClick={() => load('/')}>
              /
            </button>
            {parts.map((p, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <button className="crumb" onClick={() => load('/' + parts.slice(0, i + 1).join('/'))}>
                  {p}
                </button>
                {i < parts.length - 1 && <span className="dim">/</span>}
              </span>
            ))}
          </div>
          <button className="btn btn-quiet btn-icon" title="Refresh" aria-label="Refresh" onClick={() => load(path)}>
            <RefreshCw size={14} />
          </button>
          <button
            className="btn btn-quiet btn-icon"
            title="New folder"
            aria-label="New folder"
            onClick={async () => {
              const name = await ask({ title: 'New folder', label: 'Name', confirm: 'Create' })
              if (!name) return
              await act('sftp-mkdir', () => api().invoke('sftp:mkdir', session, path, name))
              await load(path)
            }}
          >
            <FolderPlus size={15} />
          </button>
          <button
            className="btn"
            onClick={async () => {
              const n = await act('sftp-up', () => api().invoke('sftp:upload', session, path))
              if (n) {
                notify({ kind: 'info', text: `Uploaded ${n} ${n === 1 ? 'file' : 'files'}.` })
                await load(path)
              }
            }}
          >
            <Upload size={14} /> Upload
          </button>
          <button
            className="btn btn-primary"
            disabled={chosen.filter((e) => e.type === 'file').length === 0 || busy.has('sftp-down')}
            onClick={async () => {
              const files = chosen.filter((e) => e.type === 'file').map((e) => join(e.name))
              const n = await act('sftp-down', () => api().invoke('sftp:download', session, files))
              if (n) notify({ kind: 'info', text: `Downloaded ${n} ${n === 1 ? 'file' : 'files'}.` })
            }}
          >
            <Download size={14} /> Download
          </button>
        </div>
        <div className="fb-list" role="listbox" aria-label="Files" aria-multiselectable>
          {listing?.entries.length === 0 && <div className="empty dim">This folder is empty.</div>}
          {listing?.entries.map((e) => (
            <button
              key={e.name}
              className="fb-row"
              role="option"
              data-type={e.type}
              aria-selected={selected.has(e.name)}
              onClick={(ev) =>
                setSelected((s) => {
                  const next = new Set(ev.metaKey || ev.shiftKey ? s : [])
                  if (s.has(e.name) && (ev.metaKey || ev.shiftKey)) next.delete(e.name)
                  else next.add(e.name)
                  return next
                })
              }
              onDoubleClick={() => open(e)}
            >
              {e.type === 'dir' ? <Folder size={16} /> : e.type === 'link' ? <Link2 size={16} /> : <File size={16} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
              <span className="num hint" style={{ textAlign: 'right' }}>
                {e.type === 'file' ? formatBytes(e.size) : ''}
              </span>
              <span className="hint">{new Date(e.modified).toLocaleString()}</span>
            </button>
          ))}
        </div>
        {chosen.length === 1 && (
          <div className="fb-bar" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
            <span className="hint" style={{ flex: 1 }}>
              {chosen[0].name}
            </span>
            <button
              className="btn btn-quiet"
              onClick={async () => {
                const name = await ask({ title: `Rename ${chosen[0].name}`, label: 'New name', initial: chosen[0].name, confirm: 'Rename' })
                if (!name || name === chosen[0].name) return
                await act('sftp-rename', () => api().invoke('sftp:rename', session, join(chosen[0].name), name))
                await load(path)
              }}
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              className="btn btn-quiet"
              style={{ color: 'var(--bad)' }}
              onClick={async () => {
                if (!(await ask({ title: `Delete ${chosen[0].name} on ${server.name}? This cannot be undone.`, yesNo: true, confirm: 'Delete', danger: true }))) return
                await act('sftp-delete', () => api().invoke('sftp:delete', session, join(chosen[0].name), chosen[0].type === 'dir'))
                await load(path)
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>
      {askDialog}
      <p className="hint" style={{ marginTop: 10 }}>
        Double-click a folder to open it. Hold ⌘ to select several files. Folders can be deleted once they are empty.
      </p>
    </>
  )
}
