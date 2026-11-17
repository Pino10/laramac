import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ServerAuditEntry } from '../../shared/types'
import { dirs } from '../paths'
import { redact } from './redact'

/**
 * A plain record of what was done to each server from Laramac: uploads, deletes, zips, saved commands.
 * It stays on this Mac, never holds a password or key, and keeps the last two thousand lines.
 */
const file = (): string => join(dirs.root(), 'server-audit.jsonl')
const KEEP = 2000

export function record(server: string, action: string, detail: string): void {
  try {
    mkdirSync(dirs.root(), { recursive: true, mode: 0o700 })
    const entry: ServerAuditEntry = { at: Date.now(), server, action, detail: redact(detail).slice(0, 400) }
    appendFileSync(file(), JSON.stringify(entry) + '\n', { mode: 0o600 })
    chmodSync(file(), 0o600)
    if (Math.random() < 0.02) trim()
  } catch {
    /* a log that cannot be written must never stop the work */
  }
}

function trim(): void {
  const lines = readFileSync(file(), 'utf8').split('\n').filter(Boolean)
  if (lines.length > KEEP) writeFileSync(file(), lines.slice(-KEEP).join('\n') + '\n', { mode: 0o600 })
}

export function read(server: string, limit = 200): ServerAuditEntry[] {
  if (!existsSync(file())) return []
  const out: ServerAuditEntry[] = []
  for (const line of readFileSync(file(), 'utf8').split('\n')) {
    if (!line) continue
    try {
      const e = JSON.parse(line) as ServerAuditEntry
      if (e.server === server) out.push(e)
    } catch {
      /* skip a damaged line */
    }
  }
  return out.slice(-limit).reverse()
}
