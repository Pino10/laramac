/**
 * After an import, the steps that make a project run on this Mac, worked out from its files:
 * the same things a new project from Starters gets (packages, .env, database, dev server).
 * Planning only reads files; nothing runs until the person agrees.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { DevConfig, ImportSetupStep, RuntimeId, SiteKind } from '../shared/types'

export interface SetupPlan {
  steps: ImportSetupStep[]
  /** The dev server to set up, for projects that are not served by Apache or Nginx. */
  dev: Omit<DevConfig, 'port'> | null
}

const has = (dir: string, f: string): boolean => existsSync(join(dir, f))

function pkg(dir: string): { scripts: Record<string, string>; deps: Record<string, string> } {
  try {
    const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    return { scripts: j.scripts ?? {}, deps: { ...j.dependencies, ...j.devDependencies } }
  } catch {
    return { scripts: {}, deps: {} }
  }
}

/** The package manager a Node project uses, from its lock file. */
export function nodeManager(dir: string): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  if (has(dir, 'bun.lockb') || has(dir, 'bun.lock')) return 'bun'
  if (has(dir, 'pnpm-lock.yaml')) return 'pnpm'
  if (has(dir, 'yarn.lock')) return 'yarn'
  return 'npm'
}

export function nodeInstallCommand(dir: string): string[] {
  const m = nodeManager(dir)
  if (m === 'bun') return ['bun', 'install']
  // pnpm and yarn come through npx, so nothing extra has to be installed first.
  if (m === 'pnpm') return ['npx', '--yes', 'pnpm', 'install']
  if (m === 'yarn') return ['npx', '--yes', 'yarn', 'install']
  return has(dir, 'package-lock.json') ? ['npm', 'ci'] : ['npm', 'install']
}

const PHP_KINDS: SiteKind[] = ['laravel', 'symfony', 'wordpress', 'php']

/** The dev server for a project, the same way Starters sets one up. */
export function inferDev(dir: string, kind: SiteKind | null): Omit<DevConfig, 'port'> | null {
  if (!kind || PHP_KINDS.includes(kind) || kind === 'static') return null
  if (kind === 'node') {
    const { scripts } = pkg(dir)
    const script = ['dev', 'start:dev', 'serve', 'start'].find((s) => scripts[s])
    if (!script) return null
    const body = scripts[script]
    const run = nodeManager(dir) === 'bun' ? ['bun', 'run', script] : ['npm', 'run', script]
    if (/\bnext\b/.test(body)) return { command: [...run, '--', '-p', '{port}', '-H', '127.0.0.1'], proxy: true }
    if (/\b(vite|astro|nuxt|nuxi|ng serve|react-router|svelte-kit)\b/.test(body)) return { command: [...run, '--', '--port', '{port}', '--host', '127.0.0.1'], proxy: true }
    return { command: run, proxy: true, env: { PORT: '{port}' } }
  }
  if (kind === 'python') {
    if (has(dir, 'manage.py')) return { command: ['uv', 'run', 'python', 'manage.py', 'runserver', '127.0.0.1:{port}'], proxy: true }
    const read = (f: string): string => (has(dir, f) ? readFileSync(join(dir, f), 'utf8') : '')
    if (/fastapi/i.test(read('main.py'))) return { command: ['uv', 'run', 'fastapi', 'dev', 'main.py', '--port', '{port}', '--host', '127.0.0.1'], proxy: true }
    for (const f of ['app.py', 'main.py', 'wsgi.py']) {
      if (/flask/i.test(read(f))) return { command: ['uv', 'run', 'flask', '--app', f.replace(/\.py$/, ''), 'run', '--debug', '--port', '{port}', '--host', '127.0.0.1'], proxy: true }
    }
    return null
  }
  if (kind === 'go') return { command: ['go', 'run', '.'], proxy: true, env: { PORT: '{port}' } }
  if (kind === 'rust') return { command: ['cargo', 'run'], proxy: true, env: { PORT: '{port}' } }
  if (kind === 'dotnet') return { command: ['dotnet', 'watch', 'run', '--non-interactive', '--urls', 'http://127.0.0.1:{port}'], proxy: true, env: { DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER: '1' } }
  if (kind === 'swift' && has(dir, 'Package.swift') && /vapor/i.test(readFileSync(join(dir, 'Package.swift'), 'utf8'))) {
    return { command: ['swift', 'run', 'App', 'serve', '--hostname', '127.0.0.1', '--port', '{port}'], proxy: true }
  }
  return null
}

/** Runtimes a step list needs, so they can be installed before anything runs. */
export function runtimesFor(steps: ImportSetupStep[], dev: Omit<DevConfig, 'port'> | null): RuntimeId[] {
  const out = new Set<RuntimeId>()
  const cmds = [...steps.map((s) => s.command), ...(dev ? [dev.command] : [])]
  for (const c of cmds) {
    const bin = c[0]
    if (bin === 'npm' || bin === 'npx') out.add('node')
    else if (bin === 'bun') out.add('bun')
    else if (bin === 'uv') out.add('python')
    else if (bin === 'go') out.add('go')
    else if (bin === 'cargo') out.add('rust')
    else if (bin === 'dotnet') out.add('dotnet')
    else if (bin === 'php' || bin === 'composer') out.add('php')
  }
  return [...out]
}

/**
 * What it takes to run the project. `importingSql` says whether a database dump comes with it,
 * in which case migrations are not offered (the data is already there).
 */
