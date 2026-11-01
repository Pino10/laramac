import { useEffect, useState } from 'react'
import { CircleAlert, Check, Database, FolderOpen, Globe, Upload } from 'lucide-react'
import type { ImportAnswers, ImportPlan, ImportResult } from '@shared/types'
import { useApp } from '../store'
import { formatBytes, Monogram } from '../ui'

type Step = 'pick' | 'review' | 'running' | 'done'

const kindName: Record<string, string> = {
  wordpress: 'WordPress',
  laravel: 'Laravel',
  symfony: 'Symfony',
  php: 'PHP',
  node: 'Node',
  python: 'Python',
  dotnet: '.NET',
  go: 'Go',
  rust: 'Rust',
  swift: 'Swift',
  static: 'Static site'
}

/**
 * Import a project from anywhere (Laragon, a server backup, a colleague): archive or folder plus
 * an optional SQL dump. Laramac unpacks it privately, shows what it found, asks a few questions,
 * then puts the files in www and the data in MySQL or MariaDB.
 */
export default function ImportWizard(): React.JSX.Element | null {
  const { importOpen, setImportOpen, act, busy, settings, jobs, setSites, setPage, tools } = useApp()
  const api = window.laramac
  const [step, setStep] = useState<Step>('pick')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [answers, setAnswers] = useState<ImportAnswers | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const tld = settings?.tld ?? 'test'

  useEffect(() => {
    if (!importOpen) {
      setStep('pick')
      setPlan(null)
      setAnswers(null)
      setResult(null)
    }
  }, [importOpen])

  if (!importOpen) return null

  const close = (): void => {
    if (step === 'running') return
    if (plan && step === 'review') void api.invoke('import:cancel', plan.id)
    setImportOpen(false)
  }

  const choose = async (): Promise<void> => {
    const p = await act('import-choose', () => api.invoke('import:choose'))
    if (!p) return
    setPlan(p)
    setAnswers({
      name: p.suggestedName,
      sqlFile: p.sqlFiles[0]?.path ?? null,
      engine: p.engines[0] ?? 'mysql',
      database: p.suggestedDb,
      updateConfig: !!p.configFile,
      replaceUrl: true,
      composerInstall: false
    })
    setStep('review')
  }

  const run = async (): Promise<void> => {
    if (!plan || !answers) return
    setStep('running')
    const r = await act('import-run', () => api.invoke('import:run', plan.id, answers))
    if (r) {
      setResult(r)
      setSites(r.sites)
      setStep('done')
    } else {
      // The session is consumed by a failed run; start again from the file.
      setStep('pick')
      setPlan(null)
    }
  }

  const job = jobs.find((j) => j.label.startsWith('Importing') && j.status === 'running')
  const set = (patch: Partial<ImportAnswers>): void => setAnswers((a) => (a ? { ...a, ...patch } : a))
  const domain = answers ? `${answers.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}.${tld}` : ''
  const needsEngine = !!answers?.sqlFile && plan?.engines.length === 0

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="wizard glass" role="dialog" aria-label="Import" onMouseDown={(e) => e.stopPropagation()}>
        {step === 'pick' && (
          <>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              Import a project
            </h2>
            <p className="page-desc" style={{ marginBottom: 18 }}>
              Bring a site in from Laragon, a server backup or a teammate. Files go to your projects folder, the database goes
              into MySQL or MariaDB, and the config is pointed at both.
            </p>
            <button className="dropzone" onClick={choose} disabled={busy.has('import-choose')}>
              <span className="dropzone-icon">
                <Upload size={20} />
              </span>
              <strong style={{ fontSize: 14 }}>{busy.has('import-choose') ? 'Reading what you chose' : 'Choose a file or folder'}</strong>
              <span className="hint">.zip, .tar.gz, .tgz, a project folder, or a .sql / .sql.gz dump</span>
            </button>
            <div className="hint" style={{ marginTop: 14 }}>
              Moving from Laragon? Put your project folder from <code>C:\laragon\www</code> and its .sql export (from HeidiSQL or
              phpMyAdmin) into one zip. Laramac finds both.
            </div>
            <div className="end" style={{ marginTop: 18 }}>
              <button className="btn" onClick={close}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'review' && plan && answers && (
          <>
            <h2 className="page-title" style={{ fontSize: 20, marginBottom: 14 }}>
              Here is what's inside {plan.sourceName}
            </h2>

            <div className="found">
              {plan.hasProject && (
                <div className="found-row">
                  {plan.kind ? <Monogram id={plan.kind} /> : <FolderOpen size={16} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{kindName[plan.kind ?? 'php'] ?? 'Website'} project</div>
                    <div className="hint">
                      {plan.configFile ? `Settings in ${plan.configFile}` : 'No config file found'}
                      {!plan.hasVendor && ' · vendor folder missing'}
                    </div>
                  </div>
                </div>
              )}
              {plan.sqlFiles.map((f) => (
                <div key={f.path} className="found-row">
                  <Database size={16} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.path}</div>
                    <div className="hint">Database dump, {formatBytes(f.size)}</div>
                  </div>
                </div>
              ))}
              {plan.oldUrl && (
                <div className="found-row">
                  <Globe size={16} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{plan.oldUrl}</div>
                    <div className="hint">The address it used before</div>
                  </div>
                </div>
              )}
            </div>

            {plan.warnings.map((w) => (
              <div key={w} className="warn">
                <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {w}
              </div>
            ))}

            {plan.hasProject && (
              <div className="field">
                <label htmlFor="imp-name">Site name</label>
                <input id="imp-name" className="input" value={answers.name} onChange={(e) => set({ name: e.target.value })} />
                <span className="hint">Opens at {domain}</span>
              </div>
            )}

            {plan.sqlFiles.length > 0 && (
              <>
                <div className="field">
                  <span className="field-label">Database</span>
                  <select
                    className="input"
                    aria-label="SQL file to import"
                    value={answers.sqlFile ?? ''}
                    onChange={(e) => set({ sqlFile: e.target.value || null })}
                  >
                    {plan.sqlFiles.map((f) => (
                      <option key={f.path} value={f.path}>
                        Import {f.path}
                      </option>
                    ))}
                    <option value="">Do not import a database</option>
                  </select>
                </div>
                {answers.sqlFile && (
                  <>
                    {needsEngine ? (
                      <div className="warn">
                        <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        Install MySQL or MariaDB first, then import again.
                        <button
                          className="link"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => {
                            close()
                            setPage('databases')
                          }}
                        >
                          Open Databases
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 14 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <span className="field-label">Server</span>
                          <div className="seg" role="radiogroup" aria-label="Database server">
                            {plan.engines.map((e) => (
                              <button key={e} role="radio" aria-checked={answers.engine === e} onClick={() => set({ engine: e })}>
                                {e === 'mysql' ? 'MySQL' : 'MariaDB'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                          <label htmlFor="imp-db">Database name</label>
                          <input id="imp-db" className="input" value={answers.database} onChange={(e) => set({ database: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {plan.hasProject && plan.configFile && (
              <label className="check">
                <input type="checkbox" checked={answers.updateConfig} onChange={(e) => set({ updateConfig: e.target.checked })} />
                <span>
                  Point {plan.configFile} at the local database
                  <span className="hint" style={{ display: 'block' }}>
                    Sets the database name, user root and no password. The original file is replaced.
                  </span>
                </span>
              </label>
            )}
            {plan.hasProject && plan.configFile && (
              <label className="check">
                <input type="checkbox" checked={answers.replaceUrl} onChange={(e) => set({ replaceUrl: e.target.checked })} />
                <span>
                  Use the address http://{domain}
                  {plan.oldUrl && (
                    <span className="hint" style={{ display: 'block' }}>
                      Instead of {plan.oldUrl}
                    </span>
                  )}
                </span>
              </label>
            )}
            {plan.hasProject && !plan.hasVendor && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={answers.composerInstall}
                  disabled={!tools?.composer && !settings}
                  onChange={(e) => set({ composerInstall: e.target.checked })}
                />
                <span>
                  Install Composer packages
                  <span className="hint" style={{ display: 'block' }}>
                    Runs the project's own Composer scripts. Only turn this on for code you trust.
                  </span>
                </span>
              </label>
            )}

            <div className="end" style={{ marginTop: 18 }}>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={needsEngine || (plan.hasProject && !answers.name.trim())} onClick={run}>
                Import
              </button>
            </div>
          </>
        )}

        {step === 'running' && (
          <div style={{ padding: '18px 4px' }}>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              Importing {answers?.name}
            </h2>
            <p className="page-desc" style={{ margin: '6px 0 16px' }}>
              {job?.label ?? 'Getting started'}
            </p>
            <div className="progress" style={{ height: 4 }}>
              <div className={job?.percent == null ? 'bar indeterminate' : 'bar'} style={job?.percent == null ? undefined : { width: `${job.percent}%` }} />
            </div>
            <p className="hint" style={{ marginTop: 14 }}>
              Large databases can take a few minutes. You can keep working; Laramac will notify you when it is done.
            </p>
          </div>
        )}

        {step === 'done' && result && (
          <div style={{ padding: '6px 2px' }}>
            <div className="done-mark">
              <Check size={26} />
            </div>
            <h2 className="page-title" style={{ fontSize: 20 }}>
              {result.site ? `${result.site} is ready` : `Database ${result.database} is ready`}
            </h2>
            <p className="page-desc" style={{ margin: '6px 0 4px' }}>
              {[result.site && `Files are in your projects folder at ${domain}.`, result.database && `The data is in the ${result.database} database.`]
                .filter(Boolean)
                .join(' ')}
            </p>
            {result.skipped > 0 && (
              <p className="hint">{result.skipped} lines that would switch databases or change users were skipped.</p>
            )}
            <div className="end" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => setImportOpen(false)}>
                Close
              </button>
              {result.database && (
                <button className="btn" onClick={() => api.invoke('sites:open-url', `http://phpmyadmin.${tld}`)}>
                  Open phpMyAdmin
                </button>
              )}
              {result.site && (
                <button className="btn btn-primary" onClick={() => api.invoke('sites:open-url', `http://${domain}`)}>
                  Open site
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
