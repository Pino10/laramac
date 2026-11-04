/**
 * Azure DevOps (Azure Repos): sign in with a personal access token, see every repository in
 * your organization, its pull requests, pipelines and commits, clone it into your projects
 * folder, create a repository and push a site to it.
 *
 * The token is kept encrypted with the macOS Keychain (through the same Crypto as GitHub's) and
 * is only sent to dev.azure.com. Git gets it per command through an HTTP header, so it is never
 * written into a repository's config or its remote address.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AzureAccount, AzureProject, AzureRepo, AzureRepoDetails } from '../shared/types'
import { dirs } from './paths'
import type { Crypto } from './ssh'
import type { GitAuth } from './github'

const API = '7.1'
const file = (): string => join(dirs.root(), 'azure.json')

interface Stored {
  org: string
  tokenEnc: string
  name: string
  email: string | null
}

export const ORG = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Azure DevOps names: no control characters, slashes or the characters it forbids. */
export const NAME = /^[^\\/:*?"<>|;#$%&+,=@[\]{}~`^\u0000-\u001f]{1,64}$/

function load(): Stored | null {
  try {
    return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Stored) : null
  } catch {
    return null
  }
}

export function account(): AzureAccount | null {
  const s = load()
  return s ? { org: s.org, name: s.name, email: s.email } : null
}

export function token(crypto: Crypto): string {
  const s = load()
  if (!s) throw new Error('Connect Azure DevOps first.')
  return crypto.decrypt(s.tokenEnc)
}

const basic = (pat: string): string => `Basic ${Buffer.from(`:${pat}`).toString('base64')}`

/** Only dev.azure.com addresses for this organization, so the token goes nowhere else. */
export function apiUrl(org: string, path: string, query: Record<string, string> = {}): string {
  if (!ORG.test(org)) throw new Error('That is not an Azure DevOps organization name.')
  const u = new URL(`https://dev.azure.com/${org}/${path.replace(/^\/+/, '')}`)
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
  if (!u.searchParams.has('api-version')) u.searchParams.set('api-version', API)
  return u.toString()
}

async function az<T>(pat: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!url.startsWith('https://dev.azure.com/')) throw new Error('Laramac only talks to dev.azure.com.')
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { Authorization: basic(pat), Accept: 'application/json', 'User-Agent': 'Laramac', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000)
  })
  // A wrong or expired token gets a sign-in page (203 or a redirect) instead of JSON.
  if (res.status === 401 || res.status === 203 || (res.status >= 300 && res.status < 400)) throw new Error('Azure DevOps did not accept the token. Check it has not expired, and that it has Code (read and write), Build (read) and Project (read).')
  if (res.status === 404) throw new Error('Azure DevOps could not find that. Check the organization name.')
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message
    throw new Error(msg ? `Azure DevOps: ${msg}` : `Azure DevOps answered ${res.status}.`)
  }
  return (await res.json()) as T
}

