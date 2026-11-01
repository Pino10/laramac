import { useState } from 'react'
import { Code, ExternalLink, FolderOpen, Lock, Plus, Search, Share2, Terminal, Upload } from 'lucide-react'
import type { SiteInfo } from '@shared/types'
import { useApp } from '../store'
import { Monogram, PageHead, Switch } from '../ui'

const kindLabel: Record<SiteInfo['kind'], string> = {
  laravel: 'Laravel',
  wordpress: 'WordPress',
  symfony: 'Symfony',
  php: 'PHP',
  node: 'Node',
  static: 'Static'
}

export default function Sites(): React.JSX.Element {
  const { sites, settings, tools, php, act, busy, setSites, notify, setNewProject, setImportOpen } = useApp()
  const [query, setQuery] = useState('')
  const api = window.laramac
  const installedPhp = php.filter((p) => p.installed)
  const editor = settings?.editor === 'vscode' ? 'VS Code' : 'Cursor'
  const shown = sites.filter((s) => `${s.name} ${s.domain} ${s.kind}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <PageHead
        title="Sites"
        desc={
          <>
            {sites.length} {sites.length === 1 ? 'site' : 'sites'} from <code>{settings?.wwwPath.replace(/^\/Users\/[^/]+/, '~') ?? '~/www'}</code>. Add a
            folder there and it appears here.
          </>
        }
      >
        <button className="btn" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> Import
        </button>
        <button className="btn btn-primary" onClick={() => setNewProject(true)}>
          <Plus size={14} /> New project
        </button>
      </PageHead>

      {sites.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label className="searchbox">
            <Search size={14} />
            <input placeholder="Filter sites" aria-label="Filter sites" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="btn btn-quiet" onClick={() => api.invoke('www:reveal')}>
            <FolderOpen size={14} /> Show folder
          </button>
        </div>
      )}

      {sites.length === 0 ? (
        <div className="panel empty" style={{ padding: '56px 24px' }}>
          <strong style={{ fontSize: 15 }}>Your projects folder is empty</strong>
          <p className="dim" style={{ margin: '4px auto 18px', maxWidth: '46ch' }}>
            Start something new, or bring a site in from Laragon or a backup with its database.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> Import a project
            </button>
            <button className="btn btn-primary" onClick={() => setNewProject(true)}>
              <Plus size={14} /> New project
            </button>
          </div>
        </div>
      ) : (
        <div className="panel">
          {shown.length === 0 && <div className="empty dim">No site matches “{query}”.</div>}
          {shown.map((site) => (
            <div key={site.path} className="site-row">
              <Monogram id={site.kind} />
              <div className="row-main">
                <div className="row-title">
                  {site.name}
                  {site.secure && <Lock size={12} aria-label="HTTPS" style={{ color: 'var(--ok)' }} />}
                </div>
                {site.shareUrl ? (
                  <button className="link row-sub" style={{ display: 'block' }} onClick={() => api.invoke('tools:open-external', site.shareUrl!)}>
                    Public at {site.shareUrl.replace('https://', '')}
                  </button>
                ) : (
                  <button className="link row-sub" style={{ display: 'block', color: 'var(--ink-3)' }} onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}>
                    {site.secure ? 'https://' : 'http://'}
                    {site.domain}
                  </button>
                )}
              </div>
              <div className="chips">
                <span className="tag">{kindLabel[site.kind]}</span>
              </div>
              <select
                className="input"
                aria-label={`PHP version for ${site.name}`}
                title="PHP version"
                value={site.php ?? ''}
                disabled={installedPhp.length === 0}
                onChange={(e) => act(`cfg-${site.name}`, () => api.invoke('sites:set-config', site.name, { php: e.target.value }).then(setSites))}
              >
                {installedPhp.length === 0 && <option value="">No PHP</option>}
                {installedPhp.map((p) => (
                  <option key={p.minor} value={p.minor}>
                    PHP {p.minor}
                  </option>
                ))}
              </select>
              <span title="HTTPS">
                <Switch
                  on={site.secure}
                  label={`HTTPS for ${site.name}`}
                  disabled={busy.has(`cfg-${site.name}`)}
                  onChange={async () => {
                    if (!site.secure && tools && !tools.caTrusted) {
                      notify({ kind: 'info', text: 'Trust local HTTPS on the Overview so browsers accept the certificate.' })
                    }
                    await act(`cfg-${site.name}`, () => api.invoke('sites:set-config', site.name, { secure: !site.secure }).then(setSites))
                  }}
                />
              </span>
              <div className="site-actions">
                <IconBtn label={`Open ${site.name}`} title="Open in browser" onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}>
                  <ExternalLink size={15} />
                </IconBtn>
                <IconBtn label={`Show ${site.name} in Finder`} title="Show in Finder" onClick={() => api.invoke('sites:open-folder', site.path)}>
                  <FolderOpen size={15} />
                </IconBtn>
                <IconBtn label={`Open ${site.name} in ${editor}`} title={`Open in ${editor}`} onClick={() => act(`editor-${site.name}`, () => api.invoke('sites:open-editor', site.path))}>
                  <Code size={15} />
                </IconBtn>
                <IconBtn label={`Claude Code in ${site.name}`} title="Open Claude Code here" onClick={() => act(`claude-${site.name}`, () => api.invoke('sites:open-claude', site.path))}>
                  <Terminal size={15} />
                </IconBtn>
                <IconBtn
                  label={site.shareUrl ? `Stop sharing ${site.name}` : `Share ${site.name}`}
                  title={site.shareUrl ? 'Stop sharing' : 'Share a public link'}
                  pressed={!!site.shareUrl}
                  disabled={busy.has(`share-${site.name}`)}
                  onClick={async () => {
                    if (site.shareUrl) {
                      await act(`share-${site.name}`, () => api.invoke('sites:unshare', site.name))
                      return
                    }
                    const url = await act(`share-${site.name}`, () => api.invoke('sites:share', site.name))
                    if (url) {
                      navigator.clipboard?.writeText(url).catch(() => undefined)
                      notify({ kind: 'info', text: 'Public link copied to the clipboard.' })
                    }
                  }}
                >
                  <Share2 size={15} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function IconBtn({
  label,
  title,
  onClick,
  pressed,
  disabled,
  children
}: {
  label: string
  title: string
  onClick: () => unknown
  pressed?: boolean
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button className="btn btn-quiet btn-icon" aria-label={label} title={title} aria-pressed={pressed} disabled={disabled} onClick={() => void onClick()}>
      {children}
    </button>
  )
}
