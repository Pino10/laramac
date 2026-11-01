import { useApp } from '../store'

export default function Php(): React.JSX.Element {
  const { php, settings, act, busy, setPhp, jobs } = useApp()
  const api = window.laramac
  const installing = jobs.some((j) => j.status === 'running' && j.label.includes('PHP'))

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">PHP versions</h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Install any version, keep several side by side, and pick one per site.{' '}
          {settings?.phpFlavor === 'full' ? 'Using the full extension set.' : 'Using the lightweight build.'}
        </p>
      </div>

      {php.length === 0 ? (
        <div className="glass p-8 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          Loading versions… If this stays empty, check your internet connection.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {php.map((v) => (
            <div key={v.minor} className="glass flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">PHP {v.minor}</span>
                  {v.isDefault && <span className="chip chip-ok">Default</span>}
                  {v.installed && <span className="chip">{v.installed}</span>}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {v.installed ? `Installed. Newest available: ${v.latest}` : `Latest: ${v.latest}`}
                </div>
              </div>
              <div className="no-drag flex gap-2">
                {v.installed ? (
                  <>
                    {!v.isDefault && (
                      <button
                        className="btn"
                        onClick={() => act(`default-${v.minor}`, () => api.invoke('php:set-default', v.minor).then(setPhp))}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      className="btn"
                      disabled={busy.has(`remove-${v.minor}`)}
                      onClick={() => act(`remove-${v.minor}`, () => api.invoke('php:remove', v.minor).then(setPhp))}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={busy.has(`install-php-${v.minor}`) || installing}
                    onClick={() => act(`install-php-${v.minor}`, () => api.invoke('php:install', v.minor).then(setPhp))}
                  >
                    {busy.has(`install-php-${v.minor}`) ? 'Installing…' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
