import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, CheckCircle2, ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import type { ReleaseNote, UpdateItem } from '@shared/types'
import { useApp } from '../store'
import { PageHead, Switch } from '../ui'
import Notes from '../components/Notes'

const GROUPS: { id: UpdateItem['group']; title: string }[] = [
  { id: 'php', title: 'PHP' },
  { id: 'node', title: 'Node.js' },
  { id: 'runtime', title: 'Languages' },
  { id: 'service', title: 'Services' },
  { id: 'database', title: 'Databases' },
  { id: 'tool', title: 'Tools' },
  { id: 'site', title: 'Your sites' }
]

/** Words in the release notes that matter to this person, from what they use. */
function interests(o: { kinds: string[]; services: string[]; php: string[]; hasNode: boolean; tools: string[] }): { word: RegExp; label: string }[] {
  const out: { word: RegExp; label: string }[] = []
  const add = (label: string, re: RegExp): void => void out.push({ word: re, label })
  if (o.kinds.includes('laravel')) add('Laravel', /laravel|artisan|filament/i)
  if (o.kinds.includes('wordpress')) add('WordPress', /wordpress|wp-?cli/i)
  if (o.kinds.includes('symfony')) add('Symfony', /symfony/i)
  if (o.hasNode || o.kinds.includes('node')) add('JavaScript', /node\.?js|next\.?js|nuxt|vite|react|vue|svelte|astro|npm|dev server/i)
  if (o.kinds.includes('python')) add('Python', /python|django|flask|fastapi|uv\b/i)
  if (o.php.length) add('PHP', /\bphp\b|composer|xdebug/i)
  for (const s of o.services) {
    if (s === 'mysql' || s === 'mariadb') add('MySQL', /mysql|mariadb|database/i)
    if (s === 'postgres') add('PostgreSQL', /postgres/i)
    if (s === 'redis') add('Redis', /redis/i)
    if (s === 'mailpit') add('Mail', /mailpit|mail/i)
    if (s === 'apache' || s === 'nginx') add('Web server', /apache|nginx|web server|\.test/i)
  }
  if (o.tools.includes('claude')) add('Claude', /claude|code review|recon|skills|mcp/i)
  return [...new Map(out.map((x) => [x.label, x])).values()]
}

