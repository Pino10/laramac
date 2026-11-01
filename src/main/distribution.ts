/**
 * Where Laramac's downloads come from: app updates and PHP builds.
 *
 * The public releases repository is used when it exists. While the project is
 * private, the same releases are read from the source repository using the
 * GitHub sign-in you added on Laramac's GitHub page, so updates keep working
 * for you during testing.
 */
export const RELEASE_REPOS = ['Pino10/laramac']
const UA = 'Laramac (+https://github.com/Pino10/laramac)'

let tokenFn: () => string | null = () => null
export function setDownloadToken(fn: () => string | null): void {
  tokenFn = fn
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

/** GETs `repos/<repo>/<path>` from the first release repository that answers. */
export async function releasesApi<T>(path: string): Promise<T> {
  let last = 'No release repository answered.'
  for (const repo of RELEASE_REPOS) {
    const url = `https://api.github.com/repos/${repo}/${path}`
    const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/vnd.github+json' }
    let res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
    const token = res.status === 404 ? tokenFn() : null
    if (token) res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    if (res.ok) {
      const data = (await res.json()) as T
      if (token) remember(data)
      return data
    }
    last =
      res.status === 404
        ? 'Laramac is being tested privately. Connect your GitHub account on the GitHub page so Laramac can see its own updates.'
        : `GitHub answered ${res.status}.`
  }
  throw new Error(last)
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
