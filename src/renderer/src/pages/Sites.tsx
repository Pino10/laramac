import { Code, ExternalLink, FolderOpen, Plus, Share2, Terminal } from 'lucide-react'
import type { SiteInfo } from '@shared/types'
import { useApp } from '../store'
import { PageHead, Switch } from '../ui'

const kindLabel: Record<SiteInfo['kind'], string> = {
  laravel: 'Laravel',
  wordpress: 'WordPress',
  symfony: 'Symfony',
  php: 'PHP',
  node: 'Node',
  static: 'Static'
}

export default function Sites(): React.JSX.Element {
  const { sites, settings, tools, php, act, busy, setSites, notify, setNewProject } = useApp()
  const api = window.laramac
  const installedPhp = php.filter((p) => p.installed)
  const editor = settings?.editor === 'vscode' ? 'VS Code' : 'Cursor'

  return (
    <>
      <PageHead
        title="Sites"
        desc={
          <>
            Each folder in <code>{settings?.wwwPath ?? '~/www'}</code> is served at its own address.
          </>
        }
      >
        <button className="btn" onClick={() => api.invoke('www:reveal')}>
          <FolderOpen size={14} /> Open folder
        </button>
        <button className="btn btn-primary" onClick={() => setNewProject(true)}>
          <Plus size={14} /> New project
        </button>
      </PageHead>

      {sites.length === 0 ? (
        <div className="panel empty">
          <strong>No sites yet</strong>
          <span className="dim">Create a project, or add a folder to your www directory.</span>
        </div>
      ) : (
        <div className="panel">
          <div className="thead row-site">
            <span>Site</span>
            <span>Type</span>
            <span>PHP</span>
            <span>HTTPS</span>
            <span />
          </div>
          {sites.map((site) => (
            <div key={site.path} className="row row-site">
              <div className="row-main">
                <div className="row-title">{site.name}</div>
                <div className="row-sub">
                  {site.shareUrl ? (
                    <button className="link no-drag" onClick={() => api.invoke('tools:open-external', site.shareUrl!)}>
                      {site.shareUrl.replace('https://', '')}
                    </button>
                  ) : (
                    site.domain
                  )}
                </div>
              </div>
              <span>
                <span className="tag">{kindLabel[site.kind]}</span>
              </span>
              <select
                className="input no-drag"
                aria-label={`PHP version for ${site.name}`}
                value={site.php ?? ''}
                disabled={installedPhp.length === 0}
                onChange={(e) =>
                  act(`cfg-${site.name}`, () => api.invoke('sites:set-config', site.name, { php: e.target.value }).then(setSites))
                }
              >
                {installedPhp.length === 0 && <option value="">None</option>}
                {installedPhp.map((p) => (
                  <option key={p.minor} value={p.minor}>
                    {p.minor}
                  </option>
                ))}
              </select>
              <Switch
                on={site.secure}
                label={`HTTPS for ${site.name}`}
                disabled={busy.has(`cfg-${site.name}`)}
                onChange={async () => {
                  if (!site.secure && tools && !tools.caTrusted) {
                    notify({ kind: 'info', text: 'Trust local HTTPS on the Dashboard so browsers accept the certificate.' })
                  }
                  await act(`cfg-${site.name}`, () =>
                    api.invoke('sites:set-config', site.name, { secure: !site.secure }).then(setSites)
                  )
                }}
              />
              <div className="end no-drag">
                <button
                  className="btn btn-quiet btn-icon"
                  title="Open in browser"
                  aria-label={`Open ${site.name} in browser`}
                  onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}
                >
                  <ExternalLink size={15} />
                </button>
                <button
                  className="btn btn-quiet btn-icon"
                  title="Show in Finder"
                  aria-label={`Show ${site.name} in Finder`}
                  onClick={() => api.invoke('sites:open-folder', site.path)}
                >
                  <FolderOpen size={15} />
                </button>
                <button
                  className="btn btn-quiet btn-icon"
                  title={`Open in ${editor}`}
                  aria-label={`Open ${site.name} in ${editor}`}
                  onClick={() => act(`editor-${site.name}`, () => api.invoke('sites:open-editor', site.path))}
                >
                  <Code size={15} />
                </button>
                <button
                  className="btn btn-quiet btn-icon"
                  title="Open Claude Code here"
                  aria-label={`Open Claude Code in ${site.name}`}
                  onClick={() => act(`claude-${site.name}`, () => api.invoke('sites:open-claude', site.path))}
                >
                  <Terminal size={15} />
                </button>
                <button
                  className="btn btn-quiet btn-icon"
                  aria-pressed={!!site.shareUrl}
                  disabled={busy.has(`share-${site.name}`)}
                  title={site.shareUrl ? 'Stop sharing' : 'Share a public link'}
                  aria-label={site.shareUrl ? `Stop sharing ${site.name}` : `Share ${site.name}`}
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
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
