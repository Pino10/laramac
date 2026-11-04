import { execFile } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GitHubAccount, GitHubRepo, GitHubRepoDetails, GitPushOptions, GitPushResult, GitSiteStatus } from '../shared/types'
import { dirs } from './paths'
import type { Crypto } from './ssh'

/**
 * GitHub for your sites: sign in, see your repositories, clone them into the
 * projects folder, and push a site with a choice of how it goes up (straight
 * to main, a new branch, a tag, or a release).
 *
 * The token is kept encrypted with the macOS Keychain. Git gets it per command
 * through an HTTP header, so it is never written into a repository's config.
 */
const API = 'https://api.github.com'
const file = (): string => join(dirs.root(), 'github.json')

interface Stored {
  tokenEnc: string
  login: string
  name: string | null
  id: number
  /** Classic token scopes, or null for fine-grained tokens (which do not report them). */
  scopes?: string[] | null
}

function load(): Stored | null {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Stored) : null
  } catch {
    return null
  }
}

export function account(): GitHubAccount | null {
  const s = load()
  return s ? { login: s.login, name: s.name, scopes: s.scopes ?? null } : null
}

export function token(crypto: Crypto): string {
  const s = load()
  if (!s) throw new Error('Connect GitHub first.')
  return crypto.decrypt(s.tokenEnc)
}

