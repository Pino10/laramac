import { homedir } from 'os'
import { join } from 'path'
import type { SshConfigHost } from '../../shared/types'

/**
 * Reads the hosts out of ~/.ssh/config so they can be added with one click.
 * Hosts that need a jump host or a proxy command are left out, because Laramac connects directly.
 */
export function parseSshConfig(text: string, home = homedir()): { hosts: SshConfigHost[]; skipped: string[] } {
  const hosts: SshConfigHost[] = []
  const skipped: string[] = []
  let current: { aliases: string[]; host?: string; port?: number; user?: string; key?: string; proxy: boolean } | null = null
  const flush = (): void => {
    if (!current) return
    for (const alias of current.aliases) {
      if (/[*?!]/.test(alias)) continue
      if (current.proxy) {
        skipped.push(alias)
        continue
      }
      const host = current.host ?? alias
      if (!/^[A-Za-z0-9.-]{1,253}$|^\[?[0-9a-fA-F:]+\]?$/.test(host)) continue
      hosts.push({ alias, host, port: current.port ?? 22, user: current.user ?? '', keyPath: current.key })
    }
    current = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = /^([A-Za-z]+)\s*(?:=|\s)\s*(.+)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim().replace(/^"(.*)"$/, '$1')
    if (key === 'host') {
      flush()
      current = { aliases: value.split(/\s+/), proxy: false }
    } else if (key === 'match') {
      flush()
    } else if (current) {
      if (key === 'hostname') current.host = value
      else if (key === 'user') current.user = value
      else if (key === 'port') {
        const n = Number(value)
        if (Number.isInteger(n) && n > 0 && n < 65536) current.port = n
      } else if (key === 'identityfile') current.key = current.key ?? (value.startsWith('~') ? join(home, value.slice(1)) : value)
      else if (key === 'proxyjump' || key === 'proxycommand') current.proxy = true
    }
  }
  flush()
  return { hosts, skipped }
}
