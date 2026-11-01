/**
 * Dependency check: asks Composer and npm whether any installed package has a known security
 * advisory. Both tools ship with their own advisory databases, so nothing extra is installed.
 */
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { AuditFinding, AuditResult } from '../shared/types'
import { runtimeEnv } from './runtimes'

const SEV = ['critical', 'high', 'medium', 'low', 'unknown'] as const

function sev(s: unknown): AuditFinding['severity'] {
  const v = String(s ?? '').toLowerCase()
  if (v === 'moderate') return 'medium'
  return (SEV as readonly string[]).includes(v) ? (v as AuditFinding['severity']) : 'unknown'
}

/** Reads `composer audit --format=json`. */
export function parseComposerAudit(json: string): AuditFinding[] {
  const data = JSON.parse(json) as {
    advisories?: Record<string, { title?: string; cve?: string | null; link?: string; affectedVersions?: string; severity?: string | null }[]>
    abandoned?: Record<string, string | null>
  }
  const out: AuditFinding[] = []
  for (const [pkg, list] of Object.entries(data.advisories ?? {})) {
    type Adv = { title?: string; cve?: string | null; link?: string; affectedVersions?: string; severity?: string | null }
    for (const a of (Array.isArray(list) ? list : Object.values(list as Record<string, Adv>)) as Adv[]) {
      out.push({ tool: 'composer', package: pkg, severity: sev(a.severity), title: a.title ?? 'Security advisory', id: a.cve ?? undefined, link: a.link, affected: a.affectedVersions })
    }
  }
  for (const [pkg, replacement] of Object.entries(data.abandoned ?? {})) {
    out.push({ tool: 'composer', package: pkg, severity: 'low', title: replacement ? `Abandoned; use ${replacement} instead` : 'Abandoned by its authors' })
  }
  return out
}

/** Reads `npm audit --json` (npm 7 and later). */
export function parseNpmAudit(json: string): AuditFinding[] {
  const data = JSON.parse(json) as {
    vulnerabilities?: Record<string, { severity?: string; range?: string; fixAvailable?: boolean | { name: string; version: string }; via?: (string | { title?: string; url?: string; source?: number })[] }>
  }
  const out: AuditFinding[] = []
  for (const [pkg, v] of Object.entries(data.vulnerabilities ?? {})) {
    const advisories = (v.via ?? []).filter((x): x is { title?: string; url?: string } => typeof x === 'object')
    // Packages that are only affected through another one are listed under that one.
    if (advisories.length === 0) continue
    const fix = v.fixAvailable === true ? 'npm audit fix' : typeof v.fixAvailable === 'object' ? `update ${v.fixAvailable.name} to ${v.fixAvailable.version}` : undefined
    for (const a of advisories) out.push({ tool: 'npm', package: pkg, severity: sev(v.severity), title: a.title ?? 'Security advisory', link: a.url, affected: v.range, fix })
  }
  return out
}

function run(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...runtimeEnv() }, maxBuffer: 32 * 1024 * 1024, timeout: 180000 }, (err, out, stderr) => {
      // Both tools exit with an error code when they find something; the JSON is still on stdout.
      if (String(out).trim().startsWith('{')) return resolve(String(out))
      reject(new Error(String(stderr || err?.message || 'No answer').trim().split('\n').slice(-2).join(' ')))
    })
  })
}

export async function auditProject(root: string): Promise<AuditResult> {
  const findings: AuditFinding[] = []
  const checked: string[] = []
  const problems: string[] = []
  if (existsSync(join(root, 'composer.lock'))) {
    try {
      findings.push(...parseComposerAudit(await run('composer', ['audit', '--format=json', '--locked', '--no-interaction'], root)))
      checked.push('Composer')
    } catch (e) {
      problems.push(`Composer: ${(e as Error).message}`)
    }
  }
  if (existsSync(join(root, 'package-lock.json'))) {
    try {
      findings.push(...parseNpmAudit(await run('npm', ['audit', '--json'], root)))
      checked.push('npm')
    } catch (e) {
      problems.push(`npm: ${(e as Error).message}`)
    }
  }
  const order = (s: AuditFinding['severity']): number => SEV.indexOf(s)
  return { checked, problems, findings: findings.sort((a, b) => order(a.severity) - order(b.severity) || a.package.localeCompare(b.package)) }
}
