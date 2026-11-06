import { Check } from 'lucide-react'
import { useApp } from '../store'

type Look = 'studio' | 'classic' | 'zen' | 'aurora' | 'sunset' | 'terminal' | 'mono'
type Mode = 'follow' | 'dark' | 'light' | 'auto'

const LOOKS: { id: Look; name: string; about: string }[] = [
  { id: 'studio', name: 'Studio', about: 'Feels like a classic IDE: a narrow tool strip, grey panels, underlined tabs, a path bar on top.' },
  { id: 'classic', name: 'Classic', about: 'Feels like VS Code: icon bar on the left, minimap, a bold coloured status bar.' },
  { id: 'zen', name: 'Zen', about: 'Feels like Zed: no icon bar, almost no chrome, soft tabs, a tiny status bar.' },
  { id: 'aurora', name: 'Aurora', about: 'Agent-first: the AI panel stays open on the right, in floating glass cards.' },
  { id: 'sunset', name: 'Sunset', about: 'Warm plum and amber glow, icon bar along the bottom, big soft corners.' },
  { id: 'terminal', name: 'Terminal', about: 'Green on near-black, monospace everywhere, block cursor, relative line numbers.' },
  { id: 'mono', name: 'Mono', about: 'Pure black and white. Inverted status bar, hairlines, no colour at all.' }
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
        <div className="lk-ai">
          <u />
          <u />
        </div>
      </div>
      <div className="lk-status">
        <i />
        <i />
      </div>
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
