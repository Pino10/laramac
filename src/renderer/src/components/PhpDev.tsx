import { useEffect, useState } from 'react'
import { Check, Download, SlidersHorizontal, TerminalSquare, Trash2, Wrench } from 'lucide-react'
import type { PhpQuick, PhpToolInfo, SiteInfo } from '@shared/types'
import { useApp } from '../store'

/** Quick php.ini settings: the ones developers change most, one click each, for every PHP version. */
export function PhpQuickSettings(): React.JSX.Element | null {
  const { act, busy } = useApp()
  const api = window.laramac
  const [q, setQ] = useState<PhpQuick | null>(null)
  useEffect(() => {
    void api.invoke('php:quick').then(setQ)
  }, [api])
  if (!q) return null
  return (
    <>
      <div className="section-head">
        <h2 className="section-title">
          <SlidersHorizontal size={15} /> Quick settings
        </h2>
        <span className="hint">For every PHP version. They go in your own php.ini file, so they win; PHP restarts by itself.</span>
      </div>
      <div className="group">
        {q.settings.map((s) => (
          <div key={s.key} className="row quick-row">
            <div className="row-main">
              <div className="row-title">
                {s.label} <span className="mono dim">{s.key}</span>
              </div>
              <div className="row-sub">{s.hint}</div>
            </div>
            <div className="seg" role="radiogroup" aria-label={s.label}>
              {s.options.map((o) => (
                <button key={o.value} role="radio" aria-checked={s.value === o.value} disabled={busy.has(`q-${s.key}`)} onClick={async () => setQ((await act(`q-${s.key}`, () => api.invoke('php:quick-set', s.key, o.value))) ?? q)}>
                  {o.label}
                  {o.value === s.fallback && <span className="seg-dot" aria-label="Laramac’s default" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/** The global PHP tools, installed with Laramac's Composer and on the PATH of Laramac Code's terminal. */
export function PhpTools(): React.JSX.Element | null {
  const { act, busy } = useApp()
  const api = window.laramac
  const [list, setList] = useState<PhpToolInfo[] | null>(null)
  useEffect(() => {
    void api.invoke('phptools:list').then(setList)
  }, [api])
  if (!list) return null
  return (
    <>
      <div className="section-head">
        <h2 className="section-title">
          <Wrench size={15} /> PHP tools
        </h2>
        <span className="hint">Installed for you with Composer, ready in Laramac Code’s terminal.</span>
      </div>
      <div className="tool-tiles">
        {list.map((t) => (
          <div key={t.id} className="tool-tile" data-on={!!t.version}>
            <div className="tool-tile-top">
              <strong>{t.name}</strong>
              {t.version ? (
                <span className="tag tag-ok">
                  <Check size={11} /> {t.version}
                </span>
              ) : null}
            </div>
            <span className="tool-tile-about">{t.about}</span>
            <div className="tool-tile-foot">
              <code className="mono">{t.command}</code>
              {t.version ? (
                <button className="icon-btn" aria-label={`Remove ${t.name}`} data-tip="Remove" disabled={busy.has(`pt-${t.id}`)} onClick={async () => setList((await act(`pt-${t.id}`, () => api.invoke('phptools:remove', t.id))) ?? list)}>
                  <Trash2 size={15} />
                </button>
              ) : (
                <button className="btn btn-sm" disabled={busy.has(`pt-${t.id}`)} onClick={async () => setList((await act(`pt-${t.id}`, () => api.invoke('phptools:install', t.id))) ?? list)}>
                  <Download size={13} /> {busy.has(`pt-${t.id}`) ? 'Installing…' : 'Install'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const ARTISAN: { id: string; label: string; confirm?: string }[] = [
  { id: 'migrate', label: 'Migrate' },
  { id: 'optimize-clear', label: 'Clear caches' },
  { id: 'route-list', label: 'Routes' },
  { id: 'tinker', label: 'Tinker' },
  { id: 'test', label: 'Run tests' },
  { id: 'storage-link', label: 'Storage link' },
  { id: 'about', label: 'About' },
  { id: 'fresh', label: 'Fresh database and seed', confirm: 'This deletes every table in the site’s database and builds it again from the migrations and seeders. Continue?' }
]

/** Artisan on a Laravel site: each button runs exactly that command in Terminal, with the site's PHP. */
export function ArtisanPanel({ site }: { site: SiteInfo }): React.JSX.Element | null {
  const { act } = useApp()
  if (site.kind !== 'laravel') return null
  return (
    <div className="panel artisan">
      <div className="artisan-head">
        <span className="icon-chip">
          <TerminalSquare size={15} />
        </span>
        <div>
          <div className="row-title">Artisan</div>
          <div className="row-sub">Runs in Terminal with this site’s PHP, so you see every line.</div>
        </div>
      </div>
      <div className="artisan-grid">
        {ARTISAN.map((a) => (
          <button
            key={a.id}
            className={a.confirm ? 'btn btn-sm btn-danger' : 'btn btn-sm'}
            onClick={() => {
              if (a.confirm && !window.confirm(a.confirm)) return
              void act(`artisan-${a.id}`, () => window.laramac.invoke('site:artisan', site.name, a.id))
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
