import { useEffect, useState } from 'react'
import { Camera, Code, Download, ExternalLink, FolderOpen, History, Lock, Plus, RotateCcw, Search, Share2, Terminal, Trash2, Upload, UploadCloud, X } from 'lucide-react'
import type { DeployResult, SiteInfo, SnapshotInfo, SshServer } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, Monogram, PageHead, Switch } from '../ui'
import { useAsk } from '../components/Ask'

const AI_NAMES: Record<string, string> = { claude: 'Claude Code', opencode: 'OpenCode', openclaw: 'OpenClaw', codex: 'Codex', gemini: 'Gemini CLI', vmlx: 'vMLX', lmstudio: 'LM Studio', ollama: 'Ollama' }

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
  const aiName = AI_NAMES[settings?.aiTool ?? 'claude'] ?? 'AI tool'
  const [snapFor, setSnapFor] = useState<SiteInfo | null>(null)
  const [deployFor, setDeployFor] = useState<SiteInfo | null>(null)
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
                  <ExternalLink size={18} />
                </IconBtn>
                <IconBtn label={`Show ${site.name} in Finder`} title="Show in Finder" onClick={() => api.invoke('sites:open-folder', site.path)}>
                  <FolderOpen size={18} />
                </IconBtn>
                <IconBtn label={`Open ${site.name} in ${editor}`} title={`Open in ${editor}`} onClick={() => act(`editor-${site.name}`, () => api.invoke('sites:open-editor', site.path))}>
                  <Code size={18} />
                </IconBtn>
                <IconBtn label={`${aiName} in ${site.name}`} title={`Open ${aiName} here`} onClick={() => act(`claude-${site.name}`, () => api.invoke('sites:open-claude', site.path))}>
                  <Terminal size={18} />
                </IconBtn>
                <IconBtn label={`Deploy ${site.name}`} title="Deploy to a server" onClick={() => setDeployFor(site)}>
                  <UploadCloud size={18} />
                </IconBtn>
                <IconBtn label={`Snapshots of ${site.name}`} title="Snapshots" onClick={() => setSnapFor(site)}>
                  <History size={18} />
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
                  <Share2 size={18} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
      {snapFor && <SnapshotsDialog site={snapFor} onClose={() => setSnapFor(null)} />}
      {deployFor && <DeployDialog site={deployFor} onClose={() => setDeployFor(null)} />}
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
    <button className="icon-btn" aria-label={label} data-tip={title} aria-pressed={pressed} disabled={disabled} onClick={() => void onClick()}>
      {children}
    </button>
  )
}

