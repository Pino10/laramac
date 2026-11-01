import { dbEnv } from './secrets'
import {
  closeSync,
  cpSync,
  openSync,
  readSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { randomBytes } from 'crypto'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { spawn } from 'child_process'
import { Transform, type TransformCallback } from 'stream'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import * as tar from 'tar'
import yauzl from 'yauzl'
import type { ImportAnswers, ImportPlan, SiteKind } from '../shared/types'
import { dirs } from './paths'
import { ensureWww, getSettings } from './settings'
import { detectKind, slug } from './sites'
import { validateProjectName } from './creator'
import { patchLaravelEnv } from './configgen'

/** Hard limits so a hostile or broken archive cannot fill the disk. */
export const LIMITS = { bytes: 20 * 1024 ** 3, entries: 400_000 }

const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', '__MACOSX'])

export class ImportError extends Error {}

// ------------------------------------------------------------------ Safe extraction

/** True when `child` is inside `parent` (or is it). Works on resolved absolute paths. */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== '..')
}

interface ExtractStats {
  files: number
  skippedLinks: number
}

/**
 * Extracts a .tar.gz / .tgz / .tar. Links and special files are skipped, paths that would land
 * outside the destination are refused, and size and file-count limits apply.
 */
export async function extractTar(file: string, dest: string): Promise<ExtractStats> {
  mkdirSync(dest, { recursive: true })
  const stats: ExtractStats = { files: 0, skippedLinks: 0 }
  let bytes = 0
  // Throwing inside node-tar's filter escapes as an unhandled error, so problems are recorded
  // here, every later entry is skipped, and the error is raised once the archive is closed.
  let problem: ImportError | null = null
  await tar
    .x({
      file,
      cwd: dest,
      strict: true,
      preserveOwner: false,
      noChmod: true,
      onwarn: (_code, message) => {
        problem ??= new ImportError(`The archive has an unsafe entry: ${message}`)
      },
      filter: (path, entry) => {
        if (problem) return false
        const type = 'type' in entry ? entry.type : 'File'
        if (type === 'SymbolicLink' || type === 'Link') {
          stats.skippedLinks++
          return false
        }
        if (type !== 'File' && type !== 'Directory' && type !== 'OldFile' && type !== 'ContiguousFile') return false
        if (!isInside(dest, join(dest, path))) {
          problem = new ImportError(`The archive tried to write outside its folder: ${path}`)
          return false
        }
        bytes += 'size' in entry ? (entry.size ?? 0) : 0
        if (++stats.files > LIMITS.entries || bytes > LIMITS.bytes) {
          problem = new ImportError('The archive is too large to import.')
          return false
        }
        return true
      }
    })
    .catch((err: Error) => {
      problem ??= new ImportError(`The archive could not be read: ${err.message}`)
    })
  if (problem) throw problem
  return stats
}

/** Extracts a .zip with the same rules as extractTar. */
export function extractZip(file: string, dest: string): Promise<ExtractStats> {
  mkdirSync(dest, { recursive: true })
  const stats: ExtractStats = { files: 0, skippedLinks: 0 }
  let bytes = 0
  return new Promise((resolvePromise, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(new ImportError(`This zip file could not be read: ${err?.message ?? ''}`))
      const fail = (e: Error): void => {
        zip.close()
        reject(e)
      }
      zip.on('error', fail)
      zip.on('end', () => resolvePromise(stats))
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName
        const target = join(dest, name)
        // yauzl already rejects absolute and ".." paths; this is a second check.
        if (!isInside(dest, target)) return fail(new ImportError(`The archive tried to write outside its folder: ${name}`))
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000
        if (mode === 0o120000) {
          stats.skippedLinks++
          return zip.readEntry()
        }
        if (name.endsWith('/')) {
          mkdirSync(target, { recursive: true })
          return zip.readEntry()
        }
        bytes += entry.uncompressedSize
        if (++stats.files > LIMITS.entries || bytes > LIMITS.bytes) return fail(new ImportError('The archive is too large to import.'))
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return fail(e ?? new ImportError('Could not read a file in the archive.'))
          mkdirSync(dirname(target), { recursive: true })
          pipeline(stream, createWriteStream(target, { mode: 0o644 }))
            .then(() => zip.readEntry())
            .catch(fail)
        })
      })
      zip.readEntry()
    })
  })
}

