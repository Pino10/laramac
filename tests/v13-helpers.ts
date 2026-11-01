import type { SiteInfo } from '../src/shared/types'
import type { SiteConf } from '../src/main/configgen'

/** The same site list webconf.ts builds, without certificates or PHP pools. */
export function webconfSites(sites: SiteInfo[]): SiteConf[] {
  return sites.map((s) => ({
    domain: s.domain,
    docRoot: s.docRoot,
    kind: s.kind,
    phpPort: null,
    secure: false,
    aliases: s.aliases,
    ...(s.dev?.proxy ? { proxyTo: `http://127.0.0.1:${s.dev.port}` } : {})
  }))
}
