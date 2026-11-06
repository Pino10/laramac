import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleCheck, CircleDashed, CircleX, Download, ExternalLink, GitPullRequest, Info, Lock, LogOut, Plus, RefreshCw, Search, X } from 'lucide-react'
import type { AzureAccount, AzureProject, AzureRepo, AzureRepoDetails } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'
import AfterClone from '../components/AfterClone'

const ago = (iso: string | null): string => {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/** Azure DevOps: every repository in your organization, with pull requests and pipelines. */
export default function Azure(): React.JSX.Element {
  const { act, busy, notify, sites, setSites } = useApp()
  const api = window.laramac
  const [acc, setAcc] = useState<AzureAccount | null | undefined>(undefined)
  const [repos, setRepos] = useState<AzureRepo[] | null>(null)
  const [projects, setProjects] = useState<AzureProject[]>([])
  const [project, setProject] = useState('all')
  const [query, setQuery] = useState('')
  const [org, setOrg] = useState('')
  const [pat, setPat] = useState('')
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<AzureRepo | null>(null)
  const [cloned, setCloned] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([act('az-repos', () => api.invoke('azure:repos')), api.invoke('azure:projects').catch(() => [])])
    if (r) setRepos(r)
    setProjects(p)
  }, [act, api])

  useEffect(() => {
    void api.invoke('azure:account').then((a) => {
      setAcc(a)
      if (a) void load()
    })
  }, [api, load])

  const shown = useMemo(() => (repos ?? []).filter((r) => (project === 'all' || r.projectId === project) && `${r.project} ${r.name}`.toLowerCase().includes(query.toLowerCase())), [repos, project, query])
  const local = new Set(sites.map((s) => s.name.toLowerCase()))

  if (acc === undefined) return <></>
  if (!acc)
    return (
      <>
        <PageHead title="Azure DevOps" desc="See every repository in your organization, its pull requests and pipelines, clone it into your projects folder, and push your sites." />
        <div className="gh-connect glass">
          <span className="mcp-mark" aria-hidden>
            <Lock size={20} />
          </span>
          <div className="mcp-body">
            <strong>Connect Azure DevOps</strong>
            <span>
              Make a personal access token in Azure DevOps (User settings, Personal access tokens) with <b>Code: read and write</b>, <b>Build: read</b> and <b>Project and team: read</b>. Laramac keeps it encrypted in the macOS Keychain and sends it only to dev.azure.com.
            </span>
            <div className="az-form">
              <input className="input" placeholder="Organization, as in dev.azure.com/organization" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="off" />
              <input className="input" type="password" placeholder="Personal access token" value={pat} onChange={(e) => setPat(e.target.value)} autoComplete="off" />
            </div>
            <div className="mcp-actions">
              <button
                className="btn btn-primary"
                disabled={!org.trim() || !pat.trim() || busy.has('az-sign-in')}
                onClick={async () => {
                  const a = await act('az-sign-in', () => api.invoke('azure:sign-in', org, pat))
                  if (a) {
                    setAcc(a)
                    setPat('')
                    notify({ kind: 'info', text: `Connected to ${a.org} as ${a.name}.` })
                    await load()
                  }
                }}
              >
                {busy.has('az-sign-in') ? 'Connecting…' : 'Connect'}
              </button>
              <button className="btn btn-quiet" disabled={!org.trim()} onClick={() => api.invoke('tools:open-external', `https://dev.azure.com/${encodeURIComponent(org.trim())}/_usersSettings/tokens`)}>
                <ExternalLink size={14} /> Make a token
              </button>
            </div>
          </div>
        </div>
      </>
    )

  return (
    <>
      <PageHead title="Azure DevOps" desc={`${acc.org}, signed in as ${acc.name}. Clone a repository to work on it, or push a site from its page.`}>
        <button className="btn" disabled={busy.has('az-repos')} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New repository
        </button>
        <button
          className="btn btn-quiet"
          onClick={async () => {
            await api.invoke('azure:sign-out')
            setAcc(null)
            setRepos(null)
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </PageHead>
      <div className="gh-toolbar">
        <div className="searchbox glass" style={{ flex: 1, maxWidth: 420 }}>
          <Search size={14} />
          <input placeholder="Find a repository" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input select" style={{ width: 240 }} value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="all">All projects ({projects.length})</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {cloned && <AfterClone name={cloned} onClose={() => setCloned(null)} />}
      {repos === null ? (
        <div className="group empty-state">Loading your repositories…</div>
      ) : shown.length === 0 ? (
        <div className="group empty-state">No repository matches.</div>
      ) : (
        <div className="gh-grid">
          {shown.map((r) => {
            const here = local.has(r.name.toLowerCase())
            const cloning = busy.has(`az-clone-${r.id}`)
            return (
              <div key={r.id} className="card glass gh-repo">
                <div className="gh-repo-head">
                  <span className="gh-owner">{r.project} /</span>
                  <button className="gh-name" onClick={() => setOpen(r)}>
                    {r.name}
                  </button>
                  {r.disabled && <span className="tag">Disabled</span>}
                  {r.empty && <span className="tag">Empty</span>}
                </div>
                <p className="gh-desc">{r.empty ? <span className="hint">No commits yet</span> : <span className="hint">Open it to see branches, commits, pull requests and pipelines.</span>}</p>
                <div className="gh-meta">
                  <span>{r.defaultBranch}</span>
                  <span>{r.size < 1024 * 1024 ? `${Math.max(1, Math.round(r.size / 1024))} KB` : `${(r.size / 1024 / 1024).toFixed(1)} MB`}</span>
                </div>
                <div className="ai-actions">
                  {here ? (
                    <span className="tag tag-accent">In your projects</span>
                  ) : (
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={r.empty || r.disabled || cloning}
                      onClick={async () => {
                        const next = await act(`az-clone-${r.id}`, () => api.invoke('azure:clone', r.id))
                        if (next) {
                          setSites(next)
                          setCloned(next.find((x) => x.name.toLowerCase() === r.name.toLowerCase())?.name ?? r.name)
                        }
                      }}
                    >
                      <Download size={14} /> {cloning ? 'Cloning…' : 'Clone to projects'}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="icon-btn" data-tip="Branches, commits, pull requests and pipelines" aria-label={`Details of ${r.name}`} onClick={() => setOpen(r)}>
                    <Info />
                  </button>
                  <button className="icon-btn" aria-label={`Open ${r.name} in Azure DevOps`} data-tip="Open in Azure DevOps" onClick={() => api.invoke('tools:open-external', r.url)}>
                    <ExternalLink />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {creating && <CreateAzureRepo projects={projects} onClose={() => setCreating(false)} onCreated={(r) => setRepos([r, ...(repos ?? [])])} />}
      {open && <AzureDetails repo={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function CreateAzureRepo({ projects, onClose, onCreated }: { projects: AzureProject[]; onClose: () => void; onCreated: (r: AzureRepo) => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [name, setName] = useState('')
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="New Azure DevOps repository">
        <div className="snap-head">
          <h2 className="page-title">New repository</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="deploy-form">
        <label className="field">
          <span className="field-label">Project</span>
          <select className="input select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" autoFocus />
        </label>
        <p className="hint">It starts empty. Push a site to it from the site’s page (Ship, then Azure DevOps).</p>
        <div className="end" style={{ marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!projectId || !name.trim() || busy.has('az-create')}
            onClick={async () => {
              const r = await act('az-create', () => window.laramac.invoke('azure:create', { projectId, name, clone: false }))
              if (r) {
                onCreated(r.repo)
                onClose()
              }
            }}
          >
            {busy.has('az-create') ? 'Creating…' : 'Create'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function BuildIcon({ status, result }: { status: string; result: string | null }): React.JSX.Element {
  if (status !== 'completed') return <CircleDashed size={14} className="spin-slow" />
  if (result === 'succeeded') return <CircleCheck size={14} style={{ color: 'var(--ok)' }} />
  if (result === 'partiallySucceeded') return <CircleCheck size={14} style={{ color: 'var(--warn)' }} />
  return <CircleX size={14} style={{ color: 'var(--bad)' }} />
}

function AzureDetails({ repo, onClose }: { repo: AzureRepo; onClose: () => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [d, setD] = useState<AzureRepoDetails | null>(null)
  const [pr, setPr] = useState<{ from: string; to: string; title: string; description: string } | null>(null)
  useEffect(() => {
    void act(`az-details-${repo.id}`, () => api.invoke('azure:details', repo.projectId, repo.id)).then((x) => x && setD(x))
  }, [act, api, repo])
  const open = (url: string | null): void => void (url && api.invoke('tools:open-external', url))
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog az-dialog" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={repo.name}>
        <div className="snap-head">
          <h2 className="page-title">
            <span className="hint">{repo.project} /</span> {repo.name}
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {!d && <p className="hint">Loading…</p>}
        {d && (
          <div className="az-details">
            <section>
              <h3>Pipelines</h3>
              {d.builds.length === 0 && <p className="hint">No pipeline runs for this repository.</p>}
              {d.builds.map((b) => (
                <button key={b.id} className="az-line" onClick={() => open(b.url)}>
                  <BuildIcon status={b.status} result={b.result} />
                  <span className="row-main">
                    {b.name} <span className="hint">#{b.number} · {b.branch}</span>
                  </span>
                  <span className="hint">{b.status === 'completed' ? ago(b.finished) : 'running'}</span>
                </button>
              ))}
            </section>
            <section>
              <h3>
                Pull requests
                <button className="btn btn-sm" style={{ marginLeft: 'auto' }} disabled={d.branches.length < 2} onClick={() => setPr({ from: d.branches.find((b) => b !== repo.defaultBranch) ?? '', to: repo.defaultBranch, title: '', description: '' })}>
                  <GitPullRequest size={13} /> New
                </button>
              </h3>
              {d.pulls.length === 0 && <p className="hint">No open pull requests.</p>}
              {d.pulls.map((p) => (
                <button key={p.id} className="az-line" onClick={() => open(`${repo.url}/pullrequest/${p.id}`)}>
                  <GitPullRequest size={14} />
                  <span className="row-main">
                    {p.title} {p.draft && <span className="tag">Draft</span>}
                    <span className="hint">
                      {' '}
                      {p.from} → {p.to} · {p.author}
                    </span>
                  </span>
                </button>
              ))}
              {pr && (
                <div className="az-pr">
                  <div className="az-form">
                    <select className="input select" value={pr.from} onChange={(e) => setPr({ ...pr, from: e.target.value })} aria-label="From branch">
                      {d.branches.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                    <select className="input select" value={pr.to} onChange={(e) => setPr({ ...pr, to: e.target.value })} aria-label="Into branch">
                      {d.branches.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <input className="input" placeholder="Title" value={pr.title} onChange={(e) => setPr({ ...pr, title: e.target.value })} />
                  <textarea className="input" rows={3} placeholder="What changes, and why" value={pr.description} onChange={(e) => setPr({ ...pr, description: e.target.value })} />
                  <div className="mcp-actions">
                    <button className="btn" onClick={() => setPr(null)}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={!pr.title.trim() || pr.from === pr.to || busy.has('az-pr')}
                      onClick={async () => {
                        const r = await act('az-pr', () => api.invoke('azure:pull-request', repo.id, pr))
                        if (r) {
                          notify({ kind: 'info', text: `Pull request ${r.id} is open.` })
                          setPr(null)
                          open(r.url)
                        }
                      }}
                    >
                      {busy.has('az-pr') ? 'Opening…' : 'Open pull request'}
                    </button>
                  </div>
                </div>
              )}
            </section>
            <section>
              <h3>Latest commits</h3>
              {d.commits.map((c) => (
                <button key={c.sha} className="az-line" onClick={() => open(c.url)}>
                  <code>{c.sha}</code>
                  <span className="row-main">{c.message}</span>
                  <span className="hint">
                    {c.author} · {ago(c.date)}
                  </span>
                </button>
              ))}
            </section>
            <p className="hint">Branches: {d.branches.join(', ') || 'none yet'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Push a site to Azure Repos: main, a new branch or a version tag. */
export function AzurePushDialog({ site, onClose }: { site: { name: string; path: string }; onClose: () => void }): React.JSX.Element {
  const { act, busy, notify, setPage } = useApp()
  const api = window.laramac
  const [acc, setAcc] = useState<AzureAccount | null | undefined>(undefined)
  const [repos, setRepos] = useState<AzureRepo[]>([])
  const [projects, setProjects] = useState<AzureProject[]>([])
  const [target, setTarget] = useState('new')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState(site.name)
  const [mode, setMode] = useState<'main' | 'branch' | 'tag'>('main')
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const [tag, setTag] = useState('v1.0.0')
  const [replace, setReplace] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    void api.invoke('azure:account').then(async (a) => {
      setAcc(a)
      if (!a) return
      const [r, p] = await Promise.all([api.invoke('azure:repos').catch(() => []), api.invoke('azure:projects').catch(() => [])])
      setRepos(r)
      setProjects(p)
      setProjectId(p[0]?.id ?? '')
      const same = r.find((x) => x.name.toLowerCase() === site.name.toLowerCase())
      if (same) setTarget(same.id)
    })
  }, [api, site.name])
  const go = async (): Promise<void> => {
    const r = await act(`az-push-${site.name}`, () =>
      api.invoke('azure:push', site.path, { mode, message, branch, tag, replace, ...(target === 'new' ? { azureCreate: { projectId, name } } : { azureRepo: target }) })
    )
    if (r) {
      setDone(r.url ?? null)
      notify({ kind: 'info', text: `${site.name} is on Azure DevOps.` })
    }
  }
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog push-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">Push {site.name} to Azure DevOps</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Laramac commits your changes and pushes them. Files in .gitignore, like .env and node_modules, stay on this Mac.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {acc === null && (
          <div className="deploy-form">
            <p className="hint">Connect Azure DevOps first.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                try {
                  localStorage.setItem('laramac.repoHost', 'azure')
                } catch {
                  // Only a convenience.
                }
                setPage('github')
                onClose()
              }}
            >
              Connect Azure DevOps
            </button>
          </div>
        )}
        {acc && !done && (
          <div className="deploy-form">
            <label className="field">
              <span className="field-label">Repository</span>
              <select className="input select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">A new repository</option>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.project} / {r.name}
                  </option>
                ))}
              </select>
            </label>
            {target === 'new' && (
              <div className="az-form">
                <select className="input select" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Repository name" />
              </div>
            )}
            <div className="seg" role="radiogroup" style={{ alignSelf: 'flex-start' }}>
              {(['main', 'branch', 'tag'] as const).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                  {m === 'main' ? 'Main branch' : m === 'branch' ? 'New branch' : 'Version tag'}
                </button>
              ))}
            </div>
            {mode === 'branch' && <input className="input mono" placeholder="feature/new-header" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch name" />}
            {mode === 'tag' && <input className="input mono" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Version" />}
            <input className="input" placeholder="What changed (commit message)" value={message} onChange={(e) => setMessage(e.target.value)} />
            {mode !== 'branch' && (
              <label className="check">
                <input type="checkbox" checked={replace} onChange={() => setReplace(!replace)} /> Replace what is on Azure DevOps if it has commits this Mac does not
              </label>
            )}
            <div className="end" style={{ marginTop: 8 }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy.has(`az-push-${site.name}`) || (target === 'new' && (!projectId || !name.trim())) || (mode === 'branch' && !branch.trim())} onClick={go}>
                {busy.has(`az-push-${site.name}`) ? 'Pushing…' : 'Push'}
              </button>
            </div>
          </div>
        )}
        {done !== null && (
          <div className="deploy-form">
            <p>Pushed.</p>
            <div className="end">
              {done && (
                <button className="btn" onClick={() => api.invoke('tools:open-external', done)}>
                  <ExternalLink size={14} /> Open in Azure DevOps
                </button>
              )}
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
