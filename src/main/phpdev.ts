/**
 * For PHP developers: quick php.ini settings, the global PHP tools (Laravel installer, PHPStan,
 * Pint, PHP CS Fixer, Rector, Psalm) and Artisan commands.
 *
 * Quick settings go in a marked block of your own php.ini file (php-<version>.custom.ini), which
 * Laramac adds after its defaults, so they win; anything else you wrote there stays as it is.
 * Global tools are installed with Laramac's Composer into Laramac's own Composer folder, and their
 * commands are on the PATH of Laramac Code's terminal and of Terminal windows Laramac opens.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface QuickSetting {
  key: string
  label: string
  hint: string
  options: { value: string; label: string }[]
  /** Laramac's own default (in its php.ini). */
  fallback: string
  /** Other directives that take the same value. */
  also?: string[]
}

export const QUICK_SETTINGS: QuickSetting[] = [
  { key: 'memory_limit', label: 'Memory per request', hint: 'Raise it for big imports or heavy reports.', fallback: '512M', options: [{ value: '256M', label: '256 MB' }, { value: '512M', label: '512 MB' }, { value: '1G', label: '1 GB' }, { value: '2G', label: '2 GB' }, { value: '-1', label: 'No limit' }] },
  { key: 'upload_max_filesize', label: 'Largest upload', hint: 'post_max_size follows it.', fallback: '256M', also: ['post_max_size'], options: [{ value: '64M', label: '64 MB' }, { value: '256M', label: '256 MB' }, { value: '1G', label: '1 GB' }, { value: '4G', label: '4 GB' }] },
  { key: 'max_execution_time', label: 'Time limit', hint: 'How long one request may run.', fallback: '300', options: [{ value: '60', label: '1 minute' }, { value: '300', label: '5 minutes' }, { value: '900', label: '15 minutes' }, { value: '0', label: 'No limit' }] },
  { key: 'display_errors', label: 'Show errors on the page', hint: 'On while you build; off to see what visitors see.', fallback: 'On', options: [{ value: 'On', label: 'On' }, { value: 'Off', label: 'Off' }] },
  { key: 'opcache.enable', label: 'OPcache', hint: 'Faster PHP. Turn it off if code changes do not show.', fallback: '1', options: [{ value: '1', label: 'On' }, { value: '0', label: 'Off' }] }
]

const START = '; >>> Laramac quick settings (from the PHP page). Edit them there.'
const END = '; <<< Laramac quick settings'

/** The quick settings in your php.ini file, with Laramac's defaults for the rest. */
export function readQuick(text: string): Record<string, string> {
  const out: Record<string, string> = Object.fromEntries(QUICK_SETTINGS.map((q) => [q.key, q.fallback]))
  const block = text.includes(START) ? text.slice(text.indexOf(START), text.includes(END) ? text.indexOf(END) : undefined) : ''
  for (const line of block.split('\n')) {
    const m = /^\s*([a-z_.]+)\s*=\s*(\S+)\s*$/.exec(line)
    if (m && m[1] in out) out[m[1]] = m[2]
  }
  return out
}

/** Your php.ini file with the quick settings block replaced (or added at the end). Values must be on the list. */
export function writeQuick(text: string, values: Record<string, string>): string {
  const lines: string[] = [START]
  for (const q of QUICK_SETTINGS) {
    const v = values[q.key]
    if (v === undefined || v === q.fallback) continue
    if (!q.options.some((o) => o.value === v)) throw new Error(`${q.label}: that value is not one of the choices.`)
    lines.push(`${q.key} = ${v}`)
    for (const a of q.also ?? []) lines.push(`${a} = ${v}`)
  }
  lines.push(END)
  const block = lines.length > 2 ? lines.join('\n') : ''
  let rest = text
  if (text.includes(START)) {
    const a = text.indexOf(START)
    const b = text.includes(END) ? text.indexOf(END) + END.length : text.length
    rest = (text.slice(0, a) + text.slice(b)).replace(/\n{3,}/g, '\n\n')
  }
  rest = rest.replace(/\s+$/, '')
  return block ? `${rest}\n\n${block}\n` : `${rest}\n`
}

export interface PhpTool {
  id: string
  name: string
  pkg: string
  command: string
  about: string
}

