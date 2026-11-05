import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useApp } from '../store'

/** Everything Laramac is working on, live: installs, new projects, reviews, checks. Folds away. */
export default function JobsBar(): React.JSX.Element | null {
  const { jobs } = useApp()
  const [folded, setFolded] = useState(true)
  const running = jobs.filter((j) => j.status === 'running')
  const failed = jobs.filter((j) => j.status === 'error')
  // Finished work leaves the corner; failures stay until you look.
  if (running.length === 0 && failed.length === 0) return null
  const busy = running.length
  const first = running[0]
  const shown = [...running, ...failed].slice(0, 5)

  return (
    <div className="stack-br no-drag" role="status" aria-live="polite">
      <button className="jobs-head glass" onClick={() => setFolded((f) => !f)} aria-expanded={!folded}>
        {busy > 0 && <Loader2 size={13} className="spin" />}
        <span className="jobs-pill-text">{first ? `${first.label}${first.percent !== null ? ` · ${first.percent}%` : ''}` : `${failed.length} could not finish`}</span>
        {busy > 1 && <span className="jobs-more">+{busy - 1}</span>}
        {folded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {!folded && shown.map((job) => (
        <div key={job.id} className="job glass">
          <div className="job-top">
            <span>{job.label}</span>
            <span
              className="num"
              style={{ color: job.status === 'error' ? 'var(--bad)' : job.status === 'done' ? 'var(--ok)' : undefined }}
            >
              {job.status === 'error' ? 'Failed' : job.status === 'done' ? 'Done' : job.percent === null ? '' : `${job.percent}%`}
            </span>
          </div>
          {job.status === 'error' ? (
            <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 4 }}>{job.error}</div>
          ) : (
            <div className="progress">
              <div
                className={job.percent === null ? 'bar indeterminate' : 'bar'}
                style={job.percent === null ? undefined : { width: `${job.percent}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
