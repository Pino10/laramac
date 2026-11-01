import { useApp } from '../store'
import { PageHead } from '../ui'

export default function Php(): React.JSX.Element {
  const { php, settings, act, busy, setPhp, jobs } = useApp()
  const api = window.laramac
  const installing = jobs.some((j) => j.status === 'running' && j.label.includes('PHP'))

  return (
    <>
      <PageHead
        title="PHP"
        desc={`Install any version and keep several at once. Each site picks its own. Using the ${
          settings?.phpFlavor === 'full' ? 'full extension set' : 'lightweight build'
        }.`}
      />

      {php.length === 0 ? (
        <div className="panel empty">
          <strong>No versions to show</strong>
          <span className="dim">Laramac could not reach the download server. Check your connection.</span>
        </div>
      ) : (
        <div className="panel">
          {php.map((v) => (
            <div key={v.minor} className="row row-php">
              <span style={{ fontWeight: 600 }} className="num">
                {v.minor}
              </span>
              <div className="row-main">
                <div className="row-title">
                  {v.installed ? v.installed : v.latest}
                  {v.isDefault && <span className="tag tag-accent">Default</span>}
                </div>
                <div className="row-sub">{v.installed ? 'Installed' : 'Available'}</div>
              </div>
              <div className="end no-drag">
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
                      className="btn btn-quiet"
                      disabled={busy.has(`remove-${v.minor}`)}
                      onClick={() => act(`remove-${v.minor}`, () => api.invoke('php:remove', v.minor).then(setPhp))}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    className="btn"
                    disabled={busy.has(`install-php-${v.minor}`) || installing}
                    onClick={() => act(`install-php-${v.minor}`, () => api.invoke('php:install', v.minor).then(setPhp))}
                  >
                    {busy.has(`install-php-${v.minor}`) ? 'Installing' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
