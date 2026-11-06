import { Check } from 'lucide-react'
import { useApp } from '../store'

type Look = 'aurora' | 'paper' | 'carbon'

const LOOKS: { id: Look; name: string; about: string }[] = [
  { id: 'aurora', name: 'Aurora', about: 'Soft floating glass cards on a glowing backdrop. Rounded and friendly.' },
  { id: 'paper', name: 'Paper', about: 'One calm, flat page with almost no lines. Quiet and spacious.' },
  { id: 'carbon', name: 'Carbon', about: 'Dense and sharp, with accent edges. Made for long sessions and big screens.' }
]

/** A tiny drawing of the editor in one look. It is only a picture: nothing in it is clickable. */
function Mini({ look }: { look: Look }): React.JSX.Element {
  return (
    <div className={`lk lk-${look}`} aria-hidden="true">
      <div className="lk-title">
        <i />
        <i />
        <i />
        <b />
      </div>
      <div className="lk-body">
        <div className="lk-rail">
          <i />
          <i />
          <i />
        </div>
        <div className="lk-side">
          <u />
          <u />
          <u />
          <u />
        </div>
        <div className="lk-main">
          <div className="lk-tabs">
            <span className="on" />
            <span />
            <span />
          </div>
          <div className="lk-code">
            <em style={{ width: '58%' }} />
            <em style={{ width: '38%' }} className="k" />
            <em style={{ width: '72%' }} />
            <em style={{ width: '46%' }} className="s" />
            <em style={{ width: '30%' }} />
          </div>
        </div>
      </div>
      <div className="lk-status" />
    </div>
  )
}

/** Three different looks for Laramac Code. Picking one changes the open editor within a minute. */
export default function CodeLooks(): React.JSX.Element {
  const { settings, updateSettings } = useApp()
  const current = (settings?.codeLook ?? 'aurora') as Look
  return (
    <div className="look-grid" role="radiogroup" aria-label="Laramac Code look">
      {LOOKS.map((l) => (
        <button key={l.id} role="radio" aria-checked={current === l.id} className={`look-card${current === l.id ? ' on' : ''}`} onClick={() => void updateSettings({ codeLook: l.id })}>
          <Mini look={l.id} />
          <span className="look-name">
            <strong>{l.name}</strong>
            {current === l.id && (
              <span className="look-check">
                <Check size={12} /> In use
              </span>
            )}
          </span>
          <span className="look-about">{l.about}</span>
        </button>
      ))}
    </div>
  )
}
