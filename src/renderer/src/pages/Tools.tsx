import { useEffect, useState } from 'react'
import { Cloud, Copy, Sparkles, Code, ExternalLink, Mail, Package, TerminalSquare, Waypoints } from 'lucide-react'
import type { AiTool, LlmTest, McpStatus } from '@shared/types'
import { useApp } from '../store'
import { CopyField, PageHead, Switch } from '../ui'

type Installable = 'cloudflared' | 'ngrok' | 'composer'

/** What the buttons do, in one line, so nobody has to guess. */
const AI_HOW: Record<string, string> = {
  claude: 'Terminal starts it in your home folder. The AI button on each site starts it inside that project, ready to work on its code.',
  codex: 'Terminal starts it in your home folder. The AI button on each site starts it inside that project.',
  opencode: 'Terminal starts it in your home folder. The AI button on each site starts it inside that project. It can use LM Studio or Ollama models too.',
  gemini: 'Terminal starts it in your home folder. The AI button on each site starts it inside that project.',
  openclaw: 'Terminal starts it so you can set it up and chat with it.',
  lmstudio: 'Open LM Studio, load a model, then turn on the server in its Developer tab. The status here turns green.',
  ollama: 'Open Ollama (it lives in the menu bar). Get a model with "ollama pull llama3.2" in Terminal. The status here turns green.',
  vmlx: 'Open vMLX, pick a model and start serving it. Laramac looks for it on port 8000.'
}
const MODEL_APPS = new Set(['lmstudio', 'ollama', 'vmlx'])

const AI_LETTERS: Record<string, string> = { claude: 'Cc', codex: 'Cx', opencode: 'Oc', vmlx: 'vM', lmstudio: 'LM', ollama: 'Ol', openclaw: 'Ow', gemini: 'Ge' }

