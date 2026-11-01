import { createSocket } from 'dgram'
import { afterAll, describe, expect, it } from 'vitest'
import { DNS_PORT, buildDnsResponse, startDnsServer, stopDnsServer } from '../src/main/dns'

function query(name: string, type: number, id = 0x1234): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(id, 0)
  header.writeUInt16BE(0x0100, 2)
  header.writeUInt16BE(1, 4)
  const labels = name.split('.').map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)]))
  const tail = Buffer.alloc(4)
  tail.writeUInt16BE(type, 0)
  tail.writeUInt16BE(1, 2)
  return Buffer.concat([header, ...labels, Buffer.from([0]), tail])
}

describe('buildDnsResponse', () => {
  it('answers A queries for .test names with 127.0.0.1', () => {
    const res = buildDnsResponse(query('myblog.test', 1), 'test')!
    expect(res.readUInt16BE(0)).toBe(0x1234)
    expect(res.readUInt16BE(6)).toBe(1) // one answer
    expect(res.readUInt16BE(2) & 0xf).toBe(0) // NOERROR
    expect([...res.subarray(res.length - 4)]).toEqual([127, 0, 0, 1])
  })

  it('answers subdomains and is case-insensitive', () => {
    const res = buildDnsResponse(query('API.MyBlog.TEST', 1), 'test')!
    expect(res.readUInt16BE(6)).toBe(1)
  })

  it('returns no answer (not an error) for AAAA on our domains', () => {
    const res = buildDnsResponse(query('myblog.test', 28), 'test')!
    expect(res.readUInt16BE(6)).toBe(0)
    expect(res.readUInt16BE(2) & 0xf).toBe(0)
  })

  it('returns NXDOMAIN for other domains', () => {
    const res = buildDnsResponse(query('example.com', 1), 'test')!
    expect(res.readUInt16BE(2) & 0xf).toBe(3)
  })

  it('ignores junk', () => {
    expect(buildDnsResponse(Buffer.from([1, 2, 3]), 'test')).toBeNull()
  })
})

describe('DNS server', () => {
  afterAll(() => stopDnsServer())

  it('resolves over UDP', async () => {
    await startDnsServer(() => 'test')
    const client = createSocket('udp4')
    const reply = await new Promise<Buffer>((resolve, reject) => {
      client.once('message', resolve)
      client.once('error', reject)
      client.send(query('shop.test', 1, 0xbeef), DNS_PORT, '127.0.0.1')
      setTimeout(() => reject(new Error('timeout')), 3000)
    })
    client.close()
    expect(reply.readUInt16BE(0)).toBe(0xbeef)
    expect([...reply.subarray(reply.length - 4)]).toEqual([127, 0, 0, 1])
  })
})
