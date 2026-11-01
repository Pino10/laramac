import { useState } from 'react'
import type { SiteInfo } from '@shared/types'
import { useApp } from '../store'
import NewProject from '../components/NewProject'

const kindLabel: Record<SiteInfo['kind'], string> = {
  laravel: 'Laravel',
  wordpress: 'WordPress',
  symfony: 'Symfony',
  php: 'PHP',
  node: 'Node',
  static: 'Static'
}

export default function Sites(): React.JSX.Element {
  const { sites, settings, tools, php, act, busy, setSites, notify } = useApp()
  const [creating, setCreating] = useState(false)
  const api = window.laramac
  const installedPhp = php.filter((p) => p.installed)
  const editorName = settings?.editor === 'vscode' ? 'VS Code' : 'Cursor'

  return (
    <div className="fade-in">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Every folder in <code>{settings?.wwwPath ?? '~/www'}</code> becomes a site
          </p>
        </div>
        <div className="no-drag flex gap-2">
          <button className="btn" onClick={() => api.invoke('www:reveal')}>
            Open www
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="glass p-8 text-center">
          <div className="mb-1 text-lg font-medium">No sites yet</div>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Create a project, or drop a folder into your www directory. It shows up here as{' '}
            <code>folder.{settings?.tld ?? 'test'}</code>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sites.map((site) => (
            <div key={site.path} className="glass p-4">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{site.name}</span>
                    <span className="chip">{kindLabel[site.kind]}</span>
                    {site.secure && <span className="chip chip-ok">HTTPS</span>}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--text-dim)' }}>
                    {site.domain}
                  </div>
                </div>
                <div className="no-drag flex items-center gap-2">
                  <select
                    className="input"
                    value={site.php ?? ''}
                    disabled={installedPhp.length === 0}
                    title="PHP version for this site"
                    onChange={(e) =>
                      act(`cfg-${site.name}`, () =>
                        api.invoke('sites:set-config', site.name, { php: e.target.value }).then(setSites)
                      )
                    }
                  >
                    {installedPhp.length === 0 && <option value="">No PHP</option>}
                    {installedPhp.map((p) => (
                      <option key={p.minor} value={p.minor}>
                        PHP {p.minor}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="no-drag mt-3 flex flex-wrap items-center gap-2">
                <button className="btn" onClick={() => api.invoke('sites:open-folder', site.path)}>
                  Folder
                </button>
                <button
                  className="btn"
                  onClick={() => act(`editor-${site.name}`, () => api.invoke('sites:open-editor', site.path))}
                >
                  {editorName}
                </button>
                <button
                  className="btn"
                  onClick={() => act(`claude-${site.name}`, () => api.invoke('sites:open-claude', site.path))}
                >
                  Claude Code
                </button>
                <button
                  className="btn"
                  disabled={busy.has(`cfg-${site.name}`)}
                  onClick={async () => {
                    if (!site.secure && tools && !tools.caTrusted) {
                      notify({ kind: 'info', text: 'Use "Trust local HTTPS" on the Dashboard so browsers accept the certificate.' })
                    }
                    await act(`cfg-${site.name}`, () =>
                      api.invoke('sites:set-config', site.name, { secure: !site.secure }).then(setSites)
                    )
                  }}
                >
                  {site.secure ? 'Disable HTTPS' : 'Enable HTTPS'}
                </button>
                {site.shareUrl ? (
                  <>
                    <button className="btn" onClick={() => api.invoke('tools:open-external', site.shareUrl!)}>
                      Public link
                    </button>
                    <button
                      className="btn"
                      onClick={() => act(`share-${site.name}`, () => api.invoke('sites:unshare', site.name))}
                    >
                      Stop sharing
                    </button>
                  </>
                ) : (
                  <button
                    className="btn"
                    disabled={busy.has(`share-${site.name}`)}
                    onClick={async () => {
                      const url = await act(`share-${site.name}`, () => api.invoke('sites:share', site.name))
                      if (url) {
                        navigator.clipboard?.writeText(url).catch(() => undefined)
                        notify({ kind: 'info', text: `Public link copied: ${url}` })
                      }
                    }}
                  >
                    {busy.has(`share-${site.name}`) ? 'Sharing…' : 'Share'}
                  </button>
                )}
              </div>
              {site.shareUrl && (
                <div className="mt-2 text-xs" style={{ color: 'var(--ok)', userSelect: 'text' }}>
                  Shared at {site.shareUrl}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </div>
  )
}
