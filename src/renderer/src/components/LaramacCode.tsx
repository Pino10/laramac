import { useEffect, useState } from 'react'
import { Check, Code2, Download, Puzzle, RefreshCw, X } from 'lucide-react'
import type { IdeStatus } from '@shared/types'
import { useApp } from '../store'

const FONTS: [string, string][] = [
  ['system', 'SF Mono'],
  ['jetbrains', 'JetBrains Mono'],
  ['fira', 'Fira Code'],
  ['cascadia', 'Cascadia Code'],
  ['menlo', 'Menlo']
]

/** Laramac Code: the built-in editor (code-server, the open-source VS Code) and its PHP-first setup. */
export default function LaramacCode(): React.JSX.Element {
  const { act, busy, settings, updateSettings, jobs } = useApp()
  const api = window.laramac
  const [s, setS] = useState<IdeStatus | null>(null)
  useEffect(() => {
    void api.invoke('ide:status').then(setS)
  }, [api, jobs.length])
  if (!s || !settings) return <></>
  const job = jobs.find((j) => j.status === 'running' && /Laramac Code/.test(j.label))
  const failed = s.extensions.filter((e) => e.state === 'failed')
  return (
    <div className="mcp-card glass ide-card">
      <span className="mcp-mark" aria-hidden>
        <Code2 size={20} />
      </span>
      <div className="mcp-body">
        <strong>{s.installed ? `Laramac Code ${s.version ?? ''}`.trim() : 'Laramac Code'}</strong>
        <span>
          The built-in editor: the open-source VS Code, in a Laramac window, set up for PHP first. Deep PHP intelligence (Intelephense), breakpoints with Xdebug, Blade, and a terminal where php, composer, node,
          claude, claudelm and claudefree just work. It opens from every site’s code button; “Open with…” picks another editor.
        </span>
        {job && (
          <div className="ide-progress">
            <span>
              {job.label}
              {job.percent !== null ? `, ${job.percent}%` : '…'}
            </span>
            <div className="upd-bar">
              <span style={{ width: `${job.percent ?? 8}%` }} />
            </div>
          </div>
        )}
        {s.installed && (
          <div className="ide-exts">
            {s.extensions.map((e) => (
              <span key={e.id} className="ide-ext" data-state={e.state} title={e.why}>
                {e.state === 'installed' ? <Check size={12} /> : e.state === 'failed' ? <X size={12} /> : <Puzzle size={12} />}
                {e.name}
              </span>
            ))}
          </div>
        )}
        <div className="ide-prefs">
          <label className="field">
            <span>Font</span>
            <select className="input" value={settings.editorFont ?? 'system'} onChange={(e) => void updateSettings({ editorFont: e.target.value as never })}>
              {FONTS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Size</span>
            <select className="input" value={settings.editorFontSize ?? 14} onChange={(e) => void updateSettings({ editorFontSize: Number(e.target.value) })}>
              {[12, 13, 14, 15, 16, 18, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="hint">The colours follow your Mac’s light and dark mode and Laramac’s accent. JetBrains Mono, Fira Code and Cascadia Code need to be installed on your Mac.</span>
        </div>
        <div className="mcp-actions">
          {s.installed ? (
            <>
              <button className="btn btn-primary" onClick={() => act('ide-open', () => api.invoke('ide:open', null))}>
                <Code2 size={14} /> Open Laramac Code
              </button>
              {failed.length > 0 && (
                <button className="btn" disabled={!!job || busy.has('ide-ext')} onClick={async () => setS((await act('ide-ext', () => api.invoke('ide:extensions'))) ?? s)}>
                  <RefreshCw size={14} /> Retry {failed.length} {failed.length === 1 ? 'extension' : 'extensions'}
                </button>
              )}
              {s.running && (
                <button className="btn btn-quiet" onClick={async () => setS((await act('ide-stop', () => api.invoke('ide:stop'))) ?? s)}>
                  Stop
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-primary" disabled={!!job || busy.has('ide-install')} onClick={async () => setS((await act('ide-install', () => api.invoke('ide:install'))) ?? s)}>
              <Download size={14} /> {job ? 'Installing…' : 'Install Laramac Code'}
            </button>
          )}
          <span className="hint">{s.installed ? 'Updates appear on the Updates page. Extensions update themselves.' : 'About 100 MB, checked against its published checksum.'}</span>
        </div>
      </div>
    </div>
  )
}
