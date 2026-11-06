import { useEffect, useState } from 'react'
import { Eye, FileCheck2, FolderLock, Layers, Microscope, MonitorUp, Network, Sparkles, Timer, Cpu } from 'lucide-react'
import type { DeepEngine, DeepPlanLine, DeepReviewerKind, ReviewerOption, ReviewResult } from '@shared/types'
import { useApp } from '../store'

const ENGINES: { id: DeepEngine; title: string; text: string; time: string }[] = [
  { id: 'cloudflare', title: 'Cloudflare security audit', text: 'The most thorough. AI agents map the project, hunt each kind of attack, and a fresh agent tries to disprove every candidate before it counts.', time: '45 min to 3 h' },
  { id: 'anthropic', title: 'Claude Code security review', text: 'Anthropic’s own review. One careful pass that reports only high-confidence problems.', time: '5 to 25 min' },
  { id: 'both', title: 'Both, one after the other', text: 'Anthropic’s quick pass, then Cloudflare’s full audit. The most coverage.', time: '50 min to 3.5 h' }
]

const ICON: Record<string, React.ReactNode> = { Reads: <Eye size={14} />, Writes: <FolderLock size={14} />, Does: <Layers size={14} />, 'Does not': <Layers size={14} />, Checks: <FileCheck2 size={14} />, Time: <Timer size={14} />, AI: <Sparkles size={14} />, Method: <Microscope size={14} /> }

/**
 * A deeper review with two published methods, through the AI you pick. Before it starts, it says
 * exactly what will run, where the code goes, and what it may touch.
 */
export default function DeepAudit({ source, canRun, site, onResult }: { source: unknown; canRun: boolean; site: string | null; onResult: (r: ReviewResult) => void }): React.JSX.Element {
  const { act, busy, settings, notify } = useApp()
  const api = window.laramac
  const [engine, setEngine] = useState<DeepEngine>('cloudflare')
  const [ai, setAi] = useState<DeepReviewerKind>('claude')
  const [options, setOptions] = useState<ReviewerOption[]>([])
  const [desktop, setDesktop] = useState(false)
  const [plan, setPlan] = useState<DeepPlanLine[]>([])
  useEffect(() => {
    void api.invoke('review:reviewers').then(setOptions)
    void api.invoke('skills:status').then((s) => setDesktop(s.desktop))
  }, [api])
  useEffect(() => {
    void api
      .invoke('review:deep-plan', { engine, reviewer: ai, site })
      .then(setPlan)
      .catch(() => setPlan([]))
  }, [api, engine, ai, site, settings?.llm.model])
  const ok = (id: string): boolean => options.find((o) => o.id === id)?.installed ?? false
  const note = (id: string): string | undefined => options.find((o) => o.id === id)?.note
  const model = settings?.llm.model
  const choices: { id: DeepReviewerKind; title: string; text: string; icon: React.ReactNode; ok: boolean }[] = [
    { id: 'claude', title: 'Claude Code', text: 'Your Claude account. The strongest choice for the long audit.', icon: <Sparkles size={16} />, ok: ok('claude') },
    { id: 'claude-desktop', title: 'Claude Desktop', text: site ? 'Copies the request and opens the Claude app: you paste it in its Code tab.' : 'Needs a site from www: the Claude app reads folders on this Mac.', icon: <MonitorUp size={16} />, ok: desktop && !!site },
    { id: 'claude-local', title: model ? `claudelm: ${model.split('/').pop()}` : 'claudelm', text: model ? 'Claude Code on your model in LM Studio. Private, but slower and shallower.' : 'Choose a model in the Assistant first.', icon: <Cpu size={16} />, ok: ok('claude-local') },
    { id: 'claude-free', title: 'claudefree', text: ok('claude-free') ? 'Claude Code on Free LLM API. Free, with the limits of your free keys.' : (note('claude-free') ?? 'Connect Free LLM API first.'), icon: <Network size={16} />, ok: ok('claude-free') }
  ]
  const start = async (): Promise<void> => {
    if (ai === 'claude-desktop') {
      const r = await act('deep-handoff', () => api.invoke('review:deep-handoff', { engine, site: site ?? '' }))
      if (r) notify({ kind: 'info', text: r.opened ? 'Request copied and the Claude app is open. Open its Code tab on your project and paste.' : 'Request copied. Paste it into the Claude app.' })
      return
    }
    const r = await act('review', () => api.invoke('review:run', { source, reviewer: ai, focus: 'security', scanners: false, deep: { engine } } as never))
    if (r) onResult(r)
  }
  return (
    <div className="deep glass" id="deep-audit">
      <div className="deep-head">
        <Microscope size={18} />
        <div>
          <strong>Deep audit</strong>
          <span>Two published security reviews, from Cloudflare and Anthropic, for a project on this Mac, in GitHub or in Azure DevOps. Pick the one to run and the AI to run it with.</span>
        </div>
      </div>
      <div className="deep-grid" role="radiogroup" aria-label="Method">
        {ENGINES.map((e) => (
          <button key={e.id} className="deep-card" role="radio" aria-checked={engine === e.id} onClick={() => setEngine(e.id)}>
            <strong>{e.title}</strong>
            <span>{e.text}</span>
            <small>
              <Timer size={11} /> {e.time}
            </small>
          </button>
        ))}
      </div>
      <div className="deep-label">Run it with</div>
      <div className="deep-grid deep-grid-4" role="radiogroup" aria-label="AI">
        {choices.map((c) => (
          <button key={c.id} className="deep-card" role="radio" aria-checked={ai === c.id} disabled={!c.ok} onClick={() => setAi(c.id)} title={c.ok ? undefined : 'Not ready yet'}>
            <strong>
              {c.icon} {c.title}
            </strong>
            <span>{c.text}</span>
          </button>
        ))}
      </div>
      {plan.length > 0 && (
        <div className="deep-plan" aria-label="What will run">
          <div className="deep-label">What will run</div>
          {plan.map((l) => (
            <div key={l.label} className="deep-line">
              <span className="deep-key">
                {ICON[l.label] ?? <Sparkles size={14} />} {l.label}
              </span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="end">
        <button className="btn btn-primary" disabled={!canRun || !choices.find((c) => c.id === ai)?.ok || busy.has('review') || busy.has('deep-handoff')} onClick={start}>
          <Microscope size={14} /> {busy.has('review') ? 'Auditing… you can keep working' : ai === 'claude-desktop' ? 'Copy the request and open Claude' : 'Start deep audit'}
        </button>
      </div>
    </div>
  )
}
