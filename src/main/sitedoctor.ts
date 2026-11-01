/**
 * Site doctor: gathers the recent errors that belong to one site (its framework log, its dev
 * server output, PHP and web server errors that mention it) and asks the local model to explain
 * them. Secrets are blanked before anything is sent.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from 'fs'
import { join } from 'path'
import type { ChatMessage, SiteInfo, SiteLogSource } from '../shared/types'
import { dirs } from './paths'
import { devLogFile } from './devservers'
import { chatWithLlm } from './integrations'

/** The last part of a file, read without loading the whole thing. */
export function tailText(path: string, maxBytes = 64 * 1024): string {
  try {
    const size = statSync(path).size
    const start = Math.max(0, size - maxBytes)
    const fd = openSync(path, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      readSync(fd, buf, 0, buf.length, start)
      const text = buf.toString('utf8')
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text
    } finally {
      closeSync(fd)
    }
  } catch {
    return ''
  }
}

/** Blanks passwords, tokens, keys and cookies, so logs can be shown to a model safely. */
export function redact(text: string): string {
  return text
    .replace(/(authorization:\s*(?:bearer|basic|token)\s+)[^\s"']+/gi, '$1[hidden]')
    .replace(/\b(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[hidden]')
    .replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|app_key)\s*["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, '$1[hidden]')
    .replace(/(cookie:\s*)[^\n]+/gi, '$1[hidden]')
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '[hidden]')
    .replace(/(mysql|postgres(?:ql)?|redis|mongodb(?:\+srv)?):\/\/([^:@\s/]+):([^@\s]+)@/gi, '$1://$2:[hidden]@')
}

/** Keeps the newest lines, so the latest error is never cut off. */
export function lastLines(text: string, lines: number): string {
  const all = text.trimEnd().split('\n')
  return all.slice(-lines).join('\n')
}

/** Only the lines of a shared log that are about this site. */
export function linesAbout(text: string, needles: string[], lines: number): string {
  const hits = text.split('\n').filter((l) => needles.some((n) => n && l.includes(n)))
  return hits.slice(-lines).join('\n')
}

/** Every log that can say what is wrong with this site, newest lines only. */
export function collectSiteLogs(site: SiteInfo, o: { lines?: number; redact?: boolean } = {}): SiteLogSource[] {
  const out: SiteLogSource[] = []
  const n = o.lines ?? 120
  const add = (name: string, path: string, text: string): void => {
    const clean = (o.redact === false ? text : redact(text)).trim()
    if (clean) out.push({ name, path, text: o.lines ? clean : clean.slice(-9000) })
  }
  const own: [string, string][] = [
    ['Laravel log', join(site.path, 'storage', 'logs', 'laravel.log')],
    ['Symfony log', join(site.path, 'var', 'log', 'dev.log')],
    ['WordPress debug log', join(site.path, 'wp-content', 'debug.log')],
    ['Django log', join(site.path, 'debug.log')]
  ]
  for (const [name, path] of own) if (existsSync(path)) add(name, path, lastLines(tailText(path, o.lines ? 256 * 1024 : 64 * 1024), n))
  if (site.dev) add('Dev server output', devLogFile(site.name), lastLines(tailText(devLogFile(site.name), o.lines ? 256 * 1024 : 64 * 1024), o.lines ?? 150))

  const needles = [site.path, site.domain, ...site.aliases]
  const shared: [string, string][] = [
    ['PHP errors', join(dirs.logs(), `php-${site.php ?? ''}-error.log`)],
    ['Apache errors', join(dirs.logs(), 'apache-error.log')],
    ['Nginx errors', join(dirs.logs(), 'nginx-error.log')]
  ]
  for (const [name, path] of shared) if (existsSync(path)) add(name, path, linesAbout(tailText(path, 256 * 1024), needles, o.lines ? 200 : 40))
  return out
}

const SYSTEM = `You are the Laramac site doctor, built into a local development app for macOS.
You get the recent logs of one local project. Find the most recent real problem, explain it in
plain words for a developer, and give the fix: the exact file, command or setting to change.
Format:
1. One sentence: what is wrong.
2. Why it happens, in two or three sentences.
3. The fix, as short numbered steps, with commands in backticks.
If the logs show nothing wrong, say so and suggest what to check next. Never invent log lines.
Values shown as [hidden] were removed on purpose; do not ask for them.`

export function doctorMessages(site: SiteInfo, logs: SiteLogSource[], history: ChatMessage[]): ChatMessage[] {
  const facts = [
    `Site: ${site.name} at ${site.domain}, a ${site.kind} project in ${site.path}.`,
    site.php ? `PHP ${site.php}.` : '',
    site.dev ? `Dev server: \`${site.dev.command}\` on port ${site.dev.port}, ${site.dev.running ? 'running' : 'stopped'}.` : ''
  ]
    .filter(Boolean)
    .join(' ')
  const body = logs.length ? logs.map((l) => `--- ${l.name} (${l.path}) ---\n${l.text}`).join('\n\n') : 'No log has anything for this site yet.'
  const first: ChatMessage = { role: 'user', content: `${facts}\n\nRecent logs:\n\n${body}\n\nWhat is wrong, and how do I fix it?` }
  return [{ role: 'system', content: SYSTEM }, first, ...history.filter((m) => m.role !== 'system')]
}

export async function explainSite(site: SiteInfo, history: ChatMessage[]): Promise<{ reply: string; sources: SiteLogSource[] }> {
  const sources = collectSiteLogs(site)
  const reply = await chatWithLlm(doctorMessages(site, sources, history))
  return { reply, sources: sources.map((s) => ({ ...s, text: '' })) }
}
