/**
 * Deep audit for Laramac: Cloudflare's security audit and Anthropic's security review, run through
 * Claude Code on the AI the person picked. The shared parts (the command, the checks, reading the
 * results) are in seckit/deepaudit.ts; this file connects them to Laramac's reviews.
 */
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DeepEngine, ReviewResult } from '../shared/types'
import { findCli } from './aitools'
import { countFindings, ensurePlugins, listSourceFiles, packsRoot, reviewsDir, runAgent, slugOf } from './review'
import { ensureLmContext } from './seckit/lmstudio'
import { explainFailure, localModelEnv, type LocalModel } from './seckit/reviewers'
import { changedFiles, checkCitations, deepClaudeArgs, deepFindingsFromJson, deepMarkdown, deepPlan, deepPrompt, engineList, readDeepResults, treeSignature, type DeepFinding, type DeepPlanLine, type DeepResult, type DeepReviewer } from './seckit/deepaudit'
import { installPack, packFile, packPluginDir, packState } from './seckit/skillpacks'

export interface DeepRun {
  root: string
  name: string
  engine: DeepEngine
  reviewer: 'claude' | 'claude-local' | 'claude-free'
  modelName: string
  local?: LocalModel
  remote?: boolean
}

const ENGINE_PACK = { cloudflare: 'cloudflare', anthropic: 'anthropic' } as const
const ENGINE_NAME = { cloudflare: 'Cloudflare security audit', anthropic: 'Claude Code security review' } as const

/** What will happen, for the panel shown before a deep audit starts. */
export function deepPlanFor(o: { engine: DeepEngine; reviewer: DeepReviewer; modelName: string; local?: LocalModel }): DeepPlanLine[] {
  const packs = engineList(o.engine).map((e) => {
    const id = ENGINE_PACK[e]
    return { id, name: id, commit: packState(packsRoot(), id).commit }
  })
  return deepPlan({ engine: o.engine, reviewer: o.reviewer, model: o.local?.model || o.modelName, packs, app: 'Laramac', outFolder: join(reviewsDir(), '<review>.deep') })
}

const timeoutMinutes = (engine: 'cloudflare' | 'anthropic', reviewer: string): number => (engine === 'cloudflare' ? 360 : 60) * (reviewer === 'claude-local' || reviewer === 'claude-free' ? 1.5 : 1)

