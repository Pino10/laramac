import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '@shared/types'
import { parseActions, type Action } from '@shared/actions'
import { useApp } from '../store'

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
      return `Create ${a.kind} project "${a.name}"`
    case 'enable-ssl':
      return `Enable HTTPS for ${a.site}`
    case 'open-site':
      return `Open ${a.site}`
  }
}

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

  useEffect(() => {
    refreshLlms()
  }, [refreshLlms])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  if (!settings) return <div />
  const current = llms.find((l) => l.baseUrl === settings.llm.baseUrl)

  const send = async (): Promise<void> => {
    const text = input.trim()
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
          return api.invoke('php:install', a.version)
        case 'set-default-php':
          return api.invoke('php:set-default', a.version)
        case 'install-service':
          await api.invoke('services:install', a.id)
          return setServices(await api.invoke('services:list'))
        case 'start-service':
        case 'stop-service': {
          const running = services.find((s) => s.id === a.id)?.status === 'running'
          if ((a.action === 'start-service') === running) return
          return setServices(await api.invoke('services:toggle', a.id))
        }
        case 'create-project':
          return setSites(await api.invoke('sites:create', a.kind, a.name))
        case 'enable-ssl':
          return setSites(await api.invoke('sites:set-config', a.site, { secure: true }))
        case 'open-site': {
          const site = sites.find((s) => s.name === a.site)
          if (!site) throw new Error(`No site named ${a.site}.`)
          return api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)
        }
      }
    })
    if (ok !== undefined || a.action === 'start-service' || a.action === 'stop-service') {
      setDone((d) => new Set(d).add(key))
      notify({ kind: 'info', text: `${describe(a)}: done` })
    }
  }

  return (
    <div className="fade-in flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Chat with a model running on your Mac. It proposes actions; you press the button.
        </p>
      </div>

      <div className="glass no-drag mb-3 flex flex-wrap items-center gap-2 p-3">
        <select
          className="input"
          value={settings.llm.baseUrl}
          onChange={(e) => {
            const found = llms.find((l) => l.baseUrl === e.target.value)
            updateSettings({ llm: { baseUrl: e.target.value, model: found?.models[0] ?? '' } })
          }}
        >
          {!current && <option value={settings.llm.baseUrl}>{settings.llm.baseUrl}</option>}
          {llms.map((l) => (
            <option key={l.baseUrl} value={l.baseUrl}>
              {l.provider}
            </option>
          ))}
        </select>
        {current ? (
          <select
            className="input"
            value={settings.llm.model}
            onChange={(e) => updateSettings({ llm: { ...settings.llm, model: e.target.value } })}
          >
            {current.models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            placeholder="model name"
            value={settings.llm.model}
            onChange={(e) => updateSettings({ llm: { ...settings.llm, model: e.target.value } })}
          />
        )}
        <button className="btn" onClick={refreshLlms}>
          Refresh
        </button>
        {llms.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            No local model found. Start Ollama or LM Studio, or set a custom address in Settings.
          </span>
        )}
      </div>

      <div className="glass min-h-0 flex-1 overflow-y-auto p-4" style={{ userSelect: 'text' }}>
        {turns.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Try: “Set up a WordPress site called shop with PHP 8.3 and HTTPS.”
          </div>
        )}
        {turns.map((t, i) => {
          const parsed = t.role === 'assistant' ? parseActions(t.content) : { prose: t.content, actions: [] }
          return (
            <div key={i} className={`mb-3 flex ${t.role === 'user' ? 'justify-end' : ''}`}>
              <div
                className="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
                style={{ background: t.role === 'user' ? 'var(--accent)' : 'var(--glass-bg-strong)', color: t.role === 'user' ? 'white' : 'inherit' }}
              >
                <div className="whitespace-pre-wrap">{parsed.prose}</div>
                {parsed.actions.map((a, j) => {
                  const key = `${i}-${j}`
                  return (
                    <button
                      key={key}
                      className="btn mt-2 mr-2"
                      disabled={done.has(key) || busy.has(key)}
                      onClick={() => run(key, a)}
                    >
                      {done.has(key) ? '✓ ' : busy.has(key) ? '… ' : ''}
                      {describe(a)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {busy.has('chat') && (
          <div className="text-sm" style={{ color: 'var(--text-dim)' }}>
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="no-drag mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ask Laramac to set something up…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary" disabled={busy.has('chat') || !input.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  )
}