function SnapshotsDialog({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [list, setList] = useState<SnapshotInfo[] | null>(null)
  const [note, setNote] = useState('')
  const [ask, askDialog] = useAsk()

  useEffect(() => {
    void api.invoke('snapshots:list', site.path).then(setList)
  }, [api, site.path])

  const save = async (): Promise<void> => {
    const next = await act(`snap-${site.name}`, () => api.invoke('snapshots:create', site.path, note))
    if (next) {
      setList(next)
      setNote('')
      notify({ kind: next[0]?.databaseSkipped ? 'error' : 'info', text: next[0]?.databaseSkipped ?? 'Snapshot saved.' })
    }
  }

  const restore = async (s: SnapshotInfo): Promise<void> => {
    const ok = await ask({
      title: `Restore ${site.name} to ${new Date(s.createdAt).toLocaleString()}?`,
      label: `Files${s.database ? ` and the ${s.database.name} database` : ''} go back to how they were. The current state is saved as a snapshot first, so you can undo this.`,
      yesNo: true,
      confirm: 'Restore'
    })
    if (!ok) return
    const next = await act(`snap-restore-${s.id}`, () => api.invoke('snapshots:restore', site.path, s.id))
    if (next) {
      setList(next)
      notify({ kind: 'info', text: `${site.name} is restored.` })
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              Snapshots of {site.name}
            </h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Save the site&apos;s files and database together, and go back to any snapshot later.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="snap-new">
          <input className="input" placeholder="What is this version? (optional)" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn btn-primary" disabled={busy.has(`snap-${site.name}`)} onClick={save}>
            <Camera size={15} /> {busy.has(`snap-${site.name}`) ? 'Saving…' : 'Save snapshot'}
          </button>
        </div>
        <div className="snap-list">
          {list === null && <div className="empty dim">Loading…</div>}
          {list?.length === 0 && <div className="empty dim">No snapshots yet. Save one before a big change.</div>}
          {list?.map((s) => (
            <div key={s.id} className="snap-row">
              <span className="snap-dot" data-db={!!s.database} />
              <span style={{ minWidth: 0 }}>
                <strong>{s.note || 'Snapshot'}</strong>
                <small>
                  {new Date(s.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}, {formatBytes(s.bytes)},{' '}
                  {s.database ? `files and ${s.database.name}` : s.databaseSkipped ? 'files only (database was off)' : 'files'}
                </small>
              </span>
              <span className="end">
                <button className="btn btn-tonal btn-sm" disabled={busy.has(`snap-restore-${s.id}`)} onClick={() => restore(s)}>
                  <RotateCcw size={14} /> Restore
                </button>
                <button
                  className="icon-btn"
                  data-tip="Export"
                  aria-label="Export snapshot"
                  onClick={async () => {
                    const path = await act(`snap-export-${s.id}`, () => api.invoke('snapshots:export', site.path, s.id))
                    if (path) notify({ kind: 'info', text: 'Exported. Open it with Import on any Mac running Laramac.' })
                  }}
                >
                  <Download />
                </button>
                <button
                  className="icon-btn danger-text"
                  data-tip="Delete"
                  aria-label="Delete snapshot"
                  onClick={async () => {
                    if (!(await ask({ title: 'Delete this snapshot?', yesNo: true, confirm: 'Delete', danger: true }))) return
                    const next = await act(`snap-del-${s.id}`, () => api.invoke('snapshots:delete', site.path, s.id))
                    if (next) setList(next)
                  }}
                >
                  <Trash2 />
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
      {askDialog}
    </div>
  )
}

function DeployDialog({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { settings, act, busy, notify, setPage, jobs } = useApp()
  const api = window.laramac
  const saved = settings?.siteConfig[site.name]?.deploy
  const [servers, setServers] = useState<SshServer[] | null>(null)
  const [serverId, setServerId] = useState(saved?.serverId ?? '')
  const [remotePath, setRemotePath] = useState(saved?.remotePath ?? '')
  const [excludes, setExcludes] = useState((saved?.excludes ?? []).join(', '))
  const [force, setForce] = useState(false)
  const [result, setResult] = useState<DeployResult | null>(null)
  const [ask, askDialog] = useAsk()
  const key = `deploy-${site.name}`
  const job = jobs.find((j) => j.label.startsWith(`Deploying ${site.name}`) && j.status === 'running')

  useEffect(() => {
    void api.invoke('ssh:list').then((list) => {
      setServers(list)
      if (!serverId && list[0]) setServerId(list[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const server = servers?.find((x) => x.id === serverId)
  const run = async (): Promise<void> => {
    let pass: string | null = null
    if (server?.auth === 'key') {
      const p = await ask({ title: `Connect to ${server.name}`, label: 'Key passphrase (leave empty if it has none)', secret: true, confirm: 'Deploy' })
      if (p === null) return
      pass = p || null
    }
    const target = {
      serverId,
      remotePath,
      excludes: excludes
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    }
    const res = await act(key, () => api.invoke('deploy:run', site.path, target, force, pass))
    if (res) {
      setResult(res)
      notify({ kind: 'info', text: `${site.name} is on ${server?.name}.` })
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              Deploy {site.name}
            </h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Upload this site to a server over SFTP or FTP. Only new and changed files are sent, and nothing on the server is deleted.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>

        {servers?.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 8px' }}>
            <strong>Add a server first</strong>
            <span>Save your hosting account or VPS under Servers, with SFTP, FTPS or FTP.</span>
            <button
              className="btn btn-primary"
              style={{ marginTop: 10 }}
              onClick={() => {
                onClose()
                setPage('servers')
              }}
            >
              Go to Servers
            </button>
          </div>
        ) : (
          <div className="deploy-form">
            <div className="field">
              <label htmlFor="dp-server">Server</label>
              <select id="dp-server" className="input" value={serverId} onChange={(e) => setServerId(e.target.value)}>
                {servers?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.protocol === 'sftp' ? 'SFTP' : x.protocol.toUpperCase()}, {x.user}@{x.host})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dp-path">Folder on the server</label>
              <input id="dp-path" className="input mono" placeholder="/var/www/mysite or public_html" value={remotePath} onChange={(e) => setRemotePath(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dp-ex">Also leave out</label>
              <input id="dp-ex" className="input mono" placeholder="uploads, *.sql, storage/app" value={excludes} onChange={(e) => setExcludes(e.target.value)} />
              <span className="hint">Always left out: node_modules, .git, .env, .DS_Store, editor folders and logs. Your server keeps its own .env and config.</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Upload every file, even unchanged ones
            </label>
            {result && !job && (
              <div className="deploy-result">
                <strong>Deployed</strong>
                <span>
                  {result.uploaded} {result.uploaded === 1 ? 'file' : 'files'} sent ({formatBytes(result.bytes)}), {result.skipped} already up to date, in {result.seconds}s.
                </span>
              </div>
            )}
            {job && <div className="deploy-result">{job.label}{job.percent !== null ? `, ${job.percent}%` : ''}</div>}
            <div className="end" style={{ marginTop: 6 }}>
              <button className="btn" onClick={onClose}>
                Close
              </button>
              <button className="btn btn-primary" disabled={!serverId || !remotePath.trim() || busy.has(key)} onClick={run}>
                <UploadCloud size={15} /> {busy.has(key) ? 'Deploying…' : 'Deploy'}
              </button>
            </div>
          </div>
        )}
      </div>
      {askDialog}
    </div>
  )
}
