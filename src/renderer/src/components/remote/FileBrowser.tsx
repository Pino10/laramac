import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  Link2,
  Lock,
  PackageOpen,
  Archive,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  KeyRound,
  SquareTerminal,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import type { RemoteSearchHit, SftpEntry, SftpListing, SshServer } from '@shared/types'
import { useApp } from '../../store'
import { formatBytes } from '../../ui'
import { useAsk } from '../Ask'

const api = (): Window['laramac'] => window.laramac

type SortKey = 'name' | 'size' | 'modified'
const ARCHIVE = /\.(zip|tar|tar\.gz|tgz)$/i

/** Orders a folder: folders first, then by the chosen column. */
export function sortEntries(list: SftpEntry[], key: SortKey, desc: boolean): SftpEntry[] {
  const dir = desc ? -1 : 1
  return [...list].sort((a, b) => {
    if ((a.type === 'dir') !== (b.type === 'dir')) return a.type === 'dir' ? -1 : 1
    const by = key === 'size' ? a.size - b.size : key === 'modified' ? a.modified - b.modified : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    return (by || a.name.localeCompare(b.name)) * dir
  })
}

interface Menu {
  x: number
  y: number
}

export default function FileBrowser({ server, session, home, onTerminalHere }: { server: SshServer; session: string; home: string; onTerminalHere?: (path: string) => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const [listing, setListing] = useState<SftpListing | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false })
  const [showHidden, setShowHidden] = useState(true)
  const [filter, setFilter] = useState('')
  const [hits, setHits] = useState<RemoteSearchHit[] | null>(null)
  const [bookmarks, setBookmarks] = useState<string[]>(server.bookmarks ?? [])
  const [marks, setMarks] = useState(false)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [drop, setDrop] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [perms, setPerms] = useState<SftpEntry | null>(null)
  const [ask, askDialog] = useAsk()
  const listRef = useRef<HTMLDivElement>(null)
  const ssh = server.protocol === 'sftp'
  const readOnly = server.readOnly === true
  const production = server.tag === 'production'

  /** Shows a folder. A quiet reload (a copy just finished) keeps your selection and filter where they were. */
  const load = useCallback(
    async (path: string, quiet = false) => {
      const l = await act('sftp-list', () => api().invoke('sftp:list', session, path))
      if (l) {
        setListing(l)
        if (quiet) setSelected((s) => new Set([...s].filter((n) => l.entries.some((e) => e.name === n))))
        else {
          setSelected(new Set())
          setHits(null)
          setFilter('')
        }
      }
    },
    [act, session]
  )

  useEffect(() => {
    void load(server.startDir || home)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, home])

  const path = listing?.path ?? home
  const join = (name: string): string => (path.endsWith('/') ? path + name : `${path}/${name}`)
  const parts = path.split('/').filter(Boolean)

  // When a copy for this server finishes, show what arrived.
  const lastDone = useRef(new Set<string>())
  useEffect(() => {
    // Copies that were already finished when this page opened are old news.
    void api()
      .invoke('transfers:list')
      .then((list) => list.forEach((t) => t.status === 'done' && lastDone.current.add(t.id)))
    return api().on('transfers:changed', (list) => {
      let fresh = false
      for (const t of list) {
        if (t.server === server.name && t.status === 'done' && !lastDone.current.has(t.id)) {
          lastDone.current.add(t.id)
          if (t.direction !== 'download') fresh = true
        }
      }
      if (fresh) void load(path, true)
    })
  }, [server.name, path, load])

  const shown = useMemo(() => {
    let list = listing?.entries ?? []
    if (!showHidden) list = list.filter((e) => !e.name.startsWith('.'))
    if (filter.trim()) list = list.filter((e) => e.name.toLowerCase().includes(filter.trim().toLowerCase()))
    return sortEntries(list, sort.key, sort.desc)
  }, [listing, showHidden, filter, sort])
  const chosen = shown.filter((e) => selected.has(e.name))
  const one = chosen.length === 1 ? chosen[0] : null

  // ---- guards: production asks first, read only refuses
  const mayChange = (): boolean => {
    if (!readOnly) return true
    notify({ kind: 'error', text: `${server.name} is read only. Turn that off in the server's settings to make changes.` })
    return false
  }
  const sure = async (what: string): Promise<boolean> => {
    if (!production) return true
    return (
      (await ask({ title: `${what} on a production server?`, label: `${server.name} is marked as production, so this is live.`, yesNo: true, confirm: 'Yes, go ahead', danger: true })) !== null
    )
  }

  const open = (e: SftpEntry): void => {
    if (e.type === 'dir' || e.type === 'link') void load(join(e.name))
    else if (ssh || e.size < 1_000_000) setEditing(join(e.name))
  }

  // ---- actions
  const upload = async (folder: boolean): Promise<void> => {
    if (!mayChange() || !(await sure('Upload'))) return
    const msg = await act(folder ? 'sftp-up-folder' : 'sftp-up', () => api().invoke(folder ? 'sftp:upload-folder' : 'sftp:upload', session, path))
    if (msg) notify({ kind: 'info', text: msg })
  }
  const download = async (names: SftpEntry[]): Promise<void> => {
    const items = names.filter((e) => e.type === 'file' || e.type === 'dir').map((e) => ({ path: join(e.name), dir: e.type === 'dir' }))
    if (items.length === 0) return
    const msg = await act('sftp-down', () => api().invoke('sftp:download', session, items))
    if (msg) notify({ kind: 'info', text: msg })
  }
  const zip = async (names: SftpEntry[]): Promise<void> => {
    if (!mayChange() || !(await sure('Zip'))) return
    const base = names.length === 1 ? names[0].name : parts[parts.length - 1] || 'archive'
    const name = await ask({ title: 'Zip on the server', label: 'Name of the zip file', initial: base, confirm: 'Zip' })
    if (!name) return
    const made = await act('sftp-zip', () => api().invoke('sftp:zip', session, path, names.map((e) => e.name), name))
    if (made) notify({ kind: 'info', text: `Zipping into ${made}. Follow it at the bottom.` })
  }
  const unzip = async (e: SftpEntry): Promise<void> => {
    if (!mayChange() || !(await sure('Open this archive'))) return
    const made = await act('sftp-unzip', () => api().invoke('sftp:unzip', session, join(e.name), path))
    if (made) notify({ kind: 'info', text: `Opening into the folder ${made}.` })
  }
  const rename = async (e: SftpEntry): Promise<void> => {
    if (!mayChange()) return
    const name = await ask({ title: `Rename ${e.name}`, label: 'New name', initial: e.name, confirm: 'Rename' })
    if (!name || name === e.name || !(await sure('Rename'))) return
    await act('sftp-rename', () => api().invoke('sftp:rename', session, join(e.name), name))
    await load(path)
  }
  const bin = async (list: SftpEntry[]): Promise<void> => {
    if (!mayChange() || list.length === 0) return
    if (!ssh) return void (await forever(list))
    const what = list.length === 1 ? list[0].name : `${list.length} items`
    const yes = await ask({ title: `Move ${what} to the bin on ${server.name}?`, label: 'It goes to a folder called .laramac-trash in your home folder on the server, so you can get it back.', yesNo: true, confirm: 'Move to bin' })
    if (yes === null || !(await sure('Delete'))) return
    for (const e of list) await act('sftp-trash', () => api().invoke('sftp:trash', session, join(e.name)))
    await load(path)
  }
  const forever = async (list: SftpEntry[]): Promise<void> => {
    if (!mayChange()) return
    const what = list.length === 1 ? list[0].name : `${list.length} items`
    if (production) {
      const typed = await ask({ title: `Delete ${what} forever`, label: `This is production. Type ${server.name} to confirm. This cannot be undone.`, confirm: 'Delete forever', danger: true })
      if (typed !== server.name) return
    } else if ((await ask({ title: `Delete ${what} on ${server.name}? This cannot be undone.`, yesNo: true, confirm: 'Delete', danger: true })) === null) return
    for (const e of list) await act('sftp-delete', () => api().invoke('sftp:delete', session, join(e.name), e.type === 'dir'))
    await load(path)
  }
  const newFolder = async (): Promise<void> => {
    if (!mayChange()) return
    const name = await ask({ title: 'New folder', label: 'Name', confirm: 'Create' })
    if (!name) return
    await act('sftp-mkdir', () => api().invoke('sftp:mkdir', session, path, name))
    await load(path)
  }
  const copyPath = async (e: SftpEntry | null): Promise<void> => {
    await api().invoke('sftp:copy-path', e ? join(e.name) : path)
    notify({ kind: 'info', text: 'Path copied.' })
  }
  const addMyKey = async (): Promise<void> => {
    const name = await ask({ title: 'Add my key to this server', label: 'The name of your public key file in ~/.ssh, like id_ed25519.pub or laramac_myserver.pub', initial: 'id_ed25519.pub', confirm: 'Add it' })
    if (!name) return
    const added = await act('sftp-key', () => api().invoke('sftp:install-key', session, `~/.ssh/${name.replace(/[^\w.-]/g, '')}`))
    if (added) notify({ kind: 'info', text: `${added} is on the server. You can sign in with the key now.` })
  }
  const goTo = async (): Promise<void> => {
    const to = await ask({ title: 'Go to a folder', label: 'Full path, like /var/www', initial: path, confirm: 'Go' })
    if (to && to.startsWith('/')) void load(to)
  }
  const toggleMark = async (): Promise<void> => {
    const next = bookmarks.includes(path) ? bookmarks.filter((b) => b !== path) : [...bookmarks, path]
    const list = await act('sftp-marks', () => api().invoke('sftp:bookmarks', server.id, next))
    if (list) setBookmarks(list.find((s) => s.id === server.id)?.bookmarks ?? next)
  }
  const deepSearch = async (): Promise<void> => {
    const r = await act('sftp-search', () => api().invoke('sftp:search', session, path, filter.trim()))
    if (r) setHits(r)
  }
  const dropFiles = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDrop(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0 || !mayChange() || !(await sure('Upload'))) return
    const paths = api().pathsOf(files)
    const msg = await act('sftp-up', () => api().invoke('sftp:upload-paths', session, path, paths))
    if (msg) notify({ kind: 'info', text: msg })
  }

  // ---- keyboard
  const onKey = (e: React.KeyboardEvent): void => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const names = shown.map((x) => x.name)
    if (e.key === 'a' && e.metaKey) {
      e.preventDefault()
      setSelected(new Set(names))
    } else if (e.key === 'Escape') setSelected(new Set())
    else if (e.key === 'Enter' && one) open(one)
    else if (e.key === 'F2' && one) void rename(one)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && chosen.length) {
      e.preventDefault()
      void bin(chosen)
    } else if (e.key === 'c' && e.metaKey && one) void copyPath(one)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const i = one ? names.indexOf(one.name) : -1
      const next = names[Math.max(0, Math.min(names.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) setSelected(new Set([next]))
    }
  }

  const sortBy = (key: SortKey): void => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }))
  const arrow = (key: SortKey): string => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')
  const menuItems = (): { label: string; icon: React.JSX.Element; run: () => void; danger?: boolean; off?: boolean }[] => {
    if (chosen.length === 0) return []
    const items = [
      ...(one && one.type === 'dir' ? [{ label: 'Open', icon: <Folder size={14} />, run: () => open(one) }] : []),
      ...(one && one.type === 'file' ? [{ label: 'Edit or read', icon: <FileText size={14} />, run: () => open(one) }] : []),
      { label: chosen.some((e) => e.type === 'dir') ? 'Download (folders too)' : 'Download', icon: <Download size={14} />, run: () => void download(chosen) },
      ...(ssh ? [{ label: 'Zip on the server', icon: <Archive size={14} />, run: () => void zip(chosen), off: readOnly }] : []),
      ...(ssh && one && ARCHIVE.test(one.name) ? [{ label: 'Open this archive here', icon: <PackageOpen size={14} />, run: () => void unzip(one), off: readOnly }] : []),
      ...(one ? [{ label: 'Rename', icon: <Pencil size={14} />, run: () => void rename(one), off: readOnly }] : []),
      ...(ssh && one ? [{ label: 'Permissions', icon: <KeyRound size={14} />, run: () => setPerms(one) }] : []),
      ...(one ? [{ label: 'Copy the path', icon: <Copy size={14} />, run: () => void copyPath(one) }] : []),
      { label: ssh ? 'Move to the bin' : 'Delete', icon: <Trash2 size={14} />, run: () => void bin(chosen), danger: true, off: readOnly },
      ...(ssh ? [{ label: 'Delete forever', icon: <Trash2 size={14} />, run: () => void forever(chosen), danger: true, off: readOnly }] : [])
    ]
    return items
  }

  return (
    <>
      {(production || readOnly) && (
        <div className="srv-banner" data-tag={production ? 'production' : 'readonly'}>
          {production ? <ShieldAlert size={14} /> : <Lock size={14} />}
          {production ? `Production: ${server.name} is live. Changes here reach real users.` : `Read only: you can look and download from ${server.name}, not change anything.`}
          {production && readOnly && <span> Also read only.</span>}
        </div>
      )}
      <div
        className="fb glass"
        data-drop={drop}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDrop(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false)
        }}
        onDrop={(e) => void dropFiles(e)}
      >
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
          <div style={{ position: 'relative' }}>
            <button className="btn btn-quiet btn-icon" title="Pinned folders" aria-label="Pinned folders" onClick={() => setMarks((m) => !m)} data-on={bookmarks.includes(path)}>
              <Star size={14} fill={bookmarks.includes(path) ? 'currentColor' : 'none'} />
              <ChevronDown size={10} />
            </button>
            {marks && (
              <div className="menu glass" role="menu" onMouseLeave={() => setMarks(false)}>
                <button role="menuitem" onClick={() => (setMarks(false), void toggleMark())}>
                  <Star size={14} /> {bookmarks.includes(path) ? 'Unpin this folder' : 'Pin this folder'}
                </button>
                <button role="menuitem" onClick={() => (setMarks(false), void load(home))}>
                  <Folder size={14} /> Home folder
                </button>
                {onTerminalHere && (
                  <button role="menuitem" onClick={() => (setMarks(false), onTerminalHere(path))}>
                    <SquareTerminal size={14} /> Open a terminal here
                  </button>
                )}
                {ssh && !readOnly && server.auth !== 'key' && (
                  <button role="menuitem" onClick={() => (setMarks(false), void addMyKey())}>
                    <KeyRound size={14} /> Add my key to this server…
                  </button>
                )}
                <button role="menuitem" onClick={() => (setMarks(false), void goTo())}>
                  <Search size={14} /> Go to a folder…
                </button>
                {bookmarks.length > 0 && <div className="menu-sep" />}
                {bookmarks.map((b) => (
                  <button key={b} role="menuitem" onClick={() => (setMarks(false), void load(b))} title={b}>
                    <Star size={14} /> <span className="menu-text">{b}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-quiet btn-icon" title={showHidden ? 'Hide files that start with a dot' : 'Show files that start with a dot'} aria-label="Hidden files" onClick={() => setShowHidden((h) => !h)}>
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button className="btn btn-quiet btn-icon" title="Refresh" aria-label="Refresh" onClick={() => load(path)}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-quiet btn-icon" title="New folder" aria-label="New folder" disabled={readOnly} onClick={() => void newFolder()}>
            <FolderPlus size={15} />
          </button>
          <button className="btn" disabled={readOnly || busy.has('sftp-up')} onClick={() => void upload(false)}>
            <Upload size={14} /> Files
          </button>
          <button className="btn" title="Upload a whole folder, such as one of your projects" disabled={readOnly || busy.has('sftp-up-folder')} onClick={() => void upload(true)}>
            <FolderUp size={14} /> Folder
          </button>
          <button className="btn btn-primary" disabled={chosen.length === 0 || busy.has('sftp-down')} onClick={() => void download(chosen)}>
            <Download size={14} /> Download
          </button>
        </div>

        <div className="fb-find">
          <Search size={13} />
          <input
            aria-label="Filter this folder"
            placeholder="Filter this folder"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setHits(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && ssh && filter.trim().length >= 2 && void deepSearch()}
          />
          {ssh && filter.trim().length >= 2 && (
            <button className="btn btn-quiet btn-sm" disabled={busy.has('sftp-search')} onClick={() => void deepSearch()}>
              {busy.has('sftp-search') ? 'Searching…' : `Search inside ${parts[parts.length - 1] || '/'} on the server`}
            </button>
          )}
          {filter && (
            <button className="icon-btn" aria-label="Clear" onClick={() => (setFilter(''), setHits(null))}>
              <X size={13} />
            </button>
          )}
        </div>

        {hits ? (
          <div className="fb-list" role="list" aria-label="Search results">
            <div className="fb-results-head">
              {hits.length === 0 ? 'Nothing found.' : `${hits.length}${hits.length >= 200 ? '+' : ''} found`}
              <button className="btn btn-quiet btn-sm" onClick={() => setHits(null)}>
                Back to the folder
              </button>
            </div>
            {hits.map((h) => (
              <button
                key={h.path}
                className="fb-row fb-hit"
                data-type={h.type}
                onClick={() => void load(h.type === 'dir' ? h.path : h.path.replace(/\/[^/]+$/, '') || '/')}
                title="Open the folder this is in"
              >
                {h.type === 'dir' ? <Folder size={16} /> : <File size={16} />}
                <span className="fb-path">{h.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="fb-list" role="listbox" aria-label="Files" aria-multiselectable tabIndex={0} ref={listRef} onKeyDown={onKey}>
              <div className="fb-row fb-head" role="presentation">
                <span />
                <button onClick={() => sortBy('name')}>Name{arrow('name')}</button>
                <button className="num" onClick={() => sortBy('size')} style={{ textAlign: 'right' }}>
                  Size{arrow('size')}
                </button>
                <button onClick={() => sortBy('modified')}>Changed{arrow('modified')}</button>
              </div>
              {listing?.entries.length === 0 && <div className="empty dim">This folder is empty. Drop files here to upload them.</div>}
              {listing && listing.entries.length > 0 && shown.length === 0 && <div className="empty dim">Nothing here matches.</div>}
              {shown.map((e) => (
                <div
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
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    if (!selected.has(e.name)) setSelected(new Set([e.name]))
                    setMenu({ x: Math.min(ev.clientX, window.innerWidth - 230), y: Math.min(ev.clientY, window.innerHeight - 330) })
                  }}
                >
                  {e.type === 'dir' ? <Folder size={16} /> : e.type === 'link' ? <Link2 size={16} /> : ARCHIVE.test(e.name) ? <Archive size={16} /> : <File size={16} />}
                  <span className="fb-name">{e.name}</span>
                  <span className="num hint" style={{ textAlign: 'right' }}>
                    {e.type === 'file' ? formatBytes(e.size) : ''}
                  </span>
                  <span className="hint">{e.modified ? new Date(e.modified).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="fb-bar fb-foot">
          {chosen.length === 0 ? (
            <span className="hint" style={{ flex: 1 }}>
              {listing ? `${shown.length} ${shown.length === 1 ? 'item' : 'items'}` : ''} · Right-click for more. Drop files here to upload.
            </span>
          ) : (
            <>
              <span className="hint" style={{ flex: 1 }}>
                {one ? one.name : `${chosen.length} selected`}
              </span>
              {ssh && (
                <button className="btn btn-quiet" disabled={readOnly} onClick={() => void zip(chosen)}>
                  <Archive size={14} /> Zip
                </button>
              )}
              {ssh && one && ARCHIVE.test(one.name) && (
                <button className="btn btn-quiet" disabled={readOnly} onClick={() => void unzip(one)}>
                  <PackageOpen size={14} /> Open archive
                </button>
              )}
              {one && (
                <button className="btn btn-quiet" disabled={readOnly} onClick={() => void rename(one)}>
                  <Pencil size={14} /> Rename
                </button>
              )}
              {ssh && one && (
                <button className="btn btn-quiet" onClick={() => setPerms(one)}>
                  <KeyRound size={14} /> Permissions
                </button>
              )}
              <button className="btn btn-quiet" style={{ color: 'var(--bad)' }} disabled={readOnly} onClick={() => void bin(chosen)}>
                <Trash2 size={14} /> {ssh ? 'Bin' : 'Delete'}
              </button>
            </>
          )}
        </div>
        {drop && <div className="fb-drop">Drop to upload to {path}</div>}
      </div>

      {menu && chosen.length > 0 && (
        <div className="menu-scrim" onMouseDown={() => setMenu(null)} onContextMenu={(e) => (e.preventDefault(), setMenu(null))}>
          <div className="menu glass" role="menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {menuItems().map((m) => (
              <button
                key={m.label}
                role="menuitem"
                data-danger={m.danger}
                disabled={m.off}
                onClick={() => {
                  setMenu(null)
                  m.run()
                }}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {editing && <FileEditor server={server} session={session} path={editing} onClose={(saved) => (setEditing(null), saved && void load(path))} />}
      {perms && <PermsDialog session={session} entry={perms} path={join(perms.name)} readOnly={readOnly} onClose={() => setPerms(null)} />}
      {askDialog}
    </>
  )
}

/** Reads a text file from the server and saves it back. Big files and programs are not opened. */
function FileEditor({ server, session, path, onClose }: { server: SshServer; session: string; path: string; onClose: (saved: boolean) => void }): React.JSX.Element {
  const { act, notify } = useApp()
  const [text, setText] = useState<string | null>(null)
  const [orig, setOrig] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [failed, setFailed] = useState('')
  const readOnly = server.readOnly === true

  useEffect(() => {
    api()
      .invoke('sftp:read', session, path)
      .then((r) => {
        setText(r.text)
        setOrig(r.text)
        setTruncated(r.truncated)
      })
      .catch((e: Error) => setFailed(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [session, path])

  const dirty = text !== null && text !== orig
  const save = async (): Promise<void> => {
    if (text === null || truncated || readOnly) return
    const ok = await act('sftp-save', async () => {
      await api().invoke('sftp:write', session, path, text)
      return true
    })
    if (ok) {
      setOrig(text)
      notify({ kind: 'info', text: `Saved ${path.split('/').pop()}.` })
    }
  }
  const close = (): void => {
    if (dirty && !window.confirm('Close without saving your changes?')) return
    onClose(false)
  }
  return (
    <div className="scrim" style={{ zIndex: 60 }} onMouseDown={close}>
      <div className="dialog glass fb-editor" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 's' && e.metaKey && (e.preventDefault(), void save())}>
        <div className="fb-editor-top">
          <strong className="mono" title={path}>
            {path}
          </strong>
          {dirty && <span className="tag">Not saved</span>}
          {truncated && <span className="tag">Too big: read only</span>}
          {readOnly && <span className="tag">Read only server</span>}
        </div>
        {failed ? (
          <div className="errbox">{failed}</div>
        ) : text === null ? (
          <div className="dim">Opening…</div>
        ) : (
          <textarea className="fb-editor-text mono" spellCheck={false} value={text} readOnly={truncated || readOnly} onChange={(e) => setText(e.target.value)} aria-label={`Contents of ${path}`} autoFocus />
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={close}>
            Close
          </button>
          <button className="btn btn-primary" disabled={!dirty || truncated || readOnly} onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

const PRESETS: { mode: string; label: string; for: 'file' | 'dir' | 'both' }[] = [
  { mode: '644', label: 'Normal file', for: 'file' },
  { mode: '755', label: 'Folder or program', for: 'both' },
  { mode: '600', label: 'Private to me', for: 'file' },
  { mode: '700', label: 'Private folder', for: 'dir' },
  { mode: '664', label: 'Group can edit', for: 'file' },
  { mode: '775', label: 'Group can edit folder', for: 'dir' }
]

function words(mode: string): string {
  const d = mode.slice(-3).split('').map(Number)
  if (d.some((n) => Number.isNaN(n) || n > 7)) return ''
  const can = (n: number): string => {
    const a = [(n & 4) !== 0 && 'read', (n & 2) !== 0 && 'change', (n & 1) !== 0 && 'run'].filter(Boolean) as string[]
    return a.length === 0 ? 'cannot do anything' : a.length === 1 ? `can ${a[0]}` : `can ${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
  }
  return `The owner ${can(d[0])}. The group ${can(d[1])}. Everyone else ${can(d[2])}.`
}

/** Looks up who can do what with a file or folder, and changes it with words next to the numbers. */
function PermsDialog({ session, entry, path, readOnly, onClose }: { session: string; entry: SftpEntry; path: string; readOnly: boolean; onClose: () => void }): React.JSX.Element {
  const { act, notify } = useApp()
  const [info, setInfo] = useState<{ mode: string; owner: string; group: string } | null>(null)
  const [mode, setMode] = useState('')
  const [deep, setDeep] = useState(false)
  const [failed, setFailed] = useState('')
  useEffect(() => {
    api()
      .invoke('sftp:stat', session, path)
      .then((s) => (setInfo(s), setMode(s.mode)))
      .catch((e: Error) => setFailed(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  }, [session, path])
  const valid = /^[0-7]{3,4}$/.test(mode)
  return (
    <div className="scrim" style={{ zIndex: 60 }} onMouseDown={onClose}>
      <div className="dialog glass" style={{ width: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 18, marginBottom: 6 }}>
          Permissions for {entry.name}
        </h2>
        {failed ? (
          <div className="errbox">{failed}</div>
        ) : !info ? (
          <div className="dim">Asking the server…</div>
        ) : (
          <>
            <p className="hint" style={{ margin: '0 0 12px' }}>
              Owned by {info.owner}, group {info.group}. Now: {info.mode}.
            </p>
            <div className="chips">
              {PRESETS.filter((p) => p.for === 'both' || p.for === (entry.type === 'dir' ? 'dir' : 'file')).map((p) => (
                <button key={p.mode} className="chip" data-on={mode === p.mode} onClick={() => setMode(p.mode)}>
                  {p.mode} · {p.label}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="perm-mode">Permission number</label>
              <input id="perm-mode" className="input mono" value={mode} maxLength={4} onChange={(e) => setMode(e.target.value.replace(/[^0-7]/g, ''))} />
              <span className="hint">{valid ? words(mode) : 'Three or four digits, each 0 to 7.'}</span>
            </div>
            {entry.type === 'dir' && (
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> Apply to everything inside too
              </label>
            )}
            {mode === '777' && <div className="errbox">777 lets everyone change this. It is rarely needed and often unsafe.</div>}
          </>
        )}
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!info || !valid || mode === info.mode || readOnly}
            onClick={async () => {
              const ok = await act('sftp-chmod', async () => {
                await api().invoke('sftp:chmod', session, path, mode, deep)
                return true
              })
              if (ok) {
                notify({ kind: 'info', text: `Permissions are now ${mode}.` })
                onClose()
              }
            }}
          >
            Change
          </button>
        </div>
      </div>
    </div>
  )
}
