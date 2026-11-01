import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import type { ChatMessage } from '@shared/types'
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
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  if (!settings) return <></>
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
    const result = await act(key, async () => {
      switch (a.action) {
        case 'install-php':
          await api.invoke('php:install', a.version)
          return true
        case 'set-default-php':
          await api.invoke('php:set-default', a.version)
          return true
        case 'install-service':
          await api.invoke('services:install', a.id)
          setServices(await api.invoke('services:list'))
          return true
        case 'start-service':
        case 'stop-service': {
          const running = services.find((s) => s.id === a.id)?.status === 'running'
          if ((a.action === 'start-service') !== running) setServices(await api.invoke('services:toggle', a.id))
          return true
        }
        case 'create-project':
          setSites(await api.invoke('sites:create', a.kind, a.name))
          return true
        case 'enable-ssl':
          setSites(await api.invoke('sites:set-config', a.site, { secure: true }))
          return true
        case 'open-site': {
          const site = sites.find((s) => s.name === a.site)
          if (!site) throw new Error(`There is no site named ${a.site}.`)
          await api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)
          return true
        }
      }
    })
    if (result) {
      setDone((d) => new Set(d).add(key))
      notify({ kind: 'info', text: describe(a) })
    }
  }

  return (
    <>
      <PageHead
        title="Assistant"
        desc="Chat with a model running on your Mac. It suggests actions, and nothing runs until you press its button."
      />

      <div className="no-drag" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="input"
          aria-label="Model server"
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
            aria-label="Model"
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
            aria-label="Model name"
            placeholder="Model name"
            value={settings.llm.model}
            onChange={(e) => updateSettings({ llm: { ...settings.llm, model: e.target.value } })}
          />
        )}
        <button className="btn btn-quiet btn-icon" title="Look for local models again" aria-label="Refresh models" onClick={refreshLlms}>
          <RefreshCw size={14} />
        </button>
        {llms.length === 0 && (
          <span className="row-sub">No local model found. Start Ollama or LM Studio, or set an address in Settings.</span>
        )}
      </div>

      <div className="panel chat">
        {turns.length === 0 && (
          <div className="dim" style={{ maxWidth: '52ch' }}>
            Ask for what you want set up. For example: create a WordPress site called shop on PHP 8.3 with HTTPS.
          </div>
        )}
        {turns.map((t, i) => {
          const parsed = t.role === 'assistant' ? parseActions(t.content) : { prose: t.content, actions: [] }
          return (
            <div key={i} className="msg">
              <div className="msg-who" style={{ color: t.role === 'user' ? 'var(--ink)' : 'var(--accent)' }}>
                {t.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="msg-text">{parsed.prose}</div>
              {parsed.actions.length > 0 && (
                <div className="msg-actions no-drag">
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
        {busy.has('chat') && <div className="dim">Thinking</div>}
        <div ref={endRef} />
      </div>

      <div className="no-drag" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          className="input"
          style={{ flex: 1, height: 34 }}
          aria-label="Message"
          placeholder="Ask Laramac to set something up"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary" style={{ height: 34 }} disabled={busy.has('chat') || !input.trim()} onClick={send}>
          <Send size={13} /> Send
        </button>
      </div>
    </>
  )
}
