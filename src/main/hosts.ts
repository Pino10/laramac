import { execFile } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Extra names for sites. Names under your Laramac suffix (.test) and .localhost
 * resolve on their own; anything else (shop.local, myapp.dev.internal) gets a
 * line in /etc/hosts, inside one block Laramac owns and rewrites as a whole.
 */
const START = '# >>> Laramac: site names (managed, edits here are replaced)'
const END = '# <<< Laramac'
const HOST = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{0,62}$/

export function cleanAlias(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('A site name must be text.')
  const name = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!HOST.test(name) || name.split('.').some((l) => l.startsWith('-') || l.endsWith('-'))) {
    throw new Error(`${raw} is not a valid host name. Use something like shop.local or api.shop.test.`)
  }
  if (name === 'localhost' || name.endsWith('.arpa')) throw new Error(`${name} cannot be used.`)
  return name
}

export const needsHostsEntry = (name: string, tld: string): boolean => !name.endsWith(`.${tld}`) && !name.endsWith('.localhost')

/** Replaces Laramac's block in a hosts file, leaving every other line alone. */
export function withHostsBlock(current: string, names: string[]): string {
  const lines = current.split('\n')
  const out: string[] = []
  let inside = false
  for (const l of lines) {
    if (l.trim() === START) inside = true
    else if (inside && l.trim() === END) inside = false
    else if (!inside) out.push(l)
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop()
  const unique = [...new Set(names)].sort()
  if (unique.length) {
    out.push('', START)
    // Both addresses, so macOS does not spend seconds asking Bonjour about .local names.
    for (const n of unique) out.push(`127.0.0.1 ${n}`, `::1 ${n}`)
    out.push(END)
  }
  return out.join('\n') + '\n'
}

/** Writes /etc/hosts when the block changed. macOS asks for your password. */
export function syncHostsFile(names: string[], file = '/etc/hosts'): Promise<boolean> {
  const current = readFileSync(file, 'utf8')
  const next = withHostsBlock(current, names)
  if (next === current) return Promise.resolve(false)
  const dir = mkdtempSync(join(tmpdir(), 'laramac-hosts-'))
  const tmp = join(dir, 'hosts')
  writeFileSync(tmp, next, { mode: 0o644 })
  const script = `do shell script "/bin/cat '${tmp}' > '${file}' && /usr/bin/dscacheutil -flushcache && /usr/bin/killall -HUP mDNSResponder" with administrator privileges with prompt "Laramac wants to add your site names to /etc/hosts."`
  return new Promise((resolve, reject) =>
    execFile('osascript', ['-e', script], (err) => {
      rmSync(dir, { recursive: true, force: true })
      if (err) reject(new Error(/User canceled/i.test(err.message) ? 'The site names were not added because the password prompt was cancelled.' : err.message))
      else resolve(true)
    })
  )
}