/** Deletes any link that survived (for example in a copied folder), as a last line of defence. */
export function removeLinks(root: string): number {
  let removed = 0
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) {
        rmSync(p, { force: true })
        removed++
      } else if (st.isDirectory()) walk(p)
      else if (!st.isFile()) rmSync(p, { force: true })
    }
  }
  walk(root)
  return removed
}

function folderSize(root: string): number {
  let total = 0
  let count = 0
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = lstatSync(p)
      if (st.isDirectory()) walk(p)
      else if (st.isFile()) total += st.size
      if (++count > LIMITS.entries) throw new ImportError('That folder has too many files to import.')
    }
  }
  walk(root)
  return total
}

// ------------------------------------------------------------------ Detection

const MARKERS = ['artisan', 'wp-config.php', 'wp-settings.php', 'composer.json', 'index.php', 'index.html', 'package.json']

interface Found {
  projectDir: string | null
  sqlFiles: { path: string; size: number }[]
}

/** Finds the project folder (the shallowest folder that looks like a site) and any SQL dumps. */
export function scan(root: string): Found {
  let best: { dir: string; depth: number; score: number } | null = null
  const sqlFiles: { path: string; size: number }[] = []

  const walk = (dir: string, depth: number): void => {
    if (depth > 5) return
    const names = readdirSync(dir)
    const score = MARKERS.filter((m) => names.includes(m)).length
    if (score > 0 && (!best || depth < best.depth || (depth === best.depth && score > best.score))) {
      best = { dir, depth, score }
    }
    for (const name of names) {
      const p = join(dir, name)
      const st = lstatSync(p)
      if (st.isDirectory() && !SKIP_DIRS.has(name) && !name.startsWith('.')) walk(p, depth + 1)
      else if (st.isFile() && /\.sql(\.gz)?$/i.test(name) && st.size > 0) {
        sqlFiles.push({ path: relative(root, p), size: st.size })
      }
    }
  }
  walk(root, 0)
  sqlFiles.sort((a, b) => b.size - a.size)
  const found = best as { dir: string } | null
  return { projectDir: found ? relative(root, found.dir) : null, sqlFiles }
}

const readHead = (file: string, bytes: number): string => {
  try {
    const buf = Buffer.alloc(Math.min(bytes, statSync(file).size))
    const fd = openSync(file, 'r')
    const n = readSync(fd, buf, 0, buf.length, 0)
    closeSync(fd)
    return buf.subarray(0, n).toString('utf8')
  } catch {
    return ''
  }
}

export function wpConfigValue(text: string, key: string): string | null {
  const m = new RegExp(`define\\(\\s*['"]${key}['"]\\s*,\\s*['"]([^'"]*)['"]`).exec(text)
  return m ? m[1] : null
}

export function envValue(text: string, key: string): string | null {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(text)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

/** Pulls the WordPress site address out of a dump, if it is there. */
export function findSiteUrl(sqlHead: string): string | null {
  const m = /'(?:siteurl|home)'\s*,\s*'(https?:\/\/[^']+)'/.exec(sqlHead)
  return m ? m[1].replace(/\/$/, '') : null
}

const cleanDbName = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64) || 'site'

function uniqueName(base: string): string {
  const www = ensureWww()
  let name =
    base
      .replace(/[^A-Za-z0-9._-]/g, '-')
      .replace(/^[^A-Za-z0-9]+/, '')
      .slice(0, 50) || 'imported-site'
  if (!existsSync(join(www, name))) return name
  for (let i = 2; i < 100; i++) if (!existsSync(join(www, `${name}-${i}`))) return `${name}-${i}`
  name = `${name}-${randomBytes(2).toString('hex')}`
  return name
}

// ------------------------------------------------------------------ Sessions

interface Session {
  id: string
  staging: string
  plan: ImportPlan
}

const sessions = new Map<string, Session>()
const stagingRoot = (): string => join(dirs.root(), 'imports')

export function cancelImport(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  rmSync(s.staging, { recursive: true, force: true })
  sessions.delete(id)
}

/**
 * Unpacks what the user chose (archive, folder or .sql file) into a private staging folder and
 * works out what is inside. Nothing touches the www folder or any database yet.
 */
