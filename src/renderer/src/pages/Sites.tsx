import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  Code,
  GitBranch,
  Tag,
  Rocket,
  GitCommitHorizontal,
  Download,
  ExternalLink,
  FolderOpen,
  History,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Terminal,
  Trash2,
  Upload,
  UploadCloud,
  X,
  Loader2,
  Play,
  Square,
  ScrollText,
  Stethoscope,
  List,
  LayoutGrid,
  Sparkles,
  Wrench,
  KeyRound
} from 'lucide-react'
import type { SiteLogSource, DeployResult, GitHubRepo, GitPushOptions, GitPushResult, GitSiteStatus, SiteInfo, SnapshotInfo, SshServer, SecretHit } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, Monogram, PageHead, Switch } from '../ui'
import { useAsk } from '../components/Ask'
import { ServerDialog } from './Servers'
import { Answer } from '../components/Answer'
import { ProjectDialog, SiteGallery, SiteLogs, SiteMenu } from '../components/SiteExtras'

const AI_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  openclaw: 'OpenClaw',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  vmlx: 'vMLX',
  lmstudio: 'LM Studio',
  ollama: 'Ollama'
}

const PHP_KINDS: SiteInfo['kind'][] = ['laravel', 'wordpress', 'symfony', 'php', 'static']