export default function Tools(): React.JSX.Element {
  const { tools, settings, services, act, busy, setTools, updateSettings, notify, llms, refreshLlms, setPage } = useApp()
  const [tests, setTests] = useState<Record<string, LlmTest>>({})
  const api = window.laramac
  const [ai, setAi] = useState<AiTool[]>([])
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  useEffect(() => {
    void api.invoke('mcp:status').then(setMcp)
  }, [api])

  useEffect(() => {
    const load = (): void => {
      void api.invoke('ai:tools').then(setAi)
      refreshLlms()
    }
    load()
    const t = setInterval(refreshLlms, 8000)
    window.addEventListener('focus', load)
    return () => {
      window.removeEventListener('focus', load)
      clearInterval(t)
    }
  }, [api, refreshLlms])

  if (!tools || !settings) return <></>
  const mailpit = services.find((s) => s.id === 'mailpit')
  const install = (tool: Installable): Promise<unknown> => act(`tool-${tool}`, () => api.invoke('tools:install', tool).then(setTools))

  return (
    <>
      <PageHead title="Tools" desc="Coding agents and local models, mail, public links and Composer. Installers run in Terminal so you can see every step." />

      <div className="mcp-card glass">
        <span className="mcp-mark" aria-hidden>
          <Sparkles size={20} />
        </span>
        <div className="mcp-body">
          <strong>Let Claude Code work with Laramac</strong>
          <span>
            Claude Code can then see your sites, start and stop services, switch PHP versions, create databases, read logs and take snapshots while it works.
            Only this Mac can reach it, and only with a private key.
          </span>
          {mcp?.error && <span style={{ color: 'var(--bad)' }}>{mcp.error}</span>}
          <div className="mcp-actions">
            {mcp?.claude === 'connected' ? (
              <span className="tag tag-ok">Claude Code is connected</span>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy.has('mcp-connect') || mcp?.claude === 'not-installed'}
                onClick={async () => {
                  const next = await act('mcp-connect', () => api.invoke('mcp:connect'))
                  if (next) {
                    setMcp(next)
                    notify({ kind: 'info', text: 'Claude Code is connected. Ask it to list your sites.' })
                  }
                }}
              >
                {busy.has('mcp-connect') ? 'Connecting…' : mcp?.claude === 'not-installed' ? 'Install Claude Code first' : 'Connect Claude Code'}
              </button>
            )}
            <button
              className="btn btn-quiet"
              disabled={!mcp}
              onClick={async () => {
                if (!mcp) return
                await navigator.clipboard.writeText(mcp.command)
                notify({ kind: 'info', text: 'Setup command copied. It includes your private key, so keep it to yourself.' })
              }}
            >
              <Copy size={14} /> Copy setup command
            </button>
          </div>
        </div>
        <span title={mcp?.enabled ? 'On' : 'Off'}>
          <Switch
            on={!!mcp?.enabled}
            label="Let AI tools use Laramac"
            disabled={!mcp || busy.has('mcp-enable')}
            onChange={async () => {
              const next = await act('mcp-enable', () => api.invoke('mcp:enable', !mcp?.enabled))
              if (next) setMcp(next)
            }}
          />
        </span>
      </div>

      <h2 className="section-title">AI tools</h2>
      <div className="ai-grid">
        {ai.map((t) => {
          const isDefault = settings.aiTool === t.id
          const get = async (kind: 'cli' | 'app'): Promise<void> => {
            await act(`ai-install-${t.id}-${kind}`, () => api.invoke('ai:install-tool', t.id, kind))
            notify({ kind: 'info', text: kind === 'app' ? `Opened the ${t.name} download page.` : `Installing ${t.name} in Terminal. Come back when it finishes.` })
          }
          const open = (kind: 'cli' | 'app'): Promise<unknown> => act(`ai-${t.id}-${kind}`, () => api.invoke('ai:launch-tool', t.id, null, kind))
          const have = t.app?.installed && t.cli?.installed ? 'Mac app and command line' : t.app?.installed ? 'Mac app' : t.cli?.installed ? 'Command line' : 'Not installed'
          return (
            <div key={t.id} className="card glass ai-card" data-default={isDefault && t.installed}>
              <div className="ai-top">
                <span className="mono-tile lg" aria-hidden>
                  {AI_LETTERS[t.id] ?? t.name.slice(0, 2)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{t.name}</strong>
                  <small style={t.installed ? { color: 'var(--ok)' } : undefined}>{t.note ?? have}</small>
                </span>
                {isDefault && t.installed && <span className="tag tag-accent">For sites</span>}
              </div>
              <div className="ai-desc">{t.description}</div>
              {MODEL_APPS.has(t.id) &&
                t.installed &&
                (() => {
                  const server = llms.find((l) => l.toolId === t.id)
                  const result = tests[t.id]
                  if (!server)
                    return (
                      <div className="ai-live" data-s="off">
                        <span className="llm-dot" /> Server is off. Nothing is listening yet.
                      </div>
                    )
                  const model = server.loaded[0] ?? server.models[0]
                  return (
                    <div className="ai-live" data-s={result ? (result.ok ? 'ok' : 'bad') : 'on'}>
                      <span className="llm-dot" />
                      <span className="grow">
                        {result
                          ? result.ok
                            ? `Working. ${model} answered in ${(result.ms / 1000).toFixed(1)} s.`
                            : result.error
                          : `Server on, ${server.models.length} chat ${server.models.length === 1 ? 'model' : 'models'}${server.loaded.length && server.provider !== 'vMLX' && server.provider !== 'MLX server' ? `, ${server.loaded.length} loaded` : ''}.`}
                      </span>
                      {model && (
                        <>
                          <button
                            className="link"
                            disabled={busy.has(`llm-${t.id}`)}
                            onClick={async () => {
                              const r = await act(`llm-${t.id}`, () => api.invoke('ai:test', server.baseUrl, model))
                              if (r) setTests((x) => ({ ...x, [t.id]: r }))
                            }}
                          >
                            {busy.has(`llm-${t.id}`) ? 'Testing…' : 'Test'}
                          </button>
                          <button
                            className="link"
                            onClick={async () => {
                              await updateSettings({ llm: { baseUrl: server.baseUrl, model } })
                              setPage('assistant')
                            }}
                          >
                            Chat
                          </button>
                        </>
                      )}
                    </div>
                  )
                })()}
              {t.installed && <div className="ai-how">{AI_HOW[t.id]}</div>}
              <div className="ai-actions">
                {t.app?.installed && (
                  <button className="btn btn-primary btn-sm" onClick={() => open('app')}>
                    Open app
                  </button>
                )}
                {t.cli?.installed && (
                  <button className={t.app?.installed ? 'btn btn-tonal btn-sm' : 'btn btn-primary btn-sm'} onClick={() => open('cli')}>
                    <TerminalSquare size={14} /> Terminal
                  </button>
                )}
                {t.app && !t.app.installed && (
                  <button className="btn btn-sm" disabled={!t.available} onClick={() => get('app')}>
                    <ExternalLink size={14} /> Get app
                  </button>
                )}
                {t.cli && !t.cli.installed && (
                  <button className="btn btn-sm" disabled={!t.available} onClick={() => get('cli')}>
                    {t.app?.installed ? 'Add command line' : 'Install'}
                  </button>
                )}
                {t.installed && !isDefault && (
                  <button className="btn btn-quiet btn-sm" title="The AI button on each site opens this tool" onClick={() => updateSettings({ aiTool: t.id })}>
                    Use for sites
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
