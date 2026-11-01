import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import type { LlmTest, ChatMessage } from '@shared/types'
import { parseActions, type Action } from '@shared/actions'
import { useApp } from '../store'
import { PageHead } from '../ui'

function describe(a: Action): string {
  switch (a.action) {
    case 'install-php':
      return `Install PHP ${a.version}`
    case 'set-default-php':
      return `Make PHP ${a.version} the default`
    case 'install-service':
      return `Install ${a.id}`
    case 'start-service':
      return `Start ${a.id}`
    case 'stop-service':
      return `Stop ${a.id}`
    case 'create-project':
      return `Create ${a.kind} project ${a.name}`
    case 'enable-ssl':
      return `Turn on HTTPS for ${a.site}`
    case 'open-site':
      return `Open ${a.site}`
  }
}

const SUGGESTIONS = [
  'Set up a WordPress site called shop with HTTPS',
  'Which PHP version should a new Laravel app use?',
  'Start everything I need for Laravel',
  'Why would Nginx fail to start on port 80?'
]

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export default function Assistant(): React.JSX.Element {
  const { llms, refreshLlms, settings, updateSettings, act, busy, services, sites, setServices, setSites, notify } = useApp()
  const api = window.laramac
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  const [test, setTest] = useState<LlmTest | null>(null)
  useEffect(() => {
    refreshLlms()
  }, [refreshLlms])
  // A model that is gone, or one that cannot chat, is swapped for the first loaded chat model.
  useEffect(() => {
    if (!settings) return
    const server = llms.find((l) => l.baseUrl === settings.llm.baseUrl) ?? llms[0]
    if (server && !server.models.includes(settings.llm.model) && server.models[0]) {
      void updateSettings({ llm: { baseUrl: server.baseUrl, model: server.models[0] } })
    }
    setTest(null)
  }, [llms, settings?.llm.baseUrl, settings?.llm.model]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  if (!settings) return <></>
  const current = llms.find((l) => l.baseUrl === settings.llm.baseUrl)

  const send = async (textArg?: string): Promise<void> => {
    const text = (textArg ?? input).trim()
    if (!text) return
    const next: Turn[] = [...turns, { role: 'user', content: text }]
    setTurns(next)
    setInput('')
    const reply = await act('chat', () => api.invoke('ai:chat', next as ChatMessage[]))
    if (reply !== undefined) setTurns([...next, { role: 'assistant', content: reply }])
  }

  const run = async (key: string, a: Action): Promise<void> => {
    const ok = await act(key, async () => {
      switch (a.action) {
        case 'install-php':
          await api.invoke('php:install', a.version)
          break
        case 'set-default-php':
          await api.invoke('php:set-default', a.version)
          break
        case 'install-service':
          await api.invoke('services:install', a.id)
          setServices(await api.invoke('services:list'))
          break
        case 'start-service':
        case 'stop-service': {
          const running = services.find((s) => s.id === a.id)?.status === 'running'
          if ((a.action === 'start-service') !== running) setServices(await api.invoke('services:toggle', a.id))
          break
        }
        case 'create-project':
          setSites(await api.invoke('sites:create', a.kind, a.name))
          break
        case 'enable-ssl':
          setSites(await api.invoke('sites:set-config', a.site, { secure: true }))
          break
        case 'open-site': {
          const site = sites.find((s) => s.name === a.site)
          if (!site) throw new Error(`There is no site named ${a.site}.`)
          await api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)
          break
        }
      }
      return true
    })
    if (ok) {
      setDone((d) => new Set(d).add(key))
      notify({ kind: 'info', text: describe(a) })
    }
  }

  return (
    <>
      <PageHead title="Assistant" desc="Ask a model running on your Mac. It can suggest actions, and nothing runs until you press the button.">
        <select
          className="input"
          aria-label="Model server"
          value={settings.llm.baseUrl}
          onChange={(e) => {
            const found = llms.find((l) => l.baseUrl === e.target.value)
            updateSettings({ llm: { baseUrl: e.target.value, model: found?.models[0] ?? '' } })
          }}
        >
          {!current && <option value={settings.llm.baseUrl}>Custom server</option>}
          {llms.map((l) => (
            <option key={l.baseUrl} value={l.baseUrl}>
              {l.provider}
            </option>
          ))}
        </select>
        {current ? (
          <select className="input" aria-label="Model" value={settings.llm.model} onChange={(e) => updateSettings({ llm: { ...settings.llm, model: e.target.value } })}>
            {current.models.map((m) => (
              <option key={m} value={m}>
                {m}
                {current.loaded.includes(m) ? '  (loaded)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            aria-label="Model name"
            placeholder="Model name"
            value={settings.llm.model}
            onChange={(e) => updateSettings({ llm: { ...settings.llm, model: e.target.value } })}
          />
        )}
        <button className="btn btn-quiet btn-icon" title="Look for local models again" aria-label="Refresh models" onClick={refreshLlms}>
          <RefreshCw size={14} />
        </button>
      </PageHead>

      <div className="llm-status glass" data-s={test ? (test.ok ? 'ok' : 'bad') : current ? 'found' : 'none'}>
        <span className="llm-dot" />
        <div className="llm-text">
          {current ? (
            <>
              <strong>
                {current.provider} at {current.baseUrl.replace('http://', '')}
              </strong>
              <span>
                {test
                  ? test.ok
                    ? `Connected. ${settings.llm.model} answered “${test.reply || 'ready'}” in ${(test.ms / 1000).toFixed(1)} s.`
                    : test.error
                  : current.loaded.includes(settings.llm.model)
                    ? `${settings.llm.model} is loaded and ready. Press Test to check it answers.`
                    : `${settings.llm.model || 'No model chosen'} is not loaded yet, so the first answer can take a while as it loads.`}
              </span>
            </>
          ) : (
            <>
              <strong>No model server found</strong>
              <span>
                LM Studio: open it, load a model, and turn on the server in the Developer tab. Ollama: open the app. vMLX: start serving a model. Then press refresh.
              </span>
            </>
          )}
        </div>
        {current && (
          <button
            className="btn btn-sm"
            disabled={busy.has('llm-test') || !settings.llm.model}
            onClick={async () => {
              const r = await act('llm-test', () => api.invoke('ai:test', settings.llm.baseUrl, settings.llm.model))
              if (r) setTest(r)
            }}
          >
            {busy.has('llm-test') ? 'Testing…' : 'Test'}
          </button>
        )}
      </div>

      <div className="panel chat">
        {turns.length === 0 ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{llms.length ? 'What should we set up?' : 'No local model is running'}</div>
            <div className="dim" style={{ maxWidth: '58ch' }}>
              {llms.length
                ? 'The assistant sees your services, sites and PHP versions, and proposes steps you can run with one click.'
                : 'Start Ollama or LM Studio, or point Settings at any OpenAI-compatible server on your network. Your prompts never leave your machine.'}
            </div>
            {llms.length > 0 && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="thread">
            {turns.map((t, i) => {
              const parsed = t.role === 'assistant' ? parseActions(t.content) : { prose: t.content, actions: [] }
              return (
                <div key={i} className={`bubble ${t.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>
                  {parsed.prose}
                  {parsed.actions.length > 0 && (
                    <div className="msg-actions">
                      {parsed.actions.map((a, j) => {
                        const key = `${i}-${j}`
                        return (
                          <button key={key} className="btn" disabled={done.has(key) || busy.has(key)} onClick={() => run(key, a)}>
                            {done.has(key) ? 'Done: ' : busy.has(key) ? 'Working: ' : ''}
                            {describe(a)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {busy.has('chat') && <div className="bubble bubble-ai dim">Thinking</div>}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          className="input"
          style={{ flex: 1, height: 38, borderRadius: 12 }}
          aria-label="Message"
          placeholder="Ask Laramac to set something up"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary" style={{ height: 38, borderRadius: 12 }} disabled={busy.has('chat') || !input.trim()} onClick={() => send()}>
          <Send size={13} /> Send
        </button>
      </div>
    </>
  )
}
