import { Cloud, Code, Mail, Package, Terminal, Waypoints } from 'lucide-react'
import { useApp } from '../store'
import { CopyField, PageHead } from '../ui'

type Installable = 'cloudflared' | 'ngrok' | 'composer'

export default function Tools(): React.JSX.Element {
  const { tools, settings, services, act, busy, setTools, updateSettings } = useApp()
  const api = window.laramac
  if (!tools || !settings) return <></>

  const mailpit = services.find((s) => s.id === 'mailpit')
  const install = (tool: Installable): Promise<unknown> => act(`tool-${tool}`, () => api.invoke('tools:install', tool).then(setTools))

  return (
    <>
      <PageHead title="Tools" desc="Everything around your sites: mail, sharing, packages and the apps you code in." />

      <div className="grid-2" style={{ marginBottom: 10 }}>
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
            {settings.shareProvider === 'cloudflare' ? (
              tools.cloudflared ? (
                <span className="tag tag-ok">Ready</span>
              ) : (
                <button className="btn" disabled={busy.has('tool-cloudflared')} onClick={() => install('cloudflared')}>
                  <Cloud size={14} /> Install
                </button>
              )
            ) : tools.ngrok ? (
              <span className="tag tag-ok">Ready</span>
            ) : (
              <button className="btn" disabled={busy.has('tool-ngrok')} onClick={() => install('ngrok')}>
                Install
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
            <div className="row-sub">Opens from the code button on each site.</div>
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
        <div className="row row-icon">
          <span className="icon-chip">
            <Terminal size={15} />
          </span>
          <div className="row-main">
            <div className="row-title">Claude Code</div>
            <div className="row-sub">Opens in Terminal inside a site, with PHP, Composer and MySQL on its path.</div>
          </div>
          {tools.claude ? (
            <span className="tag tag-ok">Installed</span>
          ) : (
            <button className="btn" onClick={() => act('install-claude', () => api.invoke('tools:install-claude'))}>
              Install
            </button>
          )}
        </div>
      </div>
    </>
  )
}
