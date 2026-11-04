import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, Circle, CircleSlash, Download, ExternalLink, Loader2, Radar, Square, Trash2, XCircle } from 'lucide-react'
import type { ReconDepth, ReconDetail, ReconInfo, ReconSeverity, ReviewerKind, ReviewerOption } from '@shared/types'
import { useApp } from '../store'
import { PageHead } from '../ui'

const SEV: ReconSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
const isLocal = (d: string): boolean => /\.(test|localhost)$/.test(d.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, ''))

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Recon(): React.JSX.Element {
  const { act, busy } = useApp()
  const api = window.laramac
  const [list, setList] = useState<ReconInfo[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [target, setTarget] = useState('')
  const [depth, setDepth] = useState<ReconDepth>('standard')
  const [reviewer, setReviewer] = useState<ReviewerKind | 'none'>('none')
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([])
  const [ok, setOk] = useState(false)
  const [sub, setSub] = useState<boolean | null>(null)

  useEffect(() => {
    void api.invoke('recon:list').then(setList)
    void api.invoke('review:reviewers').then((r) => setReviewers(r.filter((x) => x.id !== 'coderabbit')))
    void api.invoke('recon:tools').then((t) => setSub(t.subfinder))
    return api.on('recon:changed', (info) => setList((l) => [info, ...l.filter((x) => x.id !== info.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
  }, [api])

  if (open) return <ReconView id={open} info={list.find((x) => x.id === open)} onBack={() => setOpen(null)} />
  const valid = /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(target.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, ''))
  const needsOk = valid && !isLocal(target)

  return (
    <>
      <PageHead title="Recon" desc="Map what a domain exposes: subdomains, live hosts and what they run, old URLs, JavaScript source maps, endpoints, keys and files that should not be public. Read-only: nothing is attacked." />
      <div className="sec-form glass">
        <div className="field">
          <label htmlFor="rc-target">Domain</label>
          <input id="rc-target" className="input mono" placeholder="example.com" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="field">
          <label>How far</label>
          <div className="choices3" role="radiogroup" aria-label="Depth">
            {(
              [
                ['passive', 'Passive', 'Certificate logs, the Wayback Machine, public DNS sources. Nothing is sent to the site itself.'],
                ['standard', 'Standard', 'Plus which hosts answer and what they run, a light crawl, every script checked for source maps, endpoints and keys, and a few exposed files.'],
                ['deep', 'Deep', 'More hosts, pages and scripts, and archived JavaScript too. Takes longer.']
              ] as const
            ).map(([id, title, text]) => (
              <button key={id} className="choice-card" role="radio" aria-checked={depth === id} onClick={() => setDepth(id)}>
                <strong>{title}</strong>
                <span>{text}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>AI write-up</label>
          <div className="seg" role="radiogroup" aria-label="AI" style={{ flexWrap: 'wrap' }}>
            <button role="radio" aria-checked={reviewer === 'none'} onClick={() => setReviewer('none')}>
              None
            </button>
            {reviewers.map((r) => (
              <button key={r.id} role="radio" aria-checked={reviewer === r.id} disabled={!r.installed} title={r.note} onClick={() => setReviewer(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
          <span className="hint">The AI reads the recon (never the site) with Laramac’s recon skills, and writes the attack surface map and where to look first.</span>
        </div>
        {sub === false && (
          <div className="hint">
            Add subfinder for many more subdomains from public sources.{' '}
            <button className="link" onClick={() => act('subfinder', () => api.invoke('recon:install-subfinder')).then((t) => t && setSub(t.subfinder))}>
              <Download size={11} /> {busy.has('subfinder') ? 'Installing…' : 'Install subfinder'}
            </button>
          </div>
        )}
        {needsOk && (
          <label className="check-row">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>
              <strong>I own this domain, or have written permission to assess it</strong> (for example a bug bounty programme that includes it).
            </span>
          </label>
        )}
        <div className="end">
          <button
            className="btn btn-primary"
            disabled={!valid || (needsOk && !ok) || busy.has('recon')}
            onClick={async () => {
              const r = await act('recon', () => api.invoke('recon:start', { target: target.trim(), depth, reviewer, authorized: ok }))
              if (r) {
                setList((l) => [r, ...l])
                setOpen(r.id)
              }
            }}
          >
            <Radar size={14} /> Start recon
          </button>
        </div>
      </div>

      {list.length > 0 && (
        <>
          <h2 className="section-title">Recon sessions</h2>
          <div className="panel">
            {list.map((r) => (
              <button key={r.id} className="ms-row link-row" style={{ width: '100%' }} onClick={() => setOpen(r.id)}>
                <Radar size={16} style={{ color: 'var(--ink-3)' }} />
                <div className="row-main">
                  <div className="row-title">{r.domain}</div>
                  <div className="row-sub">
                    {r.depth} · {new Date(r.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.hosts !== undefined ? ` · ${r.hosts} hosts, ${r.live ?? 0} live, ${r.sourceMaps ?? 0} source maps` : ''}
                  </div>
                </div>
                {r.status === 'running' ? <span className="tag">Running</span> : <SevCounts c={r.counts} />}
                <ChevronRight size={15} style={{ color: 'var(--ink-3)' }} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function SevCounts({ c }: { c: Record<ReconSeverity, number> }): React.JSX.Element {
  return (
    <span style={{ display: 'flex', gap: 6 }}>
      {SEV.filter((k) => c[k] && k !== 'info').map((k) => (
        <span key={k} className="sev" data-sev={k}>
          {c[k]} {k}
        </span>
      ))}
      {SEV.every((k) => k === 'info' || !c[k]) && <span className="hint">{c.info} notes</span>}
    </span>
  )
}

function StepIcon({ s }: { s: string }): React.JSX.Element {
  if (s === 'running') return <Loader2 size={15} className="spin" />
  if (s === 'done') return <CheckCircle2 size={15} style={{ color: 'var(--ok)' }} />
  if (s === 'failed') return <XCircle size={15} style={{ color: 'var(--bad)' }} />
  if (s === 'skipped') return <CircleSlash size={15} style={{ color: 'var(--ink-3)' }} />
  return <Circle size={15} style={{ color: 'var(--ink-3)' }} />
}

function ReconView({ id, info, onBack }: { id: string; info?: ReconInfo; onBack: () => void }): React.JSX.Element {
  const { act } = useApp()
  const api = window.laramac
  const [d, setD] = useState<ReconDetail | null>(null)
  const [tab, setTab] = useState<'findings' | 'hosts' | 'js' | 'endpoints' | 'report'>('findings')
  const [lines, setLines] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())
  const box = useRef<HTMLPreElement>(null)
  const stamp = `${info?.status}|${info?.steps.map((s) => s.status).join(',')}`
  useEffect(() => {
    void api.invoke('recon:get', id).then(setD)
  }, [api, id, stamp])
  useEffect(() => api.on('recon:line', (l) => l.id === id && setLines((x) => [...x.slice(-299), l.text])), [api, id])
  const running = (info ?? d)?.status === 'running'
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines])
  const s = { ...(d ?? {}), ...(info ?? {}) } as ReconDetail & ReconInfo
  const findings = useMemo(() => (d?.findings ?? []).slice().sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity)), [d])
  if (!d) return <div className="empty dim">Opening…</div>
  const done = s.steps.filter((x) => x.status !== 'waiting' && x.status !== 'running').length
  const total = Math.max(s.steps.length, s.depth === 'passive' ? 4 : 8)

  return (
    <>
      <button className="link" onClick={onBack} style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> All recon
      </button>
      <PageHead title={s.domain} desc={`${s.depth} recon · ${new Date(s.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}>
        {running ? (
          <button className="btn danger-text" onClick={() => act('rc-stop', () => api.invoke('recon:cancel', id))}>
            <Square size={13} /> Stop
          </button>
        ) : (
          <button
            className="icon-btn danger-text"
            aria-label="Delete"
            onClick={async () => {
              const r = await act('rc-del', () => api.invoke('recon:delete', id))
              if (r) onBack()
            }}
          >
            <Trash2 />
          </button>
        )}
      </PageHead>

      {running && (
        <div className="liverun glass">
          <div className="live-top">
            <span className="live-dot" />
            <b>Running</b>
            <span className="hint">
              Step {Math.min(done + 1, total)} of {total}, {clock(now - new Date(s.createdAt).getTime())} so far
            </span>
            <span className="live-pct">{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <pre ref={box} className="code-block dev-out" style={{ maxHeight: 200, marginTop: 12 }}>
            {lines.join('\n') || 'Output appears here as it happens.'}
          </pre>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        {s.steps.map((st) => (
          <div key={st.id} className="rt-row">
            <StepIcon s={st.status} />
            <div className="row-main">
              <div className="row-title" style={{ fontWeight: 500 }}>
                {st.label}
              </div>
            </div>
            <span className="hint">
              {st.detail ?? ''}
              {st.ms ? ` · ${clock(st.ms)}` : st.status === 'running' && st.startedAt ? ` · ${clock(now - new Date(st.startedAt).getTime())}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="seg-tabs" role="tablist" style={{ marginBottom: 12 }}>
        {(
          [
            ['findings', `Findings ${findings.length}`],
            ['hosts', `Hosts ${d.hosts.length}`],
            ['js', `JavaScript ${d.js.length}`],
            ['endpoints', `Endpoints ${d.endpoints.length}`],
            ['report', 'Report']
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'findings' && (
        <div className="panel">
          {findings.length === 0 && <div className="empty dim">{running ? 'Findings appear when the steps finish.' : 'Nothing to report.'}</div>}
          {findings.map((f) => (
            <details key={f.id} className="rc-finding" data-fp={f.verdict === 'false-positive'}>
              <summary>
                <span className="sev" data-sev={f.severity}>{f.severity}</span>
                <span className="row-title">{f.title}</span>
                {f.verdict === 'false-positive' && <span className="tag">AI: harmless</span>}
              </summary>
              {f.url && (
                <button className="link mono" onClick={() => /^https?:\/\//.test(f.url!) && void api.invoke('sites:open-url', f.url!)}>
                  {f.url} {/^https?:\/\//.test(f.url) && <ExternalLink size={11} />}
                </button>
              )}
              {f.description && <p>{f.description}</p>}
              {f.aiNote && <p className="hint">AI: {f.aiNote}</p>}
              {f.fix && (
                <p>
                  <strong>Fix:</strong> {f.fix}
                </p>
              )}
            </details>
          ))}
        </div>
      )}

      {tab === 'hosts' && (
        <div className="panel">
          {d.hosts.map((h) => (
            <div key={h.host} className="rt-row">
              <div className="row-main">
                <div className="row-title mono">{h.host}</div>
                <div className="row-sub">
                  {h.ips.join(', ') || (h.cname ? `CNAME ${h.cname}` : 'Does not resolve')} · from {h.sources.join(', ')}
                </div>
              </div>
              {h.live ? (
                <span className="hint" style={{ textAlign: 'right' }}>
                  {h.live.status} {h.live.title ? `“${h.live.title.slice(0, 40)}”` : ''}
                  <br />
                  {h.live.tech.slice(0, 4).join(', ')}
                </span>
              ) : (
                <span className="hint">not checked or no answer</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'js' && (
        <div className="panel">
          {d.js.length === 0 && <div className="empty dim">No scripts were read{s.depth === 'passive' ? ' in a passive recon' : ''}.</div>}
          {d.js
            .slice()
            .sort((a, b) => Number(!!b.sourceMap) - Number(!!a.sourceMap) || b.secrets.length - a.secrets.length)
            .map((j) => (
              <div key={j.url} className="rt-row">
                <div className="row-main">
                  <div className="row-title mono" style={{ wordBreak: 'break-all' }}>
                    {j.url.replace(/^https?:\/\//, '')}
                  </div>
                  <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                    {Math.round(j.bytes / 1024)} KB · {j.endpoints.length} endpoints
                    {j.sourceMap ? ` · source map: ${j.sourceMap.files} files (${j.sourceMap.sample.slice(0, 4).join(', ')})` : ''}
                    {j.secrets.length ? ` · keys: ${j.secrets.map((k) => `${k.kind} ${k.masked}`).join(', ')}` : ''}
                  </div>
                </div>
                {j.sourceMap && <span className="sev" data-sev="medium">map</span>}
              </div>
            ))}
        </div>
      )}

      {tab === 'endpoints' && (
        <div className="panel" style={{ padding: 16 }}>
          <div className="hint" style={{ marginBottom: 8 }}>
            Endpoints named in the site’s JavaScript, and the {d.params.length} parameter names seen in {d.urls} archived URLs. Test them by hand, with Burp Suite, under your authorisation.
          </div>
          <pre className="code-block" style={{ maxHeight: 420 }}>
            {d.endpoints.join('\n') || 'None found.'}
          </pre>
          {d.params.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 14 }}>
                Parameters
              </h3>
              <div className="mono hint" style={{ wordBreak: 'break-word' }}>
                {d.params.slice(0, 200).join(', ')}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'report' && (
        <div className="panel" style={{ padding: 18 }}>
          {d.report ? <pre className="report-md">{d.report.replace(/```json[\s\S]*?```\s*$/, '')}</pre> : <div className="empty dim">{s.reviewer === 'none' ? 'No AI write-up was asked for. Start another recon with an AI chosen.' : running ? 'The AI writes this at the end.' : 'The AI write-up did not finish (see the steps).'}</div>}
        </div>
      )}
    </>
  )
}
