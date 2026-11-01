import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileArchive, GitBranch, Globe, Info, Lock, LogOut, Pencil, Plus, RefreshCw, Search, Star, Tag, Trash2, X } from 'lucide-react'
import type { GitHubAccount, GitHubRepo, GitHubRepoDetails, SiteInfo } from '@shared/types'
import { useAsk } from '../components/Ask'
import { useApp } from '../store'
import { PageHead } from '../ui'

const ago = (iso: string): string => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`
  if (d < 86400) return `${Math.round(d / 3600)} h ago`
  if (d < 86400 * 30) return `${Math.round(d / 86400)} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export default function GitHub(): React.JSX.Element {
  const { act, busy, notify, sites, setSites } = useApp()
  const api = window.laramac
  const [acc, setAcc] = useState<{ account: GitHubAccount | null; cli: boolean } | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'private' | 'public'>('all')
  const [token, setToken] = useState('')
  const [editing, setEditing] = useState<GitHubRepo | null>(null)
  const [creating, setCreating] = useState(false)
  const [details, setDetails] = useState<GitHubRepo | null>(null)

  const loadRepos = useCallback(async () => {
    const list = await act('gh-repos', () => api.invoke('github:repos'))
    if (list) setRepos(list)
  }, [act, api])

  useEffect(() => {
    void api.invoke('github:account').then((a) => {
      setAcc(a)
      if (a.account) void loadRepos()
    })
  }, [api, loadRepos])

  const shown = useMemo(
    () =>
      (repos ?? []).filter(
        (r) =>
          (filter === 'all' || (filter === 'private' ? r.private : !r.private)) &&
          `${r.fullName} ${r.description ?? ''} ${r.language ?? ''}`.toLowerCase().includes(query.toLowerCase())
      ),
    [repos, filter, query]
  )

  if (!acc) return <></>

  if (!acc.account) {
    const connected = async (a: GitHubAccount | undefined): Promise<void> => {
      if (!a) return
      setAcc({ ...acc, account: a })
      setToken('')
      notify({ kind: 'info', text: `Connected as ${a.login}.` })
      await loadRepos()
    }
    return (
      <>
        <PageHead title="GitHub" desc="See all your repositories, clone them into your projects folder, and push your sites." />
        <div className="gh-connect glass">
          <span className="mcp-mark" aria-hidden>
            <Lock size={20} />
          </span>
          <div className="mcp-body">
            <strong>Connect your GitHub account</strong>
            <span>Laramac keeps your access encrypted in the macOS Keychain and uses it only to talk to GitHub for you.</span>
            {acc.cli && (
              <div className="mcp-actions">
                <button
                  className="btn btn-primary"
                  disabled={busy.has('gh-cli')}
                  onClick={async () => connected(await act('gh-cli', () => api.invoke('github:sign-in-cli')))}
                >
                  Use my GitHub CLI sign-in
                </button>
                <span className="hint">Found the GitHub CLI on this Mac.</span>
              </div>
            )}
            <div className="gh-token">
              <span className="hint" style={{ display: 'block', margin: '12px 0 6px' }}>
                {acc.cli ? 'Or paste' : 'Paste'} a personal access token.{' '}
                <button
                  className="link"
                  onClick={() =>
                    api.invoke('tools:open-external', 'https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo&description=Laramac')
                  }
                >
                  Create one on GitHub
                </button>{' '}
                with the repo, workflow and delete_repo boxes ticked.
              </span>
              <form
                style={{ display: 'flex', gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  await connected(await act('gh-token', () => api.invoke('github:sign-in', token)))
                }}
              >
                <input
                  className="input mono"
                  style={{ flex: 1 }}
                  type="password"
                  placeholder="ghp_… or github_pat_…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button className={acc.cli ? 'btn' : 'btn btn-primary'} disabled={!token.trim() || busy.has('gh-token')}>
                  Connect
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    )
  }

  const local = new Set(sites.map((s) => s.name.toLowerCase()))

  return (
    <>
      <PageHead
        title="GitHub"
        desc={`Signed in as ${acc.account.name ? `${acc.account.name} (${acc.account.login})` : acc.account.login}. Clone a repository to start working on it, or push a site from the Sites page.`}
      >
        <button className="btn" disabled={busy.has('gh-repos')} onClick={loadRepos}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New repository
        </button>
        <button
          className="btn btn-quiet"
          onClick={async () => {
            await api.invoke('github:sign-out')
            setAcc({ ...acc, account: null })
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
        <div className="seg" role="radiogroup" aria-label="Show">
          {(['all', 'private', 'public'] as const).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? `All ${repos?.length ?? ''}` : f === 'private' ? 'Private' : 'Public'}
            </button>
          ))}
        </div>
      </div>

      {repos === null ? (
        <div className="group empty-state">Loading your repositories…</div>
      ) : shown.length === 0 ? (
        <div className="group empty-state">No repository matches.</div>
      ) : (
        <div className="gh-grid">
          {shown.map((r) => {
            const here = local.has(r.name.toLowerCase())
            return (
              <div key={r.fullName} className="card glass gh-repo">
                <div className="gh-repo-head">
                  <span className="gh-owner">{r.fullName.split('/')[0]} /</span>
                  <button className="gh-name" onClick={() => setDetails(r)}>
                    {r.name}
                  </button>
                  <span className={r.private ? 'tag' : 'tag tag-ok'}>
                    {r.private ? <Lock size={10} /> : <Globe size={10} />} {r.private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="gh-desc">{r.description ?? <span className="hint">No description</span>}</p>
                <div className="gh-meta">
                  {r.language && <span>{r.language}</span>}
                  {r.stars > 0 && (
                    <span>
                      <Star size={11} /> {r.stars}
                    </span>
                  )}
                  <span>Updated {ago(r.updatedAt)}</span>
                  {r.fork && <span>Fork</span>}
                  {r.archived && <span>Archived</span>}
                </div>
                <div className="ai-actions">
                  {here ? (
                    <span className="tag tag-accent">In your projects</span>
                  ) : (
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy.has(`gh-clone-${r.fullName}`)}
                      onClick={async () => {
                        const next = await act(`gh-clone-${r.fullName}`, () => api.invoke('github:clone', r.fullName))
                        if (next) {
                          setSites(next)
                          notify({ kind: 'info', text: `${r.name} is in your projects folder.` })
                        }
                      }}
                    >
                      <Download size={14} /> {busy.has(`gh-clone-${r.fullName}`) ? 'Cloning…' : 'Clone to projects'}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="icon-btn" data-tip="Branches, commits and releases" aria-label={`Details of ${r.name}`} onClick={() => setDetails(r)}>
                    <Info />
                  </button>
                  <button
                    className="icon-btn"
                    data-tip="Download ZIP"
                    aria-label={`Download ${r.name} as a zip`}
                    onClick={async () => {
                      const path = await act(`gh-zip-${r.fullName}`, () => api.invoke('github:download-zip', r.fullName))
                      if (path) notify({ kind: 'info', text: `Saved ${path.split('/').pop()} to ${path.split('/').slice(-2, -1)[0]}.` })
                    }}
                  >
                    <FileArchive />
                  </button>
                  <button className="icon-btn" data-tip="Edit details" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil />
                  </button>
                  <button
                    className="icon-btn"
                    data-tip="Open on GitHub"
                    aria-label={`Open ${r.name} on GitHub`}
                    onClick={() => api.invoke('tools:open-external', r.url)}
                  >
                    <ExternalLink />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {creating && (
        <CreateRepo
          onClose={() => setCreating(false)}
          onCreated={(repo, nextSites) => {
            setRepos((list) => [repo, ...(list ?? [])])
            if (nextSites) setSites(nextSites)
            setCreating(false)
            notify({ kind: 'info', text: nextSites ? `${repo.name} is on GitHub and in your projects folder.` : `${repo.fullName} is on GitHub.` })
          }}
        />
      )}
      {details && (
        <RepoDetails
          repo={details}
          onClose={() => setDetails(null)}
          onDeleted={() => {
            setRepos((list) => (list ?? []).filter((x) => x.fullName !== details.fullName))
            setDetails(null)
          }}
        />
      )}
      {editing && (
        <EditRepo
          repo={editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setRepos((list) => (list ?? []).map((x) => (x.fullName === r.fullName ? r : x)))
            setEditing(null)
            notify({ kind: 'info', text: `${r.name} is updated on GitHub.` })
          }}
        />
      )}
    </>
  )
}

function EditRepo({ repo, onClose, onSaved }: { repo: GitHubRepo; onClose: () => void; onSaved: (r: GitHubRepo) => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const [description, setDescription] = useState(repo.description ?? '')
  const [homepage, setHomepage] = useState(repo.homepage ?? '')
  const [priv, setPriv] = useState(repo.private)
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <h2 className="page-title">{repo.fullName}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="gh-desc">Description</label>
          <input id="gh-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gh-home">Website</label>
          <input id="gh-home" className="input" placeholder="https://" value={homepage} onChange={(e) => setHomepage(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">Who can see it</span>
          <div className="seg" role="radiogroup" style={{ alignSelf: 'flex-start' }}>
            <button role="radio" aria-checked={priv} onClick={() => setPriv(true)}>
              <Lock size={12} /> Private
            </button>
            <button role="radio" aria-checked={!priv} onClick={() => setPriv(false)}>
              <Globe size={12} /> Public
            </button>
          </div>
          {priv !== repo.private && (
            <span className="hint" style={{ color: 'var(--warn)' }}>
              {priv ? 'Only you and people you invite will see it.' : 'Anyone on the internet will be able to see the code.'}
            </span>
          )}
        </div>
        <div className="end" style={{ marginTop: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy.has('gh-edit')}
            onClick={async () => {
              const r = await act('gh-edit', () => window.laramac.invoke('github:edit', repo.fullName, { description, homepage, private: priv }))
              if (r) onSaved(r)
            }}
          >
            Save on GitHub
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateRepo({ onClose, onCreated }: { onClose: () => void; onCreated: (r: GitHubRepo, sites: SiteInfo[] | null) => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priv, setPriv] = useState(true)
  const [readme, setReadme] = useState(true)
  const [clone, setClone] = useState(true)
  const valid = /^[A-Za-z0-9._-]{1,100}$/.test(name.trim())
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div>
            <h2 className="page-title">New repository</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              Created on your GitHub account. To put an existing site on GitHub, use the Push button on the Sites page instead.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="deploy-form">
          <div className="field">
            <label htmlFor="nr-name">Name</label>
            <input
              id="nr-name"
              className="input mono"
              autoFocus
              placeholder="my-new-site"
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))}
            />
            {name && !valid && (
              <span className="hint" style={{ color: 'var(--bad)' }}>
                Use letters, numbers, dots, dashes and underscores.
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="nr-desc">Description (optional)</label>
            <input id="nr-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <span className="field-label">Who can see it</span>
            <div className="seg" role="radiogroup" style={{ alignSelf: 'flex-start' }}>
              <button role="radio" aria-checked={priv} onClick={() => setPriv(true)}>
                <Lock size={12} /> Private
              </button>
              <button role="radio" aria-checked={!priv} onClick={() => setPriv(false)}>
                <Globe size={12} /> Public
              </button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} /> Start with a README
          </label>
          <label className="check">
            <input type="checkbox" checked={clone} onChange={(e) => setClone(e.target.checked)} /> Also put it in my projects folder, ready to work on
          </label>
          <div className="end" style={{ marginTop: 8 }}>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!valid || busy.has('gh-create')}
              onClick={async () => {
                const res = await act('gh-create', () =>
                  window.laramac.invoke('github:create', { name: name.trim(), description, private: priv, readme, clone })
                )
                if (res) onCreated(res.repo, res.sites)
              }}
            >
              <Plus size={14} /> {busy.has('gh-create') ? 'Creating…' : 'Create repository'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RepoDetails({ repo, onClose, onDeleted }: { repo: GitHubRepo; onClose: () => void; onDeleted: () => void }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [d, setD] = useState<GitHubRepoDetails | null>(null)
  const [ask, askDialog] = useAsk()
  useEffect(() => {
    void act(`gh-details-${repo.fullName}`, () => api.invoke('github:details', repo.fullName)).then((x) => x && setD(x))
  }, [act, api, repo.fullName])
  const open = (url: string): void => void api.invoke('tools:open-external', url)

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="dialog glass snap-dialog repo-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snap-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="page-title">{repo.fullName}</h2>
            <p className="page-desc" style={{ marginTop: 4 }}>
              {repo.description ?? 'No description'} · {repo.private ? 'Private' : 'Public'} · default branch {repo.defaultBranch}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {!d ? (
          <div className="hint" style={{ padding: '24px 0' }}>
            Loading from GitHub…
          </div>
        ) : (
          <div className="repo-grid">
            <section>
              <h3>
                <GitBranch size={14} /> Branches <small>{d.branches.length}</small>
              </h3>
              {d.branches.map((b) => (
                <div key={b.name} className="repo-line mono">
                  {b.name} {b.protected && <span className="tag">protected</span>}
                </div>
              ))}
            </section>
            <section>
              <h3>
                <Tag size={14} /> Releases <small>{d.releases.length}</small>
              </h3>
              {d.releases.length === 0 && <div className="hint">No releases yet.</div>}
              {d.releases.map((r) => (
                <button key={r.tag} className="repo-line link-row" onClick={() => open(r.url)}>
                  <span className="mono">{r.tag}</span> <span className="hint">{new Date(r.date).toLocaleDateString()}</span>
                </button>
              ))}
            </section>
            <section className="wide">
              <h3>Recent commits</h3>
              {d.commits.map((c) => (
                <button key={c.sha} className="repo-line link-row" onClick={() => open(c.url)}>
                  <span className="mono hint">{c.sha}</span> <span className="grow">{c.message}</span> <span className="hint">{c.author}</span>
                </button>
              ))}
            </section>
            <section>
              <h3>
                Pull requests <small>{d.pulls.length} open</small>
              </h3>
              {d.pulls.length === 0 && <div className="hint">None open.</div>}
              {d.pulls.map((p) => (
                <button key={p.number} className="repo-line link-row" onClick={() => open(p.url)}>
                  <span className="hint">#{p.number}</span> <span className="grow">{p.title}</span>
                </button>
              ))}
            </section>
            <section>
              <h3>
                Issues <small>{d.issues.length} open</small>
              </h3>
              {d.issues.length === 0 && <div className="hint">None open.</div>}
              {d.issues.map((i) => (
                <button key={i.number} className="repo-line link-row" onClick={() => open(i.url)}>
                  <span className="hint">#{i.number}</span> <span className="grow">{i.title}</span>
                </button>
              ))}
            </section>
          </div>
        )}
        <div className="end" style={{ marginTop: 16 }}>
          <button
            className="btn btn-quiet danger-text"
            style={{ marginRight: 'auto' }}
            disabled={busy.has('gh-delete')}
            onClick={async () => {
              const typed = await ask({
                title: `Delete ${repo.fullName} on GitHub?`,
                label: `This deletes the repository, its issues, pull requests and releases for everyone. It cannot be undone. Type ${repo.name} to confirm.`,
                confirm: 'Delete repository',
                danger: true
              })
              if (typed === null) return
              if (typed.trim() !== repo.name) {
                notify({ kind: 'error', text: 'The name did not match, so nothing was deleted.' })
                return
              }
              const ok = await act('gh-delete', async () => {
                await api.invoke('github:delete', repo.fullName)
                return true
              })
              if (ok) {
                notify({ kind: 'info', text: `${repo.fullName} is deleted.` })
                onDeleted()
              }
            }}
          >
            <Trash2 size={14} /> Delete repository
          </button>
          <button className="btn" onClick={() => open(repo.url)}>
            <ExternalLink size={14} /> Open on GitHub
          </button>
        </div>
      </div>
      <div onMouseDown={(e) => e.stopPropagation()}>{askDialog}</div>
    </div>
  )
}
