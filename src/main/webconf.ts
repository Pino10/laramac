import { existsSync } from 'fs'
import { join } from 'path'
import type { SiteInfo } from '../shared/types'
import { dirs } from './paths'
import { ensureWww, getSettings } from './settings'
import { scanSites } from './sites'
import { defaultMinor } from './php'
import { phpPortFor, type ExtraHost, type LocalhostRoot, type SiteConf } from './configgen'
import { certFor, ensureSiteCert } from './ssl'

export interface HostConfs {
  sites: SiteConf[]
  extras: ExtraHost[]
  siteInfos: SiteInfo[]
  localhost: LocalhostRoot | null
}

export const mailpitBinary = (): string => join(dirs.mailpit(), 'mailpit')
export const phpmyadminInstalled = (): boolean => existsSync(join(dirs.phpmyadmin(), 'index.php'))
export const adminerInstalled = (): boolean => existsSync(join(dirs.adminer(), 'index.php'))

/** Builds the virtual host list shared by Nginx and Apache. Issues certificates for HTTPS sites. */
export async function buildHostConfs(): Promise<HostConfs> {
  const { tld } = getSettings()
  const siteInfos = scanSites()
  const fallback = defaultMinor()

  const sites: SiteConf[] = []
  for (const s of siteInfos) {
    let cert = s.secure ? certFor(s.domain) : undefined
    if (s.secure && !cert) cert = await ensureSiteCert(s.domain)
    sites.push({
      domain: s.domain,
      docRoot: s.docRoot,
      kind: s.kind,
      phpPort: s.php ? phpPortFor(s.php) : null,
      secure: s.secure,
      cert,
      aliases: s.aliases,
      ...(s.dev?.proxy ? { proxyTo: `http://127.0.0.1:${s.dev.port}` } : {})
    })
  }

  const extras: ExtraHost[] = []
  if (phpmyadminInstalled()) {
    extras.push({
      domain: `phpmyadmin.${tld}`,
      secure: false,
      root: dirs.phpmyadmin(),
      phpPort: fallback ? phpPortFor(fallback) : null
    })
  }
  if (adminerInstalled()) {
    extras.push({
      domain: `adminer.${tld}`,
      secure: false,
      root: dirs.adminer(),
      phpPort: fallback ? phpPortFor(fallback) : null
    })
  }
  if (existsSync(mailpitBinary())) {
    extras.push({ domain: `mail.${tld}`, secure: false, proxyTo: 'http://127.0.0.1:8025' })
  }

  const localhost = getSettings().hostLocalhostFolders ? { root: ensureWww(), phpPort: fallback ? phpPortFor(fallback) : null } : null
  return { sites, extras, siteInfos, localhost }
}
