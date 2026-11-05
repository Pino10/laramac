import { useEffect, useRef, useState } from 'react'
import OpenWith from '../components/OpenWith'
import { ArtisanPanel } from '../components/PhpDev'
import { Activity, ArrowLeft, Bot, Camera, Code2, Cog, Database, ExternalLink, FileCog, FlaskConical, FolderOpen, GitBranch, Globe, Lock, Network, Package, Play, Rocket, ScrollText, Share2, ShieldCheck, Sparkles, Square, Stethoscope } from 'lucide-react'
import type { OutdatedPackage, ReviewFinding, SiteFacts, SiteInfo } from '@shared/types'
import { useApp } from '../store'
import { Monogram } from '../ui'
import Doctor from '../components/Doctor'
import { NodeChooser } from '../components/NodeVersions'
import DbBrowser from '../components/DbBrowser'
import { BackendRow, DeployDialog, kindLabel, PushDialog, SiteDoctor, SnapshotsDialog } from './Sites'
import { FindingsList } from './Security'
import { AzurePushDialog } from './Azure'
import { HostingPanel, RequestsTab, SiteExtras, TestsTab, WorkersTab } from '../components/SiteTools'

type Tab = 'overview' | 'logs' | 'requests' | 'database' | 'env' | 'packages' | 'workers' | 'tests' | 'security' | 'deploy'
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Globe size={14} /> },
  { id: 'logs', label: 'Logs', icon: <ScrollText size={14} /> },
  { id: 'requests', label: 'Requests', icon: <Activity size={14} /> },
  { id: 'database', label: 'Database', icon: <Database size={14} /> },
  { id: 'env', label: 'Environment', icon: <FileCog size={14} /> },
  { id: 'packages', label: 'Packages', icon: <Package size={14} /> },
  { id: 'workers', label: 'Workers', icon: <Cog size={14} /> },
  { id: 'tests', label: 'Tests', icon: <FlaskConical size={14} /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={14} /> },
  { id: 'deploy', label: 'Ship', icon: <Rocket size={14} /> }
]

