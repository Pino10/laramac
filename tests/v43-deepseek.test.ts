import { describe, expect, it } from 'vitest'
import { freshEnv } from './helpers'

const fakeCrypto = { available: () => true, encrypt: (s: string) => `enc:${Buffer.from(s).toString('base64')}`, decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString() }

describe('DeepSeek for Claude Code', () => {
  it('sends Claude Code to DeepSeek with the saved key, which never reaches the list', async () => {
    freshEnv()
    const m = await import('../src/main/models')
    const { setSettings } = await import('../src/main/settings')
    const { localModelEnv, anthropicBase } = await import('../src/main/seckit/reviewers')
    m.setModelCrypto(fakeCrypto)
    const list = m.saveServer({ name: 'DeepSeek for Claude Code', baseUrl: 'https://api.deepseek.com/anthropic', api: 'anthropic', key: 'sk-test-123456' })
    expect(list[0].hasKey).toBe(true)
    expect(JSON.stringify(list)).not.toContain('sk-test')
    setSettings({ llm: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro' } })
    const c = m.chosenLocal()
    expect(c.token).toBe('sk-test-123456')
    expect(anthropicBase(c.baseUrl)).toBe('https://api.deepseek.com/anthropic')
    const env = localModelEnv(c)
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-123456')
    expect(env.ANTHROPIC_MODEL).toBe('deepseek-v4-pro')
  })
  it('a local model has no key', async () => {
    freshEnv()
    const m = await import('../src/main/models')
    const { setSettings } = await import('../src/main/settings')
    setSettings({ llm: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'x' } })
    expect(m.chosenLocal().token).toBeUndefined()
  })
})
