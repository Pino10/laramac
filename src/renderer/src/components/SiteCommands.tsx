import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { CalendarClock, Clock, FileCode2, FolderOpen, Play, Plus, Save, Square, SquareTerminal, Trash2 } from 'lucide-react'
import type { CommandRunInfo, CommandSchedule, CommandsInfo, FoundCommand, SavedCommand, SiteInfo } from '@shared/types'
import { useApp } from '../store'
import { useAsk } from './Ask'

const KIND: Record<FoundCommand['kind'], string> = { script: 'Scripts in this project', npm: 'package.json scripts', composer: 'composer.json scripts', make: 'Makefile' }
const words = (argv: string[]): string => argv.map((w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`)).join(' ')
const when = (s?: CommandSchedule | null): string => {
  if (!s) return ''
  if (s.every === 'daily') return `Every day at ${s.at}`
  const n = s.minutes ?? 60
  return n === 1 ? 'Every minute' : n === 60 ? 'Every hour' : n % 60 === 0 ? `Every ${n / 60} hours` : `Every ${n} minutes`
}
const ago = (t: number): string => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const SCHEDULES: [string, CommandSchedule | null][] = [
  ['Not scheduled', null],
  ['Every minute', { every: 'minutes', minutes: 1 }],
  ['Every 5 minutes', { every: 'minutes', minutes: 5 }],
  ['Every 15 minutes', { every: 'minutes', minutes: 15 }],
  ['Every hour', { every: 'minutes', minutes: 60 }],
  ['Every 6 hours', { every: 'minutes', minutes: 360 }],
  ['Every day at…', { every: 'daily', at: '02:00' }]
]

/**
 * Commands for a site: type one and run it in any folder of the site, run a script the project
 * already has, or save a command, on a schedule if you like. Output shows in a real terminal.
 */
export default function SiteCommands({ site }: { site: SiteInfo }): React.JSX.Element {
  const { act, busy, notify } = useApp()
  const api = window.laramac
  const [info, setInfo] = useState<CommandsInfo | null>(null)
  const [text, setText] = useState('')
  const [folder, setFolder] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [runs, setRuns] = useState<CommandRunInfo[]>([])
  const [saving, setSaving] = useState<{ name: string; argv: string[]; cwd: string; schedule: CommandSchedule | null; id?: string } | null>(null)
  const [ask, askDialog] = useAsk()
  const ok = useRef(new Set<string>())
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const activeRef = useRef<string | null>(null)
  const showRef = useRef<(id: string) => Promise<void>>(async () => undefined)

  const load = useCallback(() => void api.invoke('cmd:list', site.name).then((i) => {
    setInfo(i)
    setRuns(i.runs)
    // Coming back to the tab: show the newest run, so a running command is not hidden.
    if (!activeRef.current && i.runs[0]) void showRef.current(i.runs[0].id)
  }), [api, site.name])

  // The terminal: always dark, like a real one.
  useEffect(() => {
    const t = new Terminal({
      fontFamily: "'SF Mono', ui-monospace, Menlo, monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 10000,
      convertEol: true,
      theme: { background: '#0c0e16', foreground: '#e9ecf5', cursor: '#7aa2ff', selectionBackground: 'rgba(122,162,255,0.3)', black: '#1b1e2b', red: '#ff7a8a', green: '#6ee7a8', yellow: '#ffd479', blue: '#8ab4ff', magenta: '#d0a8ff', cyan: '#7fe3f0', white: '#e9ecf5', brightBlack: '#6b7390' }
    })
    const f = new FitAddon()
    t.loadAddon(f)
    t.open(host.current!)
    term.current = t
    fit.current = f
    try {
      f.fit()
    } catch {
      /* hidden */
    }
    t.writeln('\x1b[2mRun a command and its output shows here. Typing goes to the command while it runs.\x1b[0m')
    const input = t.onData((d) => activeRef.current && void api.invoke('cmd:input', activeRef.current, d))
    const offData = api.on('cmd:data', ({ id, data }) => {
      if (id === activeRef.current) t.write(data)
    })
    const offExit = api.on('cmd:exit', ({ id, code }) => {
      if (id === activeRef.current) t.writeln(`\r\n\x1b[${code === 0 ? '32' : '33'}m● Finished${code === 0 ? '' : ` with code ${code}`}\x1b[0m`)
      setRuns((r) => r.map((x) => (x.id === id ? { ...x, endedAt: Date.now(), code } : x)))
      void api.invoke('cmd:list', site.name).then(setInfo)
    })
    const ro = new ResizeObserver(() => {
      try {
        f.fit()
      } catch {
        /* hidden */
      }
    })
    ro.observe(host.current!)
    return () => {
      input.dispose()
      offData()
      offExit()
      ro.disconnect()
      t.dispose()
    }
  }, [api, site.name])

  const show = async (id: string): Promise<void> => {
    activeRef.current = id
    setActive(id)
    const t = term.current
    if (!t) return
    t.reset()
    t.write(await api.invoke('cmd:output', id))
    t.focus()
  }

  showRef.current = show
  useEffect(() => load(), [load])

  const run = async (req: { text?: string; argv?: string[]; savedId?: string; cwd?: string }, label?: string): Promise<void> => {
    const t = term.current
    const r = await act('cmd-run', () => api.invoke('cmd:run', site.name, { ...req, cols: t?.cols, rows: t?.rows }))
    if (!r) return
    setRuns((list) => [{ id: r.id, site: site.name, name: label ?? r.name, startedAt: Date.now(), endedAt: null, code: null }, ...list].slice(0, 12))
    activeRef.current = r.id
    setActive(r.id)
    if (t) {
      t.reset()
      t.writeln(`\x1b[2m${site.name}/${req.cwd || ''}\x1b[0m \x1b[1m$ ${r.name}\x1b[0m`)
      t.focus()
    }
  }

  // A script from the project runs its code: asked once per script.
  const runFound = async (c: FoundCommand): Promise<void> => {
    if (!ok.current.has(c.name)) {
      const yes = await ask({ title: `Run ${c.name}?`, label: `This runs code from ${site.name} on your Mac: ${words(c.argv)}`, yesNo: true, confirm: 'Run it' })
      if (yes === null) return
    }
    ok.current.add(c.name)
    void run({ argv: c.argv }, c.name)
  }

  const save = async (): Promise<void> => {
    if (!saving || !info) return
    const entry: SavedCommand = { id: saving.id ?? `c${Date.now().toString(36)}`, name: saving.name, argv: saving.argv, cwd: saving.cwd, schedule: saving.schedule }
    const list = saving.id ? info.saved.map((c) => (c.id === saving.id ? entry : c)) : [...info.saved, entry]
    const r = await act('cmd-save', () => api.invoke('cmd:save', site.name, list))
    if (r) {
      setInfo(r)
      setSaving(null)
      notify({ kind: 'info', text: entry.schedule ? `${entry.name} is saved and runs ${when(entry.schedule).toLowerCase()} while Laramac is open.` : `${entry.name} is saved.` })
    }
  }
  const remove = async (id: string): Promise<void> => {
    if (!info) return
    const r = await act('cmd-save', () => api.invoke('cmd:save', site.name, info.saved.filter((c) => c.id !== id)))
    if (r) setInfo(r)
  }
  const startSave = (): void => {
    const t = text.trim()
    if (!t) return notify({ kind: 'info', text: 'Type the command first, then save it.' })
    // The words are checked by Laramac when it runs; here they only need splitting for the list.
    const argv = t.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^(["'])(.*)\1$/, '$2')) ?? []
    setSaving({ name: t.slice(0, 60), argv, cwd: folder, schedule: null })
  }

  const running = runs.find((r) => r.id === active && !r.endedAt)
  const groups = (['script', 'npm', 'composer', 'make'] as const).map((k) => [k, (info?.found ?? []).filter((c) => c.kind === k)] as const).filter(([, l]) => l.length)

  return (
    <div className="cmds">
      <div className="cmd-bar">
        <label className="cmd-folder" title="The folder the command runs in">
          <FolderOpen size={14} />
          <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Run in folder">
            <option value="">{site.name}/</option>
            {(info?.folders ?? []).map((f) => (
              <option key={f} value={f}>
                {site.name}/{f}
              </option>
            ))}
          </select>
        </label>
        <input
          className="cmd-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && void run({ text, cwd: folder })}
          placeholder="python3 tools/make_film.py --from-clips"
          aria-label="Command"
          spellCheck={false}
        />
        <button className="btn btn-primary" disabled={!text.trim() || busy.has('cmd-run')} onClick={() => run({ text, cwd: folder })}>
          <Play size={14} /> Run
        </button>
        <button className="icon-btn" data-tip="Save this command" aria-label="Save this command" onClick={startSave}>
          <Save size={15} />
        </button>
        <button className="icon-btn" data-tip="Open Terminal here (for pipes and the like). The command is copied." aria-label="Open Terminal" onClick={() => act('cmd-term', () => api.invoke('cmd:terminal', site.name, text))}>
          <SquareTerminal size={15} />
        </button>
      </div>
      <p className="cmd-hint">
        Runs in the folder you pick, with this site’s PHP and Node.js. Python runs through uv in any folder: it brings its own Python and installs the folder’s requirements.txt for you.
      </p>

      <div className="cmd-body">
        <aside className="cmd-side">
          {site.kind === 'laravel' && (
            <div className="cmd-sched glass">
              <div className="row-title">
                <CalendarClock size={14} /> Laravel’s scheduler
              </div>
              {(info?.saved ?? []).some((c) => c.argv.includes('schedule:run') && c.schedule) ? (
                <div className="row-sub">Runs every minute while Laramac is open, so tasks in routes/console.php run on time.</div>
              ) : (
                <>
                  <div className="row-sub">Tasks in routes/console.php run only when something calls schedule:run each minute.</div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                      if (!info) return
                      const entry: SavedCommand = { id: `c${Date.now().toString(36)}`, name: 'Laravel scheduler', argv: ['php', 'artisan', 'schedule:run'], cwd: '', schedule: { every: 'minutes', minutes: 1 } }
                      const r = await act('cmd-save', () => api.invoke('cmd:save', site.name, [...info.saved, entry]))
                      if (r) setInfo(r)
                    }}
                  >
                    Run it every minute
                  </button>
                </>
              )}
              <button className="link" onClick={() => run({ argv: ['php', 'artisan', 'schedule:list'] }, 'schedule:list')}>
                See what is scheduled
              </button>
            </div>
          )}
          <div className="cmd-group">
            <div className="cmd-group-head">
              <span>Saved</span>
              <button className="link" onClick={startSave}>
                <Plus size={12} /> Save one
              </button>
            </div>
            {(info?.saved ?? []).length === 0 && <div className="cmd-empty">Commands you run often, kept here. Schedule one to run by itself.</div>}
            {(info?.saved ?? []).map((c) => {
              const last = info?.last[c.id]
              return (
                <div key={c.id} className="cmd-item">
                  <button className="cmd-run" onClick={() => run({ savedId: c.id }, c.name)} title={words(c.argv)}>
                    <Play size={12} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {c.cwd ? `${c.cwd}/ · ` : ''}
                        {c.schedule ? (
                          <>
                            <CalendarClock size={11} /> {when(c.schedule)}
                          </>
                        ) : (
                          words(c.argv)
                        )}
                      </small>
                      {last && (
                        <small className="cmd-last" data-ok={last.code === 0}>
                          <Clock size={11} /> {ago(last.at)}, {last.code === 0 ? 'worked' : `stopped with code ${last.code}`}
                        </small>
                      )}
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={`Edit ${c.name}`} data-tip="Edit" onClick={() => setSaving({ id: c.id, name: c.name, argv: c.argv, cwd: c.cwd ?? '', schedule: c.schedule ?? null })}>
                    <CalendarClock size={14} />
                  </button>
                  <button className="icon-btn danger-text" aria-label={`Delete ${c.name}`} data-tip="Delete" onClick={() => remove(c.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
          {groups.map(([k, list]) => (
            <div key={k} className="cmd-group">
              <div className="cmd-group-head">
                <span>{KIND[k]}</span>
              </div>
              {list.map((c) => (
                <div key={c.name} className="cmd-item">
                  <button className="cmd-run" onClick={() => runFound(c)} title={words(c.argv)}>
                    {k === 'script' ? <FileCode2 size={12} /> : <Play size={12} />}
                    <span>
                      <strong>{c.name}</strong>
                      <small>{words(c.argv)}</small>
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={`Put ${c.name} in the command box`} data-tip="Edit before running" onClick={() => setText(words(c.argv))}>
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </aside>

        <section className="cmd-term">
          <div className="cmd-tabs">
            {runs.slice(0, 6).map((r) => (
              <button key={r.id} className="cmd-tab" aria-pressed={r.id === active} onClick={() => show(r.id)} title={r.name}>
                <i data-s={r.endedAt ? (r.code === 0 ? 'ok' : 'bad') : 'run'} />
                {r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name}
              </button>
            ))}
            {running && (
              <button className="btn btn-sm cmd-stop" onClick={() => api.invoke('cmd:stop', running.id)}>
                <Square size={12} /> Stop
              </button>
            )}
          </div>
          <div className="cmd-xterm" ref={host} />
        </section>
      </div>

      {askDialog}
      {saving && (
        <div className="scrim" onMouseDown={() => setSaving(null)}>
          <div className="dialog glass" style={{ width: 480 }} onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="page-title" style={{ fontSize: 18 }}>
              {saving.id ? 'Edit command' : 'Save command'}
            </h2>
            <label className="field">
              <span>Name</span>
              <input className="input" value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Command</span>
              <input className="input mono" value={words(saving.argv)} readOnly />
            </label>
            <label className="field">
              <span>Folder</span>
              <select className="input" value={saving.cwd} onChange={(e) => setSaving({ ...saving, cwd: e.target.value })}>
                <option value="">{site.name}/</option>
                {(info?.folders ?? []).map((f) => (
                  <option key={f} value={f}>
                    {site.name}/{f}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Schedule</span>
              <select
                className="input"
                value={SCHEDULES.findIndex(([, s]) => (s && saving.schedule ? s.every === saving.schedule.every && (s.every === 'daily' || s.minutes === saving.schedule.minutes) : !s && !saving.schedule))}
                onChange={(e) => setSaving({ ...saving, schedule: SCHEDULES[Number(e.target.value)][1] })}
              >
                {SCHEDULES.map(([label], i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {saving.schedule?.every === 'daily' && (
              <label className="field">
                <span>Time</span>
                <input className="input" type="time" value={saving.schedule.at} onChange={(e) => setSaving({ ...saving, schedule: { every: 'daily', at: e.target.value } })} />
              </label>
            )}
            <p className="hint">{saving.schedule ? 'Scheduled commands run while Laramac is open, each with its own log, and show when they last ran.' : 'Saved commands run with one click.'}</p>
            <div className="end" style={{ marginTop: 14, gap: 8 }}>
              <button className="btn btn-quiet" onClick={() => setSaving(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy.has('cmd-save') || !saving.name.trim()} onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