export function planSetup(dir: string, kind: SiteKind | null, importingSql: boolean): SetupPlan {
  const steps: ImportSetupStep[] = []
  const step = (s: ImportSetupStep): void => {
    steps.push(s)
  }
  const isPhp = !!kind && PHP_KINDS.includes(kind)

  if (kind === 'laravel' && !has(dir, '.env') && has(dir, '.env.example')) {
    step({ id: 'env', label: 'Create .env from .env.example', detail: 'With a new app key. Nothing from the project runs.', command: [], runsCode: false })
  }
  if (has(dir, 'composer.json') && !has(dir, 'vendor')) {
    step({ id: 'composer', label: 'Install Composer packages', detail: 'composer install', command: ['composer', 'install', '--no-interaction', '--prefer-dist'], runsCode: true })
  }
  if (has(dir, 'package.json') && !has(dir, 'node_modules')) {
    const cmd = nodeInstallCommand(dir)
    step({ id: 'node', label: `Install ${nodeManager(dir)} packages`, detail: cmd.filter((c) => c !== '--yes' && c !== 'npx').join(' '), command: cmd, runsCode: true })
  }
  // PHP sites load their front end from built files, so build it once.
  if (isPhp && has(dir, 'package.json') && pkg(dir).scripts.build && !has(dir, join('public', 'build'))) {
    const cmd = nodeManager(dir) === 'bun' ? ['bun', 'run', 'build'] : ['npm', 'run', 'build']
    step({ id: 'build', label: 'Build the front end', detail: cmd.join(' '), command: cmd, runsCode: true })
  }
  if (kind === 'python') {
    if (has(dir, 'pyproject.toml')) step({ id: 'python', label: 'Install Python packages', detail: 'uv sync', command: ['uv', 'sync'], runsCode: true })
    else if (has(dir, 'requirements.txt')) {
      step({ id: 'python', label: 'Install Python packages', detail: 'uv venv, then uv pip install -r requirements.txt', command: ['uv', 'venv', '--allow-existing'], then: ['uv', 'pip', 'install', '-r', 'requirements.txt'], runsCode: true })
    }
  }
  if (kind === 'go' && has(dir, 'go.mod')) step({ id: 'go', label: 'Download Go modules', detail: 'go mod download', command: ['go', 'mod', 'download'], runsCode: false })
  if (kind === 'dotnet') step({ id: 'dotnet', label: 'Restore .NET packages', detail: 'dotnet restore', command: ['dotnet', 'restore'], runsCode: true })
  if (kind === 'laravel' && !importingSql) {
    step({ id: 'migrate', label: 'Create the database tables', detail: 'php artisan migrate', command: ['php', 'artisan', 'migrate', '--force', '--no-interaction'], runsCode: true })
  }
  if (kind === 'python' && has(dir, 'manage.py') && !importingSql) {
    step({ id: 'migrate', label: 'Create the database tables', detail: 'python manage.py migrate', command: ['uv', 'run', 'python', 'manage.py', 'migrate', '--noinput'], runsCode: true })
  }
  return { steps, dev: inferDev(dir, kind) }
}

/** A Laravel APP_KEY, made the same way `php artisan key:generate` does. */
export function newAppKey(): string {
  return `base64:${randomBytes(32).toString('base64')}`
}

/** .env from .env.example, with a fresh app key. */
export function envFromExample(example: string): string {
  const key = newAppKey()
  return /^APP_KEY=.*$/m.test(example) ? example.replace(/^APP_KEY=.*$/m, `APP_KEY=${key}`) : `APP_KEY=${key}\n${example}`
}

/** Files that mark a folder as a project, for any language Laramac runs. */
export function looksLikeProject(names: string[]): number {
  const markers = ['artisan', 'wp-config.php', 'wp-settings.php', 'composer.json', 'index.php', 'index.html', 'package.json', 'pyproject.toml', 'manage.py', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Package.swift']
  return markers.filter((m) => names.includes(m)).length + (names.some((n) => /\.(csproj|sln|slnx)$/.test(n)) ? 1 : 0)
}

export const listNames = (dir: string): string[] => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** A friendlier name than the language: "Next.js" rather than "Node". */
export function frameworkName(dir: string, kind: SiteKind | null): string | null {
  if (kind === 'node') {
    const { deps } = pkg(dir)
    const order: [string, string][] = [
      ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['@remix-run/react', 'Remix'], ['react-router', 'React Router'], ['astro', 'Astro'], ['@sveltejs/kit', 'SvelteKit'],
      ['@angular/core', 'Angular'], ['@nestjs/core', 'NestJS'], ['expo', 'Expo'], ['@tauri-apps/api', 'Tauri'], ['electron', 'Electron'], ['hono', 'Hono'],
      ['express', 'Express'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['solid-js', 'Solid'], ['react', 'React']
    ]
    return order.find(([d]) => deps[d])?.[1] ?? null
  }
  if (kind === 'python') {
    if (has(dir, 'manage.py')) return 'Django'
    const text = ['pyproject.toml', 'requirements.txt'].map((f) => (has(dir, f) ? readFileSync(join(dir, f), 'utf8') : '')).join('\n')
    if (/fastapi/i.test(text)) return 'FastAPI'
    if (/flask/i.test(text)) return 'Flask'
  }
  if (kind === 'php' && has(dir, 'composer.json')) {
    const text = readFileSync(join(dir, 'composer.json'), 'utf8')
    if (/drupal\/core/.test(text)) return 'Drupal'
    if (/craftcms\/cms/.test(text)) return 'Craft CMS'
    if (/cakephp\/cakephp/.test(text)) return 'CakePHP'
    if (/codeigniter4/.test(text)) return 'CodeIgniter'
    if (/yiisoft/.test(text)) return 'Yii'
  }
  return null
}
