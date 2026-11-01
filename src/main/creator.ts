import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { spawn } from 'child_process'
import type { ProjectKind } from '../shared/types'
import { dirs } from './paths'
import { ensureWww, getSettings } from './settings'
import { downloadFile, extract } from './download'
import { jobs } from './jobs'
import { WORDPRESS_URL } from './versions'
import { patchLaravelEnv } from './configgen'
import { defaultMinor, phpBinary, phpIniPath, writePhpConfig } from './php'
import { createDatabase } from './svc/mysql'
import { composerPhar, installComposer, refreshShims } from './tools'
import { slug } from './sites'

export function validateProjectName(name: string): string | null {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,60}$/.test(name)) {
    return 'Use letters, numbers, dots, dashes or underscores, starting with a letter or number.'
  }
  return null
}

/** Fills wp-config-sample.php with local database settings and fresh salts. */
export function buildWpConfig(sample: string, dbName: string, salt: () => string = () => randomBytes(32).toString('hex')): string {
  let out = sample
    .replace(/'database_name_here'/, `'${dbName}'`)
    .replace(/'username_here'/, `'root'`)
    .replace(/'password_here'/, `''`)
    .replace(/'localhost'/, `'127.0.0.1'`)
  for (const key of [
    'AUTH_KEY',
    'SECURE_AUTH_KEY',
    'LOGGED_IN_KEY',
    'NONCE_KEY',
    'AUTH_SALT',
    'SECURE_AUTH_SALT',
    'LOGGED_IN_SALT',
    'NONCE_SALT'
  ]) {
    out = out.replace(new RegExp(`(define\\(\\s*'${key}',\\s*)'[^']*'`), `$1'${salt()}'`)
  }
  return out
}

export function runStreaming(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } })
    let last = ''
    const handle = (b: Buffer): void => {
      for (const line of b.toString().split('\n')) {
        if (line.trim()) {
          last = line.trim()
          onLine(last)
        }
      }
    }
    child.stdout.on('data', handle)
    child.stderr.on('data', handle)
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Command failed: ${last}`))))
  })
}

async function createWordPress(target: string, dbName: string): Promise<void> {
  await jobs.run('Creating WordPress site', async (update) => {
    const archive = join(dirs.downloads(), 'wordpress.zip')
    const staging = join(dirs.downloads(), 'wordpress-staging')
    rmSync(staging, { recursive: true, force: true })
    await downloadFile(WORDPRESS_URL, archive, (p) => update(p, 'Downloading WordPress'))
    update(null, 'Unpacking WordPress')
    await extract(archive, staging)
    renameSync(join(staging, 'wordpress'), target)
    rmSync(staging, { recursive: true, force: true })
    rmSync(archive, { force: true })

    const sample = join(target, 'wp-config-sample.php')
    if (existsSync(sample)) {
      writeFileSync(join(target, 'wp-config.php'), buildWpConfig(readFileSync(sample, 'utf8'), dbName))
    }
    update(null, 'Creating database')
    await createDatabase(dbName)
  })
}

async function createLaravel(target: string, name: string, dbName: string, domain: string): Promise<void> {
  const minor = defaultMinor()
  if (!minor) throw new Error('Install PHP first, then create a Laravel project.')
  if (!existsSync(composerPhar())) await installComposer()
  writePhpConfig(minor)

  await jobs.run('Creating Laravel project', async (update) => {
    mkdirSync(dirs.root(), { recursive: true })
    await runStreaming(
      phpBinary(minor),
      ['-c', phpIniPath(minor), composerPhar(), 'create-project', 'laravel/laravel', name, '--prefer-dist', '--no-interaction'],
      join(target, '..'),
      { COMPOSER_HOME: join(dirs.root(), 'composer'), PATH: `${dirs.bin()}:${process.env.PATH ?? ''}` },
      (line) => update(null, `Laravel: ${line.slice(0, 70)}`)
    )
    const envFile = join(target, '.env')
    if (existsSync(envFile)) {
      writeFileSync(envFile, patchLaravelEnv(readFileSync(envFile, 'utf8'), dbName, domain))
    }
    update(null, 'Creating database')
    await createDatabase(dbName)
  })
  refreshShims()
}

export async function createProject(kind: ProjectKind, name: string): Promise<string> {
  const problem = validateProjectName(name)
  if (problem) throw new Error(problem)

  const root = ensureWww()
  const target = join(root, name)
  if (existsSync(target)) throw new Error(`A folder named "${name}" already exists in your www folder.`)

  const dbName = slug(name).replace(/-/g, '_')
  const domain = `${slug(name)}.${getSettings().tld}`

  if (kind === 'blank') {
    mkdirSync(target, { recursive: true })
    writeFileSync(
      join(target, 'index.php'),
      `<?php\n\necho '<h1>${name.replace(/[<>&'"]/g, '')} is running on PHP ' . PHP_VERSION . '</h1>';\n`
    )
  } else if (kind === 'wordpress') {
    await createWordPress(target, dbName)
  } else {
    await createLaravel(target, name, dbName, domain)
  }

  return target
}