/** Everything about one site in one place. */
export default function SitePage({ site, tab: first, onBack }: { site: SiteInfo; tab?: string; onBack: () => void }): React.JSX.Element {
  const { act, busy, setSites, settings, tools } = useApp()
  const api = window.laramac
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === first)?.id as Tab) ?? 'overview')
  const [facts, setFacts] = useState<SiteFacts | null>(null)
  const [dialog, setDialog] = useState<'snap' | 'deploy' | 'push' | 'azure' | 'doctor' | null>(null)
  const url = site.secure ? site.httpsUrl : site.url
  const stamp = `${site.dev?.running}|${site.backend?.running}`
  useEffect(() => {
    void api.invoke('site:facts', site.name).then(setFacts).catch(() => undefined)
  }, [api, site.name, stamp])
  const answers = facts?.answers
  const state = site.dev?.proxy && !site.dev.running ? 'stopped' : answers === null || answers === undefined ? 'unknown' : answers < 400 ? 'up' : answers < 500 ? 'warn' : 'down'

  return (
    <>
      <button className="link" onClick={onBack} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> All sites
      </button>
      <div className="site-hero glass">
        <Monogram id={site.kind} large />
        <div className="row-main">
          <h1 className="page-title" style={{ margin: 0 }}>
            {site.name}
          </h1>
          <button className="link mono" onClick={() => api.invoke('sites:open-url', url)}>
            {site.secure && <Lock size={12} />} {url.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
          </button>
          <div className="site-tags">
            <span className="status-pill" data-state={state}>
              {state === 'up' ? `Answers (${answers})` : state === 'stopped' ? 'Dev server stopped' : state === 'down' ? `Error ${answers}` : state === 'warn' ? `Answers ${answers}` : 'Not answering'}
            </span>
            <span className="tag">{kindLabel[site.kind]}</span>
            {site.php && <span className="tag">PHP {site.php}</span>}
            {facts?.nodeInfo && (facts.nodeInfo.chosen || facts.nodeInfo.want || facts.nodeInfo.main) && (site.kind === 'node' || facts.nodeInfo.want) && <span className="tag">Node {facts.nodeInfo.chosen ?? (facts.nodeInfo.installed ? (facts.nodeInfo.want ?? facts.nodeInfo.main) : facts.nodeInfo.main)}</span>}
            {facts?.database && <span className="tag">{facts.database.engine} · {facts.database.name}</span>}
            {site.backend && <span className="tag">{site.backend.kind === 'supabase' ? 'Supabase' : 'Firebase'}</span>}
            {facts?.git && <span className="tag">Git</span>}
          </div>
        </div>
        <div className="site-actions">
          {site.dev && (
            <button
              className={site.dev.running ? 'btn' : 'btn btn-primary'}
              disabled={busy.has(`dev-${site.name}`)}
              onClick={async () => {
                const r = await act(`dev-${site.name}`, () => api.invoke(site.dev!.running ? 'dev:stop' : 'dev:start', site.name))
                if (r) setSites(r)
              }}
            >
              {site.dev.running ? <Square size={13} /> : <Play size={13} />} {site.dev.running ? 'Stop' : 'Start'}
            </button>
          )}
          <OpenWith path={site.path} />
          <button className="btn" onClick={() => api.invoke('sites:open-claude', site.path)}>
            <Sparkles size={14} /> Claude Code
          </button>
          <button className="icon-btn" aria-label="Claude Code on your model (claudelm)" data-tip="claudelm: on your model" onClick={() => act('open-lm', () => api.invoke('claude:open-lm', site.name))}>
            <Bot />
          </button>
          <button className="icon-btn" aria-label="Claude Code on Free LLM API (claudefree)" data-tip="claudefree: on Free LLM API" onClick={() => act('open-free', () => api.invoke('claude:open-free', site.name))}>
            <Network />
          </button>
          <button className="icon-btn" aria-label="Show folder" data-tip="Show folder" onClick={() => api.invoke('sites:open-folder', site.path)}>
            <FolderOpen />
          </button>
        </div>
      </div>

      <div className="seg-tabs site-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="site-grid">
          <Doctor site={site.name} />
          <ArtisanPanel site={site} />
          {facts && (site.kind === 'node' || facts.nodeInfo.want || /^(npm|npx|pnpm|yarn|node|bun)\b/.test(site.dev?.command ?? '')) && (
            <div className="panel">
              <NodeChooser site={site} info={facts.nodeInfo} onChange={(nodeInfo) => setFacts({ ...facts, nodeInfo })} />
            </div>
          )}
          {site.dev && (
            <div className="panel pad">
              <div className="row-title">Dev server</div>
              <div className="row-sub mono" style={{ whiteSpace: 'normal' }}>
                {site.dev.command} · port {site.dev.port} · {site.dev.running ? 'running' : 'stopped'}
              </div>
              <BackendRow site={site} />
            </div>
          )}
          <SiteExtras site={site} />
          <div className="quick-grid">
            <Quick icon={<Stethoscope size={18} />} title="Ask the Site Doctor" text="Reads the logs and explains what is wrong." onClick={() => setDialog('doctor')} />
            <Quick icon={<Camera size={18} />} title="Snapshots" text="Save the files and database, and go back." onClick={() => setDialog('snap')} />
            <Quick icon={<ShieldCheck size={18} />} title="Security review" text={facts?.reviews.length ? `Last: ${new Date(facts.reviews[0].at).toLocaleDateString('en-GB')}` : 'Not reviewed yet.'} onClick={() => setTab('security')} />
            <Quick icon={<Rocket size={18} />} title="Ship it" text="Push to GitHub or Azure DevOps, share a public link, or deploy." onClick={() => setTab('deploy')} />
          </div>
        </div>
      )}
      {tab === 'logs' && <Logs site={site} />}
      {tab === 'requests' && <RequestsTab site={site} />}
      {tab === 'workers' && <WorkersTab site={site} />}
      {tab === 'tests' && <TestsTab site={site} />}
      {tab === 'database' && (
        <div className="panel pad">
          {facts?.database ? (
            facts.database.engine === 'mysql' || facts.database.engine === 'mariadb' ? (
              <DbBrowser engine={facts.database.engine as 'mysql' | 'mariadb'} name={facts.database.name} />
            ) : (
              <span className="hint">This site uses {facts.database.engine}.</span>
            )
          ) : site.backend ? (
            <div>
              <div className="row-title">{site.backend.kind === 'supabase' ? 'Supabase' : 'Firebase'}</div>
              <p className="hint">Manage its data in its own dashboard.</p>
              {site.backend.studioUrl && (
                <button className="btn" onClick={() => api.invoke('sites:open-url', site.backend!.studioUrl!)}>
                  {site.backend.kind === 'supabase' ? 'Open Supabase Studio' : 'Open the Emulator UI'}
                </button>
              )}
            </div>
          ) : (
            <span className="hint">No MySQL or MariaDB database was found in this site’s settings (.env or wp-config.php). Create one on the Databases page, or add Supabase or Firebase from the Overview tab.</span>
          )}
        </div>
      )}
      {tab === 'env' && <EnvEditor site={site} files={facts?.envFiles ?? []} />}
      {tab === 'packages' && <Packages site={site} />}
      {tab === 'security' && <SiteSecurity site={site} facts={facts} />}
      {tab === 'deploy' && (
        <div className="quick-grid">
          <Quick icon={<GitBranch size={18} />} title={facts?.git ? 'Push to GitHub' : 'Put it on GitHub'} text={facts?.git ? 'Commit and push your changes.' : 'Make a repository and push the first commit.'} onClick={() => setDialog('push')} />
          <Quick icon={<GitBranch size={18} />} title="Push to Azure DevOps" text="Azure Repos: main, a branch or a version tag." onClick={() => setDialog('azure')} />
          <Quick icon={<Rocket size={18} />} title="Deploy" text="Send it to your server over SSH." onClick={() => setDialog('deploy')} />
          <Quick
            icon={<Share2 size={18} />}
            title={site.shareUrl ? 'Shared' : 'Share a public link'}
            text={site.shareUrl ? site.shareUrl.replace('https://', '') : 'A temporary https address anyone can open.'}
            onClick={async () => {
              const r = await act(`share-${site.name}`, async () => { if (site.shareUrl) await api.invoke('sites:unshare', site.name); else await api.invoke('sites:share', site.name); return true })
              if (r) void api.invoke('sites:list').then(setSites)
            }}
          />
          <Quick icon={<Camera size={18} />} title="Snapshot first" text="A safety copy before you ship." onClick={() => setDialog('snap')} />
        </div>
      )}
      {tab === 'deploy' && <HostingPanel site={site} />}

      {dialog === 'snap' && <SnapshotsDialog site={site} onClose={() => setDialog(null)} />}
      {dialog === 'deploy' && <DeployDialog site={site} onClose={() => setDialog(null)} />}
      {dialog === 'push' && <PushDialog site={site} onClose={() => setDialog(null)} />}
      {dialog === 'azure' && <AzurePushDialog site={site} onClose={() => setDialog(null)} />}
      {dialog === 'doctor' && <SiteDoctor site={site} aiName="AI" onClose={() => setDialog(null)} />}
    </>
  )
}

