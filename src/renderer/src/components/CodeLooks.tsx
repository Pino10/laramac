import { Check } from 'lucide-react'
import { useApp } from '../store'

type Look = 'aurora' | 'paper' | 'carbon' | 'sunset' | 'terminal'
type Mode = 'follow' | 'dark' | 'light' | 'auto'

const LOOKS: { id: Look; name: string; about: string }[] = [
  { id: 'aurora', name: 'Aurora', about: 'Soft floating glass cards on a glowing backdrop. Rounded and friendly.' },
  { id: 'paper', name: 'Paper', about: 'One calm, flat page with almost no lines. Quiet and spacious.' },
  { id: 'carbon', name: 'Carbon', about: 'Dense and sharp, with accent edges. Made for long sessions and big screens.' },
  { id: 'sunset', name: 'Sunset', about: 'Warm plum and amber glow, big soft corners. Brings its own colours.' },
  { id: 'terminal', name: 'Terminal', about: 'Green on near-black, monospace everywhere, hard edges. Brings its own colours.' }
]

const MODES: [Mode, string][] = [
  ['follow', 'Follow Laramac'],
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['auto', 'Match my Mac']
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
  const mode = (settings?.codeAppearance ?? 'follow') as Mode
  return (
    <>
    <div className="row row-set look-mode">
      <div className="row-main">
        <div className="row-title">Dark or light</div>
        <div className="row-sub">Follow Laramac, or choose for Laramac Code alone.</div>
      </div>
      <div className="seg" role="radiogroup" aria-label="Laramac Code mode">
        {MODES.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={mode === id} onClick={() => void updateSettings({ codeAppearance: id })}>
            {label}
          </button>
        ))}
      </div>
    </div>
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
    </>
  )
}
