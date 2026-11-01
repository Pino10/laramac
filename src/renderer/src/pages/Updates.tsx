import { useEffect, useState } from 'react'
import { ArrowDownToLine, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import type { ReleaseNote } from '@shared/types'
import { useApp } from '../store'
import { PageHead, Switch } from '../ui'
import Notes from '../components/Notes'

export default function Updates(): React.JSX.Element {
  const { appInfo, update, setUpdate, settings, updateSettings, act, busy, jobs, notify } = useApp()
  const api = window.laramac
  const [notes, setNotes] = useState<ReleaseNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = appInfo?.version ?? ''
  const job = jobs.find((j) => j.label === 'Updating Laramac')

  useEffect(() => {
    api
      .invoke('app:changelog')
      .then(setNotes)
      .catch(() => setError('The changelog could not be loaded. Check your internet connection.'))
  }, [api])

  const check = async (): Promise<void> => {
    const next = await act('check-update', () => api.invoke('app:check-update'))
    setUpdate(next ?? null)
    if (!next) notify({ kind: 'info', text: `You have the newest Laramac, ${current}.` })
    setNotes(await api.invoke('app:changelog').catch(() => notes))
  }

  return (
    <>
      <PageHead title="Updates" desc="What changed in each version, and the newest Laramac for your Mac. Updating keeps your settings, PHP versions, databases and sites." />

      <div className="update-hero glass">
        <span className="update-mark" data-new={!!update}>
          {update ? <ArrowDownToLine size={22} /> : <CheckCircle2 size={22} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{update ? `Laramac ${update.version} is ready` : 'Laramac is up to date'}</strong>
          <span>
            {job
              ? `${job.label}${job.percent !== null ? `, ${job.percent}%` : ''}`
              : update
                ? `You have ${current}. The update is checked against its published checksum and signature before it installs.`
                : `You have version ${current}.`}
          </span>
        </div>
        <button className="btn" disabled={busy.has('check-update')} onClick={check}>
          <RefreshCw size={14} /> {busy.has('check-update') ? 'Checking…' : 'Check now'}
        </button>
        {update && (
          <button className="btn btn-primary" disabled={busy.has('install-update')} onClick={() => act('install-update', () => api.invoke('app:install-update'))}>
            {busy.has('install-update') ? 'Updating…' : 'Update and restart'}
          </button>
        )}
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Check for updates automatically</div>
            <div className="row-sub">Laramac looks once a day and tells you. Nothing installs without you.</div>
          </div>
          {settings && <Switch on={settings.autoUpdateCheck} label="Check for updates automatically" onChange={() => updateSettings({ autoUpdateCheck: !settings.autoUpdateCheck })} />}
        </div>
      </div>

      <h2 className="section-title">Changelog</h2>
      {error && <div className="group empty-state">{error}</div>}
      {notes === null && !error && <div className="group empty-state">Loading…</div>}
      <div className="changelog">
        {notes?.map((n) => (
          <article key={n.version} className="release glass" data-current={n.version === current}>
            <header>
              <span className="release-version">{n.version}</span>
              {n.version === current && <span className="tag tag-accent">Installed</span>}
              {update?.version === n.version && <span className="tag tag-ok">New</span>}
              <span className="hint" style={{ marginLeft: 'auto' }}>
                {new Date(n.publishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button className="icon-btn" data-tip="Open on GitHub" aria-label={`Release ${n.version} on GitHub`} onClick={() => api.invoke('tools:open-external', n.url)}>
                <ExternalLink />
              </button>
            </header>
            <Notes text={n.notes.split(/\n## Download/)[0]} />
          </article>
        ))}
      </div>
    </>
  )
}