function Quick({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }): React.JSX.Element {
  return (
    <button className="quick glass" onClick={onClick}>
      <span className="quick-icon">{icon}</span>
      <strong>{title}</strong>
      <span className="hint">{text}</span>
    </button>
  )
}

function Logs({ site }: { site: SiteInfo }): React.JSX.Element {
  const api = window.laramac
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ name: string; path: string }[]>([])
  const box = useRef<HTMLPreElement>(null)
  useEffect(() => {
    void api.invoke('sites:logs', site.name).then(setFiles).catch(() => undefined)
    if (!site.dev) return
    const read = (): void => void api.invoke('dev:logs', site.name).then(setText).catch(() => undefined)
    read()
    const t = setInterval(read, 2000)
    return () => clearInterval(t)
  }, [api, site.name, site.dev])
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [text])
  return (
    <div className="site-grid">
      {site.dev && (
        <div className="panel pad">
          <div className="row-title">Dev server output (live)</div>
          <pre ref={box} className="code-block dev-out" style={{ maxHeight: 360 }}>
            {text || (site.dev.running ? 'Waiting for output…' : 'Not running.')}
          </pre>
        </div>
      )}
      <div className="panel">
        {files.length === 0 && <div className="empty dim">No log files found for this site yet.</div>}
        {files.map((f) => (
          <div key={f.path} className="rt-row">
            <ScrollText size={15} />
            <div className="row-main">
              <div className="row-title">{f.name}</div>
              <div className="row-sub mono">{f.path.replace(/^\/Users\/[^/]+/, '~')}</div>
            </div>
            <button className="btn btn-sm" onClick={() => api.invoke('sites:open-log', site.name, f.path)}>
              Open
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EnvEditor({ site, files }: { site: SiteInfo; files: { file: string; exists: boolean }[] }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const existing = files.filter((f) => f.exists)
  const [file, setFile] = useState(existing[0]?.file ?? '.env')
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [show, setShow] = useState(false)
  useEffect(() => {
    void api.invoke('site:env-read', site.name, file).then((t) => {
      setText(t)
      setSaved(t)
    })
  }, [api, site.name, file])
  const masked = text.replace(/^([A-Z0-9_]*(KEY|SECRET|PASSWORD|TOKEN|PASS)[A-Z0-9_]*=)(.{4})(.*)$/gim, (_m, k, _w, a) => `${k}${a}••••••••`)
  return (
    <div className="panel pad">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div className="seg" role="radiogroup" aria-label="File">
          {files.map((f) => (
            <button key={f.file} role="radio" aria-checked={file === f.file} onClick={() => setFile(f.file)}>
              {f.file}
              {!f.exists && <span className="hint"> (new)</span>}
            </button>
          ))}
        </div>
        <label className="check-row" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show secret values
        </label>
      </div>
      {show ? (
        <textarea className="input mono env-text" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label={file} />
      ) : (
        <pre className="code-block env-text" onClick={() => setShow(true)} title="Click to edit">
          {masked || 'Empty. Click to edit.'}
        </pre>
      )}
      <div className="end" style={{ marginTop: 10 }}>
        <span className="hint" style={{ marginRight: 'auto' }}>
          {text !== saved ? 'Not saved yet. Restart the dev server after saving so it reads the change.' : 'Values stay on this Mac, in the project folder.'}
        </span>
        <button
          className="btn btn-primary"
          disabled={text === saved || busy.has('env')}
          onClick={async () => {
            const ok = await act('env', () => api.invoke('site:env-write', site.name, file, text).then(() => true))
            if (ok) {
              setSaved(text)
              notify({ kind: 'info', text: `Saved ${file}.` })
            }
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function Packages({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy } = useApp()
  const [list, setList] = useState<OutdatedPackage[] | null>(null)
  const [consent, setConsent] = useState(false)
  const safe = list?.filter((p) => !p.major && p.wanted && p.wanted !== p.current) ?? []
  const update = async (o: { names?: string[]; latest?: boolean }, key: string): Promise<void> => {
    const r = await act(key, () => window.laramac.invoke('site:update-packages', site.name, o))
    if (r) setList(r)
  }
  const working = [...busy].some((b) => b.startsWith(`pkg-${site.name}`))
  return (
    <div className="site-grid">
      <div className="panel">
        <div className="rt-row">
          <Package size={16} />
          <div className="row-main">
            <div className="row-title">Outdated packages</div>
            <div className="row-sub">From npm and Composer’s own reports. Checking runs nothing in the project.</div>
          </div>
          {safe.length > 0 && (
            <button className="btn btn-sm" disabled={!consent || working} onClick={() => update({}, `pkg-${site.name}-safe`)}>
              {busy.has(`pkg-${site.name}-safe`) ? 'Updating…' : `Update ${safe.length} safe ${safe.length === 1 ? 'one' : 'ones'}`}
            </button>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy.has('outdated')} onClick={async () => setList((await act('outdated', () => window.laramac.invoke('site:outdated', site.name))) ?? null)}>
            {busy.has('outdated') ? 'Checking…' : list ? 'Check again' : 'Check now'}
          </button>
        </div>
        {list?.length === 0 && <div className="empty dim">Everything is up to date (or the packages are not installed yet).</div>}
        {list?.map((p) => (
          <div key={`${p.manager}-${p.name}`} className="rt-row">
            <span className="tag">{p.manager}</span>
            <div className="row-main">
              <div className="row-title mono">{p.name}</div>
              <div className="row-sub">
                {p.current} → {p.latest}
                {p.major ? ' · new major version: read its changes first' : p.wanted && p.wanted !== p.current ? ` · ${p.wanted} is a safe update` : ''}
                {p.abandoned ? ' · abandoned' : ''}
              </div>
            </div>
            {p.major && <span className="sev" data-sev="medium">major</span>}
            <button className="btn btn-sm" disabled={!consent || working} onClick={() => update({ names: [p.name], latest: true }, `pkg-${site.name}-${p.name}`)}>
              {busy.has(`pkg-${site.name}-${p.name}`) ? 'Updating…' : `Update to ${p.latest}`}
            </button>
          </div>
        ))}
      </div>
      {list && list.length > 0 && (
        <label className="panel pad upd-consent">
          <input type="checkbox" checked={consent} onChange={() => setConsent(!consent)} />
          <span>Updating runs this project’s own install scripts (npm and Composer do this). Laramac saves a snapshot first, so you can go back under Snapshots. Then run your tests.</span>
        </label>
      )}
    </div>
  )
}

function SiteSecurity({ site, facts }: { site: SiteInfo; facts: SiteFacts | null }): React.JSX.Element {
  const { act, busy, setPage } = useApp()
  const api = window.laramac
  const last = facts?.reviews[0]
  const [findings, setFindings] = useState<ReviewFinding[] | null>(null)
  useEffect(() => {
    if (last) void api.invoke('review:findings', last.id).then(setFindings)
  }, [api, last])
  return (
    <div className="site-grid">
      <div className="panel pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={18} />
        <div className="row-main">
          <div className="row-title">{last ? `Reviewed ${new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not reviewed yet'}</div>
          <div className="row-sub">Read-only review with Laramac’s security skills, and MacSec’s scanners when installed.</div>
        </div>
        <button className="btn" onClick={() => setPage('security')}>
          <Bot size={13} /> Choose a reviewer
        </button>
        <button
          className="btn btn-primary"
          disabled={busy.has('site-review')}
          onClick={async () => {
            const r = await act('site-review', () => api.invoke('review:run', { source: { kind: 'site', site: site.name }, reviewer: 'claude', focus: 'security', scanners: true }))
            if (r) setFindings(await api.invoke('review:findings', r.id))
          }}
        >
          {busy.has('site-review') ? 'Reviewing…' : 'Review with Claude Code'}
        </button>
      </div>
      {last && findings && <FindingsList id={last.id} findings={findings} onChange={setFindings} />}
    </div>
  )
}
