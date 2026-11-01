import { existsSync } from 'fs'
import { release } from 'os'
import { delimiter, join } from 'path'

export const isMac = process.platform === 'darwin'

/** Architecture names used by each upstream project. */
export function phpArch(): 'aarch64' | 'x86_64' {
  return process.arch === 'arm64' ? 'aarch64' : 'x86_64'
}

export function goArch(): 'arm64' | 'amd64' {
  return process.arch === 'arm64' ? 'arm64' : 'amd64'
}

export function mysqlArch(): 'arm64' | 'x86_64' {
  return process.arch === 'arm64' ? 'arm64' : 'x86_64'
}

/** macOS major version derived from the Darwin kernel version (Darwin 24 is macOS 15). */
export function macMajor(): number {
  const darwin = parseInt(release().split('.')[0], 10)
  if (Number.isNaN(darwin)) return 15
  return darwin >= 25 ? darwin + 1 : darwin - 9
}

const EXTRA_BIN_DIRS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin'
]

export function findOnPath(name: string, extraDirs: string[] = []): string | null {
  const dirs = [...extraDirs, ...(process.env.PATH ?? '').split(delimiter), ...EXTRA_BIN_DIRS]
  for (const dir of dirs) {
    if (!dir) continue
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Homebrew installs formulas under one of these prefixes depending on CPU. */
export function brewPrefix(): string | null {
  for (const p of ['/opt/homebrew', '/usr/local']) {
    if (existsSync(join(p, 'bin', 'brew'))) return p
  }
  return null
}