export default function Updates(): React.JSX.Element {
  const { appInfo, update, setUpdate, updates, setUpdates, settings, updateSettings, act, busy, jobs, notify, sites, services, php, tools } = useApp()
  const api = window.laramac
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [consent, setConsent] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const current = appInfo?.version ?? ''
  const job = jobs.find((j) => j.label === 'Updating Laramac')
  const checking = busy.has('updates-check')

  useEffect(() => {
    api
      .invoke('app:changelog')
      .then(setNotes)
      .catch(() => setError('The changelog could not be loaded. Check your internet connection.'))
    // Look now when nothing was checked in the last hour.
    if (!updates || Date.now() - updates.checkedAt > 3600_000) void act('updates-check', () => api.invoke('updates:check', false)).then((r) => r && setUpdates(r))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const items = (updates?.items ?? []).filter((i) => i.group !== 'laramac')
  const chosen = picked ?? new Set(items.filter((i) => !i.runsProjectCode).map((i) => i.id))
  const needsConsent = items.some((i) => chosen.has(i.id) && i.runsProjectCode)
  const toggle = (id: string): void => {
    const n = new Set(chosen)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setPicked(n)
  }

  const checkAll = async (): Promise<void> => {
    const next = await act('check-update', () => api.invoke('app:check-update'))
    setUpdate(next ?? null)
    const r = await act('updates-check', () => api.invoke('updates:check', true))
    if (r) {
      setUpdates(r)
      setPicked(null)
      if (!next && !r.items.length) notify({ kind: 'info', text: `Everything is up to date, Laramac ${current} included.` })
    }
    setNotes(await api.invoke('app:changelog').catch(() => notes))
  }

  const apply = async (ids: string[]): Promise<void> => {
    const r = await act('updates-apply', () => api.invoke('updates:apply', ids, consent))
    if (r) {
      setUpdates(r.report)
      setPicked(null)
      setConsent(false)
      if (r.failed.length) notify({ kind: 'error', text: r.failed.map((f) => f.error).join(' ') })
    }
  }

  const mine = useMemo(
    () =>
      interests({
        kinds: [...new Set(sites.map((s) => s.kind))],
        services: services.filter((s) => s.status !== 'not-installed').map((s) => s.id),
        php: (php ?? []).filter((p) => p.installed).map((p) => p.minor),
        hasNode: sites.some((s) => !!s.dev),
        tools: tools?.claude ? ['claude'] : []
      }),
    [sites, services, php, tools]
  )
  const newer = (notes ?? []).filter((n) => n.version !== current && (!current || n.version.localeCompare(current, undefined, { numeric: true }) > 0))
  const older = (notes ?? []).filter((n) => !newer.includes(n))
  const relevance = (n: ReleaseNote): string[] => mine.filter((m) => m.word.test(n.notes)).map((m) => m.label)

  return (
    <>
      <PageHead title="Updates" desc="Everything on your Mac that Laramac looks after, in one place: Laramac, PHP, Node.js, languages, services, tools and your sites' packages.">
        <button className="btn" disabled={checking || busy.has('check-update')} onClick={checkAll}>
          <RefreshCw size={14} /> {checking ? 'Checking…' : 'Check now'}
        </button>
      </PageHead>

      <div className="update-hero glass">
        <span className="update-mark" data-new={!!update}>
          {update ? <ArrowDownToLine size={22} /> : <CheckCircle2 size={22} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{update ? `Laramac ${update.version} is ready` : `Laramac ${current} is up to date`}</strong>
          <span>
            {job
              ? `${job.label}${job.percent !== null ? `, ${job.percent}%` : ''}`
              : update
                ? `${newer.length > 1 ? `${newer.length} versions of changes since yours. ` : ''}Checked against its published checksum and signature before it installs. Your settings, sites and databases stay as they are.`
                : 'You have the newest version.'}
          </span>
        </div>
        {update && (
          <button className="btn btn-primary" disabled={busy.has('install-update')} onClick={() => act('install-update', () => api.invoke('app:install-update'))}>
            {busy.has('install-update') ? 'Updating…' : 'Update and restart'}
          </button>
        )}
      </div>

      <div className="upd-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          On your Mac
        </h2>
        <span className="hint">{updates ? `${items.length ? `${items.length} ${items.length === 1 ? 'update' : 'updates'}` : 'All up to date'} · checked ${new Date(updates.checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : checking ? 'Checking…' : ''}</span>
        {items.length > 0 && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={busy.has('updates-apply') || chosen.size === 0 || (needsConsent && !consent)} onClick={() => apply([...chosen])}>
            <ArrowDownToLine size={14} /> {busy.has('updates-apply') ? 'Updating…' : chosen.size === items.length ? 'Update all' : `Update ${chosen.size}`}
          </button>
        )}
      </div>

      {checking && !updates && <div className="panel pad hint">Looking at PHP, Node.js, languages, services, tools and each site's packages…</div>}
      {updates && items.length === 0 && (
        <div className="panel pad upd-clear">
          <CheckCircle2 size={18} /> Everything Laramac looks after is on its newest version.
        </div>
      )}
      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g.id)
        if (!list.length) return null
        return (
          <div key={g.id} className="panel upd-group">
            <div className="upd-group-title">{g.title}</div>
            {list.map((i) => (
              <label key={i.id} className="row upd-row">
                <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Update ${i.name}`} />
                <div className="row-main">
                  <div className="row-title">
                    {i.name}
                    {i.jump === 'major' && <span className="tag tag-warn">Big jump</span>}
                    {i.runsProjectCode && <span className="tag">Runs its install scripts</span>}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                    {i.detail}
                  </div>
                </div>
                <div className="upd-ver mono">
                  {i.current && <span>{i.current}</span>}
                  {i.current && <span className="hint">→</span>}
                  <strong>{i.latest}</strong>
                </div>
              </label>
            ))}
          </div>
        )
      })}
      {needsConsent && (
        <label className="panel pad upd-consent">
          <input type="checkbox" checked={consent} onChange={() => setConsent(!consent)} />
          <span>
            Updating a site's packages runs that project's own install scripts (npm and Composer do this). Laramac saves a snapshot of each site first, so you can go back from its page. Only versions the project already allows are installed; bigger jumps wait for you on the site's Packages tab.
          </span>
        </label>
      )}
      {(updates?.notes.length ?? 0) > 0 && <div className="hint" style={{ marginTop: 8 }}>{updates!.notes.join(' ')}</div>}

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Check for updates automatically</div>
            <div className="row-sub">Laramac looks once a day and puts a dot on Updates. Nothing installs without you.</div>
          </div>
          {settings && <Switch on={settings.autoUpdateCheck} label="Check for updates automatically" onChange={() => updateSettings({ autoUpdateCheck: !settings.autoUpdateCheck })} />}
        </div>
      </div>

      {mine.length > 0 && (
        <div className="hint upd-mine">
          <Sparkles size={13} /> Marked for you: changes that touch {mine.map((m) => m.label).join(', ')}, from the sites and services you have.
        </div>
      )}
      <h2 className="section-title">{newer.length ? 'New since your version' : 'Changelog'}</h2>
      {error && <div className="group empty-state">{error}</div>}
      {notes === null && !error && <div className="group empty-state">Loading…</div>}
      <div className="changelog">
        {[...newer, ...(showAll || !newer.length ? older : older.slice(0, 1))].map((n) => {
          const rel = relevance(n)
          return (
            <article key={n.version} className="release glass" data-current={n.version === current} data-new={newer.includes(n)}>
              <header>
                <span className="release-version">{n.version}</span>
                {n.version === current && <span className="tag tag-accent">Installed</span>}
                {newer.includes(n) && <span className="tag tag-ok">New</span>}
                {rel.map((r) => (
                  <span key={r} className="tag tag-for-you">
                    {r}
                  </span>
                ))}
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  {new Date(n.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <button className="icon-btn" data-tip="Open on GitHub" aria-label={`Release ${n.version} on GitHub`} onClick={() => api.invoke('tools:open-external', n.url)}>
                  <ExternalLink />
                </button>
              </header>
              <Notes text={n.notes.split(/\n## Download/)[0]} />
            </article>
          )
        })}
      </div>
      {!showAll && newer.length > 0 && older.length > 1 && (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>
          Show older versions
        </button>
      )}
    </>
  )
}
