import { useApp } from '../store'
import { CopyField, PageHead } from '../ui'

type Installable = 'cloudflared' | 'ngrok' | 'composer'

export default function Tools(): React.JSX.Element {
  const { tools, settings, services, act, busy, setTools, updateSettings } = useApp()
  const api = window.laramac
  if (!tools || !settings) return <></>

  const mailpit = services.find((s) => s.id === 'mailpit')
  const install = (tool: Installable): Promise<unknown> =>
    act(`tool-${tool}`, () => api.invoke('tools:install', tool).then(setTools))

  return (
    <>
      <PageHead title="Tools" desc="Mail catching, public links, package management and your editor." />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        Mail
      </h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Mailpit inbox</div>
            <div className="row-sub">Every email your apps send stays on this Mac. PHP mail() is connected to it.</div>
          </div>
          <div className="end no-drag">
            <CopyField value="127.0.0.1:1025" />
            <button
              className="btn btn-primary"
              disabled={mailpit?.status !== 'running'}
              title={mailpit?.status !== 'running' ? 'Start Mailpit on the Dashboard first' : undefined}
              onClick={() => api.invoke('sites:open-url', 'http://127.0.0.1:8025')}
            >
              Open inbox
            </button>
          </div>
        </div>
      </div>

      <h2 className="section-title">Public links</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Tunnel provider</div>
            <div className="row-sub">Used by the share button on each site.</div>
          </div>
          <select
            className="input no-drag"
            aria-label="Tunnel provider"
            value={settings.shareProvider}
            onChange={(e) => updateSettings({ shareProvider: e.target.value as 'cloudflare' | 'ngrok' })}
          >
            <option value="cloudflare">Cloudflare Tunnel</option>
            <option value="ngrok">ngrok</option>
          </select>
        </div>
        <ToolRow
          name="Cloudflare Tunnel"
          hint="No account needed."
          installed={tools.cloudflared}
          busy={busy.has('tool-cloudflared')}
          onInstall={() => install('cloudflared')}
        />
        <ToolRow
          name="ngrok"
          hint="Needs your authtoken, set in Settings."
          installed={tools.ngrok}
          busy={busy.has('tool-ngrok')}
          onInstall={() => install('ngrok')}
        />
      </div>

      <h2 className="section-title">Development</h2>
      <div className="panel">
        <ToolRow
          name="Composer"
          hint="PHP package manager. Laravel projects need it."
          installed={tools.composer}
          busy={busy.has('tool-composer')}
          onInstall={() => install('composer')}
        />
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Editor</div>
            <div className="row-sub">Opens from the code icon on each site.</div>
          </div>
          <select
            className="input no-drag"
            aria-label="Editor"
            value={settings.editor}
            onChange={(e) => updateSettings({ editor: e.target.value as 'cursor' | 'vscode' })}
          >
            <option value="cursor">Cursor{tools.editors.cursor ? '' : ' (not found)'}</option>
            <option value="vscode">VS Code{tools.editors.vscode ? '' : ' (not found)'}</option>
          </select>
        </div>
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Claude Code</div>
            <div className="row-sub">
              Opens in Terminal inside a site folder, with PHP, Composer and MySQL ready.
            </div>
          </div>
          <div className="end no-drag">
            {tools.claude ? (
              <span className="tag tag-ok">Installed</span>
            ) : (
              <button className="btn" onClick={() => act('install-claude', () => api.invoke('tools:install-claude'))}>
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ToolRow({
  name,
  hint,
  installed,
  busy,
  onInstall
}: {
  name: string
  hint: string
  installed: boolean
  busy: boolean
  onInstall: () => void
}): React.JSX.Element {
  return (
    <div className="row row-set">
      <div className="row-main">
        <div className="row-title">{name}</div>
        <div className="row-sub">{hint}</div>
      </div>
      <div className="end no-drag">
        {installed ? (
          <span className="tag tag-ok">Installed</span>
        ) : (
          <button className="btn" disabled={busy} onClick={onInstall}>
            {busy ? 'Installing' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}
