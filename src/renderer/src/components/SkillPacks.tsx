import { useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import type { PackUpdateInfo, SkillPackInfo } from '@shared/types'
import { useApp } from '../store'

/** Security skills from well-known teams on GitHub, loaded into every Claude Code review. */
export default function SkillPacks(): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [packs, setPacks] = useState<SkillPackInfo[]>([])
  const [updates, setUpdates] = useState<PackUpdateInfo[]>([])
  useEffect(() => {
    void api.invoke('packs:list').then(setPacks)
    void api.invoke('packs:updates').then(setUpdates)
  }, [api])
  const newer = (id: string): PackUpdateInfo | undefined => updates.find((u) => u.id === id && u.available)
  const checkedAt = updates.map((u) => u.checkedAt).filter(Boolean).sort().pop()
  return (
    <div className="panel packs">
      <div className="packs-head">
        <div className="row-title">Skills from security teams</div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>
          Free skill sets from Trail of Bits, Sentry, Cloudflare, Laravel and Anthropic, kept in Laramac’s folder and loaded into every Claude Code review next to Laramac’s own 29 skills. Reviews stay read-only whatever a skill asks for.
        </div>
        <div className="row-sub" style={{ whiteSpace: 'normal', marginTop: 6 }}>
          {updates.some((u) => u.available) ? `${updates.filter((u) => u.available).length} newer ${updates.filter((u) => u.available).length === 1 ? 'version is' : 'versions are'} available.` : 'Everything is up to date.'}{' '}
          {checkedAt ? `Checked ${new Date(checkedAt).toLocaleString()}.` : 'Not checked yet.'} Laramac checks once a day and never updates a pack without you pressing Update.{' '}
          <button className="link" disabled={busy.has('pack-check')} onClick={async () => setUpdates((await act('pack-check', () => api.invoke('packs:check-updates'))) ?? updates)}>
            <RefreshCw size={11} /> {busy.has('pack-check') ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>
      {packs.map((p) => (
        <div key={p.id} className="rt-row">
          <div className="row-main">
            <div className="row-title">
              {p.name} <span className="tag">{p.license}</span>
              {p.installed && <span className="tag tag-ok">{p.loaded.length} {p.loaded.length === 1 ? 'skill' : 'skills'}{p.guides ? `, ${p.guides} guides` : ''}</span>}
              {newer(p.id) && <span className="tag tag-new">Update available</span>}
            </div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {p.about}
              {p.installed && p.commit ? ` Version ${p.commit.slice(0, 7)}, ${new Date(p.at ?? '').toLocaleDateString()}.` : ''}
              {newer(p.id) && (
                <>
                  {' '}
                  Newer: {newer(p.id)!.latest!.slice(0, 7)}.{' '}
                  <button className="link" onClick={() => api.invoke('tools:open-external', newer(p.id)!.changes!)}>
                    See what changed
                  </button>
                </>
              )}
            </div>
          </div>
          <button className="icon-btn" aria-label={`${p.repo} on GitHub`} data-tip="On GitHub" onClick={() => api.invoke('tools:open-external', `https://github.com/${p.repo}`)}>
            <ExternalLink />
          </button>
          {p.installed && (
            <button className="icon-btn" aria-label={`Remove ${p.name} skills`} data-tip="Remove" onClick={async () => setPacks((await act(`pack-${p.id}`, () => api.invoke('packs:remove', p.id))) ?? packs)}>
              <Trash2 />
            </button>
          )}
          <button className={p.installed ? 'btn btn-sm' : 'btn btn-primary btn-sm'} style={{ minWidth: 110 }} disabled={busy.has(`pack-${p.id}`)} onClick={async () => {
            setPacks((await act(`pack-${p.id}`, () => api.invoke('packs:install', p.id))) ?? packs)
            setUpdates(await api.invoke('packs:updates'))
          }}>
            {p.installed ? <RefreshCw size={13} /> : <Download size={13} />} {busy.has(`pack-${p.id}`) ? 'Getting…' : p.installed ? (newer(p.id) ? 'Update now' : 'Reinstall') : 'Add'}
          </button>
        </div>
      ))}
    </div>
  )
}
