import { useApp } from '../store'
import { PageHead } from '../ui'

export default function Php(): React.JSX.Element {
  const { php, settings, act, busy, setPhp, jobs, sites, setPage } = useApp()
  const api = window.laramac
  const installing = jobs.some((j) => j.status === 'running' && j.label.includes('PHP'))
  const def = php.find((p) => p.isDefault)
  const usage = (minor: string): number => sites.filter((s) => s.php === minor).length

  return (
    <>
      <PageHead
        title="PHP"
        desc={`Keep as many versions as you need side by side. Each site picks its own on the Sites page. Builds include the ${
          settings?.phpFlavor === 'full' ? 'full extension set' : 'lightweight extension set'
        }.`}
      />

      {def ? (
        <div className="php-hero glass">
          <div className="php-num">{def.minor}</div>
          <div style={{ flex: 1 }}>
            <div className="card-title">Default version</div>
            <div className="dim">
              {def.installed}. Used by {usage(def.minor)} {usage(def.minor) === 1 ? 'site' : 'sites'}, new projects, Composer and the terminal.
            </div>
          </div>
          <button className="btn" onClick={() => setPage('sites')}>
            Choose per site
          </button>
        </div>
      ) : (
        <div className="php-hero glass">
          <div className="php-num dim">—</div>
          <div>
            <div className="card-title">No PHP yet</div>
            <div className="dim">Install a version below. 8.4 is a good default for new work.</div>
          </div>
        </div>
      )}

      {php.length === 0 ? (
        <div className="panel empty">
          <strong>Could not load the version list</strong>
          <span className="dim">Laramac could not reach the download server. Check your connection.</span>
        </div>
      ) : (
        <div className="grid-3">
          {php.map((v) => {
            const state = v.isDefault ? 'default' : v.installed ? 'installed' : 'available'
            const n = usage(v.minor)
            return (
              <div key={v.minor} className="card glass" data-state={state}>
                <div className="card-head" style={{ justifyContent: 'space-between' }}>
                  <span className="php-tile-num">{v.minor}</span>
                  {state === 'default' ? (
                    <span className="tag tag-accent">Default</span>
                  ) : state === 'installed' ? (
                    <span className="tag tag-ok">Installed</span>
                  ) : null}
                </div>
                <div className="hint">
                  {v.installed ? `${v.installed}${n ? `, used by ${n} ${n === 1 ? 'site' : 'sites'}` : ''}` : `Latest ${v.latest}`}
                </div>
                <div className="card-foot">
                  {v.installed ? (
                    <>
                      {!v.isDefault ? (
                        <button className="btn" onClick={() => act(`default-${v.minor}`, () => api.invoke('php:set-default', v.minor).then(setPhp))}>
                          Make default
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        className="btn btn-quiet"
                        disabled={busy.has(`remove-${v.minor}`) || n > 0}
                        title={n > 0 ? 'Sites still use this version' : undefined}
                        onClick={() => act(`remove-${v.minor}`, () => api.invoke('php:remove', v.minor).then(setPhp))}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      style={{ width: '100%' }}
                      disabled={busy.has(`install-php-${v.minor}`) || installing}
                      onClick={() => act(`install-php-${v.minor}`, () => api.invoke('php:install', v.minor).then(setPhp))}
                    >
                      {busy.has(`install-php-${v.minor}`) ? 'Installing' : `Install ${v.latest}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
