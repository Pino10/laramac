import { existsSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { runRecon } from '../src/main/seckit/recon'

// A real Next.js dev site behind Laramac's nginx config at http://myapp.test (see MAINTAINING.md).
const run = existsSync('/tmp/lm/myapp/package.json') ? describe : describe.skip

run('recon of a real Next.js site', () => {
  it('finds the host, its technology, scripts, source maps and endpoints', async () => {
    const steps: string[] = []
    const lines: string[] = []
    const r = await runRecon('myapp.test', {
      depth: 'standard',
      step: (id, _l, status, detail) => status !== 'running' && steps.push(`${id}: ${status} ${detail ?? ''}`),
      line: (t) => lines.push(t),
      cancelled: () => false,
      tool: () => null,
      run: async () => ''
    })
    console.log(steps.join('\n'))
    console.log(r.js.map((j) => `${j.url} ${j.bytes} map=${j.sourceMap?.files ?? 0}`).slice(0, 8).join('\n'))
    const host = r.hosts.find((h) => h.host === 'myapp.test')!
    expect(host.ips).toContain('127.0.0.1')
    expect(host.live?.status).toBe(200)
    expect(host.live?.tech).toEqual(expect.arrayContaining(['Next.js']))
    expect(r.js.length).toBeGreaterThan(2)
    expect(r.js.some((j) => j.sourceMap)).toBe(true)
    expect(r.findings.some((f) => f.kind === 'sourcemap')).toBe(true)
    expect(steps.find((s) => s.startsWith('crawl'))).toMatch(/done/)
  }, 300_000)
})
