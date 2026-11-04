import { execFile, spawn } from 'child_process'
import { dbEnv } from './secrets'
import { createWriteStream, existsSync, renameSync, rmSync } from 'fs'
import { basename, dirname, join } from 'path'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import type { DatabaseInfo } from '../shared/types'

/**
 * Everyday database chores for MySQL and MariaDB: list, create, drop, back up.
 * Every name is checked against a strict pattern before it reaches SQL, and
 * every command runs through the client with argument arrays, never a shell.
 */
export interface DbTarget {
  engine: 'mysql' | 'mariadb'
  client: string
  port: number
}

const SYSTEM = new Set(['information_schema', 'performance_schema', 'mysql', 'sys'])
export const DB_NAME = /^[A-Za-z0-9_]{1,64}$/

export function checkName(name: string): string {
  if (!DB_NAME.test(name)) throw new Error('Database names may use letters, numbers and underscores (up to 64).')
  if (SYSTEM.has(name.toLowerCase())) throw new Error(`${name} belongs to the database server and cannot be changed here.`)
  return name
}

const base = (t: DbTarget): string[] => ['--host=127.0.0.1', `--port=${t.port}`, '--user=root', '--default-character-set=utf8mb4']

function query(t: DbTarget, sql: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    execFile(t.client, [...base(t), '-N', '-B', '-e', sql], { maxBuffer: 16 * 1024 * 1024, env: dbEnv(t.engine) }, (err, out, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().split('\n').pop()))
      resolve(
        String(out)
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split('\t'))
      )
    })
  })
}

export async function listDatabases(t: DbTarget): Promise<DatabaseInfo[]> {
  const rows = await query(
    t,
    `SELECT s.SCHEMA_NAME, COUNT(tb.TABLE_NAME), COALESCE(SUM(tb.DATA_LENGTH + tb.INDEX_LENGTH), 0), COALESCE(SUM(tb.TABLE_ROWS), 0)
     FROM information_schema.SCHEMATA s LEFT JOIN information_schema.TABLES tb ON tb.TABLE_SCHEMA = s.SCHEMA_NAME
     GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME`
  )
  return rows
    .filter(([name]) => !SYSTEM.has(name.toLowerCase()))
    .map(([name, tables, bytes, rows]) => ({ engine: t.engine, name, tables: Number(tables), bytes: Number(bytes), rows: Number(rows) }))
}

/** Sets the root password on every root account, using the current one to sign in. */
export async function setRootPassword(t: DbTarget, password: string): Promise<void> {
  const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const hosts = (await query(t, "SELECT host FROM mysql.user WHERE user = 'root'")).map((r) => r[0]).filter(Boolean)
  if (hosts.length === 0) throw new Error('No root account was found.')
  const statements = hosts.map((h) => `ALTER USER 'root'@${q(h)} IDENTIFIED BY ${q(password)}`).join('; ')
  await query(t, `${statements}; FLUSH PRIVILEGES`)
}

export async function createDatabase(t: DbTarget, name: string): Promise<void> {
  await query(t, `CREATE DATABASE \`${checkName(name)}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
}

export async function dropDatabase(t: DbTarget, name: string): Promise<void> {
  await query(t, `DROP DATABASE \`${checkName(name)}\``)
}

/** The dump tool that ships next to the client. */
export function dumpTool(t: DbTarget): string {
  const dir = dirname(t.client)
  for (const name of t.engine === 'mariadb' ? ['mariadb-dump', 'mysqldump'] : ['mysqldump']) {
    if (existsSync(join(dir, name))) return join(dir, name)
  }
  throw new Error(`The ${t.engine === 'mariadb' ? 'mariadb-dump' : 'mysqldump'} tool was not found next to the database client.`)
}

/** Writes a complete backup (tables, data, routines, triggers, events) to `dest`, gzipped when it ends in .gz. */
export async function exportDatabase(t: DbTarget, name: string, dest: string): Promise<void> {
  checkName(name)
  const tmp = join(dirname(dest), `.${basename(dest)}.part`)
  const child = spawn(
    dumpTool(t),
    [...base(t), '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob', '--no-tablespaces', '--databases', name],
    { stdio: ['ignore', 'pipe', 'pipe'], env: dbEnv(t.engine) }
  )
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)))
  const exited = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
  try {
    if (dest.endsWith('.gz')) await pipeline(child.stdout, createGzip(), createWriteStream(tmp, { mode: 0o600 }))
    else await pipeline(child.stdout, createWriteStream(tmp, { mode: 0o600 }))
    const code = await exited
    if (code !== 0) throw new Error(`The backup failed: ${stderr.trim().split('\n').pop() ?? 'unknown error'}`)
    renameSync(tmp, dest)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

/**
 * Runs one read-only statement (SELECT, SHOW, DESCRIBE, EXPLAIN) inside a
 * read-only transaction, for AI tools that need to look at data. Writing,
 * file access and multiple statements are refused.
 */
export async function readOnlyQuery(t: DbTarget, database: string, sql: string, maxRows = 200): Promise<{ columns: string[]; rows: string[][]; truncated: boolean }> {
  checkName(database)
  const s = sql.trim().replace(/;\s*$/, '')
  if (!/^(select|show|describe|desc|explain)\b/i.test(s)) throw new Error('Only SELECT, SHOW, DESCRIBE and EXPLAIN are allowed.')
  if (s.includes(';')) throw new Error('Send one statement at a time.')
  if (/\binto\s+(outfile|dumpfile)\b|\bload_file\s*\(|\bsleep\s*\(|\bbenchmark\s*\(/i.test(s)) throw new Error('That statement is not allowed here.')
  const out = await new Promise<string>((resolve, reject) => {
    execFile(
      t.client,
      [...base(t), `--database=${database}`, '-B', '--max-allowed-packet=16M', '-e', `SET SESSION TRANSACTION READ ONLY; START TRANSACTION READ ONLY; ${s}; ROLLBACK;`],
      { maxBuffer: 16 * 1024 * 1024, timeout: 30000, env: dbEnv(t.engine) },
      (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().split('\n').pop())) : resolve(String(stdout)))
    )
  })
  const lines = out.split('\n').filter((l) => l.length > 0)
  const columns = (lines.shift() ?? '').split('\t')
  const rows = lines.slice(0, maxRows).map((l) => l.split('\t'))
  return { columns, rows, truncated: lines.length > maxRows }
}

/** Runs statements that change data in one database (used for scrambling a local copy). */
export function execSql(t: DbTarget, database: string, sql: string): Promise<void> {
  checkName(database)
  return new Promise((resolve, reject) => {
    const child = execFile(t.client, [...base(t), `--database=${database}`], { maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60_000, env: dbEnv(t.engine) }, (err, _out, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().split('\n').pop())) : resolve()))
    child.stdin?.end(sql)
  })
}
