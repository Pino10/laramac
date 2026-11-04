import { useEffect, useState } from 'react'
import { Check, Download, Trash2 } from 'lucide-react'
import type { NodeVersionsInfo, SiteInfo, SiteNodeInfo } from '@shared/types'
import { useApp } from '../store'

/** Which Node.js a site runs on, with the choice to change it. */
export function NodeChooser({ site, info, onChange }: { site: SiteInfo; info: SiteNodeInfo; onChange: (i: SiteNodeInfo) => void }): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [versions, setVersions] = useState<NodeVersionsInfo | null>(null)
  useEffect(() => {
    void api.invoke('node:versions').then(setVersions).catch(() => undefined)
  }, [api])
  const installed = new Set(versions?.installed.map((v) => v.major))
  const majors = [...new Set([...(versions?.installed.map((v) => v.major) ?? []), ...(versions?.available.map((v) => v.major) ?? []), ...(info.want ? [info.want] : [])])].sort((a, b) => Number(b) - Number(a))
  const using = info.chosen ?? (info.installed ? (info.want ?? info.main) : info.main)
  const auto = info.want && !info.chosen ? `As the project asks: Node ${info.want} (${info.source})` : `As the project asks (main Node ${info.main ?? ''})`
  const key = `node-${site.name}`
  return (
    <div className="row row-set node-row">
      <div className="row-main">
        <div className="row-title">Node.js</div>
        <div className="row-sub" style={{ whiteSpace: 'normal' }}>
          {busy.has(key)
            ? 'Switching… Laramac installs the version if needed and restarts the dev server.'
            : !info.installed && info.want
              ? `Wants Node ${info.want} (${info.source}), which is not installed yet. Pick it below to install it for this site only.`
              : `Runs on Node ${using ?? '?'}. Its dev server, package updates and Terminal in this folder use it; other sites keep their own.`}
        </div>
      </div>
      <select
        className="input select"
        style={{ width: 300 }}
        aria-label="Node.js version for this site"
        disabled={busy.has(key)}
        value={info.chosen ?? ''}
        onChange={async (e) => {
          const r = await act(key, () => api.invoke('site:node', site.name, e.target.value || null))
          if (r) onChange(r)
        }}
      >
        <option value="">{auto}</option>
        {majors.map((m) => (
          <option key={m} value={m}>
            Node {m}
            {m === info.main ? ' (main)' : installed.has(m) ? '' : ' (installs it)'}
            {versions?.available.find((a) => a.major === m)?.lts ? `, LTS` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Every Node.js line installed, and the ones you can add. */
export function NodeVersionsPanel(): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [v, setV] = useState<NodeVersionsInfo | null>(null)
  useEffect(() => {
    void api.invoke('node:versions').then(setV).catch(() => undefined)
  }, [api])
  if (!v) return <div className="panel pad hint">Looking for Node.js versions…</div>
  const have = new Map(v.installed.map((i) => [i.major, i]))
  const lines = [...new Set([...v.installed.map((i) => i.major), ...v.available.filter((a) => a.lts || Number(a.major) >= Number(v.available[0]?.major ?? 0)).map((a) => a.major)])].sort((a, b) => Number(b) - Number(a))
  return (
    <div className="panel">
      {lines.map((m) => {
        const i = have.get(m)
        const a = v.available.find((x) => x.major === m)
        const newer = i && a && a.version !== i.version
        return (
          <div key={m} className="rt-row">
            <div className="row-main">
              <div className="row-title">
                Node.js {m}
                {i?.main && <span className="tag tag-accent">Main</span>}
                {a?.lts && <span className="tag">LTS {String(a.lts)}</span>}
              </div>
              <div className="row-sub">{i ? `Installed ${i.version}` : `Newest ${a?.version ?? ''}`}</div>
            </div>
            {!i || newer ? (
              <button className={i ? 'btn btn-sm' : 'btn btn-primary btn-sm'} style={{ minWidth: 120 }} disabled={busy.has(`nv-${m}`)} onClick={() => act(`nv-${m}`, () => api.invoke('node:install', m).then(setV))}>
                <Download size={13} /> {busy.has(`nv-${m}`) ? 'Installing' : i ? `Update to ${a?.version}` : 'Install'}
              </button>
            ) : (
              <span className="st-ready" style={{ width: 120 }}>
                <Check size={14} /> Ready
              </span>
            )}
            {i && !i.main && (
              <button
                className="icon-btn"
                aria-label={`Remove Node ${m}`}
                data-tip="Remove"
                onClick={() => act(`nv-${m}`, () => api.invoke('node:remove', m).then(setV))}
              >
                <Trash2 />
              </button>
            )}
          </div>
        )
      })}
      <div className="hint" style={{ padding: '12px 18px' }}>
        Each project uses the version it asks for in .nvmrc, .node-version, .tool-versions, Volta or engines, or the one you pick on its page. In Terminal, node, npm and npx switch on their own when you are inside a project.
      </div>
    </div>
  )
}
