import { useApp } from '../store'

type Installable = 'phpmyadmin' | 'cloudflared' | 'ngrok' | 'composer'

export default function Tools(): React.JSX.Element {
  const { tools, settings, services, act, busy, setTools, updateSettings } = useApp()
  const api = window.laramac
  if (!tools || !settings) return <div />

  const mailpit = services.find((s) => s.id === 'mailpit')
  const install = (tool: Installable): Promise<unknown> =>
    act(`tool-${tool}`, () => api.invoke('tools:install', tool).then(setTools))

  return (
    <div className="fade-in">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Tools</h1>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Database" hint="phpMyAdmin signs in as root automatically.">
          <div className="text-xs" style={{ color: 'var(--text-dim)', userSelect: 'text' }}>
            Host 127.0.0.1 · Port 3306 · User root · No password
          </div>
          {tools.phpmyadmin ? (
            <button className="btn btn-primary" onClick={() => api.invoke('sites:open-url', `http://phpmyadmin.${settings.tld}`)}>
              Open phpMyAdmin
            </button>
          ) : (
            <button className="btn" disabled={busy.has('tool-phpmyadmin')} onClick={() => install('phpmyadmin')}>
              {busy.has('tool-phpmyadmin') ? 'Installing…' : 'Install phpMyAdmin'}
            </button>
          )}
          <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Needs MySQL, PHP and Nginx running.
          </div>
        </Card>

        <Card title="Mail" hint="Every email your apps send lands here. Nothing leaves your Mac.">
          <div className="text-xs" style={{ color: 'var(--text-dim)', userSelect: 'text' }}>
            SMTP 127.0.0.1:1025 · Inbox 127.0.0.1:8025
          </div>
          <button
            className="btn btn-primary"
            disabled={mailpit?.status !== 'running'}
            onClick={() => api.invoke('sites:open-url', 'http://127.0.0.1:8025')}
          >
            Open inbox
          </button>
          {mailpit?.status !== 'running' && (
            <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Install and start Mailpit from the Dashboard.
            </div>
          )}
        </Card>

        <Card title="Public links" hint="Share a local site with anyone, from the Sites page.">
          <div className="flex items-center gap-2">
            <select
              className="input"
              value={settings.shareProvider}
              onChange={(e) => updateSettings({ shareProvider: e.target.value as 'cloudflare' | 'ngrok' })}
            >
              <option value="cloudflare">Cloudflare Tunnel (no account)</option>
              <option value="ngrok">ngrok (needs authtoken)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={tools.cloudflared || busy.has('tool-cloudflared')} onClick={() => install('cloudflared')}>
              {tools.cloudflared ? 'Cloudflare installed' : 'Install Cloudflare'}
            </button>
            <button className="btn" disabled={tools.ngrok || busy.has('tool-ngrok')} onClick={() => install('ngrok')}>
              {tools.ngrok ? 'ngrok installed' : 'Install ngrok'}
            </button>
          </div>
        </Card>

        <Card title="Composer" hint="PHP package manager. Needed for Laravel projects.">
          <button className="btn" disabled={tools.composer || busy.has('tool-composer')} onClick={() => install('composer')}>
            {tools.composer ? 'Installed' : busy.has('tool-composer') ? 'Installing…' : 'Install Composer'}
          </button>
        </Card>

        <Card title="Editor" hint="Used by the editor button on each site.">
          <select
            className="input"
            value={settings.editor}
            onChange={(e) => updateSettings({ editor: e.target.value as 'cursor' | 'vscode' })}
          >
            <option value="cursor">Cursor {tools.editors.cursor ? '' : '(not found)'}</option>
            <option value="vscode">VS Code {tools.editors.vscode ? '' : '(not found)'}</option>
          </select>
        </Card>

        <Card title="Claude Code" hint="Open an AI coding session in any site folder, with PHP and MySQL ready on its PATH.">
          {tools.claude ? (
            <div className="text-sm" style={{ color: 'var(--ok)' }}>
              Installed. Use the Claude Code button on a site.
            </div>
          ) : (
            <button className="btn" onClick={() => act('install-claude', () => api.invoke('tools:install-claude'))}>
              Install Claude Code
            </button>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({
  title,
  hint,
  children
}: {
  title: string
  hint: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="glass no-drag flex flex-col items-start gap-3 p-4">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {hint}
        </div>
      </div>
      {children}
    </div>
  )
}