export async function runDeepAudit(o: DeepRun, update: (p: number | null, l?: string) => void): Promise<ReviewResult> {
  const started = Date.now()
  const bin = findCli(['claude'])
  if (!bin) throw new Error('Claude Code is not installed. Install it on the AI tools page first.')
  ensurePlugins()
  const engines = engineList(o.engine)
  // The method comes from the skill packs. Fetch any that are not here yet.
  for (const [i, e] of engines.entries()) {
    const id = ENGINE_PACK[e]
    if (!packPluginDir(packsRoot(), id)) {
      update(3 + i, `Getting the ${ENGINE_NAME[e]} skills`)
      await installPack(packsRoot(), id)
    }
  }
  if (o.reviewer === 'claude-local' && o.local) {
    update(8, 'Checking the model has enough context for Claude Code')
    const ctx = await ensureLmContext(o.local.baseUrl, o.local.model, o.local.token)
    if (!ctx.ok) throw new Error(ctx.note)
  }
  const when = new Date()
  const id = `${slugOf(o.name)}-${when.toISOString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const work = join(reviewsDir(), `${id}.deep`)
  mkdirSync(work, { recursive: true, mode: 0o700 })
  const files = listSourceFiles(o.root).length
  const before = treeSignature(o.root)
  const results: DeepResult[] = []
  const names: string[] = []
  let session: string | undefined
  let reportText = ''
  for (const [i, e] of engines.entries()) {
    const outDir = join(work, e)
    mkdirSync(outDir, { recursive: true, mode: 0o700 })
    const plugin = packPluginDir(packsRoot(), ENGINE_PACK[e])!
    const run = deepClaudeArgs({
      prompt: deepPrompt({ engine: e, name: o.name, root: o.root, outDir }),
      outDir,
      root: o.root,
      plugins: [plugin],
      session: { id: randomUUID(), name: `Laramac deep audit: ${o.name}` },
      model: o.reviewer === 'claude' ? undefined : o.local?.model,
      localEnv: o.reviewer === 'claude' || !o.local ? undefined : localModelEnv(o.local)
    })
    session = run.args[run.args.indexOf('--session-id') + 1]
    const label = `${ENGINE_NAME[e]}${engines.length > 1 ? ` (${i + 1} of ${engines.length})` : ''}`
    update(15 + (i * 40) / engines.length, `${label} is working`)
    let text = ''
    try {
      text = await runAgent(bin, run.args, run.env, run.cwd, (l) => update(null, `${label}: ${l.replace('Reading the code…', 'Working…')}`), timeoutMinutes(e, o.reviewer) * 60_000)
    } catch (err) {
      // A long audit may have written its files before it stopped: keep them if so.
      if (!existsSync(join(outDir, 'findings.json')) && !existsSync(join(outDir, 'REPORT.md'))) throw new Error(explainFailure(o.reviewer, (err as Error).message))
      text = ''
    }
    let r = readDeepResults(outDir, o.root, e === 'cloudflare' ? packFile(packsRoot(), 'cloudflare', 'skills', 'security-audit', 'report-schema.json') : null)
    if (e === 'anthropic' || !r.fromFiles) {
      // The review answered in text: its json block is the list, checked against the code.
      const saved = join(outDir, 'REPORT.md')
      const fromText = checkCitations(o.root, deepFindingsFromJson(text || (existsSync(saved) ? readFileSync(saved, 'utf8') : '')))
      if (!r.fromFiles) r = { ...r, findings: fromText.findings, problems: [...r.problems, ...fromText.problems], counts: { confirmed: fromText.findings.filter((f) => f.state === 'confirmed').length, needsChecking: fromText.findings.filter((f) => f.state === 'needs-checking').length, rejected: 0 } }
    }
    if (!r.report) r.report = text.replace(/```json[\s\S]*?```/g, '').trim()
    results.push(r)
    names.push(ENGINE_NAME[e])
  }
  // Nothing in the project may have changed.
  const changed = changedFiles(before, treeSignature(o.root))
  const warning = changed.length ? `These files changed while the audit ran: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? `, and ${changed.length - 8} more` : ''}. The audit is not allowed to change your project, so if you did not edit them yourself, treat this audit as untrusted and tell the developers of the skill.` : null
  const merged: DeepResult = {
    report: results.map((r) => r.report).filter(Boolean).join('\n\n'),
    findings: dedupe(results.flatMap((r) => r.findings)),
    counts: { confirmed: 0, needsChecking: 0, rejected: results.reduce((n, r) => n + r.counts.rejected, 0) },
    problems: [...results.flatMap((r) => r.problems), ...(warning ? [warning] : [])],
    fromFiles: results.some((r) => r.fromFiles)
  }
  merged.counts.confirmed = merged.findings.filter((f) => f.state === 'confirmed').length
  merged.counts.needsChecking = merged.findings.length - merged.counts.confirmed
  update(95, 'Writing the report')
  const who = o.reviewer === 'claude-local' ? `Claude Code on ${o.local?.model ?? o.modelName}` : o.reviewer === 'claude-free' ? `Claude Code on Free LLM API (${o.local?.model ?? 'auto'})` : 'Claude Code'
  const version = engines.map((e) => `${ENGINE_NAME[e]} ${packState(packsRoot(), ENGINE_PACK[e]).commit?.slice(0, 7) ?? ''}`.trim()).join(', ')
  const body = deepMarkdown(merged, o.name, names)
  const markdown = `# Deep audit: ${o.name}\n\nMethod: ${version}. AI: ${who}. ${files} files. Read-only on your code.\n\n${body}${merged.report ? `\n\n## The audit’s own report\n${merged.report}` : ''}\n`
  const title = `${o.name}, deep audit, ${when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
  mkdirSync(reviewsDir(), { recursive: true })
  writeFileSync(join(reviewsDir(), `${id}.md`), markdown)
  const counts = countFindings(body)
  const deep = { engine: o.engine, confirmed: merged.counts.confirmed, leads: merged.counts.needsChecking, rejected: merged.counts.rejected }
  writeFileSync(join(reviewsDir(), `${id}.json`), JSON.stringify({ id, title, folder: o.remote ? '' : o.root, reviewer: o.reviewer, focus: 'security', at: when.toISOString(), counts, secrets: 0, remote: !!o.remote, session, skills: engines.map((e) => ENGINE_PACK[e] + '-security'), deep }))
  return { id, title, folder: o.remote ? '' : o.root, remote: !!o.remote, reviewer: o.reviewer, markdown, secrets: [], files, ms: Date.now() - started, reportPath: join(reviewsDir(), `${id}.md`), counts, session, skills: engines.map((e) => ENGINE_PACK[e] + '-security') }
}

/** The same problem found by both methods is listed once, keeping the confirmed one. */
function dedupe(list: DeepFinding[]): DeepFinding[] {
  const out: DeepFinding[] = []
  for (const f of list) {
    const key = `${f.file ?? ''}:${f.line ?? ''}:${f.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`
    const at = out.findIndex((g) => `${g.file ?? ''}:${g.line ?? ''}:${g.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}` === key)
    if (at < 0) out.push(f)
    else if (out[at].state !== 'confirmed' && f.state === 'confirmed') out[at] = f
  }
  return out
}
