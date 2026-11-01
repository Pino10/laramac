import { createSocket, type Socket } from 'dgram'
import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { ALLOWED_TLDS } from './validate'

/** Port the built-in DNS server listens on. 5353 is taken by macOS mDNS, so we avoid it. */
export const DNS_PORT = 53535

/**
 * Builds a DNS reply that resolves every `*.tld` name to 127.0.0.1.
 * Returns null when the packet is not a query we understand.
 */
export function buildDnsResponse(query: Buffer, tld: string, ip = '127.0.0.1'): Buffer | null {
  if (query.length < 12) return null
  const flags = query.readUInt16BE(2)
  const isQuery = (flags & 0x8000) === 0
  const qdcount = query.readUInt16BE(4)
  if (!isQuery || qdcount < 1) return null

  // Read the first question: labels, then type and class.
  let offset = 12
  const labels: string[] = []
  while (offset < query.length) {
    const len = query[offset]
    if (len === 0) {
      offset += 1
      break
    }
    if (len > 63 || offset + 1 + len > query.length) return null
    labels.push(query.subarray(offset + 1, offset + 1 + len).toString('ascii').toLowerCase())
    offset += 1 + len
  }
  if (offset + 4 > query.length) return null
  const qtype = query.readUInt16BE(offset)
  const questionEnd = offset + 4

  const name = labels.join('.')
  const suffix = tld.toLowerCase()
  const ours = name === suffix || name.endsWith(`.${suffix}`)

  const header = Buffer.alloc(12)
  query.copy(header, 0, 0, 2) // transaction id
  const recursionDesired = flags & 0x0100
  const answers = ours && qtype === 1 ? 1 : 0
  const rcode = ours ? 0 : 3
  header.writeUInt16BE(0x8000 | 0x0400 | recursionDesired | 0x0080 | rcode, 2)
  header.writeUInt16BE(1, 4) // qdcount
  header.writeUInt16BE(answers, 6)
  header.writeUInt16BE(0, 8)
  header.writeUInt16BE(0, 10)

  const question = query.subarray(12, questionEnd)
  if (!answers) return Buffer.concat([header, question])

  const answer = Buffer.alloc(16)
  answer.writeUInt16BE(0xc00c, 0) // pointer to the name in the question
  answer.writeUInt16BE(1, 2) // type A
  answer.writeUInt16BE(1, 4) // class IN
  answer.writeUInt32BE(60, 6) // ttl
  answer.writeUInt16BE(4, 10) // rdlength
  ip.split('.').forEach((part, i) => answer.writeUInt8(parseInt(part, 10), 12 + i))
  return Buffer.concat([header, question, answer])
}

let socket: Socket | null = null

export function startDnsServer(getTld: () => string): Promise<void> {
  if (socket) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = createSocket('udp4')
    s.on('message', (msg, rinfo) => {
      const reply = buildDnsResponse(msg, getTld())
      if (reply) s.send(reply, rinfo.port, rinfo.address)
    })
    s.once('error', (err) => {
      socket = null
      reject(err)
    })
    s.bind(DNS_PORT, '127.0.0.1', () => {
      socket = s
      resolve()
    })
  })
}

export function stopDnsServer(): void {
  socket?.close()
  socket = null
}

export function resolverFile(tld: string): string {
  return `/etc/resolver/${tld}`
}

export function resolverContents(): string {
  return `nameserver 127.0.0.1\nport ${DNS_PORT}\n`
}

export function isResolverInstalled(tld: string): boolean {
  try {
    return existsSync(resolverFile(tld)) && readFileSync(resolverFile(tld), 'utf8').includes(`port ${DNS_PORT}`)
  } catch {
    return false
  }
}

/** Runs a shell command as administrator using the standard macOS password prompt. */
export function runAsAdmin(shellCommand: string, prompt: string): Promise<void> {
  const escaped = shellCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `do shell script "${escaped}" with prompt "${prompt}" with administrator privileges`
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, _out, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message))
      else resolve()
    })
  })
}

/** Creates /etc/resolver/<tld> so macOS sends *.tld lookups to our DNS server. One-time, needs a password. */
export function installResolver(tld: string): Promise<void> {
  // This runs as administrator, so the suffix is checked again here, not only in settings.
  if (!(ALLOWED_TLDS as readonly string[]).includes(tld)) {
    return Promise.reject(new Error('That domain suffix is not allowed.'))
  }
  const cmd = `mkdir -p /etc/resolver && printf 'nameserver 127.0.0.1\\nport ${DNS_PORT}\\n' > ${resolverFile(tld)}`
  return runAsAdmin(cmd, 'Laramac needs to set up .' + tld + ' domains on this Mac.')
}
