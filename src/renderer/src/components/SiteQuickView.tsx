import { useEffect, useState } from 'react'
import { Bot, Code2, ExternalLink, FolderOpen, Network, ScrollText, Sparkles, X } from 'lucide-react'
import type { SiteFacts, SiteInfo } from '@shared/types'
import { useApp } from '../store'
import { Monogram } from '../ui'

/** Everything about a site at a glance, opened from its card on the Overview. */
export default function SiteQuickView({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { showSite, act } = useApp()
  const api = window.laramac
  const [f, setF] = useState<SiteFacts | null>(null)
  useEffect(() => {
    void api.invoke('site:facts', site.name).then(setF).catch(() => undefined)
  }, [api, site.name])
  const url = site.secure ? site.httpsUrl : site.url
  const node = f?.nodeInfo ? (f.nodeInfo.chosen ?? (f.nodeInfo.installed ? (f.nodeInfo.want ?? f.nodeInfo.main) : f.nodeInfo.main)) : null
  const last = f?.reviews[0]
  const rows: [string, React.ReactNode][] = [
    ['Address', <button key="a" className="link mono" onClick={() => api.invoke('sites:open-url', url)}>{url.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></button>],
    ['Status', f ? (f.answers === null ? 'Not checked (web server stopped)' : `Answers ${f.answers}${f.answers >= 500 ? ', a server error' : f.answers >= 400 ? ', a client error' : ''}`) : '…'],
    ['Kind', site.kind],
    ['Folder', <span key="p" className="mono">{site.path.replace(/^\/Users\/[^/]+/, '~')}</span>],
    ...(site.php ? ([['PHP', site.php]] as [string, React.ReactNode][]) : []),
    ...(node && (site.kind === 'node' || f?.nodeInfo.want) ? ([['Node.js', `${node}${f?.nodeInfo.source ? ` (${f.nodeInfo.source})` : ''}`]] as [string, React.ReactNode][]) : []),
    ['Database', f?.database ? `${f.database.engine}, ${f.database.name}` : 'None found'],
    ...(site.dev ? ([['Dev server', `${site.dev.command} on port ${site.dev.port}, ${site.dev.running ? 'running' : 'stopped'}`]] as [string, React.ReactNode][]) : []),
    ...(site.backend ? ([['Backend', `${site.backend.kind === 'supabase' ? 'Supabase' : 'Firebase'}${site.backend.running ? ', running' : ''}`]] as [string, React.ReactNode][]) : []),
    ['HTTPS', site.secure ? 'On' : 'Off'],
    ...(site.aliases.length ? ([['Other names', site.aliases.join(', ')]] as [string, React.ReactNode][]) : []),
    ['Git', f ? (f.git ? 'Yes' : 'No') : '…'],
    ['.env files', f ? f.envFiles.filter((e) => e.exists).map((e) => e.file).join(', ') || 'None' : '…'],
    ['Security review', last ? `${new Date(last.at).toLocaleDateString()}: ${last.counts.critical} critical, ${last.counts.high} high, ${last.counts.medium} medium, ${last.counts.low} low` : 'Not reviewed yet']
  ]
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog quickview" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={`${site.name} details`}>
        <div className="snap-head">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Monogram id={site.kind} large />
            <div>
              <h2 className="page-title">{site.name}</h2>
              <p className="page-desc" style={{ marginTop: 2 }}>{site.domain}</p>
            </div>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <dl className="qv-list">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="end" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => api.invoke('sites:open-editor', site.path)}>
            <Code2 size={13} /> Editor
          </button>
          <button className="btn btn-sm" onClick={() => api.invoke('sites:open-claude', site.path)}>
            <Sparkles size={13} /> Claude Code
          </button>
          <button className="btn btn-sm" onClick={() => act('open-lm', () => api.invoke('claude:open-lm', site.name))}>
            <Bot size={13} /> claudelm
          </button>
          <button className="btn btn-sm" onClick={() => act('open-free', () => api.invoke('claude:open-free', site.name))}>
            <Network size={13} /> claudefree
          </button>
          <button className="btn btn-sm" onClick={() => api.invoke('sites:open-folder', site.path)}>
            <FolderOpen size={13} /> Folder
          </button>
          <button className="btn btn-sm" onClick={() => { onClose(); showSite(site.name, 'logs') }}>
            <ScrollText size={13} /> Logs
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { onClose(); showSite(site.name) }}>
            Open its page
          </button>
        </div>
      </div>
    </div>
  )
}
