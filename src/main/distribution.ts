/**
 * Where Laramac's downloads come from: app updates and PHP builds.
 *
 * The public releases repository is used when it exists. While the project is
 * private, the same releases are read from the source repository using the
 * GitHub sign-in you added on Laramac's GitHub page, so updates keep working
 * for you during testing.
 */
import { configureGitHub, githubApi, releasesWithFallback, type ApiLikeRelease } from './seckit/ghapi'

export const RELEASE_REPOS = ['Pino10/laramac']
const UA = 'Laramac (+https://github.com/Pino10/laramac)'

let tokenFn: () => string | null = () => null
export function setDownloadToken(fn: () => string | null): void {
  tokenFn = fn
  configureGitHub({ userAgent: UA, token: fn })
}

// Browser download links of private assets map to their API address, which accepts a token.
const privateAssets = new Map<string, string>()

interface Asset {
  name: string
  url?: string
  browser_download_url: string
}

function remember(data: unknown): void {
  const releases = Array.isArray(data) ? data : [data]
  for (const r of releases as { assets?: Asset[] }[]) for (const a of r.assets ?? []) if (a.url) privateAssets.set(a.browser_download_url, a.url)
}

/**
 * GETs `repos/<repo>/<path>` from the release repository, through the shared GitHub client: with
 * your GitHub sign-in when there is one, kept for a while, and never spending GitHub's hourly
 * limit twice on the same question.
 */
export async function releasesApi<T>(path: string): Promise<T> {
  const data = await githubApi<T>(`/repos/${RELEASE_REPOS[0]}/${path}`)
  remember(data)
  return data
}

/** Laramac's own releases, newest first. When GitHub's hourly limit is used up, they come from its release feed instead. */
export function appReleases(): Promise<ApiLikeRelease[]> {
  return releasesWithFallback(RELEASE_REPOS[0], (v) => [`Laramac-${v}-arm64.dmg`, `Laramac-${v}-x64.dmg`, 'SHA256SUMS.txt'])
}

/** Opens a download, using the GitHub sign-in when it belongs to a private release. */
export function openAsset(url: string): Promise<Response> {
  const api = privateAssets.get(url)
  const token = api ? tokenFn() : null
  if (api && token) {
    // fetch drops the Authorization header when GitHub redirects to its file storage.
    return fetch(api, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/octet-stream', Authorization: `Bearer ${token}` } })
  }
  return fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } })
}
