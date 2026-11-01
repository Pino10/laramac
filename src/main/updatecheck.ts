import type { ReleaseNote, UpdateInfo } from '../shared/types'
import { compareVersions } from './versions'

export interface Release {
  tag_name: string
  draft: boolean
  body: string | null
  published_at: string
  html_url: string
  assets: { name: string; browser_download_url: string; url?: string }[]
}

/** Every app release, newest first, for the changelog. */
export function changelog(releases: Release[]): ReleaseNote[] {
  return releases
    .filter((r) => !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name))
    .map((r) => ({ version: r.tag_name.slice(1), notes: r.body ?? '', publishedAt: r.published_at, url: r.html_url }))
    .sort((a, b) => compareVersions(b.version, a.version))
}

export const dmgArch = (): string => (process.arch === 'arm64' ? 'arm64' : 'x64')

/** Picks the newest app release (tags like v1.2.3) newer than `current`. Server builds have other tags and are ignored. */
export function pickUpdate(releases: Release[], current: string, arch = dmgArch()): { info: UpdateInfo; dmg: string; sums: string } | null {
  let best: Release | null = null
  for (const r of releases) {
    if (r.draft || !/^v\d+\.\d+\.\d+$/.test(r.tag_name)) continue
    const v = r.tag_name.slice(1)
    if (compareVersions(v, current) <= 0) continue
    if (!best || compareVersions(v, best.tag_name.slice(1)) > 0) best = r
  }
  if (!best) return null
  const version = best.tag_name.slice(1)
  const dmg = best.assets.find((a) => a.name === `Laramac-${version}-${arch}.dmg`)
  const sums = best.assets.find((a) => a.name === 'SHA256SUMS.txt')
  // Without a checksum list the download cannot be verified, so the release is not offered.
  if (!dmg || !sums) return null
  return {
    info: { version, current, notes: best.body ?? '', publishedAt: best.published_at, url: best.html_url },
    dmg: dmg.browser_download_url,
    sums: sums.browser_download_url
  }
}

