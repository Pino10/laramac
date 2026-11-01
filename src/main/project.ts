/**
 * laramac.yml: a project's setup in one small file you commit with the code. Whoever clones it
 * gets the same PHP version, HTTPS, extra addresses, services, database and dev server, and the
 * setup commands, after they have seen and approved them.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parse, stringify } from 'yaml'
import type { ProjectFile, ProjectPlan, ServiceId, SiteInfo } from '../shared/types'
import { getSettings } from './settings'

export const PROJECT_FILE = 'laramac.yml'

const SERVICES: ServiceId[] = ['mysql', 'mariadb', 'postgres', 'redis', 'memcached', 'mongodb', 'meilisearch', 'mailpit', 's3', 'rabbitmq']

const fail = (msg: string): never => {
  throw new Error(`laramac.yml: ${msg}`)
}

/** Reads and checks a laramac.yml. Unknown keys are ignored; wrong values are refused. */
export function parseProjectFile(text: string): ProjectFile {
  let raw: unknown
  try {
    raw = parse(text, { maxAliasCount: 20 })
  } catch (err) {
    return fail(`it is not valid YAML (${(err as Error).message.split('\n')[0]}).`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('it must be a list of settings.')
  const r = raw as Record<string, unknown>
  const out: ProjectFile = {}
  if (r.php !== undefined) {
    const v = String(r.php)
    if (!/^\d\.\d$/.test(v)) fail('php must look like "8.4".')
    out.php = v
  }
  if (r.https !== undefined) {
    if (typeof r.https !== 'boolean') fail('https must be true or false.')
    out.https = r.https as boolean
  }
  if (r.aliases !== undefined) {
    if (!Array.isArray(r.aliases) || r.aliases.length > 10) fail('aliases must be a short list.')
    out.aliases = (r.aliases as unknown[]).map(String).map((a) => {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(a)) fail(`"${a}" is not a valid address.`)
      return a.toLowerCase()
    })
  }
  if (r.services !== undefined) {
    if (!Array.isArray(r.services)) fail('services must be a list.')
    out.services = (r.services as unknown[]).map(String).map((s) => {
      if (!SERVICES.includes(s as ServiceId)) fail(`"${s}" is not a service Laramac knows. Use: ${SERVICES.join(', ')}.`)
      return s as ServiceId
    })
  }
  if (r.database !== undefined) {
    const d = r.database as Record<string, unknown>
    if (!d || typeof d !== 'object') fail('database needs an engine and a name.')
    const engine = String(d.engine ?? 'mysql')
    if (!['mysql', 'mariadb', 'postgres'].includes(engine)) fail('database engine must be mysql, mariadb or postgres.')
    const name = String(d.name ?? '')
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(name)) fail('database name may only use letters, numbers and underscores.')
    out.database = { engine: engine as 'mysql' | 'mariadb' | 'postgres', name }
  }
  if (r.dev !== undefined) {
    const d = r.dev as Record<string, unknown>
    const command = typeof d === 'string' ? d : String(d?.command ?? '')
    if (!command.trim() || command.length > 300) fail('dev needs a command, like "npm run dev".')
    out.dev = { command: command.trim(), proxy: typeof d === 'object' && d.proxy === false ? false : true }
  }
  if (r.setup !== undefined) {
    if (!Array.isArray(r.setup) || r.setup.length > 20) fail('setup must be a list of up to 20 commands.')
    out.setup = (r.setup as unknown[]).map(String).map((c) => {
      if (!c.trim() || c.length > 300 || /[\n\r]/.test(c)) fail('each setup command must be one line.')
      return c.trim()
    })
  }
  return out
}

export function projectFileHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export function readProjectFile(site: SiteInfo): { file: ProjectFile; text: string; hash: string } | null {
  const path = join(site.path, PROJECT_FILE)
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf8').slice(0, 20000)
  return { file: parseProjectFile(text), text, hash: projectFileHash(text) }
}

