import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useApp } from '../store'

/** Everything Laramac is working on, live: installs, new projects, reviews, checks. Folds away. */
export default function JobsBar(): React.JSX.Element | null {
  const { jobs } = useApp()
  const [folded, setFolded] = useState(false)
  if (jobs.length === 0) return null
  const busy = jobs.filter((j) => j.status === 'running').length

  return (
    <div className="stack-br no-drag" role="status" aria-live="polite">
      <button className="jobs-head glass" onClick={() => setFolded((f) => !f)} aria-expanded={!folded}>
        {busy > 0 && <Loader2 size={13} className="spin" />}
        <span>{busy ? `Working on ${busy} ${busy === 1 ? 'thing' : 'things'}` : 'All done'}</span>
        {folded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {!folded && jobs.map((job) => (
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