export async function inspect(source: string, installedEngines: ('mysql' | 'mariadb')[]): Promise<ImportPlan> {
  const id = randomBytes(8).toString('hex')
  const staging = join(stagingRoot(), id)
  const content = join(staging, 'content')
  mkdirSync(content, { recursive: true, mode: 0o700 })

  const warnings: string[] = []
  const name = basename(source)
  try {
    const st = statSync(source)
    if (st.isDirectory()) {
      if (folderSize(source) > LIMITS.bytes) throw new ImportError('That folder is too large to import.')
      cpSync(source, join(content, name), {
        recursive: true,
        filter: (src) => !lstatSync(src).isSymbolicLink()
      })
    } else {
      if (st.size > LIMITS.bytes) throw new ImportError('That file is too large to import.')
      const lower = name.toLowerCase()
      let stats: ExtractStats | null = null
      if (lower.endsWith('.zip')) stats = await extractZip(source, content)
      else if (/\.(tar\.gz|tgz|tar)$/.test(lower)) stats = await extractTar(source, content)
      else if (/\.sql(\.gz)?$/.test(lower)) cpSync(source, join(content, name))
      else throw new ImportError('Choose a .zip, .tar.gz, .tgz or .sql file, or a project folder.')
      if (stats?.skippedLinks) {
        warnings.push(
          `${stats.skippedLinks} shortcut ${stats.skippedLinks === 1 ? 'link was' : 'links were'} left out for safety. For Laravel, run "php artisan storage:link" afterwards.`
        )
      }
    }
    const removed = removeLinks(content)
    if (removed) warnings.push(`${removed} links inside the folder were left out for safety.`)

    // Make sure nothing escaped the staging folder.
    // Resolve both sides: on macOS, /var is a link to /private/var.
    if (!isInside(realpathSync(staging), realpathSync(content))) throw new ImportError('The import could not be prepared safely.')

    const found = scan(content)
    const projectAbs = found.projectDir !== null ? join(content, found.projectDir) : null
    const kind: SiteKind | null = projectAbs ? detectKind(projectAbs) : null

    let configFile: ImportPlan['configFile'] = null
    let dbFromConfig: string | null = null
    let oldUrl: string | null = null
    if (projectAbs && existsSync(join(projectAbs, 'wp-config.php'))) {
      configFile = 'wp-config.php'
      const wp = readFileSync(join(projectAbs, 'wp-config.php'), 'utf8')
      dbFromConfig = wpConfigValue(wp, 'DB_NAME')
      oldUrl = wpConfigValue(wp, 'WP_HOME') ?? wpConfigValue(wp, 'WP_SITEURL')
    } else if (projectAbs && existsSync(join(projectAbs, '.env'))) {
      configFile = '.env'
      const env = readFileSync(join(projectAbs, '.env'), 'utf8')
      dbFromConfig = envValue(env, 'DB_DATABASE')
      oldUrl = envValue(env, 'APP_URL')
      const conn = envValue(env, 'DB_CONNECTION')
      if (conn && !['mysql', 'mariadb'].includes(conn)) {
        warnings.push(`This project uses ${conn}. Laramac imports MySQL and MariaDB dumps; restore other databases with their own tools.`)
      }
    }
    const firstSql = found.sqlFiles[0]
    if (firstSql && !oldUrl) {
      const head = /\.gz$/i.test(firstSql.path) ? '' : readHead(join(content, firstSql.path), 8 * 1024 * 1024)
      oldUrl = findSiteUrl(head)
    }
    if (projectAbs && kind === 'laravel' && !existsSync(join(projectAbs, 'vendor'))) {
      warnings.push('The vendor folder is missing. Turn on "Install Composer packages" or run composer install later.')
    }
    if (!projectAbs && found.sqlFiles.length === 0) {
      throw new ImportError('No website files or SQL dumps were found in that import.')
    }

    const baseName = projectAbs && found.projectDir ? basename(projectAbs) : name.replace(/\.(zip|tar\.gz|tgz|tar|sql\.gz|sql)$/i, '')
    const suggestedName = uniqueName(baseName === 'content' || baseName === '' ? 'imported-site' : baseName)

    const plan: ImportPlan = {
      id,
      sourceName: name,
      hasProject: projectAbs !== null,
      suggestedName,
      kind,
      sqlFiles: found.sqlFiles,
      suggestedDb: cleanDbName(dbFromConfig ?? slug(suggestedName)),
      engines: installedEngines,
      oldUrl,
      configFile,
      hasVendor: projectAbs ? existsSync(join(projectAbs, 'vendor')) : true,
      warnings
    }
    sessions.set(id, { id, staging, plan })
    // Remember where the project is inside the staging folder.
    writeFileSync(join(staging, 'project'), found.projectDir ?? '')
    return plan
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    throw err instanceof ImportError ? err : new ImportError(err instanceof Error ? err.message : String(err))
  }
}