export const PHP_TOOLS: PhpTool[] = [
  { id: 'laravel', name: 'Laravel installer', pkg: 'laravel/installer', command: 'laravel', about: 'laravel new my-app, with the starter kits.' },
  { id: 'phpstan', name: 'PHPStan', pkg: 'phpstan/phpstan', command: 'phpstan', about: 'Finds bugs without running your code.' },
  { id: 'pint', name: 'Laravel Pint', pkg: 'laravel/pint', command: 'pint', about: 'Formats PHP the Laravel way (PSR-12 and more).' },
  { id: 'php-cs-fixer', name: 'PHP CS Fixer', pkg: 'friendsofphp/php-cs-fixer', command: 'php-cs-fixer', about: 'Fixes coding standards across a project.' },
  { id: 'rector', name: 'Rector', pkg: 'rector/rector', command: 'rector', about: 'Upgrades code to newer PHP and framework versions.' },
  { id: 'psalm', name: 'Psalm', pkg: 'vimeo/psalm', command: 'psalm', about: 'Type checks and taint analysis for security.' },
  { id: 'phpunit', name: 'PHPUnit', pkg: 'phpunit/phpunit', command: 'phpunit', about: 'Tests for projects that do not ship their own.' }
]

/** Installed global packages and their versions, from Composer's installed.json. */
export function installedGlobals(composerHome: string): Record<string, string> {
  const f = join(composerHome, 'vendor', 'composer', 'installed.json')
  if (!existsSync(f)) return {}
  try {
    const j = JSON.parse(readFileSync(f, 'utf8')) as { packages?: { name: string; version: string }[] } | { name: string; version: string }[]
    const list = Array.isArray(j) ? j : (j.packages ?? [])
    return Object.fromEntries(list.map((p) => [p.name, p.version.replace(/^v/, '')]))
  } catch {
    return {}
  }
}

export interface ArtisanAction {
  id: string
  label: string
  args: string[]
  /** Changes the database or data: the window asks first. */
  confirm?: string
}

/** The Artisan commands on a Laravel site's page. Each opens in Terminal so you see it run. */
export const ARTISAN: ArtisanAction[] = [
  { id: 'migrate', label: 'Migrate', args: ['migrate'] },
  { id: 'fresh', label: 'Fresh database and seed', args: ['migrate:fresh', '--seed'], confirm: 'This deletes every table in the site’s database and builds it again from the migrations and seeders.' },
  { id: 'optimize-clear', label: 'Clear caches', args: ['optimize:clear'] },
  { id: 'route-list', label: 'Routes', args: ['route:list'] },
  { id: 'tinker', label: 'Tinker', args: ['tinker'] },
  { id: 'test', label: 'Run tests', args: ['test'] },
  { id: 'about', label: 'About', args: ['about'] },
  { id: 'storage-link', label: 'Storage link', args: ['storage:link'] }
]

/** Laravel Boost in a Laravel project: installed or not, and which version (from composer.lock). */
export function boostState(root: string): { laravel: boolean; installed: boolean; version: string | null } {
  const laravel = existsSync(join(root, 'artisan'))
  let installed = false
  let version: string | null = null
  try {
    const c = JSON.parse(readFileSync(join(root, 'composer.json'), 'utf8')) as { require?: Record<string, string>; 'require-dev'?: Record<string, string> }
    installed = !!(c['require-dev']?.['laravel/boost'] ?? c.require?.['laravel/boost'])
  } catch {
    /* no composer.json */
  }
  try {
    const lock = JSON.parse(readFileSync(join(root, 'composer.lock'), 'utf8')) as { packages?: { name: string; version: string }[]; 'packages-dev'?: { name: string; version: string }[] }
    const p = [...(lock['packages-dev'] ?? []), ...(lock.packages ?? [])].find((x) => x.name === 'laravel/boost')
    if (p) {
      installed = true
      version = p.version.replace(/^v/, '')
    }
  } catch {
    /* not installed yet */
  }
  return { laravel, installed, version }
}

/** The exact commands the Boost buttons run, in Terminal, after the person agrees. */
export const BOOST_COMMANDS = {
  install: 'composer require laravel/boost --dev && php artisan boost:install',
  update: 'composer update laravel/boost && php artisan boost:update'
} as const
