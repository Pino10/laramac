import { useApp } from '../store'

/** Floating progress panel for downloads and installs. */
export default function JobsBar(): React.JSX.Element | null {
  const { jobs } = useApp()
  if (jobs.length === 0) return null

  return (
    <div className="no-drag pointer-events-none fixed bottom-4 right-4 z-40 flex w-80 flex-col gap-2">
      {jobs.map((job) => (
        <div key={job.id} className="glass glass-strong pointer-events-auto fade-in p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{job.label}</span>
            <span
              className="shrink-0 text-xs"
              style={{
                color:
                  job.status === 'error' ? 'var(--bad)' : job.status === 'done' ? 'var(--ok)' : 'var(--text-dim)'
              }}
            >
              {job.status === 'error' ? 'Failed' : job.status === 'done' ? 'Done' : job.percent === null ? '…' : `${job.percent}%`}
            </span>
          </div>
          {job.status === 'error' ? (
            <div className="mt-1 line-clamp-3 text-xs" style={{ color: 'var(--bad)' }}>
              {job.error}
            </div>
          ) : (
            <div className="progress mt-2">
              <div
                className={job.percent === null ? 'bar indeterminate' : 'bar'}
                style={{ width: job.percent === null ? '40%' : `${job.percent}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