// ------------------------------------------------------------------ SQL import

/**
 * Line filter for SQL dumps fed to the mysql/mariadb client.
 * - Refuses client commands (\! system, source, tee, pager, edit, connect, any backslash command),
 *   which could run programs or read and write files on this Mac.
 * - Drops CREATE DATABASE, USE and DROP DATABASE so everything lands in the chosen database.
 * - Drops account and privilege statements so a dump cannot change your local root user.
 */
export class DumpFilter extends Transform {
  private rest = ''
  skipped = 0

  // The same rules the mysql client uses: a named command only counts as the
  // first word of a new statement, and a backslash command anywhere outside
  // quotes and comments. A column called `source` inside CREATE TABLE is fine.
  static readonly NAMED = /^\s*(system|source|tee|pager|edit|connect)(\s|;|$)/i
  static readonly SKIP =
    /^(CREATE\s+(DATABASE|SCHEMA)|DROP\s+(DATABASE|SCHEMA)|USE(\s|;|`|$)|(CREATE|ALTER|DROP|RENAME)\s+USER|GRANT\s|REVOKE\s|SET\s+PASSWORD|FLUSH\s+PRIVILEGES)/i

  private delimiter = ';'
  private quote: string | null = null
  private inComment = false
  private stmtEmpty = true
  private skipping = false

  _transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback): void {
    const text = this.rest + chunk.toString('utf8')
    const lines = text.split('\n')
    this.rest = lines.pop() ?? ''
    try {
      done(null, lines.map((l) => this.line(l)).join(''))
    } catch (err) {
      done(err as Error)
    }
  }

  _flush(done: TransformCallback): void {
    try {
      done(null, this.rest ? this.line(this.rest).replace(/\n$/, '') : '')
    } catch (err) {
      done(err as Error)
    }
  }

  private refuse(text: string): never {
    throw new ImportError(`This dump contains a client command ("${text.trim().slice(0, 40)}"), which could run programs on your Mac. It was not imported.`)
  }

  private line(raw: string): string {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const cr = l.length !== raw.length ? '\r' : ''

    if (this.stmtEmpty && !this.quote && !this.inComment) {
      const d = /^\s*delimiter\s+(\S+)/i.exec(l)
      if (d) {
        this.delimiter = d[1]
        return raw + '\n'
      }
      if (DumpFilter.NAMED.test(l)) this.refuse(l)
    }

    let out = ''
    let i = 0
    while (i < l.length) {
      const c = l[i]
      if (this.inComment) {
        if (l.startsWith('*/', i)) {
          this.inComment = false
          if (!this.skipping) out += '*/'
          i += 2
        } else {
          if (!this.skipping) out += c
          i++
        }
        continue
      }
      if (this.quote) {
        if (c === '\\' && this.quote !== '`') {
          if (!this.skipping) out += l.slice(i, i + 2)
          i += 2
          continue
        }
        if (c === this.quote) this.quote = null
        if (!this.skipping) out += c
        i++
        continue
      }
      // Line comments: "-- " (or "--" at the end) and "#".
      if (c === '#' || (l.startsWith('--', i) && (i + 2 >= l.length || /\s/.test(l[i + 2])))) {
        if (!this.skipping) out += l.slice(i)
        break
      }
      if (l.startsWith('/*', i) && l[i + 2] !== '!' && l[i + 2] !== '+') {
        this.inComment = true
        if (!this.skipping) out += '/*'
        i += 2
        continue
      }
      if (c === '\\') this.refuse(l.slice(i))
      if (l.startsWith(this.delimiter, i)) {
        if (!this.skipping) out += this.delimiter
        if (this.skipping) this.skipped++
        this.skipping = false
        this.stmtEmpty = true
        i += this.delimiter.length
        continue
      }
      if (this.stmtEmpty && !/\s/.test(c)) {
        this.stmtEmpty = false
        if (DumpFilter.SKIP.test(l.slice(i))) this.skipping = true
      }
      if (c === "'" || c === '"' || c === '`') this.quote = c
      if (!this.skipping) out += c
      i++
    }
    return out + cr + '\n'
  }
}

