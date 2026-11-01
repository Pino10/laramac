import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { SiteConfig, SiteInfo, SiteKind } from '../shared/types'
import { ensureWww, getSettings, setSettings } from './settings'
import { defaultMinor, installedMinors } from './php'
import { isDevRunning, suggestDevScript } from './devservers'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function detectKind(dir: string): SiteKind {
  if (existsSync(join(dir, 'artisan'))) return 'laravel'
  if (existsSync(join(dir, 'wp-config.php')) || existsSync(join(dir, 'wp-content'))) return 'wordpress'
  if (existsSync(join(dir, 'bin', 'console')) && existsSync(join(dir, 'symfony.lock'))) return 'symfony'
  if (existsSync(join(dir, 'composer.json')) && (existsSync(join(dir, 'web', 'index.php')) || existsSync(join(dir, 'public', 'index.php')))) return 'php'
  if (existsSync(join(dir, 'package.json')) && !existsSync(join(dir, 'index.php'))) return 'node'
  if (existsSync(join(dir, 'index.php')) || existsSync(join(dir, 'public', 'index.php'))) return 'php'
  if (existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'manage.py')) || existsSync(join(dir, 'requirements.txt'))) return 'python'
  if (existsSync(join(dir, 'go.mod'))) return 'go'
  if (existsSync(join(dir, 'Cargo.toml'))) return 'rust'
  if (existsSync(join(dir, 'Package.swift')) || existsSync(join(dir, 'project.yml'))) return 'swift'
  try {
    if (readdirSync(dir).some((f) => f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.slnx'))) return 'dotnet'
  } catch {
    // Unreadable folder; fall through.
  }
  return 'static'
}

/** Laravel and Symfony serve from public/; so does any project with a public/index file. */
export function detectDocRoot(dir: string, kind: SiteKind): string {
  const pub = join(dir, 'public')
  if (kind === 'laravel' || kind === 'symfony') return pub
  if (existsSync(join(pub, 'index.php')) || existsSync(join(pub, 'index.html'))) return pub
  // Drupal and Craft serve from web/.
  if (existsSync(join(dir, 'web', 'index.php'))) return join(dir, 'web')
  return dir
}

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function siteConfigFor(name: string): SiteConfig {
  return getSettings().siteConfig[name] ?? {}
}

export function setSiteConfig(name: string, patch: SiteConfig): void {
  const current = getSettings().siteConfig
  setSettings({ siteConfig: { ...current, [name]: { ...current[name], ...patch } } })
}

/** Whether a project's laramac.yml is new or changed since it was applied. */
function projectState(dir: string, applied?: string): { projectFile?: 'new' | 'applied' } {
  const f = join(dir, 'laramac.yml')
  if (!existsSync(f)) return {}
  try {
    const hash = createHash('sha256').update(readFileSync(f, 'utf8').slice(0, 20000)).digest('hex').slice(0, 16)
    return { projectFile: hash === applied ? 'applied' : 'new' }
  } catch {
    return {}
  }
}

/** Every folder directly inside the www directory becomes `<folder>.<tld>`. */
export function scanSites(): SiteInfo[] {
  const root = ensureWww()
  const { tld, httpPort, httpsPort, hostDotLocalhost } = getSettings()
  const installed = installedMinors()
  const fallback = defaultMinor()
  const sites: SiteInfo[] = []

  for (const entry of readdirSync(root)) {
    if (entry.startsWith('.')) continue
    const full = join(root, entry)
    try {
      if (!statSync(full).isDirectory()) continue
    } catch {
      continue
    }
    const s = slug(entry)
    if (!s) continue

    const cfg = siteConfigFor(entry)
    const kind = detectKind(full)
    const domain = `${s}.${tld}`
    const php = cfg.php && installed.includes(cfg.php) ? cfg.php : fallback
    const aliases = [...(hostDotLocalhost ? [`${s}.localhost`] : []), ...(cfg.aliases ?? [])].filter((a, i, all) => a !== domain && all.indexOf(a) === i)
    const port = (p: number, def: number): string => (p === def ? '' : `:${p}`)

    sites.push({
      name: entry,
      path: full,
      docRoot: detectDocRoot(full, kind),
      domain,
      url: `http://${domain}${port(httpPort, 80)}`,
      httpsUrl: `https://${domain}${port(httpsPort, 443)}`,
      kind,
      secure: !!cfg.secure,
      php,
      aliases,
      ...projectState(full, cfg.projectHash),
      ...(cfg.dev
        ? { dev: { port: cfg.dev.port, proxy: cfg.dev.proxy, running: isDevRunning(entry), command: cfg.dev.command.join(' ') } }
        : kind === 'node' && suggestDevScript(full)
          ? { devSuggestion: suggestDevScript(full)! }
          : {})
    })
  }

  return sites.sort((a, b) => a.name.localeCompare(b.name))
}
