import http from 'http'
import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'
import { detectLlms, explainLlmError, isChatModel, orderModels, testLlm } from '../src/main/integrations'

function fakeServer(port: number, routes: Record<string, (body: string) => [number, unknown]>): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const route = routes[`${req.method} ${req.url}`]
        const [status, json] = route ? route(body) : [404, { error: 'not found' }]
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(json))
      })
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

describe('local model servers', () => {
  it('tells chat models from embedding models', () => {
    expect(isChatModel('text-embedding-nomic-embed-text-v1.5')).toBe(false)
    expect(isChatModel('qwen3-8b')).toBe(true)
    expect(isChatModel('anything', 'embeddings')).toBe(false)
    expect(isChatModel('anything', 'vlm')).toBe(true)
    expect(orderModels(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b'])
  })

  it('finds LM Studio with only its chat models, loaded first, and explains a 400', async () => {
    freshEnv()
    const lm = await fakeServer(1234, {
      'GET /api/v0/models': () => [
        200,
        {
          data: [
            { id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings', state: 'loaded' },
            { id: 'google/gemma-3-12b', type: 'vlm', state: 'not-loaded' },
            { id: 'qwen/qwen3-8b', type: 'llm', state: 'loaded' }
          ]
        }
      ],
      'POST /v1/chat/completions': (body) => {
        const { model } = JSON.parse(body) as { model: string }
        if (model.includes('embed')) return [400, { error: `"${model}" is not a llm. Please use a different model.` }]
        return [200, { choices: [{ message: { content: 'ready' } }] }]
      }
    })
    try {
      const found = await detectLlms()
      const studio = found.find((f) => f.provider === 'LM Studio')!
      expect(studio).toMatchObject({ toolId: 'lmstudio', models: ['qwen/qwen3-8b', 'google/gemma-3-12b'], loaded: ['qwen/qwen3-8b'] })

      const good = await testLlm(studio.baseUrl, 'qwen/qwen3-8b')
      expect(good).toMatchObject({ ok: true, reply: 'ready' })

      const bad = await testLlm(studio.baseUrl, 'text-embedding-nomic-embed-text-v1.5')
      expect(bad.ok).toBe(false)
      expect(bad.error).toContain('is an embedding model and cannot chat')
      expect(bad.error).toContain('The server said:')
    } finally {
      lm.close()
    }
  })

  it('says plainly when nothing is listening', async () => {
    const r = await testLlm('http://127.0.0.1:1', 'x')
    expect(r).toMatchObject({ ok: false })
    expect(r.error).toContain('Is the server on?')
  })

  it('turns common server errors into next steps', () => {
    expect(explainLlmError(400, '{"error":{"message":"Trying to keep the first 9000 tokens when context the overflows. n_ctx: 4096"}}', 'qwen')).toContain('larger context length')
    expect(explainLlmError(404, '{"error":"model \\"llama9\\" not found"}', 'llama9')).toContain('llama9 is not loaded')
    expect(explainLlmError(500, '', 'm')).toBe('The model server answered 500.')
  })
})