export interface SqlTarget {
  client: string
  engine: 'mysql' | 'mariadb'
  port: number
  database: string
}

function clientArgs(t: SqlTarget, extra: string[]): string[] {
  return [
    '--host=127.0.0.1',
    `--port=${t.port}`,
    '--user=root',
    '--local-infile=0',
    // Belt and braces with DumpFilter: the client itself refuses shell and file commands.
    // MySQL 8.4.6+: --commands=OFF disables all client commands except DELIMITER and \\C.
    t.engine === 'mariadb' ? '--sandbox' : '--commands=OFF',
    '--default-character-set=utf8mb4',
    ...extra
  ]
}

function runClient(t: SqlTarget, args: string[], input?: NodeJS.ReadableStream, onBytes?: (n: number) => void): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(t.client, clientArgs(t, args), {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: dbEnv(t.engine)
    })
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000)
    })
    child.on('error', (e) => reject(new ImportError(`The database client could not run: ${e.message}`)))
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new ImportError(`The database refused the import:\n${stderr.trim().split('\n').slice(-4).join('\n')}`))
    )
    if (!input) {
      child.stdin.end()
      return
    }
    if (onBytes) input.on('data', (c: Buffer) => onBytes(c.length))
    pipeline(input, child.stdin).catch((e) => {
      child.kill('SIGTERM')
      reject(e instanceof ImportError ? e : new ImportError(String(e?.message ?? e)))
    })
  })
}

/** Creates the database (if needed) and loads the dump into it. Returns how many lines were skipped. */
export async function importSql(file: string, t: SqlTarget, onProgress?: (pct: number) => void): Promise<number> {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(t.database)) throw new ImportError('Database names may use letters, numbers and underscores.')
  // Remember whether the database is new, so a failed import can remove it again
  // instead of leaving an empty database behind.
  let created = false
  try {
    await runClient(t, ['-e', `CREATE DATABASE \`${t.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`])
    created = true
  } catch (err) {
    if (!/exists/i.test(String((err as Error).message))) throw err
  }

  const total = statSync(file).size
  let read = 0
  const raw = createReadStream(file)
  raw.on('data', (c: Buffer | string) => {
    read += c.length
    onProgress?.(Math.min(99, Math.round((read / total) * 100)))
  })
  const filter = new DumpFilter()
  const source = /\.gz$/i.test(file) ? raw.pipe(createGunzip()).pipe(filter) : raw.pipe(filter)
  try {
    await runClient(t, [t.database], source)
  } catch (err) {
    if (created) await runClient(t, ['-e', `DROP DATABASE IF EXISTS \`${t.database}\``]).catch(() => undefined)
    throw err
  }
  return filter.skipped
}

// ------------------------------------------------------------------ Config rewriting

