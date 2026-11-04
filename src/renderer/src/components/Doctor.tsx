import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Stethoscope, Wrench, XCircle } from 'lucide-react'
import type { HealthIssue } from '@shared/types'
import { useApp } from '../store'

/**
 * The Doctor: what is wrong right now, each with a fix. Checks on open, every 30 seconds while it is
 * on screen, and whenever sites or services change. With `site`, only that site's problems and the
 * ones that stop every site (no web server, .test addresses) are shown.
 */
export default function Doctor({ site, quietWhenFine = false }: { site?: string; quietWhenFine?: boolean }): React.JSX.Element | null {
  const { act, busy, services, sites, showSite } = useApp()
  const [issues, setIssues] = useState<HealthIssue[] | null>(null)
  const check = useCallback(() => void window.laramac.invoke('health:check').then(setIssues).catch(() => undefined), [])
  const stamp = `${services.map((s) => s.status).join(',')}|${sites.map((s) => `${s.name}${s.dev?.running}`).join(',')}`
  useEffect(() => {
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [check, stamp])
  if (!issues) return null
  const shown = issues.filter((i) => !site || !i.site || i.site === site)
  if (!shown.length) {
    if (quietWhenFine) return null
    return (
      <div className="health doctor-ok glass">
        <CheckCircle2 size={18} />
        <span>
          <b>Everything works.</b> {site ? 'This site answers, and its services are running.' : 'Every site answers, and every service is running.'}
        </span>
      </div>
    )
  }
  const fix = async (i: HealthIssue): Promise<void> => {
    if (!i.fix) return
    if (i.fix.startsWith('logs:')) return showSite(i.fix.slice(5), 'logs')
    const next = await act(`fix-${i.id}`, () => window.laramac.invoke('health:fix', i.fix!))
    if (next) setIssues(next)
  }
  return (
    <div className="health glass">
      <div className="doctor-head">
        <Stethoscope size={17} />
        <b>{shown.length === 1 ? 'One thing needs attention' : `${shown.length} things need attention`}</b>
        <button className="link" style={{ marginLeft: 'auto' }} onClick={check}>
          Check again
        </button>
      </div>
      {shown.map((i) => (
        <div key={i.id} className="doctor-row" data-level={i.level}>
          {i.level === 'error' ? <XCircle size={16} /> : i.level === 'warn' ? <AlertTriangle size={16} /> : <Info size={16} />}
          <div className="row-main">
            <div className="row-title">{i.title}</div>
            <div className="row-sub" style={{ whiteSpace: 'normal' }}>
              {i.detail}
            </div>
          </div>
          {i.site && !site && (
            <button className="btn btn-sm btn-quiet" onClick={() => showSite(i.site!)}>
              Open site
            </button>
          )}
          {i.fix && (
            <button className="btn btn-sm btn-primary" disabled={busy.has(`fix-${i.id}`)} onClick={() => void fix(i)}>
              <Wrench size={12} /> {busy.has(`fix-${i.id}`) ? 'Fixing…' : (i.fixLabel ?? 'Fix it')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
