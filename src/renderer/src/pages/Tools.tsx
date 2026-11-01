import { useEffect, useState } from 'react'
import { Bot, Cloud, Code, ExternalLink, Mail, Package, Waypoints } from 'lucide-react'
import type { AiTool } from '@shared/types'
import { useApp } from '../store'
import { CopyField, PageHead } from '../ui'

type Installable = 'cloudflared' | 'ngrok' | 'composer'

const AI_HUES: Record<string, [string, string]> = {
  claude: ['Cc', '#d97757'],
  opencode: ['Oc', '#5f6b7a'],
  openclaw: ['Ow', '#e0533d'],
  codex: ['Cx', '#10a37f'],
  gemini: ['Ge', '#4a7cf6'],
  vmlx: ['vM', '#8b5cf6'],
  'mlx-lm': ['ML', '#6d6d72'],
  ollama: ['Ol', '#4b4b4f'],
  lmstudio: ['LM', '#4f46e5']
}

export default function Tools(): React.JSX.Element {
  const { tools, settings, services, act, busy, setTools, updateSettings, notify } = useApp()
  const api = window.laramac
  const [ai, setAi] = useState<AiTool[]>([])

  useEffect(() => {
    const load = (): void => void api.invoke('ai:tools').then(setAi)
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [api])

  if (!tools || !settings) return <></>
  const mailpit = services.find((s) => s.id === 'mailpit')
  const install = (tool: Installable): Promise<unknown> => act(`tool-${tool}`, () => api.invoke('tools:install', tool).then(setTools))

  return (
    <>
      <PageHead title="Tools" desc="AI coding agents, local models, mail, sharing and packages, all a click away." />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        <Bot size={14} /> AI tools <small>Install with each project's official installer, which runs in Terminal so you can see every step.</small>
      </h2>
      <div className="grid-3">
        {ai.map((t) => {
          const [letters, hue] = AI_HUES[t.id] ?? [t.name.slice(0, 2), '#8a919c']
          const isDefault = settings.aiTool === t.id
          return (
            <div key={t.id} className="card glass ai-card" data-default={isDefault && t.kind === 'cli'}>
              <div className="card-head">
                <span className="mono-tile lg" style={{ ['--hue' as string]: hue }} aria-hidden>
                  {letters}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">
                    {t.name}
                    {t.installed && <span className="tag tag-ok">Installed</span>}
                  </div>
                  <div className="hint">{t.kind === 'app' ? 'Mac app' : 'Command line'}</div>
                </div>
              </div>
              <div className="hint" style={{ minHeight: 34 }}>
                {t.description}
                {t.note && <span style={{ display: 'block', color: 'var(--warn)' }}>{t.note}</span>}
              </div>
              <div className="card-foot">
                {t.kind === 'cli' && t.installed ? (
                  <button
                    className="btn btn-quiet"
                    disabled={isDefault}
                    title="Used by the AI button on each site"
                    onClick={() => updateSettings({ aiTool: t.id })}
                  >
                    {isDefault ? 'Used for sites' : 'Use for sites'}
                  </button>
                ) : (
                  <span />
                )}
                {t.installed ? (
                  <button className="btn btn-primary" onClick={() => act(`ai-${t.id}`, () => api.invoke('ai:launch-tool', t.id, null))}>
                    Open
                  </button>
                ) : (
                  <button
                    className="btn"
                    disabled={!t.available}
                    onClick={async () => {
                      await act(`ai-install-${t.id}`, () => api.invoke('ai:install-tool', t.id))
                      notify({ kind: 'info', text: t.kind === 'app' ? `Opened the ${t.name} download page.` : `Installing ${t.name} in Terminal. Come back when it finishes.` })
                    }}
                  >
                    {t.kind === 'app' ? (
                      <>
                        <ExternalLink size={13} /> Get app
                      </>
                    ) : (
                      'Install'
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="section-title">Everything else</h2>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="card glass">
          <div className="card-head">
            <span className="icon-chip">
              <Mail size={16} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="card-title">Mail inbox</div>
              <div className="hint">Every email your apps send lands here and never leaves this Mac.</div>
            </div>
          </div>
          <CopyField value="smtp://127.0.0.1:1025" />
          <div className="card-foot">
            <span className="status" data-s={mailpit?.status}>
              {mailpit?.status === 'running' ? 'Catching mail' : mailpit?.status === 'not-installed' ? 'Mailpit is not installed' : 'Mailpit is off'}
            </span>
            <button className="btn btn-primary" disabled={mailpit?.status !== 'running'} onClick={() => api.invoke('sites:open-url', 'http://127.0.0.1:8025')}>
              Open inbox
            </button>
          </div>
        </div>

        <div className="card glass">
          <div className="card-head">
            <span className="icon-chip">
              <Waypoints size={16} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="card-title">Public links</div>
              <div className="hint">The share button on each site uses this tunnel.</div>
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Tunnel provider" style={{ alignSelf: 'flex-start' }}>
            {(['cloudflare', 'ngrok'] as const).map((p) => (
              <button key={p} role="radio" aria-checked={settings.shareProvider === p} onClick={() => updateSettings({ shareProvider: p })}>
                {p === 'cloudflare' ? 'Cloudflare' : 'ngrok'}
              </button>
            ))}
          </div>
          <div className="card-foot">
            <span className="hint">
              {settings.shareProvider === 'cloudflare' ? 'No account needed.' : settings.ngrokToken ? 'Authtoken saved.' : 'Add your authtoken in Settings.'}
            </span>
            {(settings.shareProvider === 'cloudflare' ? tools.cloudflared : tools.ngrok) ? (
              <span className="tag tag-ok">Ready</span>
            ) : (
              <button
                className="btn"
                disabled={busy.has(`tool-${settings.shareProvider === 'cloudflare' ? 'cloudflared' : 'ngrok'}`)}
                onClick={() => install(settings.shareProvider === 'cloudflare' ? 'cloudflared' : 'ngrok')}
              >
                <Cloud size={14} /> Install
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="row row-icon">
          <span className="icon-chip">
            <Package size={15} />
          </span>
          <div className="row-main">
            <div className="row-title">Composer</div>
            <div className="row-sub">PHP packages. Available as composer in any terminal Laramac opens.</div>
          </div>
          {tools.composer ? (
            <span className="tag tag-ok">Installed</span>
          ) : (
            <button className="btn" disabled={busy.has('tool-composer')} onClick={() => install('composer')}>
              {busy.has('tool-composer') ? 'Installing' : 'Install'}
            </button>
          )}
        </div>
        <div className="row row-icon">
          <span className="icon-chip">
            <Code size={15} />
          </span>
          <div className="row-main">
            <div className="row-title">Editor</div>
            <div className="row-sub">Opens from the code button on each site, and for php.ini.</div>
          </div>
          <div className="seg" role="radiogroup" aria-label="Editor">
            {(['cursor', 'vscode'] as const).map((e) => (
              <button
                key={e}
                role="radio"
                aria-checked={settings.editor === e}
                title={(e === 'cursor' ? tools.editors.cursor : tools.editors.vscode) ? undefined : 'Not found in Applications'}
                onClick={() => updateSettings({ editor: e })}
              >
                {e === 'cursor' ? 'Cursor' : 'VS Code'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
