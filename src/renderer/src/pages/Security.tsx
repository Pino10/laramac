import { useEffect, useState } from 'react'
import { Bot, FileText, FolderOpen, GitBranch, Globe2, KeyRound, Laptop, Radar, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import type { GitHubRepo, ReviewFocus, ReviewInfo, ReviewResult, ScanResult } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'
import { Answer } from '../components/Answer'

type SourceKind = 'site' | 'github' | 'git'

const SEV = ['critical', 'high', 'medium', 'low'] as const

function Counts({ counts, secrets }: { counts: ReviewInfo['counts']; secrets: number }): React.JSX.Element {
  const total = SEV.reduce((a, k) => a + counts[k], 0)
  return (
    <span className="sev-counts">
      {total === 0 && secrets === 0 ? (
        <span className="sev" data-sev="ok">
          Nothing found
        </span>
      ) : (
        <>
          {SEV.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} className="sev" data-sev={k}>
              {counts[k]} {k}
            </span>
          ))}
          {secrets > 0 && (
            <span className="sev" data-sev="high">
              <KeyRound size={11} /> {secrets} {secrets === 1 ? 'key' : 'keys'}
            </span>
          )}
        </>
      )}
    </span>
  )
}

export default function Security(): React.JSX.Element {
  const { sites, settings, act, busy, llms, setPage, notify } = useApp()
  const api = window.laramac
  const [tab, setTab] = useState<'review' | 'scan'>('review')
  const [kind, setKind] = useState<SourceKind>('site')
  const [site, setSite] = useState('')
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)
  const [repo, setRepo] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [reviewer, setReviewer] = useState<'claude' | 'model'>('claude')
  const [focus, setFocus] = useState<ReviewFocus>('security')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [history, setHistory] = useState<ReviewInfo[]>([])
  const [opened, setOpened] = useState<{ info: ReviewInfo; md: string } | null>(null)

  useEffect(() => {
    void api.invoke('review:list').then(setHistory)
    void api
      .invoke('github:repos')
      .then(setRepos)
      .catch(() => setRepos([]))
  }, [api])
  useEffect(() => {
    if (!site && sites[0]) setSite(sites[0].name)
  }, [sites, site])

  const model = settings?.llm.model
  const current = llms.find((l) => l.baseUrl === settings?.llm.baseUrl)
  const canRun = kind === 'site' ? !!site : kind === 'github' ? !!repo : /^https:\/\/\S+$/.test(url.trim())

  const run = async (): Promise<void> => {
    const source = kind === 'site' ? { kind, site } : kind === 'github' ? { kind, repo } : { kind, url: url.trim(), ...(token.trim() ? { token: token.trim() } : {}) }
    const r = await act('review', () => api.invoke('review:run', { source, reviewer, focus } as never))
    if (r) {
      setResult(r)
      setOpened(null)
      setToken('')
      setHistory(await api.invoke('review:list'))
    }
  }

  return (
    <>
      <PageHead title="Security" desc="Review your code with AI and scan your sites for known problems. Nothing here changes your code.">
        <div className="seg-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>
            <ShieldCheck size={14} /> Code review
          </button>
          <button role="tab" aria-selected={tab === 'scan'} onClick={() => setTab('scan')}>
            <Radar size={14} /> Web scan
          </button>
        </div>
      </PageHead>

      {tab === 'review' ? (
        <>
          <div className="sec-form glass">
            <div className="field">
              <label>What to review</label>
              <div className="seg" role="radiogroup" aria-label="Source">
                <button role="radio" aria-checked={kind === 'site'} onClick={() => setKind('site')}>
                  <Laptop size={13} /> A site in www
                </button>
                <button role="radio" aria-checked={kind === 'github'} onClick={() => setKind('github')}>
                  <GitBranch size={13} /> GitHub repository
                </button>
                <button role="radio" aria-checked={kind === 'git'} onClick={() => setKind('git')}>
                  <Globe2 size={13} /> Azure DevOps or any Git
                </button>
              </div>
            </div>
            {kind === 'site' && (
              <select className="input" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
                {sites.length === 0 && <option value="">No sites yet</option>}
                {sites.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {kind === 'github' &&
              (repos && repos.length > 0 ? (
                <select className="input" value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository">
                  <option value="">Pick a repository</option>
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                      {r.private ? ' (private)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="hint">
                  Connect GitHub on the{' '}
                  <button className="link" onClick={() => setPage('github')}>
                    GitHub page
                  </button>{' '}
                  to pick from your repositories, or use the Git address option.
                </div>
              ))}
            {kind === 'git' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 10 }}>
                <input className="input mono" placeholder="https://dev.azure.com/org/project/_git/repo" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Repository address" />
                <input className="input mono" type="password" autoComplete="off" placeholder="Token, if private (PAT)" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Access token" />
              </div>
            )}
            {kind !== 'site' && <div className="hint">Laramac downloads a read-only copy into its own folder. The token is used once and not saved.</div>}

            <div className="sec-row">
              <div className="field">
                <label>Reviewer</label>
                <div className="seg" role="radiogroup" aria-label="Reviewer">
                  <button role="radio" aria-checked={reviewer === 'claude'} onClick={() => setReviewer('claude')}>
                    <Sparkles size={13} /> Claude Code
                  </button>
                  <button role="radio" aria-checked={reviewer === 'model'} onClick={() => setReviewer('model')}>
                    <Bot size={13} /> {current ? `${current.provider}` : 'Your model'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Look for</label>
                <div className="seg" role="radiogroup" aria-label="Focus">
                  {(
                    [
                      ['security', 'Security'],
                      ['bugs', 'Bugs'],
                      ['all', 'Everything']
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} role="radio" aria-checked={focus === id} onClick={() => setFocus(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="hint">
              {reviewer === 'claude'
                ? 'Claude Code reads the whole project itself, in read-only mode: it can open and search files but not change or run anything. It needs to be installed and signed in.'
                : model
                  ? `${model} reads the most important files in parts (routes, controllers, login, database code first). Local models are private but slower; large projects take a while.`
                  : 'Pick a model on the Tools page first.'}
            </div>
            <div className="end">
              <button className="btn btn-primary" disabled={!canRun || busy.has('review') || (reviewer === 'model' && !model)} onClick={run}>
                <ShieldCheck size={14} /> {busy.has('review') ? 'Reviewing… you can keep working' : 'Start review'}
              </button>
            </div>
          </div>

          {(result || opened) && (
            <ReportView
              title={result && !opened ? result.title : opened!.info.title}
              md={result && !opened ? result.markdown : opened!.md}
              id={result && !opened ? result.id : opened!.info.id}
              onAgent={() => {
                const id = result && !opened ? result.id : opened!.info.id
                void act('review-open', () => api.invoke('review:open', id, 'agent')).then(() => notify({ kind: 'info', text: 'Your AI tool is open in the project, and the fix request is copied. Paste it in.' }))
              }}
            />
          )}

          {history.length > 0 && (
            <>
              <h2 className="section-title">Past reviews</h2>
              <div className="panel">
                {history.map((h) => (
                  <div key={h.id} className="ms-row">
                    <FileText size={16} style={{ color: 'var(--ink-3)' }} />
                    <button
                      className="row-main link-row"
                      onClick={async () => {
                        const md = await act('review-read', () => api.invoke('review:read', h.id))
                        if (md) {
                          setOpened({ info: h, md })
                          setResult(null)
                        }
                      }}
                    >
                      <div className="row-title">{h.title}</div>
                      <div className="row-sub">{h.reviewer === 'claude' ? 'Claude Code' : 'Model'} · {h.focus}</div>
                    </button>
                    <Counts counts={h.counts} secrets={h.secrets} />
                    <button className="icon-btn" data-tip="Show folder" aria-label="Show folder" onClick={() => act('review-open', () => api.invoke('review:open', h.id, 'folder'))}>
                      <FolderOpen />
                    </button>
                    <button
                      className="icon-btn danger-text"
                      data-tip="Delete"
                      aria-label="Delete review"
                      onClick={async () => {
                        const r = await act('review-del', () => api.invoke('review:delete', h.id))
                        if (r) setHistory(r)
                      }}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <WebScan />
      )}
    </>
  )
}

function ReportView({ title, md, id, onAgent }: { title: string; md: string; id: string; onAgent: () => void }): React.JSX.Element {
  const { act } = useApp()
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const m of md.matchAll(/^#{2,4}\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]/gim)) counts[m[1].toLowerCase() as keyof typeof counts]++
  const secrets = (md.match(/^- .+ in `[^`]+:\d+`$/gm) ?? []).length
  return (
    <div className="report glass">
      <div className="report-head">
        <div>
          <strong>{title}</strong>
          <Counts counts={counts} secrets={secrets} />
        </div>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => act('review-open', () => window.laramac.invoke('review:open', id, 'report'))}>
            <FileText size={13} /> Open report
          </button>
          <button className="btn btn-sm btn-primary" onClick={onAgent}>
            <Sparkles size={13} /> Fix with AI
          </button>
        </span>
      </div>
      <Answer text={md.replace(/^# .*\n/, '')} />
    </div>
  )
}

function WebScan(): React.JSX.Element {
  const { sites, act, busy, services } = useApp()
  const api = window.laramac
  const [status, setStatus] = useState<{ installed: boolean; version: string | null } | null>(null)
  const [mode, setMode] = useState<'site' | 'url'>('site')
  const [site, setSite] = useState(sites[0]?.name ?? '')
  const [url, setUrl] = useState('')
  const [res, setRes] = useState<ScanResult | null>(null)
  const [explain, setExplain] = useState<string | null>(null)
  useEffect(() => {
    void api.invoke('scan:status').then(setStatus)
  }, [api])
  const web = services.find((s) => (s.id === 'apache' || s.id === 'nginx') && s.status === 'running')

  return (
    <>
      <div className="sec-form glass">
        <div className="hint" style={{ marginBottom: 4 }}>
          Nuclei runs thousands of community checks for known problems: exposed files and panels, misconfigurations, outdated software with known flaws, missing security headers and more.
          Checks that could harm a site (denial of service, fuzzing, brute force) are left out. {status?.installed ? `Nuclei ${status.version ?? ''} is installed.` : 'Laramac downloads Nuclei the first time.'}
        </div>
        <div className="seg" role="radiogroup" aria-label="Target">
          <button role="radio" aria-checked={mode === 'site'} onClick={() => setMode('site')}>
            <Laptop size={13} /> A site in www
          </button>
          <button role="radio" aria-checked={mode === 'url'} onClick={() => setMode('url')}>
            <Globe2 size={13} /> An address
          </button>
        </div>
        {mode === 'site' ? (
          <select className="input" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
            {sites.map((s) => (
              <option key={s.name} value={s.name}>
                {s.domain}
              </option>
            ))}
          </select>
        ) : (
          <input className="input mono" placeholder="https://staging.yoursite.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Address" />
        )}
        {mode === 'site' && !web && <div className="hint" style={{ color: 'var(--warn)' }}>Start Apache or Nginx first, so the site answers.</div>}
        {mode === 'url' && <div className="hint">Only scan sites you own or have written permission to test. Laramac asks you to confirm.</div>}
        <div className="end">
          <button
            className="btn btn-primary"
            disabled={busy.has('scan') || (mode === 'site' ? !site || !web : !/^https?:\/\/\S+$/.test(url.trim()))}
            onClick={async () => {
              setExplain(null)
              const r = await act('scan', () => api.invoke('scan:run', mode === 'url' ? url.trim() : '', mode === 'site' ? site : null))
              if (r) {
                setRes(r)
                setStatus(await api.invoke('scan:status'))
              }
            }}
          >
            <Radar size={14} /> {busy.has('scan') ? 'Scanning… this takes a few minutes' : 'Start scan'}
          </button>
        </div>
      </div>
      {res && (
        <div className="report glass">
          <div className="report-head">
            <div>
              <strong>
                {res.target}: {res.findings.length === 0 ? 'nothing found' : `${res.findings.length} ${res.findings.length === 1 ? 'finding' : 'findings'}`}
              </strong>
              <span className="hint">{Math.round(res.ms / 1000)} s</span>
            </div>
            {res.findings.length > 0 && (
              <button
                className="btn btn-sm btn-primary"
                disabled={busy.has('scan-explain')}
                onClick={async () => {
                  const list = res.findings
                    .slice(0, 40)
                    .map((f) => `- [${f.severity}] ${f.name} (${f.template}) at ${f.matched}${f.description ? `: ${f.description.slice(0, 200)}` : ''}`)
                    .join('\n')
                  const text = await act('scan-explain', () =>
                    api.invoke('ai:chat', [
                      {
                        role: 'user',
                        content: `A Nuclei scan of ${res.target} found:\n${list}\n\nWhich of these matter, which are likely harmless, and how do I fix the ones that matter? Answer as numbered steps, most important first.`
                      }
                    ])
                  )
                  if (text) setExplain(text)
                }}
              >
                <Sparkles size={13} /> {busy.has('scan-explain') ? 'Thinking…' : 'Explain with AI'}
              </button>
            )}
          </div>
          {explain && <Answer text={explain} />}
          <div className="scan-list">
            {res.findings.map((f, i) => (
              <div key={i} className="scan-item">
                <span className="sev" data-sev={f.severity}>
                  {f.severity}
                </span>
                <div className="grow">
                  <strong>{f.name}</strong>
                  <span className="mono hint">{f.matched}</span>
                  {f.description && <p>{f.description}</p>}
                  {f.remediation && <p className="hint">Fix: {f.remediation}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
