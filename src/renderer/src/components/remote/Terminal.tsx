import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Minus, Plus, Save, SquareTerminal, X } from 'lucide-react'
import type { ServerCommand, SshServer } from '@shared/types'
import { pasteRisk } from '@shared/pastecheck'
import { useApp } from '../../store'
import { useAsk } from '../Ask'

const api = (): Window['laramac'] => window.laramac
type Unknown = (fingerprint: string, retry: () => void) => void

const THEME = {
  background: 'rgba(0,0,0,0)',
  foreground: '#ece9f6',
  cursor: '#ff7a4c',
  cursorAccent: '#0d0b1a',
  selectionBackground: 'rgba(255,122,76,0.3)',
  black: '#1b1830',
  red: '#ff6b6b',
  green: '#5be0a0',
  yellow: '#ffd27a',
  blue: '#8aa8ff',
  magenta: '#c79bff',
  cyan: '#6fe0ef',
  white: '#e7e4f2',
  brightBlack: '#6f6a8a',
  brightRed: '#ff8f8f',
  brightGreen: '#86f0bd',
  brightYellow: '#ffe2a6',
  brightBlue: '#adc2ff',
  brightMagenta: '#dab9ff',
  brightCyan: '#9cf0f8',
  brightWhite: '#ffffff'
}

export const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

const fontSize = (): number => {
  try {
    const n = Number(localStorage.getItem('laramac.termFont'))
    return n >= 10 && n <= 20 ? n : 12.5
  } catch {
    return 12.5
  }
}

interface Pending {
  text: string
  reason: string
  /** A saved command being run, or a paste. */
  kind: 'paste' | 'command'
}