/** Points wp-config.php at the local database and, optionally, the new address. */
export function rewriteWpConfig(text: string, db: string, host: string, url: string | null): string {
  const set = (src: string, key: string, value: string): string =>
    src.replace(new RegExp(`(define\\(\\s*['"]${key}['"]\\s*,\\s*)(['"])[^'"]*\\2`), `$1'${value}'`)
  let out = set(text, 'DB_NAME', db)
  out = set(out, 'DB_USER', 'root')
  out = set(out, 'DB_PASSWORD', '')
  out = set(out, 'DB_HOST', host)
  if (url) {
    for (const key of ['WP_HOME', 'WP_SITEURL']) {
      if (wpConfigValue(out, key) !== null) out = set(out, key, url)
      else {
        const line = `define( '${key}', '${url}' );\n`
        const marker = out.search(/\/\*\s*That's all, stop editing/i)
        out = marker >= 0 ? out.slice(0, marker) + line + out.slice(marker) : out.replace(/<\?php\s*\n?/, (m) => `${m}${line}`)
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ Run

export interface RunDeps {
  ensureRunning: (engine: 'mysql' | 'mariadb') => Promise<void>
  clientFor: (engine: 'mysql' | 'mariadb') => string | null
  composerInstall: (dir: string, onLine: (l: string) => void) => Promise<void>
  update: (pct: number | null, label?: string) => void
}

export function validateAnswers(plan: ImportPlan, a: ImportAnswers): void {
  const problem = validateProjectName(a.name)
  if (plan.hasProject && problem) throw new ImportError(problem)
  if (plan.hasProject && existsSync(join(ensureWww(), a.name))) throw new ImportError(`A site named ${a.name} already exists.`)
  if (a.sqlFile !== null) {
    if (!plan.sqlFiles.some((f) => f.path === a.sqlFile)) throw new ImportError('Choose one of the SQL files that were found.')
    if (!plan.engines.includes(a.engine)) throw new ImportError(`Install ${a.engine === 'mysql' ? 'MySQL' : 'MariaDB'} first.`)
    if (!/^[A-Za-z0-9_]{1,64}$/.test(a.database)) throw new ImportError('Database names may use letters, numbers and underscores.')
  }
}

/** Moves the project into www, loads the database and rewires the config. */
export async function runImport(id: string, a: ImportAnswers, deps: RunDeps): Promise<{ site: string | null; database: string | null; skipped: number }> {
  const session = sessions.get(id)
  if (!session) throw new ImportError('This import has expired. Choose the file again.')
  const { plan, staging } = session
  validateAnswers(plan, a)

  const content = join(staging, 'content')
  const projectRel = readFileSync(join(staging, 'project'), 'utf8')
  const target = join(ensureWww(), a.name)
  const tld = getSettings().tld
  const url = `http://${slug(a.name)}.${tld}`
  let skipped = 0

  try {
    // 1. Database first, so a bad dump does not leave a half-imported site behind.
    if (a.sqlFile) {
      deps.update(null, 'Starting the database')
      await deps.ensureRunning(a.engine)
      const client = deps.clientFor(a.engine)
      if (!client) throw new ImportError('The database client was not found.')
      deps.update(0, `Importing ${basename(a.sqlFile)}`)
      skipped = await importSql(
        join(content, a.sqlFile),
        {
          client,
          engine: a.engine,
          port: a.engine === 'mysql' ? 3306 : 3307,
          database: a.database
        },
        (p) => deps.update(p, `Importing ${basename(a.sqlFile!)}`)
      )
    }

    // 2. Files.
    if (plan.hasProject) {
      deps.update(null, 'Copying files')
      const from = join(content, projectRel)
      try {
        renameSync(from, target)
      } catch {
        cpSync(from, target, { recursive: true })
      }

      // 3. Config.
      if (a.updateConfig) {
        const host = a.engine === 'mysql' ? '127.0.0.1' : '127.0.0.1:3307'
        const wp = join(target, 'wp-config.php')
        const env = join(target, '.env')
        if (existsSync(wp)) {
          writeFileSync(wp, rewriteWpConfig(readFileSync(wp, 'utf8'), a.database, host, a.replaceUrl ? url : null))
        } else if (existsSync(env)) {
          let text = patchLaravelEnv(readFileSync(env, 'utf8'), a.database, `${slug(a.name)}.${tld}`)
          if (a.engine === 'mariadb') text = text.replace(/^DB_PORT=.*$/m, 'DB_PORT=3307')
          if (!a.replaceUrl && plan.oldUrl) text = text.replace(/^APP_URL=.*$/m, `APP_URL=${plan.oldUrl}`)
          writeFileSync(env, text)
        }
      }

      // 4. Composer, only when asked: it runs scripts from the project.
      if (a.composerInstall && existsSync(join(target, 'composer.json'))) {
        deps.update(null, 'Installing Composer packages')
        await deps.composerInstall(target, (l) => deps.update(null, `Composer: ${l.slice(0, 60)}`))
      }
    }
    return {
      site: plan.hasProject ? a.name : null,
      database: a.sqlFile ? a.database : null,
      skipped
    }
  } finally {
    cancelImport(id)
  }
}

export const importsRoot = stagingRoot
