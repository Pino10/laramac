/**
 * One place for every update: Laramac itself, PHP, Node.js and the other languages, the tools
 * Laramac installed (Composer, phpMyAdmin, Cloudflare Tunnel, Claude Code), Homebrew services,
 * and each site's own npm and Composer packages.
 *
 * Checking only reads version numbers. Applying an update downloads from the same places the
 * first install did, checked the same way. Updating a site's packages runs that project's own
 * install scripts, so it only happens when the person agreed to it, and a snapshot is saved first.
 */
import { GITHUB_API, githubApi } from './seckit/ghapi'
import { execFile } from 'child_process'
import type { OutdatedPackage, UpdateItem } from '../shared/types'
import { compareVersions } from './versions'

/** How big a version change is: major, minor or patch. */
export function jumpOf(current: string | null, latest: string): UpdateItem['jump'] {
  if (!current) return undefined
  const a = current.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const b = latest.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  if ((b[0] ?? 0) !== (a[0] ?? 0)) return 'major'
  if ((b[1] ?? 0) !== (a[1] ?? 0)) return 'minor'
  return 'patch'
}

export const isNewer = (current: string | null, latest: string | null | undefined): boolean => !!latest && (!current || compareVersions(latest.replace(/^v/, ''), current.replace(/^v/, '')) > 0)

/** The newest version in `list` that is newer than `current` and stays in the same line (same first `parts` numbers). */
export function newestInLine(current: string, list: string[], parts: 1 | 2): string | null {
  const head = (v: string): string => v.replace(/^v/, '').split('.').slice(0, parts).join('.')
  let best: string | null = null
  for (const v of list) {
    if (!/^\d+(\.\d+)+$/.test(v) || head(v) !== head(current) || compareVersions(v, current) <= 0) continue
    if (!best || compareVersions(v, best) > 0) best = v
  }
  return best
}

/** `brew outdated --json=v2`, only for the formulae Laramac looks after. */
export function parseBrewOutdated(json: string, ours: string[]): { formula: string; current: string; latest: string }[] {
  try {
    const data = JSON.parse(json) as { formulae?: { name: string; installed_versions: string[]; current_version: string; pinned?: boolean }[] }
    return (data.formulae ?? [])
      .filter((f) => ours.includes(f.name) && !f.pinned)
      .map((f) => ({ formula: f.name, current: f.installed_versions[f.installed_versions.length - 1] ?? '', latest: f.current_version }))
  } catch {
    return []
  }
}

/** "Composer version 2.8.4 2024-12-11 10:57:47" → 2.8.4 */
export const parseComposerVersion = (out: string): string | null => /Composer (?:version )?(\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null
/** "2.1.3 (Claude Code)" → 2.1.3 */
export const parseClaudeVersion = (out: string): string | null => /(\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null
/** "cloudflared version 2025.1.0 (built ...)" → 2025.1.0 */
export const parseCloudflaredVersion = (out: string): string | null => /version (\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null

/** A site's outdated packages as one update line. */
export function siteItem(site: string, pkgs: OutdatedPackage[]): UpdateItem | null {
  if (!pkgs.length) return null
  const majors = pkgs.filter((p) => p.major).length
  const safe = pkgs.length - majors
  const tools = [...new Set(pkgs.map((p) => p.manager))].map((m) => (m === 'npm' ? 'npm' : 'Composer')).join(' and ')
  return {
    id: `site:${site}`,
    group: 'site',
    name: site,
    current: null,
    latest: `${pkgs.length} ${pkgs.length === 1 ? 'package' : 'packages'}`,
    detail: `${tools}: ${safe} within the versions it allows${majors ? `, ${majors} with a bigger jump (left for you to choose on its page)` : ''}.`,
    jump: majors ? 'major' : 'minor',
    runsProjectCode: true,
    site
  }
}

export function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve) =>
    execFile(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, timeout: opts.timeout ?? 20000, maxBuffer: 16 * 1024 * 1024 }, (_e, out, err) => resolve(`${String(out)}${String(err)}`))
  )
}

export async function getJson<T>(url: string): Promise<T | null> {
  try {
    // GitHub's API has an hourly limit: its own client keeps answers and uses your sign-in.
    if (url.startsWith(GITHUB_API)) return await githubApi<T>(url)
    const res = await fetch(url, { headers: { 'User-Agent': 'Laramac', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Groups in the order the Updates page shows them. */
export const GROUP_ORDER: UpdateItem['group'][] = ['laramac', 'php', 'node', 'runtime', 'service', 'database', 'tool', 'site']

export function sortItems(items: UpdateItem[]): UpdateItem[] {
  return [...items].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name))
}