/** One live terminal on a server. It stays connected while you look at other tabs. */
function TerminalPane({
  server,
  passphrase,
  visible,
  onUnknownHost,
  cd,
  commands
}: {
  server: SshServer
  passphrase: string | null
  visible: boolean
  onUnknownHost: Unknown
  /** Move to this folder once connected. The number makes the same folder work twice. */
  cd: { path: string; n: number } | null
  commands: ServerCommand[]
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sidRef = useRef<string | null>(null)
  const log = useRef('')
  const typed = useRef('')
  const intentional = useRef(false)
  const retries = useRef(0)
  const [state, setState] = useState<'connecting' | 'live' | 'ended' | 'failed'>('connecting')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null)
  const [size, setSize] = useState(fontSize)
  const production = server.tag === 'production'

  const send = (text: string): void => {
    if (sidRef.current) void api().invoke('shell:write', sidRef.current, text)
  }
  /** Pastes go through one check: many lines at once, or a command that can wipe things, asks first. */
  const offerPaste = (text: string): void => {
    if (!text || !sidRef.current) return
    const risk = pasteRisk(text)
    if (risk || (production && text.includes('\n'))) setPending({ text, reason: risk?.reason ?? 'This is a production server.', kind: 'paste' })
    else termRef.current?.paste(text)
  }
  const offerCommand = (c: ServerCommand): void => {
    if (!sidRef.current) return
    const risk = pasteRisk(c.command)
    if (production || risk) setPending({ text: c.command, reason: risk?.reason ?? `${server.name} is a production server.`, kind: 'command' })
    else send(c.command + '\r')
  }
  const offerRef = useRef(offerPaste)
  offerRef.current = offerPaste

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "'SF Mono', ui-monospace, Menlo, monospace",
      fontSize: size,
      lineHeight: 1.25,
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
      theme: THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    termRef.current = term
    fitRef.current = fit
    try {
      fit.fit()
    } catch {
      /* hidden */
    }
    const input = term.onData((d) => {
      if (!sidRef.current) return
      // Remember the last line typed, so closing with "exit" is not treated as a dropped connection.
      for (const ch of d) {
        if (ch === '\r') {
          intentional.current = /^\s*(exit|logout)\s*$/.test(typed.current)
          typed.current = ''
        } else if (ch === '\x04') intentional.current = true
        else if (ch === '\x7f') typed.current = typed.current.slice(0, -1)
        else if (ch >= ' ') typed.current += ch
      }
      void api().invoke('shell:write', sidRef.current, d)
    })
    const paste = async (): Promise<void> => offerRef.current((await api().invoke('clipboard:read')) ?? '')
    const copySelection = (): void => {
      const sel = term.getSelection()
      if (sel) void api().invoke('clipboard:write', sel)
    }
    const selection = term.onSelectionChange(copySelection)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.metaKey) return true
      const k = e.key.toLowerCase()
      if (k === 'v') {
        void paste()
        e.preventDefault()
        return false
      }
      if (k === 'c' && term.hasSelection()) {
        copySelection()
        return false
      }
      if (k === 'a') {
        term.selectAll()
        return false
      }
      if (k === 'k') {
        term.clear()
        return false
      }
      return true
    })
    const el = host.current!
    const onContext = (e: MouseEvent): void => {
      e.preventDefault()
      void paste()
    }
    // A paste that does not come from our own keys (the Edit menu, a middle click) goes through the same check.
    const onNativePaste = (e: ClipboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      offerRef.current(e.clipboardData?.getData('text') ?? '')
    }
    el.addEventListener('contextmenu', onContext)
    el.addEventListener('paste', onNativePaste, true)
    const offData = api().on('shell:data', (p) => {
      if (p.session !== sidRef.current) return
      term.write(p.data)
      log.current = (log.current + p.data).slice(-1_000_000)
    })
    const offExit = api().on('shell:exit', (p) => {
      if (p.session !== sidRef.current) return
      sidRef.current = null
      setState('ended')
      // A dropped connection is retried a few times. Closing it yourself is not.
      if (!intentional.current && retries.current < 3) {
        retries.current++
        term.write(`\r\n\x1b[38;2;255;210;122mConnection lost. Trying again (${retries.current} of 3)…\x1b[0m\r\n`)
        setTimeout(() => setAttempt((n) => n + 1), 1500 * retries.current)
      }
    })
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        return
      }
      if (sidRef.current) void api().invoke('shell:resize', sidRef.current, term.cols, term.rows)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      input.dispose()
      selection.dispose()
      el.removeEventListener('contextmenu', onContext)
      el.removeEventListener('paste', onNativePaste, true)
      offData()
      offExit()
      if (sidRef.current) void api().invoke('shell:close', sidRef.current)
      sidRef.current = null
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const term = termRef.current!
    let live = true
    setState('connecting')
    intentional.current = false
    term.write('\x1b[38;2;157;140;255mConnecting to ' + server.user + '@' + server.host + '…\x1b[0m\r\n')
    api()
      .invoke('shell:open', server.id, passphrase, term.cols, term.rows)
      .then((res) => {
        if (res.status === 'unknown-host') {
          setState('failed')
          setError('Confirm the server identity to continue.')
          onUnknownHost(res.fingerprint, () => setAttempt((n) => n + 1))
          return
        }
        if (!live) return void api().invoke('shell:close', res.session)
        sidRef.current = res.session
        retries.current = 0
        setState('live')
        term.focus()
      })
      .catch((e: Error) => {
        setState('failed')
        setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, passphrase, attempt])

  // "Open a terminal here" from the file browser.
  useEffect(() => {
    if (!cd || state !== 'live') return
    send(`cd ${shq(cd.path)} && clear\r`)
    termRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cd?.n, state])

  useEffect(() => {
    if (!visible) return
    try {
      fitRef.current?.fit()
    } catch {
      /* not laid out yet */
    }
    termRef.current?.focus()
  }, [visible])

  const resize = (delta: number): void => {
    const next = Math.min(20, Math.max(10, size + delta))
    setSize(next)
    try {
      localStorage.setItem('laramac.termFont', String(next))
    } catch {
      /* not kept */
    }
    if (termRef.current) {
      termRef.current.options.fontSize = next
      try {
        fitRef.current?.fit()
      } catch {
        /* hidden */
      }
    }
  }

  return (
    <div className="term" data-production={production}>
      <div className="term-bar">
        <span className="dots">
          <i data-live={state === 'live'} />
          <i />
          <i />
        </span>
        <span className="mono" style={{ color: 'inherit' }}>
          {server.user}@{server.host}
        </span>
        <span className="term-tip">Select to copy, right-click to paste</span>
        <span style={{ marginLeft: 'auto' }}>{state === 'live' ? 'Connected' : state === 'connecting' ? 'Connecting' : state === 'ended' ? 'Session ended' : 'Not connected'}</span>
        <button className="icon-btn" title="Smaller text" aria-label="Smaller text" onClick={() => resize(-1)}>
          <Minus size={13} />
        </button>
        <button className="icon-btn" title="Larger text" aria-label="Larger text" onClick={() => resize(1)}>
          <Plus size={13} />
        </button>
        <button
          className="icon-btn"
          title="Save this session as a text file (secrets are taken out)"
          aria-label="Save the session"
          onClick={() => void api().invoke('ssh:save-log', server.name, log.current)}
        >
          <Save size={13} />
        </button>
        {(state === 'ended' || state === 'failed') && (
          <button
            className="btn btn-accent"
            style={{ height: 26 }}
            onClick={() => {
              retries.current = 0
              setAttempt((n) => n + 1)
            }}
          >
            Reconnect
          </button>
        )}
      </div>
      {commands.length > 0 && (
        <div className="term-cmds" aria-label="Saved commands">
          {commands.map((c) => (
            <button key={c.label} className="chip" title={c.command} disabled={state !== 'live'} onClick={() => offerCommand(c)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <div className="term-confirm" role="alertdialog" aria-label="Check before running">
          <strong>{pending.kind === 'command' ? 'Run this?' : 'Paste this?'}</strong> {pending.reason}
          <pre className="mono">{pending.text.length > 600 ? `${pending.text.slice(0, 600)}…` : pending.text}</pre>
          <div>
            <button className="btn btn-sm" onClick={() => (setPending(null), termRef.current?.focus())}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (pending.kind === 'command') send(pending.text + '\r')
                else termRef.current?.paste(pending.text)
                setPending(null)
                termRef.current?.focus()
              }}
            >
              {pending.kind === 'command' ? 'Run it' : 'Paste it'}
            </button>
          </div>
        </div>
      )}
      {state === 'failed' && error && (
        <div className="errbox" style={{ margin: '10px 14px 0', gridColumn: 'auto' }}>
          {error}
        </div>
      )}
      <div className="term-body" ref={host} />
    </div>
  )
}

/** Several terminals on one server, as tabs, with your saved commands as buttons above. */
export default function TerminalTabs({
  server,
  passphrase,
  visible,
  onUnknownHost,
  cd
}: {
  server: SshServer
  passphrase: string | null
  visible: boolean
  onUnknownHost: Unknown
  cd: { path: string; n: number } | null
}): React.JSX.Element {
  const { act } = useApp()
  const [tabs, setTabs] = useState<number[]>([1])
  const [current, setCurrent] = useState(1)
  const [commands, setCommands] = useState<ServerCommand[]>(server.commands ?? [])
  const [ask, askDialog] = useAsk()
  const next = useRef(2)

  const addCommand = async (): Promise<void> => {
    const label = await ask({ title: 'Save a command', label: 'A short name, like "Restart PHP"', confirm: 'Next' })
    if (!label) return
    const command = await ask({ title: label, label: 'The command, on one line', confirm: 'Save' })
    if (!command) return
    const list = await act('ssh-commands', () => api().invoke('ssh:commands', server.id, [...commands, { label, command }]))
    if (list) setCommands(list.find((s) => s.id === server.id)?.commands ?? commands)
  }
  const removeCommand = async (label: string): Promise<void> => {
    const list = await act('ssh-commands', () => api().invoke('ssh:commands', server.id, commands.filter((c) => c.label !== label)))
    if (list) setCommands(list.find((s) => s.id === server.id)?.commands ?? commands)
  }

  return (
    <div>
      <div className="term-tabs" role="tablist">
        {tabs.map((t, i) => (
          <span key={t} className="term-tab" role="tab" aria-selected={current === t}>
            <button onClick={() => setCurrent(t)}>
              <SquareTerminal size={12} /> Terminal {i + 1}
            </button>
            {tabs.length > 1 && (
              <button className="icon-btn" aria-label={`Close terminal ${i + 1}`} onClick={() => (setTabs((l) => l.filter((x) => x !== t)), current === t && setCurrent(tabs.find((x) => x !== t) ?? 1))}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        <button
          className="icon-btn"
          title="Another terminal on this server"
          aria-label="New terminal"
          disabled={tabs.length >= 6}
          onClick={() => {
            const id = next.current++
            setTabs((l) => [...l, id])
            setCurrent(id)
          }}
        >
          <Plus size={13} />
        </button>
        <span className="term-manage">
          <button className="btn btn-quiet btn-sm" onClick={() => void addCommand()}>
            <Plus size={12} /> Save a command
          </button>
          {commands.length > 0 && (
            <button
              className="btn btn-quiet btn-sm"
              onClick={async () => {
                const label = await ask({ title: 'Remove a saved command', label: `Type its name: ${commands.map((c) => c.label).join(', ')}`, confirm: 'Remove' })
                if (label && commands.some((c) => c.label === label)) void removeCommand(label)
              }}
            >
              Remove
            </button>
          )}
        </span>
      </div>
      {tabs.map((t) => (
        <div key={t} style={{ display: t === current ? 'block' : 'none' }}>
          <TerminalPane server={server} passphrase={passphrase} visible={visible && t === current} onUnknownHost={onUnknownHost} cd={t === current ? cd : null} commands={commands} />
        </div>
      ))}
      {askDialog}
    </div>
  )
}