export async function gh<T>(tok: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Laramac',
      ...(init.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000)
  })
  if (res.status === 401) throw new Error('GitHub did not accept the token. Connect again.')
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] }
    throw new Error(`GitHub: ${j.errors?.[0]?.message ?? j.message ?? res.statusText}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export async function signIn(tok: string, crypto: Crypto): Promise<GitHubAccount> {
  const t = tok.trim()
  if (!/^(gh[pousr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|[a-f0-9]{40})$/.test(t)) throw new Error('That does not look like a GitHub token.')
  if (!crypto.available()) throw new Error('The macOS Keychain is not available, so the token cannot be stored safely.')
  const res = await fetch(`${API}/user`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Laramac' }, signal: AbortSignal.timeout(30_000) })
  if (res.status === 401) throw new Error('GitHub did not accept that token.')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
  const me = (await res.json()) as { login: string; name: string | null; id: number }
  const header = res.headers.get('x-oauth-scopes')
  const scopes = header === null ? null : header.split(',').map((x) => x.trim()).filter(Boolean)
  mkdirSync(dirs.root(), { recursive: true, mode: 0o700 })
  writeFileSync(file(), JSON.stringify({ tokenEnc: crypto.encrypt(t), login: me.login, name: me.name, id: me.id, scopes }), { mode: 0o600 })
  chmodSync(file(), 0o600)
  return { login: me.login, name: me.name, scopes }
}

export function signOut(): void {
  rmSync(file(), { force: true })
}

type RawRepo = {
  full_name: string
  name: string
  private: boolean
  description: string | null
  language: string | null
  updated_at: string
  pushed_at: string
  default_branch: string
  html_url: string
  clone_url: string
  stargazers_count: number
  fork: boolean
  archived: boolean
  homepage: string | null
}

const toRepo = (r: RawRepo): GitHubRepo => ({
  fullName: r.full_name,
  name: r.name,
  private: r.private,
  description: r.description,
  language: r.language,
  updatedAt: r.pushed_at ?? r.updated_at,
  defaultBranch: r.default_branch,
  url: r.html_url,
  cloneUrl: r.clone_url,
  stars: r.stargazers_count,
  fork: r.fork,
  archived: r.archived,
  homepage: r.homepage
})

export async function listRepos(tok: string): Promise<GitHubRepo[]> {
  const out: GitHubRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const batch = await gh<RawRepo[]>(tok, `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`)
    out.push(...batch.map(toRepo))
    if (batch.length < 100) break
  }
  return out
}

export const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export async function editRepo(tok: string, fullName: string, patch: { description?: string; private?: boolean; homepage?: string }): Promise<GitHubRepo> {
  if (!REPO.test(fullName)) throw new Error('Unknown repository.')
  return toRepo(await gh<RawRepo>(tok, `/repos/${fullName}`, { method: 'PATCH', body: patch }))
}

export async function createRepo(tok: string, name: string, isPrivate: boolean, description = '', readme = false): Promise<GitHubRepo> {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error('Repository names may use letters, numbers, dots, dashes and underscores.')
  return toRepo(await gh<RawRepo>(tok, '/user/repos', { method: 'POST', body: { name, private: isPrivate, description, auto_init: readme } }))
}

export async function deleteRepo(tok: string, fullName: string): Promise<void> {
  if (!REPO.test(fullName)) throw new Error('Unknown repository.')
  try {
    await gh(tok, `/repos/${fullName}`, { method: 'DELETE' })
  } catch (err) {
    if (/Must have admin rights|Not Found|403/i.test((err as Error).message)) {
      throw new Error('Your GitHub token cannot delete repositories. Connect again with a token that has the delete_repo permission (Administration: read and write for fine-grained tokens).')
    }
    throw err
  }
}

export async function repoDetails(tok: string, fullName: string): Promise<GitHubRepoDetails> {
  if (!REPO.test(fullName)) throw new Error('Unknown repository.')
  const base = `/repos/${fullName}`
  const [branches, releases, commits, pulls, issues, runs] = await Promise.all([
    gh<{ name: string; protected: boolean }[]>(tok, `${base}/branches?per_page=50`).catch(() => []),
    gh<{ tag_name: string; name: string | null; published_at: string; html_url: string; prerelease: boolean }[]>(tok, `${base}/releases?per_page=10`).catch(() => []),
    gh<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }[]>(tok, `${base}/commits?per_page=10`).catch(() => []),
    gh<{ number: number; title: string; html_url: string; user: { login: string } }[]>(tok, `${base}/pulls?state=open&per_page=20`).catch(() => []),
    gh<{ number: number; title: string; html_url: string; pull_request?: unknown }[]>(tok, `${base}/issues?state=open&per_page=30`).catch(() => []),
    gh<{ workflow_runs: { id: number; name: string; status: string; conclusion: string | null; head_branch: string; html_url: string; updated_at: string }[] }>(tok, `${base}/actions/runs?per_page=6`).catch(() => ({ workflow_runs: [] }))
  ])
  return {
    branches: branches.map((b) => ({ name: b.name, protected: b.protected })),
    releases: releases.map((r) => ({ tag: r.tag_name, name: r.name ?? r.tag_name, date: r.published_at, url: r.html_url, prerelease: r.prerelease })),
    commits: commits.map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], author: c.commit.author.name, date: c.commit.author.date, url: c.html_url })),
    pulls: pulls.map((p) => ({ number: p.number, title: p.title, url: p.html_url, author: p.user.login })),
    issues: issues.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, url: i.html_url })),
    runs: runs.workflow_runs.map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, branch: r.head_branch, url: r.html_url, date: r.updated_at }))
  }
}

/** Saves the default branch as a zip file. */
export async function downloadZip(tok: string, fullName: string, dest: string): Promise<void> {
  if (!REPO.test(fullName)) throw new Error('Unknown repository.')
  const res = await fetch(`${API}/repos/${fullName}/zipball`, { headers: { Authorization: `Bearer ${tok}`, 'User-Agent': 'Laramac' }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`GitHub answered ${res.status} for the download.`)
  const { Readable } = await import('stream')
  const { pipeline } = await import('stream/promises')
  const { createWriteStream } = await import('fs')
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
}

export async function createRelease(tok: string, fullName: string, tag: string, name: string, notes: string): Promise<string> {
  const r = await gh<{ html_url: string }>(tok, `/repos/${fullName}/releases`, {
    method: 'POST',
    body: { tag_name: tag, name, body: notes || undefined, generate_release_notes: !notes }
  })
  return r.html_url
}

// ------------------------------------------------------------------ git

export interface GitAuth {
  /** Extra -c settings, such as the authorization header for github.com. */
  config: string[]
  user: { name: string; email: string }
}

export function authFor(tok: string, acc: Stored | { login: string; id: number; name: string | null }): GitAuth {
  return {
    config: ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${tok}`).toString('base64')}`],
    user: { name: acc.name || acc.login, email: `${acc.id}+${acc.login}@users.noreply.github.com` }
  }
}
export const storedAccount = load

function git(cwd: string, args: string[], extra: string[] = []): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', [...extra, ...args], { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 300_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out, stderr) => {
      if (!err) return resolve(String(out).trim())
      const msg = String(stderr || err.message).trim()
      if (/xcrun|xcode-select|developer tools/i.test(msg)) return reject(new Error('Git needs Apple\'s Command Line Tools. Run "xcode-select --install" in Terminal, then try again.'))
      reject(new Error(msg.split('\n').filter((l) => !/^hint:/.test(l)).slice(-3).join('\n')))
    })
  )
}

const GITIGNORE = ['.DS_Store', 'node_modules/', '.env', '.env.*', '!.env.example', '*.log', '.idea/', '.vscode/', '']

export async function siteStatus(path: string): Promise<GitSiteStatus> {
  if (!existsSync(join(path, '.git'))) return { isRepo: false, branch: null, remote: null, changed: 0, lastTag: null }
  const branch = await git(path, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => null)
  const url = await git(path, ['remote', 'get-url', 'origin']).catch(() => null)
  const m = url ? /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url) : null
  const changed = (await git(path, ['status', '--porcelain']).catch(() => '')).split('\n').filter(Boolean).length
  const lastTag = await git(path, ['describe', '--tags', '--abbrev=0']).catch(() => null)
  return { isRepo: true, branch: branch === 'HEAD' ? null : branch, remote: m ? m[1] : url, changed, lastTag }
}

/** Suggests the next version after the last tag: v1.2.3 becomes v1.2.4. */
export function nextVersion(last: string | null): string {
  const m = last ? /^(v?)(\d+)\.(\d+)\.(\d+)$/.exec(last) : null
  return m ? `${m[1]}${m[2]}.${m[3]}.${Number(m[4]) + 1}` : 'v1.0.0'
}

const TAG = /^[A-Za-z0-9._/-]{1,100}$/

/**
 * Commits everything and pushes it the way you chose. `remote` is a full URL,
 * so tests can point it at a local bare repository.
 */
export async function publish(path: string, remote: string, o: GitPushOptions, auth: GitAuth, host = 'GitHub'): Promise<GitPushResult> {
  const message = o.message.trim() || 'Update from Laramac'
  const who = ['-c', `user.name=${auth.user.name}`, '-c', `user.email=${auth.user.email}`]
  if (!existsSync(join(path, '.git'))) {
    await git(path, ['init', '-b', 'main'])
    if (!existsSync(join(path, '.gitignore'))) {
      const extra = existsSync(join(path, 'composer.json')) ? ['vendor/'] : []
      writeFileSync(join(path, '.gitignore'), [...GITIGNORE.slice(0, -1), ...extra, ''].join('\n'))
    }
  }
  const current = await git(path, ['remote', 'get-url', 'origin']).catch(() => null)
  if (!current) await git(path, ['remote', 'add', 'origin', remote])
  else if (current !== remote) await git(path, ['remote', 'set-url', 'origin', remote])

  await git(path, ['add', '-A'])
  const dirty = (await git(path, ['status', '--porcelain'])).length > 0
  const hasCommit = await git(path, ['rev-parse', '--verify', 'HEAD']).then(
    () => true,
    () => false
  )
  if (dirty || !hasCommit) await git(path, ['commit', '-m', message, ...(dirty ? [] : ['--allow-empty'])], who)
  const commit = (await git(path, ['rev-parse', '--short', 'HEAD'])).trim()
  const net = [...auth.config]

  if (o.mode === 'branch') {
    const branch = (o.branch ?? '').trim()
    if (!TAG.test(branch) || branch.includes('..')) throw new Error('Give the branch a name like feature/new-header.')
    await git(path, ['push', 'origin', `HEAD:refs/heads/${branch}`], net)
    return { mode: o.mode, commit, ref: branch }
  }

  const base = o.base?.trim() || 'main'
  const pushArgs = ['push', 'origin', `HEAD:refs/heads/${base}`]
  if (o.replace) {
    // Look at GitHub first, so the overwrite only replaces what we just saw.
    await git(path, ['fetch', 'origin', base], net).catch(() => '')
    pushArgs.splice(1, 0, '--force-with-lease')
  }
  try {
    await git(path, pushArgs, net)
  } catch (err) {
    if (/rejected|non-fast-forward|fetch first/i.test((err as Error).message)) {
      throw new Error(`${host} has changes on ${base} that are not on this Mac. Turn on "Replace what is on ${host}" to overwrite them, or push to a new branch.`)
    }
    throw err
  }
  if (o.mode === 'main') return { mode: o.mode, commit, ref: base }

  const tag = (o.tag ?? '').trim()
  if (!TAG.test(tag) || tag.includes('..')) throw new Error('Give the version a name like v1.2.0.')
  await git(path, ['tag', '-a', tag, '-m', o.notes?.trim() || message], who)
  await git(path, ['push', 'origin', `refs/tags/${tag}`], net)
  return { mode: o.mode, commit, ref: tag }
}

/** Brings in what is new on GitHub for a site that was cloned or pushed before. */
export async function pull(path: string, auth: GitAuth): Promise<string> {
  if (!existsSync(join(path, '.git'))) throw new Error('This site is not connected to GitHub yet. Push it first.')
  const dirty = (await git(path, ['status', '--porcelain'])).length > 0
  if (dirty) throw new Error('This site has changes that are not pushed yet. Push them first, or take a snapshot and discard them.')
  const before = await git(path, ['rev-parse', 'HEAD'])
  await git(path, ['pull', '--ff-only'], [...auth.config, '-c', `user.name=${auth.user.name}`, '-c', `user.email=${auth.user.email}`])
  const after = await git(path, ['rev-parse', 'HEAD'])
  if (before === after) return 'Already up to date.'
  const n = (await git(path, ['rev-list', '--count', `${before}..${after}`])).trim()
  return `Brought in ${n} new ${n === '1' ? 'commit' : 'commits'}.`
}

export async function cloneRepo(cloneUrl: string, into: string, auth: GitAuth): Promise<void> {
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\.git$/.test(cloneUrl) && !/^https:\/\/dev\.azure\.com\/[A-Za-z0-9-]+\/[^/\s]+\/_git\/[^/\s]+$/.test(cloneUrl)) throw new Error('Unknown repository address.')
  if (existsSync(into)) throw new Error('A project with that name is already in your projects folder.')
  await git(dirs.root(), ['clone', '--', cloneUrl, into], auth.config)
}