export async function signIn(org: string, pat: string, crypto: Crypto): Promise<AzureAccount> {
  const o = org.trim().replace(/^https:\/\/dev\.azure\.com\//, '').replace(/\/.*$/, '')
  const t = pat.trim()
  if (!ORG.test(o)) throw new Error('Enter your organization as it appears in dev.azure.com/<organization>.')
  if (t.length < 20 || /\s/.test(t)) throw new Error('That does not look like a personal access token.')
  const data = await az<{ authenticatedUser?: { providerDisplayName?: string; properties?: { Account?: { $value?: string } } } }>(t, apiUrl(o, '_apis/connectionData', { 'api-version': '7.1-preview' }))
  const user = data.authenticatedUser
  if (!user?.providerDisplayName || user.providerDisplayName === 'Anonymous') throw new Error('Azure DevOps did not accept the token for that organization.')
  // A token that can see the projects is enough to go on.
  await az(t, apiUrl(o, '_apis/projects', { $top: '1' }))
  const stored: Stored = { org: o, tokenEnc: crypto.encrypt(t), name: user.providerDisplayName, email: user.properties?.Account?.$value ?? null }
  writeFileSync(file(), JSON.stringify(stored), { mode: 0o600 })
  return { org: o, name: stored.name, email: stored.email }
}

export function signOut(): void {
  rmSync(file(), { force: true })
}

/** The address Git uses, without the user name Azure DevOps puts in front. */
export function cleanRemote(remoteUrl: string): string {
  const u = new URL(remoteUrl)
  u.username = ''
  u.password = ''
  if (u.hostname !== 'dev.azure.com') throw new Error('Only dev.azure.com repositories can be cloned here.')
  return u.toString()
}

interface RawRepo {
  id: string
  name: string
  project: { id: string; name: string }
  defaultBranch?: string
  remoteUrl: string
  webUrl: string
  size?: number
  isDisabled?: boolean
}

const toRepo = (r: RawRepo): AzureRepo => ({
  id: r.id,
  name: r.name,
  project: r.project.name,
  projectId: r.project.id,
  defaultBranch: (r.defaultBranch ?? 'refs/heads/main').replace(/^refs\/heads\//, ''),
  cloneUrl: cleanRemote(r.remoteUrl),
  url: r.webUrl,
  size: r.size ?? 0,
  disabled: !!r.isDisabled,
  empty: !r.defaultBranch
})

export async function listProjects(org: string, pat: string): Promise<AzureProject[]> {
  const r = await az<{ value: { id: string; name: string; description?: string }[] }>(pat, apiUrl(org, '_apis/projects', { $top: '500' }))
  return r.value.map((p) => ({ id: p.id, name: p.name, description: p.description ?? null })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function listRepos(org: string, pat: string): Promise<AzureRepo[]> {
  const r = await az<{ value: RawRepo[] }>(pat, apiUrl(org, '_apis/git/repositories'))
  return r.value.map(toRepo).sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name))
}

export async function createRepo(org: string, pat: string, projectId: string, name: string): Promise<AzureRepo> {
  if (!GUID.test(projectId)) throw new Error('Choose a project.')
  if (!NAME.test(name.trim())) throw new Error('Give the repository a name without slashes or symbols.')
  const r = await az<RawRepo>(pat, apiUrl(org, `${projectId}/_apis/git/repositories`), { method: 'POST', body: { name: name.trim(), project: { id: projectId } } })
  return toRepo(r)
}

export async function repoDetails(org: string, pat: string, projectId: string, repoId: string): Promise<AzureRepoDetails> {
  if (!GUID.test(projectId) || !GUID.test(repoId)) throw new Error('Unknown repository.')
  const base = `${projectId}/_apis/git/repositories/${repoId}`
  const [branches, commits, pulls, builds] = await Promise.all([
    az<{ value: { name: string }[] }>(pat, apiUrl(org, `${base}/refs`, { filter: 'heads/' })).catch(() => ({ value: [] })),
    az<{ value: { commitId: string; comment: string; author: { name: string; date: string }; remoteUrl: string }[] }>(pat, apiUrl(org, `${base}/commits`, { 'searchCriteria.$top': '10' })).catch(() => ({ value: [] })),
    az<{ value: { pullRequestId: number; title: string; createdBy: { displayName: string }; sourceRefName: string; targetRefName: string; isDraft?: boolean }[] }>(pat, apiUrl(org, `${base}/pullrequests`, { 'searchCriteria.status': 'active', $top: '30' })).catch(() => ({ value: [] })),
    az<{ value: { id: number; buildNumber: string; status: string; result?: string; definition: { name: string }; finishTime?: string; sourceBranch?: string; _links?: { web?: { href?: string } } }[] }>(pat, apiUrl(org, `${projectId}/_apis/build/builds`, { repositoryId: repoId, repositoryType: 'TfsGit', $top: '8' })).catch(() => ({ value: [] }))
  ])
  return {
    branches: branches.value.map((b) => b.name.replace(/^refs\/heads\//, '')),
    commits: commits.value.map((c) => ({ sha: c.commitId.slice(0, 8), message: c.comment.split('\n')[0], author: c.author.name, date: c.author.date, url: c.remoteUrl })),
    pulls: pulls.value.map((p) => ({ id: p.pullRequestId, title: p.title, author: p.createdBy.displayName, from: p.sourceRefName.replace(/^refs\/heads\//, ''), to: p.targetRefName.replace(/^refs\/heads\//, ''), draft: !!p.isDraft })),
    builds: builds.value.map((b) => ({ id: b.id, name: b.definition.name, number: b.buildNumber, status: b.status, result: b.result ?? null, branch: (b.sourceBranch ?? '').replace(/^refs\/heads\//, ''), finished: b.finishTime ?? null, url: b._links?.web?.href ?? null }))
  }
}

const REF = /^[A-Za-z0-9._/-]{1,100}$/

export async function createPullRequest(org: string, pat: string, projectId: string, repoId: string, o: { from: string; to: string; title: string; description: string }): Promise<{ id: number; url: string }> {
  if (!GUID.test(projectId) || !GUID.test(repoId)) throw new Error('Unknown repository.')
  if (!REF.test(o.from) || !REF.test(o.to) || o.from.includes('..') || o.to.includes('..')) throw new Error('Choose the branches.')
  if (!o.title.trim()) throw new Error('Give the pull request a title.')
  const r = await az<{ pullRequestId: number; repository: { webUrl: string } }>(pat, apiUrl(org, `${projectId}/_apis/git/repositories/${repoId}/pullrequests`), {
    method: 'POST',
    body: { sourceRefName: `refs/heads/${o.from}`, targetRefName: `refs/heads/${o.to}`, title: o.title.trim().slice(0, 400), description: o.description.slice(0, 4000) }
  })
  return { id: r.pullRequestId, url: `${r.repository.webUrl}/pullrequest/${r.pullRequestId}` }
}

/** Git settings that send the token to dev.azure.com only, for one command. */
export function authFor(pat: string, acc: AzureAccount): GitAuth {
  return {
    config: ['-c', `http.https://dev.azure.com/.extraheader=AUTHORIZATION: ${basic(pat)}`],
    user: { name: acc.name, email: acc.email ?? `${acc.name.replace(/\s+/g, '.').toLowerCase()}@users.noreply.dev.azure.com` }
  }
}

/** True for https://dev.azure.com/<org>/<project>/_git/<repo> addresses. */
export const isAzureRemote = (url: string): boolean => /^https:\/\/dev\.azure\.com\/[A-Za-z0-9-]+\/[^/]+\/_git\/[^/]+$/.test(url)
