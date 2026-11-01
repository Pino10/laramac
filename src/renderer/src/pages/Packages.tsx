import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { PackageInfo } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, PageHead } from '../ui'
import { useAsk } from '../components/Ask'

const GROUPS: { id: PackageInfo['group']; title: string; note?: string }[] = [
  { id: 'php', title: 'PHP versions' },
  { id: 'database', title: 'Database servers', note: 'Removing a server keeps your databases. They come back when you install it again.' },
  { id: 'tool', title: 'Tools' },
  { id: 'brew', title: 'Homebrew', note: 'Installed through Homebrew for Laramac. Removing one uninstalls it from Homebrew too.' },
  { id: 'cache', title: 'Cache' }
]

const LETTERS: Record<PackageInfo['group'], string> = { php: 'Php', database: 'Db', tool: 'Tl', brew: 'Br', cache: 'Ca' }

export default function Packages(): React.JSX.Element {
  const { act, busy, notify, setServices } = useApp()
  const api = window.laramac
  const [items, setItems] = useState<PackageInfo[] | null>(null)
  const [ask, askDialog] = useAsk()

  const load = useCallback(() => void api.invoke('packages:list').then(setItems), [api])
  useEffect(() => {
    load()
  }, [load])

  const total = (items ?? []).reduce((n, p) => n + p.bytes, 0)
  const cache = (items ?? []).filter((p) => p.group === 'cache').reduce((n, p) => n + p.bytes, 0)

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
      <PageHead title="Packages" desc="Everything Laramac has installed on this Mac, and how much space it takes. Remove what you no longer use." />

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
                    <strong>{p.name}</strong>
                    <small>{p.detail}</small>
                  </span>
                  <span className="hint" style={{ textAlign: 'right' }}>
                    {g.id === 'cache' ? '' : 'Installed'}
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
