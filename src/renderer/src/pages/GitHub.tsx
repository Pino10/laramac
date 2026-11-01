import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Globe, Lock, LogOut, Pencil, RefreshCw, Search, Star, X } from 'lucide-react'
import type { GitHubAccount, GitHubRepo } from '@shared/types'
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
                <button className="btn btn-primary" disabled={busy.has('gh-cli')} onClick={async () => connected(await act('gh-cli', () => api.invoke('github:sign-in-cli')))}>
                  Use my GitHub CLI sign-in
                </button>
                <span className="hint">Found the GitHub CLI on this Mac.</span>
              </div>
            )}
            <div className="gh-token">
              <span className="hint" style={{ display: 'block', margin: '12px 0 6px' }}>
                {acc.cli ? 'Or paste' : 'Paste'} a personal access token.{' '}
                <button className="link" onClick={() => api.invoke('tools:open-external', 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Laramac')}>
                  Create one on GitHub
                </button>{' '}
                with the repo and workflow boxes ticked.
              </span>
              <form
                style={{ display: 'flex', gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  await connected(await act('gh-token', () => api.invoke('github:sign-in', token)))
                }}
              >
                <input className="input mono" style={{ flex: 1 }} type="password" placeholder="ghp_… or github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
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
      <PageHead title="GitHub" desc={`Signed in as ${acc.account.name ? `${acc.account.name} (${acc.account.login})` : acc.account.login}. Clone a repository to start working on it, or push a site from the Sites page.`}>
        <button className="btn" disabled={busy.has('gh-repos')} onClick={loadRepos}>
          <RefreshCw size={14} /> Refresh
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
                  <strong>{r.name}</strong>
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
                  <button className="icon-btn" data-tip="Edit details" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil />
                  </button>
                  <button className="icon-btn" data-tip="Open on GitHub" aria-label={`Open ${r.name} on GitHub`} onClick={() => api.invoke('tools:open-external', r.url)}>
                    <ExternalLink />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
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
          {priv !== repo.private && <span className="hint" style={{ color: 'var(--warn)' }}>{priv ? 'Only you and people you invite will see it.' : 'Anyone on the internet will be able to see the code.'}</span>}
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
