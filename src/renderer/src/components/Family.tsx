import { useEffect, useState } from 'react'
import { Check, ExternalLink, ShieldHalf } from 'lucide-react'
import codeIcon from '../assets/code-icon.png'
import type { IdeStatus } from '@shared/types'
import { useApp } from '../store'

/** Laramac Code and MacSec: the two apps that go with Laramac. */
export default function Family(): React.JSX.Element {
  const { act, busy, setPage } = useApp()
  const api = window.laramac
  const [ide, setIde] = useState<IdeStatus | null>(null)
  const [macsec, setMacsec] = useState<boolean | null>(null)
  useEffect(() => {
    void api.invoke('ide:status').then(setIde)
    void api.invoke('macsec:status').then((r) => setMacsec(r.installed))
  }, [api])
  return (
    <div className="family">
      <div className="family-card" style={{ ['--g1' as string]: '#60a5fa', ['--g2' as string]: '#7c3aed' }}>
        <img className="family-logo" src={codeIcon} alt="" width={46} height={46} />
        <div className="family-text">
          <strong>Laramac Code</strong>
          <span>Its own app, set up for PHP and Laravel: smart completion, refactoring, Xdebug, Claude Code and Cline in the side panel, and checks when you save. Free.</span>
        </div>
        <div className="family-actions">
          {ide?.installed ? (
            <button className="btn btn-primary btn-sm" disabled={busy.has('ide-open-app')} onClick={() => act('ide-open-app', () => api.invoke('ide:open', null))}>
              Open
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setPage('code')}>
              Install
            </button>
          )}
        </div>
      </div>
      <div className="family-card" style={{ ['--g1' as string]: '#22d3ee', ['--g2' as string]: '#ec4899' }}>
        <span className="family-icon">
          <ShieldHalf size={22} />
        </span>
        <div className="family-text">
          <strong>MacSec</strong>
          <span>Laramac’s security workbench: every free scanner plus an AI reviewer, recon, web and API scans, package alerts and “I leaked a key” help. Laramac’s code reviews use its scanners when it is installed.</span>
        </div>
        <div className="family-actions">
          {macsec ? (
            <span className="tag tag-ok">
              <Check size={11} /> Installed
            </span>
          ) : (
            <button className="btn btn-sm" onClick={() => api.invoke('tools:open-external', 'https://github.com/Pino10/macsec/releases/latest')}>
              Get MacSec <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
