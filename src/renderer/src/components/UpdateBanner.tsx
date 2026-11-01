import { useState } from 'react'
import { ArrowDownToLine } from 'lucide-react'
import { useApp } from '../store'
import Notes from './Notes'

/** Shown when a newer Laramac is on GitHub. Updating keeps every setting, PHP version, database and site. */
export default function UpdateBanner(): React.JSX.Element | null {
  const { update, act, busy, jobs } = useApp()
  const [showNotes, setShowNotes] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!update || dismissed === update.version) return null
  const job = jobs.find((j) => j.label === 'Updating Laramac' || j.label.startsWith('Downloading Laramac'))

  return (
    <>
      <div className="banner" role="status">
        <span className="banner-icon">
          <ArrowDownToLine size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Laramac {update.version} is ready</div>
          <div className="row-sub" style={{ whiteSpace: 'normal' }}>
            {job ? `${job.label}${job.percent !== null ? `, ${job.percent}%` : ''}` : `You have ${update.current}. Your settings, PHP versions, databases and sites stay as they are.`}
          </div>
        </div>
        <button className="btn btn-quiet" onClick={() => setShowNotes(true)}>
          What's new
        </button>
        {!job && (
          <button className="btn btn-quiet" onClick={() => setDismissed(update.version)}>
            Later
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={busy.has('install-update')}
          onClick={() => act('install-update', () => window.laramac.invoke('app:install-update'))}
        >
          {busy.has('install-update') ? 'Updating' : 'Update and restart'}
        </button>
      </div>
      {showNotes && (
        <div className="scrim" onMouseDown={() => setShowNotes(false)}>
          <div className="dialog glass" style={{ width: 560, maxHeight: '74vh', overflowY: 'auto' }} onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              What's new in {update.version}
            </h2>
            <p className="hint" style={{ margin: '4px 0 10px' }}>
              Released {new Date(update.publishedAt).toLocaleDateString()}
            </p>
            <Notes text={update.notes} />
            <div className="end" style={{ marginTop: 18 }}>
              <button className="btn" onClick={() => window.laramac.invoke('tools:open-external', update.url)}>
                Open on GitHub
              </button>
              <button className="btn btn-primary" onClick={() => setShowNotes(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