/** Start, stop and watch a project's own dev server (Vite, Next.js, Django, dotnet watch...). */
function DevControl({ site, onLogs, compact }: { site: SiteInfo; onLogs: () => void; compact?: boolean }): React.JSX.Element | null {
  const { act, busy, setSites } = useApp()
  const api = window.laramac
  const key = `dev-${site.name}`
  if (site.dev) {
    const on = site.dev.running
    return (
      <div className="dev-pill" data-on={on} data-compact={compact}>
        <button
          className="dev-toggle"
          aria-label={on ? `Stop the ${site.name} dev server` : `Start the ${site.name} dev server`}
          data-tip={on ? 'Stop dev server' : 'Start dev server'}
          disabled={busy.has(key)}
          onClick={() => act(key, () => api.invoke(on ? 'dev:stop' : 'dev:start', site.name).then(setSites))}
        >
          {busy.has(key) ? <Loader2 size={13} className="spin" /> : on ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
        {!compact && <span className="dev-label">{busy.has(key) ? (on ? 'Stopping' : 'Starting') : on ? `Running :${site.dev.port}` : 'Dev server'}</span>}
        <button className="dev-logs" aria-label={`Dev server output for ${site.name}`} data-tip="Output" onClick={onLogs}>
          <ScrollText size={13} />
        </button>
      </div>
    )
  }
  if (site.devSuggestion)
    return (
      <button
        className="btn btn-sm btn-tonal"
        style={{ width: compact ? undefined : 132 }}
        disabled={busy.has(key)}
        title={`Run npm run ${site.devSuggestion} and open it at ${site.domain}`}
        onClick={() => act(key, () => api.invoke('dev:setup', site.name, site.devSuggestion!).then(setSites))}
      >
        <Play size={12} /> Set up dev
      </button>
    )
  return <span style={{ width: 132 }} />
}

function DevLogs({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { act, setSites } = useApp()
  const [text, setText] = useState('')
  const box = useRef<HTMLPreElement>(null)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.laramac.invoke('dev:logs', site.name).then((t) => {
        if (!alive) return
        setText(t)
        requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight))
      })
    }
    load()
    const t = setInterval(load, 1500)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [site.name])
  const dev = site.dev
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog push-dialog" role="dialog" aria-label={`${site.name} dev server`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">{site.name} dev server</h2>
            <p className="page-desc mono" style={{ marginTop: 4 }}>
              {dev?.command ?? ''}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <pre ref={box} className="code-block dev-out">
          {text || (dev?.running ? 'Waiting for output…' : 'Not running. Press play on the Sites page to start it.')}
        </pre>
        <BackendRow site={site} />
        <div className="end" style={{ marginTop: 14 }}>
          <button
            className="btn btn-quiet danger-text"
            style={{ marginRight: 'auto' }}
            onClick={async () => {
              const r = await act(`dev-${site.name}`, () => window.laramac.invoke('dev:setup', site.name, null))
              if (r) {
                setSites(r)
                onClose()
              }
            }}
          >
            Remove dev server
          </button>
          {dev && (
            <button className="btn" onClick={() => window.laramac.invoke('sites:open-url', `http://127.0.0.1:${dev.port}`)}>
              Open 127.0.0.1:{dev.port}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => window.laramac.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}>
            Open {site.domain}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Supabase or Firebase beside the dev server: open its dashboard, or add one. */
function BackendRow({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy, setSites } = useApp()
  const b = site.backend
  const name = b?.kind === 'supabase' ? 'Supabase' : 'Firebase'
  const run = async (key: string, fn: () => Promise<SiteInfo[]>): Promise<void> => {
    const r = await act(key, fn)
    if (r) setSites(r)
  }
  return (
    <div className="backend-row">
      {b ? (
        <>
          <span>
            <strong>{name}</strong> <span className="hint">{b.kind === 'supabase' ? 'runs in containers and starts with the dev server' : b.running ? 'emulators running' : 'emulators start with the dev server'}</span>
          </span>
          {b.studioUrl && (
            <button className="btn btn-sm" onClick={() => window.laramac.invoke('sites:open-url', b.studioUrl!)}>
              {b.kind === 'supabase' ? 'Open Studio' : 'Open Emulator UI'}
            </button>
          )}
          <button className="btn btn-sm" disabled={busy.has(`be-${site.name}`)} onClick={() => run(`be-${site.name}`, () => window.laramac.invoke('backends:start', site.name))}>
            Start
          </button>
          <button className="btn btn-sm btn-quiet" onClick={() => run(`be-${site.name}`, () => window.laramac.invoke('backends:stop', site.name))}>
            Stop
          </button>
        </>
      ) : (
        <>
          <span className="hint">Add a backend that runs on this Mac:</span>
          {(['supabase', 'firebase'] as const).map((k) => (
            <button key={k} className="btn btn-sm" disabled={busy.has(`be-${site.name}`)} onClick={() => run(`be-${site.name}`, () => window.laramac.invoke('backends:add', site.name, k))}>
              {busy.has(`be-${site.name}`) ? 'Setting up…' : k === 'supabase' ? 'Add Supabase' : 'Add Firebase'}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

function SiteDoctor({ site, aiName, onClose }: { site: SiteInfo; aiName: string; onClose: () => void }): React.JSX.Element {
  const { act, busy, setPage, settings } = useApp()
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [sources, setSources] = useState<SiteLogSource[]>([])
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const ask = async (history: { role: 'user' | 'assistant'; content: string }[]): Promise<void> => {
    setError(null)
    try {
      const r = await window.laramac.invoke('sites:doctor', site.name, history)
      setSources(r.sources)
      setTurns([...history, { role: 'assistant', content: r.reply }])
    } catch (err) {
      setError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }))
  }
  useEffect(() => {
    void act('doctor', () => ask([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const thinking = busy.has('doctor')
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog push-dialog doctor" role="dialog" aria-label={`Explain errors in ${site.name}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">
              <Stethoscope size={18} style={{ verticalAlign: -3, marginRight: 8 }} />
              What is wrong with {site.name}?
            </h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Your local model reads this site’s recent logs and explains them. Passwords, tokens and keys are blanked first, and nothing leaves your Mac unless your model server is elsewhere.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {sources.length > 0 && (
          <div className="doctor-sources">
            <span className="hint">Read:</span>
            {sources.map((s) => (
              <button key={s.path} className="tag" title={s.path} onClick={() => window.laramac.invoke('sites:open-log', site.name, s.path)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="doctor-thread">
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="bubble bubble-user">
                {t.content}
              </div>
            ) : (
              <Answer key={i} text={t.content} />
            )
          )}
          {thinking && (
            <div className="doctor-wait">
              <Loader2 size={16} className="spin" /> Reading the logs and asking {settings?.llm.model || 'your model'}… local models can take a minute.
            </div>
          )}
          {error && (
            <div className="errbox" style={{ gridColumn: 'auto' }}>
              {error}
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    onClose()
                    setPage('tools')
                  }}
                >
                  <Wrench size={13} /> Check model servers in Tools
                </button>
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
        <div className="doctor-input">
          <input
            className="input"
            placeholder="Ask a follow-up, like “show me the exact change”"
            value={input}
            disabled={thinking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim() && !thinking) {
                const next = [...turns, { role: 'user' as const, content: input.trim() }]
                setTurns(next)
                setInput('')
                void act('doctor', () => ask(next))
              }
            }}
          />
          <button className="btn" disabled={thinking} onClick={() => void act('doctor', () => ask([]))}>
            Read again
          </button>
          <button className="btn btn-primary" onClick={() => window.laramac.invoke('sites:open-claude', site.path)}>
            <Sparkles size={14} /> Fix with {aiName}
          </button>
        </div>
      </div>
    </div>
  )
}

const kindLabel: Record<SiteInfo['kind'], string> = {
  laravel: 'Laravel',
  wordpress: 'WordPress',
  symfony: 'Symfony',
  php: 'PHP',
  node: 'Node',
  python: 'Python',
  dotnet: '.NET',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  static: 'Static'
}

export default function Sites(): React.JSX.Element {
  const { sites, settings, tools, php, act, busy, setSites, notify, setNewProject, setImportOpen, setPage } = useApp()
  const [query, setQuery] = useState('')
  const api = window.laramac
  const installedPhp = php.filter((p) => p.installed)
  const editor = settings?.editor === 'vscode' ? 'VS Code' : 'Cursor'
  const aiName = AI_NAMES[settings?.aiTool ?? 'claude'] ?? 'AI tool'
  const [snapFor, setSnapFor] = useState<SiteInfo | null>(null)
  const [deployFor, setDeployFor] = useState<SiteInfo | null>(null)
  const [pushFor, setPushFor] = useState<SiteInfo | null>(null)
  const [logsFor, setLogsFor] = useState<SiteInfo | null>(null)
  const [doctorFor, setDoctorFor] = useState<SiteInfo | null>(null)
  const [siteLogsFor, setSiteLogsFor] = useState<SiteInfo | null>(null)
  const [projectFor, setProjectFor] = useState<SiteInfo | null>(null)
  const [view, setViewState] = useState<'list' | 'gallery'>(() => {
    try {
      return localStorage.getItem('sites-view') === 'gallery' ? 'gallery' : 'list'
    } catch {
      return 'list'
    }
  })
  const setView = (v: 'list' | 'gallery'): void => {
    setViewState(v)
    try {
      localStorage.setItem('sites-view', v)
    } catch {
      // Storage can be unavailable; the choice just is not remembered.
    }
  }
  const menuFor = (s: SiteInfo): React.ReactNode => <SiteMenu site={s} onLogs={() => setSiteLogsFor(s)} onProject={() => setProjectFor(s)} onDoctor={() => setDoctorFor(s)} />
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
          <div className="seg" role="radiogroup" aria-label="View" style={{ marginLeft: 'auto' }}>
            <button role="radio" aria-checked={view === 'list'} onClick={() => setView('list')}>
              <List size={14} /> List
            </button>
            <button role="radio" aria-checked={view === 'gallery'} onClick={() => setView('gallery')}>
              <LayoutGrid size={14} /> Gallery
            </button>
          </div>
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
            <button className="btn" onClick={() => setNewProject(true)}>
              <Plus size={14} /> WordPress or PHP
            </button>
            <button className="btn btn-primary" onClick={() => setPage('starters')}>
              <Rocket size={14} /> Browse starters
            </button>
          </div>
        </div>
      ) : view === 'gallery' ? (
        <>
          {shown.length === 0 && <div className="empty dim">No site matches “{query}”.</div>}
          <SiteGallery
            sites={shown}
            kindLabel={kindLabel}
            aiName={aiName}
            renderDev={(s) => (s.dev || s.devSuggestion ? <DevControl site={s} onLogs={() => setLogsFor(s)} /> : null)}
            renderMenu={menuFor}
          />
        </>
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
                  <button
                    className="link row-sub"
                    style={{ display: 'block', color: 'var(--ink-3)' }}
                    onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}
                  >
                    {site.secure ? 'https://' : 'http://'}
                    {site.domain}
                  </button>
                )}
              </div>
              <div className="chips">
                {PHP_KINDS.includes(site.kind) && (site.dev || site.devSuggestion) && <DevControl site={site} compact onLogs={() => setLogsFor(site)} />}
                {site.projectFile === 'new' && (
                  <button className="tag tag-accent" style={{ border: 0, cursor: 'pointer' }} title="This project has a laramac.yml" onClick={() => setProjectFor(site)}>
                    laramac.yml · Set up
                  </button>
                )}
                <span className="tag">{kindLabel[site.kind]}</span>
              </div>
              {PHP_KINDS.includes(site.kind) ? (
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
              ) : (
                <DevControl site={site} onLogs={() => setLogsFor(site)} />
              )}
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
                <IconBtn
                  label={`Open ${site.name}`}
                  title="Open in browser"
                  onClick={() => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)}
                >
                  <ExternalLink size={18} />
                </IconBtn>
                <IconBtn label={`Show ${site.name} in Finder`} title="Show in Finder" onClick={() => api.invoke('sites:open-folder', site.path)}>
                  <FolderOpen size={18} />
                </IconBtn>
                <IconBtn
                  label={`Open ${site.name} in ${editor}`}
                  title={`Open in ${editor}`}
                  onClick={() => act(`editor-${site.name}`, () => api.invoke('sites:open-editor', site.path))}
                >
                  <Code size={18} />
                </IconBtn>
                <IconBtn
                  label={`${aiName} in ${site.name}`}
                  title={`Open ${aiName} here`}
                  onClick={() => act(`claude-${site.name}`, () => api.invoke('sites:open-claude', site.path))}
                >
                  <Terminal size={18} />
                </IconBtn>
                <IconBtn label={`Explain errors in ${site.name}`} title="Explain errors (AI)" onClick={() => setDoctorFor(site)}>
                  <Stethoscope size={18} />
                </IconBtn>
                <IconBtn label={`Push ${site.name} to GitHub`} title="Push to GitHub" onClick={() => setPushFor(site)}>
                  <GitBranch size={18} />
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
                {menuFor(site)}
              </div>
            </div>
          ))}
        </div>
      )}
      {snapFor && <SnapshotsDialog site={snapFor} onClose={() => setSnapFor(null)} />}
      {deployFor && <DeployDialog site={deployFor} onClose={() => setDeployFor(null)} />}
      {doctorFor && <SiteDoctor site={doctorFor} aiName={aiName} onClose={() => setDoctorFor(null)} />}
      {logsFor && <DevLogs site={sites.find((x) => x.name === logsFor.name) ?? logsFor} onClose={() => setLogsFor(null)} />}
      {pushFor && <PushDialog site={pushFor} onClose={() => setPushFor(null)} />}
      {siteLogsFor && <SiteLogs site={siteLogsFor} onClose={() => setSiteLogsFor(null)} />}
      {projectFor && <ProjectDialog site={projectFor} onClose={() => setProjectFor(null)} />}
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
          <input
            className="input"
            placeholder="What is this version? (optional)"
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
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
      <div onMouseDown={(e) => e.stopPropagation()}>{askDialog}</div>
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
  const [adding, setAdding] = useState(false)
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
            <span>Your hosting account or VPS, with SFTP, FTPS or FTP. It is saved under Servers too.</span>
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
              <Plus size={14} /> Add server
            </button>
          </div>
        ) : (
          <div className="deploy-form">
            <div className="field">
              <label htmlFor="dp-server">Server</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select id="dp-server" className="input" style={{ flex: 1 }} value={serverId} onChange={(e) => setServerId(e.target.value)}>
                  {servers?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.protocol === 'sftp' ? 'SFTP' : x.protocol.toUpperCase()}, {x.user}@{x.host})
                    </option>
                  ))}
                </select>
                <button className="btn btn-tonal" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Add server
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="dp-path">Folder on the server</label>
              <input
                id="dp-path"
                className="input mono"
                placeholder="/var/www/mysite or public_html"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="dp-ex">Also leave out</label>
              <input
                id="dp-ex"
                className="input mono"
                placeholder="uploads, *.sql, storage/app"
                value={excludes}
                onChange={(e) => setExcludes(e.target.value)}
              />
              <span className="hint">
                Always left out: node_modules, .git, .env, .DS_Store, editor folders and logs. Your server keeps its own .env and config.
              </span>
            </div>
            <label className="check">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Upload every file, even unchanged ones
            </label>
            {result && !job && (
              <div className="deploy-result">
                <strong>Deployed</strong>
                <span>
                  {result.uploaded} {result.uploaded === 1 ? 'file' : 'files'} sent ({formatBytes(result.bytes)}), {result.skipped} already up to date, in{' '}
                  {result.seconds}s.
                </span>
              </div>
            )}
            {job && (
              <div className="deploy-result">
                {job.label}
                {job.percent !== null ? `, ${job.percent}%` : ''}
              </div>
            )}
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
      <div onMouseDown={(e) => e.stopPropagation()}>{askDialog}</div>
      {adding && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <ServerDialog
            initial={{ name: '', host: '', port: 21, user: '', auth: 'password', protocol: 'ftps' }}
            onClose={() => setAdding(false)}
            onSaved={(list) => {
              const added = list.find((x) => !servers?.some((y) => y.id === x.id))
              setServers(list)
              if (added) setServerId(added.id)
              setAdding(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

const PUSH_MODES: { id: GitPushOptions['mode']; title: string; desc: string }[] = [
  { id: 'main', title: 'Update main', desc: 'Your changes go straight onto the main branch.' },
  { id: 'branch', title: 'New branch', desc: 'Keep main as it is and push to a branch you can review first.' },
  { id: 'tag', title: 'New version tag', desc: 'Update main and mark this point as a version, like v1.2.0.' },
  { id: 'release', title: 'New release', desc: 'A version tag plus a GitHub release with notes.' }
]

function PushDialog({ site, onClose }: { site: SiteInfo; onClose: () => void }): React.JSX.Element {
  const { act, busy, notify, setPage } = useApp()
  const api = window.laramac
  const [acc, setAcc] = useState<boolean | null>(null)
  const [st, setSt] = useState<(GitSiteStatus & { next: string }) | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [target, setTarget] = useState<'new' | string>('new')
  const [newName, setNewName] = useState(site.name)
  const [priv, setPriv] = useState(true)
  const [mode, setMode] = useState<GitPushOptions['mode']>('main')
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const [tag, setTag] = useState('')
  const [notes, setNotes] = useState('')
  const [replace, setReplace] = useState(false)
  const [done, setDone] = useState<GitPushResult | null>(null)
  const [changeRepo, setChangeRepo] = useState(false)
  const [keys, setKeys] = useState<SecretHit[] | null>(null)
  const [keysOk, setKeysOk] = useState(false)
  const picking = !st?.remote || changeRepo

  useEffect(() => {
    // Looks for passwords and API keys in the files that would be pushed, before anything leaves the Mac.
    void api
      .invoke('sites:secret-check', site.name)
      .then(setKeys)
      .catch(() => setKeys([]))
  }, [api, site.name])

  useEffect(() => {
    void api.invoke('github:account').then(async (a) => {
      setAcc(!!a.account)
      if (!a.account) return
      const s = await api.invoke('github:site-status', site.path)
      setSt(s)
      setTag(s.next)
      setRepos(await api.invoke('github:repos').catch(() => []))
    })
  }, [api, site.path])

  const run = async (): Promise<void> => {
    const o: GitPushOptions = { mode, message, branch, tag, notes, replace }
    if (picking) {
      if (target === 'new') o.create = { name: newName.trim(), private: priv }
      else o.repo = target
    }
    const r = await act(`push-${site.name}`, () => api.invoke('github:push', site.path, o))
    if (r) {
      setDone(r)
      notify({ kind: 'info', text: `${site.name} is on GitHub.` })
    }
  }

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog push-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Push {site.name} to GitHub</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              {st?.remote && !changeRepo ? (
                <>
                  To <span className="mono">{st.remote}</span>
                  {st.changed ? `, with ${st.changed} changed ${st.changed === 1 ? 'file' : 'files'}` : ', nothing new to commit'}.{' '}
                  <button className="link" onClick={() => setChangeRepo(true)}>
                    Push somewhere else
                  </button>
                  {' · '}
                  <button
                    className="link"
                    disabled={busy.has(`pull-${site.name}`)}
                    onClick={async () => {
                      const msg = await act(`pull-${site.name}`, () => api.invoke('github:pull', site.path))
                      if (msg) {
                        notify({ kind: 'info', text: msg })
                        setSt(await api.invoke('github:site-status', site.path))
                      }
                    }}
                  >
                    {busy.has(`pull-${site.name}`) ? 'Pulling…' : 'Pull latest from GitHub'}
                  </button>
                </>
              ) : (
                'Commits everything in the site (except .env, node_modules and logs) and sends it to GitHub.'
              )}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>

        {acc === false ? (
          <div className="empty-state" style={{ padding: '28px 8px' }}>
            <strong>Connect GitHub first</strong>
            <span>Sign in once on the GitHub page, then push from here.</span>
            <button
              className="btn btn-primary"
              style={{ marginTop: 10 }}
              onClick={() => {
                onClose()
                setPage('github')
              }}
            >
              Go to GitHub
            </button>
          </div>
        ) : done ? (
          <div className="deploy-result" style={{ marginTop: 18 }}>
            <strong>Pushed</strong>
            <span>
              Commit {done.commit} is on GitHub as{' '}
              {done.mode === 'main' ? `the newest ${done.ref}` : done.mode === 'branch' ? `branch ${done.ref}` : `${done.mode} ${done.ref}`}.
            </span>
            {done.url && (
              <button className="link" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => api.invoke('tools:open-external', done.url!)}>
                {done.mode === 'branch' ? 'Open a pull request on GitHub' : 'Open on GitHub'}
              </button>
            )}
          </div>
        ) : st === null ? (
          <div className="hint" style={{ padding: '24px 0' }}>
            Looking at the project…
          </div>
        ) : (
          <div className="deploy-form">
            {picking && (
              <div className="field">
                <label htmlFor="push-repo">Repository</label>
                <select id="push-repo" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">Create a new repository</option>
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName} {r.private ? '(private)' : ''}
                    </option>
                  ))}
                </select>
                {target === 'new' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      className="input mono"
                      style={{ flex: 1 }}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      aria-label="New repository name"
                    />
                    <div className="seg" role="radiogroup" aria-label="Visibility">
                      <button role="radio" aria-checked={priv} onClick={() => setPriv(true)}>
                        <Lock size={12} /> Private
                      </button>
                      <button role="radio" aria-checked={!priv} onClick={() => setPriv(false)}>
                        Public
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <span className="field-label" style={{ marginTop: 6 }}>
              How should it go up?
            </span>
            <div className="push-modes" role="radiogroup">
              {PUSH_MODES.map((m) => (
                <button key={m.id} className="choice" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}>
                  <span className="push-mode-title">
                    {m.id === 'main' ? (
                      <GitCommitHorizontal size={15} />
                    ) : m.id === 'branch' ? (
                      <GitBranch size={15} />
                    ) : m.id === 'tag' ? (
                      <Tag size={15} />
                    ) : (
                      <Rocket size={15} />
                    )}{' '}
                    {m.title}
                  </span>
                  <span className="row-sub" style={{ whiteSpace: 'normal' }}>
                    {m.desc}
                  </span>
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="push-msg">What changed</label>
              <input id="push-msg" className="input" placeholder="Fix the contact form" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {mode === 'branch' && (
              <div className="field">
                <label htmlFor="push-branch">Branch name</label>
                <input id="push-branch" className="input mono" placeholder="feature/new-header" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
            )}
            {(mode === 'tag' || mode === 'release') && (
              <div className="field">
                <label htmlFor="push-tag">Version</label>
                <input id="push-tag" className="input mono" value={tag} onChange={(e) => setTag(e.target.value)} />
                {st.lastTag && <span className="hint">The last version was {st.lastTag}.</span>}
              </div>
            )}
            {mode === 'release' && (
              <div className="field">
                <label htmlFor="push-notes">Release notes</label>
                <textarea
                  id="push-notes"
                  className="apic-code"
                  style={{ minHeight: 90, fontFamily: 'inherit' }}
                  placeholder="Leave empty and GitHub writes them from your commits."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
            {mode !== 'branch' && (
              <label className="check">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace what is on GitHub if it has changes this Mac
                does not
              </label>
            )}
            {keys && keys.length > 0 && (
              <div className="push-keys">
                <strong>
                  <KeyRound size={13} /> {keys.length === 1 ? 'This looks like a password or key' : `${keys.length} things look like passwords or keys`}
                </strong>
                <ul>
                  {keys.slice(0, 6).map((k) => (
                    <li key={`${k.file}:${k.line}`}>
                      {k.kind} in <span className="mono">{k.file}:{k.line}</span>
                    </li>
                  ))}
                  {keys.length > 6 && <li>and {keys.length - 6} more</li>}
                </ul>
                <span className="hint">Move them to .env (which Git ignores) before pushing. Anything pushed stays in the history, even after you delete it.</span>
                <label className="check">
                  <input type="checkbox" checked={keysOk} onChange={(e) => setKeysOk(e.target.checked)} /> I checked these, they are safe to push
                </label>
              </div>
            )}
            <div className="end" style={{ marginTop: 8 }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  busy.has(`push-${site.name}`) ||
                  (!!keys && keys.length > 0 && !keysOk) ||
                  (mode === 'branch' && !branch.trim()) ||
                  ((mode === 'tag' || mode === 'release') && !tag.trim()) ||
                  (picking && target === 'new' && !newName.trim())
                }
                onClick={run}
              >
                <GitBranch size={15} /> {busy.has(`push-${site.name}`) ? 'Pushing…' : mode === 'release' ? 'Push and release' : 'Push'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
