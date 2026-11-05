import { useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import type { SkillPackInfo } from '@shared/types'
import { useApp } from '../store'

/** Security skills from well-known teams on GitHub, loaded into every Claude Code review. */
export default function SkillPacks(): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [packs, setPacks] = useState<SkillPackInfo[]>([])
  useEffect(() => {
    void api.invoke('packs:list').then(setPacks)
  }, [api])
  return (
    <div className="panel packs">
      <div className="packs-head">
        <div className="row-title">Skills from security teams</div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>
          Public skill sets from Trail of Bits, Sentry, Cloudflare and Anthropic, kept in Laramac’s folder and loaded into every Claude Code review next to Laramac’s own 29 skills. Reviews stay read-only whatever a skill asks for.
        </div>
      </div>
      {packs.map((p) => (
        <div key={p.id} className="rt-row">
          <div className="row-main">
            <div className="row-title">
              {p.name} <span className="tag">{p.license}</span>
              {p.installed && <span className="tag tag-ok">{p.loaded.length} skills</span>}
            </div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {p.about}
              {p.installed && p.commit ? ` Version ${p.commit.slice(0, 7)}, ${new Date(p.at ?? '').toLocaleDateString()}.` : ''}
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
          <button className={p.installed ? 'btn btn-sm' : 'btn btn-primary btn-sm'} style={{ minWidth: 110 }} disabled={busy.has(`pack-${p.id}`)} onClick={async () => setPacks((await act(`pack-${p.id}`, () => api.invoke('packs:install', p.id))) ?? packs)}>
            {p.installed ? <RefreshCw size={13} /> : <Download size={13} />} {busy.has(`pack-${p.id}`) ? 'Getting…' : p.installed ? 'Update' : 'Add'}
          </button>
        </div>
      ))}
    </div>
  )
}