/** Guesses what a project uses from its .env and files, for the first laramac.yml. */
export function inferProject(site: SiteInfo): ProjectFile {
  const cfg = getSettings().siteConfig[site.name] ?? {}
  const env = existsSync(join(site.path, '.env')) ? readFileSync(join(site.path, '.env'), 'utf8') : ''
  const get = (k: string): string | undefined => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '')
  const services = new Set<ServiceId>()
  const conn = get('DB_CONNECTION')
  const dbName = get('DB_DATABASE')
  let database: ProjectFile['database']
  if (conn === 'mysql' || conn === 'mariadb' || conn === 'pgsql') {
    const engine = conn === 'pgsql' ? 'postgres' : get('DB_PORT') === '3307' ? 'mariadb' : 'mysql'
    services.add(engine)
    if (dbName && /^[a-zA-Z0-9_]+$/.test(dbName)) database = { engine, name: dbName }
  }
  if (/^(CACHE_STORE|CACHE_DRIVER|SESSION_DRIVER|QUEUE_CONNECTION)=redis/m.test(env) || get('REDIS_HOST')) services.add('redis')
  if (get('MAIL_PORT') === '1025') services.add('mailpit')
  if (get('MEILISEARCH_HOST')) services.add('meilisearch')
  if (get('AWS_ENDPOINT')?.includes('127.0.0.1:9000')) services.add('s3')
  if (/^QUEUE_CONNECTION=rabbitmq/m.test(env)) services.add('rabbitmq')
  const setup: string[] = []
  if (existsSync(join(site.path, 'composer.json'))) setup.push('composer install')
  if (existsSync(join(site.path, 'package.json'))) setup.push('npm install')
  if (existsSync(join(site.path, 'artisan'))) {
    if (existsSync(join(site.path, '.env.example'))) setup.push('cp -n .env.example .env')
    setup.push('php artisan key:generate --no-interaction', 'php artisan migrate --no-interaction')
  }
  if (existsSync(join(site.path, 'package.json')) && existsSync(join(site.path, 'vite.config.js'))) setup.push('npm run build')
  return {
    ...(site.php ? { php: site.php } : {}),
    https: site.secure,
    ...(cfg.aliases?.length ? { aliases: cfg.aliases } : {}),
    ...(services.size ? { services: [...services] } : {}),
    ...(database ? { database } : {}),
    ...(cfg.dev ? { dev: { command: cfg.dev.command.join(' ').replace(/ -- --port \{port\}.*$/, ''), proxy: cfg.dev.proxy } } : {}),
    ...(setup.length ? { setup } : {})
  }
}

export function writeProjectFile(site: SiteInfo, file: ProjectFile): string {
  const body = stringify(file, { lineWidth: 0 })
  const text = `# Laramac project file. Commit it so everyone who clones this project gets the same setup.\n# https://github.com/Pino10/laramac#project-files\n${body}`
  writeFileSync(join(site.path, PROJECT_FILE), text)
  return text
}

/** What applying the file would change, shown before anything happens. */
export function planProject(site: SiteInfo, file: ProjectFile, installedPhp: string[], services: { id: ServiceId; installed: boolean }[]): ProjectPlan {
  const steps: string[] = []
  if (file.php && file.php !== site.php) steps.push(installedPhp.includes(file.php) ? `Use PHP ${file.php}` : `Install PHP ${file.php} and use it`)
  if (file.https !== undefined && file.https !== site.secure) steps.push(file.https ? 'Turn on HTTPS' : 'Turn off HTTPS')
  for (const a of file.aliases ?? []) if (!site.aliases.includes(a)) steps.push(`Also answer at ${a}`)
  for (const s of file.services ?? []) {
    const known = services.find((x) => x.id === s)
    steps.push(known?.installed ? `Start ${s}` : `Install and start ${s}`)
  }
  if (file.database) steps.push(`Create the ${file.database.engine} database ${file.database.name}`)
  if (file.dev) steps.push(`Set up the dev server: ${file.dev.command}`)
  return { steps, commands: file.setup ?? [] }
}
