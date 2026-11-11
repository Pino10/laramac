import { useCallback, useEffect, useState } from 'react'
import { ArrowUpCircle, Download, RefreshCw, Trash2 } from 'lucide-react'
import type { UpdateItem } from '@shared/types'
import type { PackageInfo } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, PageHead } from '../ui'
import { useAsk } from '../components/Ask'
import { offerSwaps } from '../components/swap'

const GROUPS: { id: PackageInfo['group']; title: string; note?: string }[] = [
  { id: 'php', title: 'PHP versions' },
  { id: 'database', title: 'Database servers', note: 'Removing a server keeps your databases. They come back when you install it again.' },
  { id: 'tool', title: 'Tools' },
  { id: 'brew', title: 'Homebrew', note: 'Installed through Homebrew for Laramac. Removing one uninstalls it from Homebrew too.' },
  { id: 'cache', title: 'Cache' }
]

const LETTERS: Record<PackageInfo['group'], string> = { php: 'Php', database: 'Db', tool: 'Tl', brew: 'Br', cache: 'Ca' }

export default function Packages(): React.JSX.Element {
  const { act, busy, notify, setServices, updates, setUpdates } = useApp()
  // An update for a package, from the Updates page's last check.
  const updateFor = (p: PackageInfo): UpdateItem | undefined =>
    (updates?.items ?? []).find((u) => u.group !== 'site' && u.group !== 'laramac' && u.current !== null && (u.group !== 'database' || u.current === p.detail) && (u.id === p.id || u.name.toLowerCase() === p.name.toLowerCase() || (u.id.split(':')[1] && u.id.split(':')[1] === p.id.split(':')[1])))
  const update = async (u: UpdateItem): Promise<void> => {
    const r = await act(`upd-${u.id}`, () => api.invoke('updates:apply', [u.id], false))
    if (r) {
      notify(r.failed.length ? { kind: 'error', text: `${u.name}: ${r.failed[0].error}` } : { kind: 'info', text: r.swaps?.length ? `${u.name} ${u.latest} is installed.` : `${u.name} is now ${u.latest}.` })
      setUpdates(r.report)
      load()
      // A newer version sits next to the one in use: switch, or keep.
      if (await offerSwaps(r.swaps, ask, (id) => act(`use-${id}`, () => api.invoke('packages:use', id)).then((x) => x && setItems(x)))) load()
    }
  }
  const api = window.laramac
  const [items, setItems] = useState<PackageInfo[] | null>(null)
  const [ask, askDialog] = useAsk()

  // Newer versions you do not have yet (for example a new PHP line). Installing one leaves what you have alone.
  const fresh = (updates?.items ?? []).filter((u) => u.current === null && u.group === 'php')
  const recheck = (): void => {
    void act('updates-check', () => api.invoke('updates:check', true)).then((r) => {
      if (r) {
        setUpdates(r)
        notify({ kind: 'info', text: r.items.length ? `${r.items.length} ${r.items.length === 1 ? 'update' : 'updates'} found.` : 'Everything is up to date.' })
      }
    })
  }
  useEffect(() => {
    if (!updates || Date.now() - updates.checkedAt > 3600_000) void api.invoke('updates:check', false).then(setUpdates).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(() => void api.invoke('packages:list').then(setItems), [api])
  useEffect(() => {
    load()
  }, [load])

  const total = (items ?? []).reduce((n, p) => n + p.bytes, 0)
  const cache = (items ?? []).filter((p) => p.group === 'cache').reduce((n, p) => n + p.bytes, 0)

  const use = async (p: PackageInfo): Promise<void> => {
    const sameLine = p.group === 'database' && (items ?? []).some((x) => x.active && x.name === p.name && x.detail.split('.').slice(0, p.name === 'MySQL' ? 2 : 1).join('.') === p.detail.split('.').slice(0, p.name === 'MySQL' ? 2 : 1).join('.'))
    const ok = await ask({
      title: `Use ${p.name} ${p.detail}?`,
      label:
        p.group === 'php'
          ? 'New sites and the terminal will use it. Sites that choose their own PHP version keep it. Nothing is deleted.'
          : sameLine
            ? 'Both versions use the same data, so your databases stay as they are. If it is running, it restarts for a moment. Nothing is deleted.'
            : 'This version keeps its own data folder. Your databases in the other version are not deleted and come back when you switch back. If it is running, it restarts for a moment.',
      yesNo: true,
      confirm: 'Switch',
      cancel: 'Keep as it is'
    })
    if (!ok) return
    const next = await act(`use-${p.id}`, () => api.invoke('packages:use', p.id))
    if (next) setItems(next)
  }

  const remove = async (p: PackageInfo): Promise<void> => {
    const ok = await ask({
      title: `Remove ${p.name}${p.group === 'php' || p.group === 'database' ? ` ${p.detail}` : ''}?`,
      label:
        p.group === 'cache'
          ? 'These files are only kept to speed up reinstalls.'
          : `This frees ${formatBytes(p.bytes)}. You can install it again any time.`,
      yesNo: true,
      confirm: 'Remove',
      danger: p.group !== 'cache'
    })
    if (!ok) return
    const next = await act(`pkg-${p.id}`, () => api.invoke('packages:remove', p.id))
    if (next) {
      setItems(next)
      setServices(await api.invoke('services:list'))
      notify({ kind: 'info', text: `Removed ${p.name}.` })
    }
  }

  return (
    <>
      <PageHead title="Packages" desc="Everything Laramac has installed on this Mac, how much space it takes, and which ones have an update. Remove what you no longer use." />

      <div className="pkg-check">
        <span className="hint">{updates ? `Last checked ${new Date(updates.checkedAt).toLocaleTimeString()}.` : 'Checking for updates…'}</span>
        <button className="btn btn-sm" disabled={busy.has('updates-check')} onClick={recheck}>
          <RefreshCw size={13} /> {busy.has('updates-check') ? 'Checking…' : 'Check for updates now'}
        </button>
      </div>

      {(updates?.notes.length ?? 0) > 0 && <p className="hint">{updates!.notes.join(' ')}</p>}

      {fresh.length > 0 && (
        <section>
          <h2 className="section-title">Newer versions you can add</h2>
          <div className="group">
            {fresh.map((u) => (
              <div key={u.id} className="pkg-row">
                <span className="mono-tile" aria-hidden>
                  New
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong>{u.name}</strong>
                  <small>{u.detail}</small>
                </span>
                <span className="hint" style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-tonal" disabled={busy.has(`upd-${u.id}`)} onClick={() => update(u)}>
                    <Download size={13} /> {busy.has(`upd-${u.id}`) ? 'Installing…' : `Install ${u.latest}`}
                  </button>
                </span>
                <span />
                <span />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pkg-total">
        <div>
          <strong>{items ? formatBytes(total) : '…'}</strong>
          <span>Installed in total</span>
        </div>
        <div>
          <strong>{items ? items.filter((p) => p.group !== 'cache').length : '…'}</strong>
          <span>Packages</span>
        </div>
        <div>
          <strong>{items ? formatBytes(cache) : '…'}</strong>
          <span>Cache you can clear</span>
        </div>
      </div>

      {items?.length === 0 && (
        <div className="group empty-state">
          <strong>Nothing installed yet</strong>
          <span>PHP versions, databases and tools you install appear here with their size.</span>
        </div>
      )}

      {GROUPS.map((g) => {
        const list = (items ?? []).filter((p) => p.group === g.id)
        if (list.length === 0) return null
        return (
          <section key={g.id}>
            <h2 className="section-title">{g.title}</h2>
            <div className="group">
              {list.map((p) => (
                <div key={p.id} className="pkg-row">
                  <span className="mono-tile" aria-hidden>
                    {LETTERS[p.group]}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong>
                      {p.name} {p.active && <span className="tag tag-ok">In use</span>}
                    </strong>
                    <small>{p.detail}</small>
                  </span>
                  <span className="hint" style={{ textAlign: 'right' }}>
                    {p.active === false && (
                      <button className="btn btn-sm" style={{ marginRight: 8 }} disabled={busy.has(`use-${p.id}`)} onClick={() => void use(p)}>
                        {busy.has(`use-${p.id}`) ? 'Switching…' : p.group === 'php' ? 'Make default' : 'Use this one'}
                      </button>
                    )}
                    {(() => {
                      const u = updateFor(p)
                      if (u)
                        return (
                          <button className="btn btn-sm btn-tonal" disabled={busy.has(`upd-${u.id}`)} onClick={() => update(u)}>
                            <ArrowUpCircle size={13} /> {busy.has(`upd-${u.id}`) ? 'Updating…' : `Update to ${u.latest}`}
                          </button>
                        )
                      return g.id === 'cache' ? '' : 'Up to date'
                    })()}
                  </span>
                  <span className="num" style={{ textAlign: 'right' }}>
                    {formatBytes(p.bytes)}
                  </span>
                  <button className="icon-btn danger-text" data-tip={g.id === 'cache' ? 'Clear' : 'Remove'} aria-label={`Remove ${p.name}`} disabled={busy.has(`pkg-${p.id}`)} onClick={() => remove(p)}>
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
            {g.note && <p className="footnote">{g.note}</p>}
          </section>
        )
      })}
      {askDialog}
    </>
  )
}
