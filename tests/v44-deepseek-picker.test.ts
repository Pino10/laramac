import { describe, expect, it } from 'vitest'
import { reviewerOptions } from '../src/main/review'

const servers = [
  { baseUrl: 'https://api.deepseek.com/anthropic', api: 'anthropic', hasKey: true },
  { baseUrl: 'https://api.deepseek.com', api: 'openai', hasKey: true }
]

describe('DeepSeek in the reviewer lists', () => {
  it('offers DeepSeek once its server and key are saved, with the server and model chosen by the click', () => {
    const list = reviewerOptions('', false, servers, '')
    const claude = list.find((r) => r.name === 'Claude Code on DeepSeek')
    const api = list.find((r) => r.name === 'DeepSeek (API)')
    expect(claude).toMatchObject({ id: 'claude-local', llm: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro' } })
    expect(api).toMatchObject({ id: 'model', installed: true, llm: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' } })
  })
  it('does not offer it without a key', () => {
    const list = reviewerOptions('', false, servers.map((s) => ({ ...s, hasKey: false })), '')
    expect(list.some((r) => /DeepSeek/.test(r.name))).toBe(false)
  })
  it('keeps the chosen DeepSeek model and replaces the two generic choices while it is in use', () => {
    const list = reviewerOptions('deepseek-v4-flash', false, servers, 'https://api.deepseek.com/anthropic')
    expect(list.filter((r) => r.id === 'claude-local')).toHaveLength(1)
    expect(list.find((r) => r.name === 'Claude Code on DeepSeek')?.llm?.model).toBe('deepseek-v4-flash')
    expect(list.find((r) => r.name === 'DeepSeek (API)')?.llm?.model).toBe('deepseek-v4-pro')
    expect(list.some((r) => r.name === 'deepseek-v4-flash directly')).toBe(false)
  })
  it('leaves the generic choices when another model is in use', () => {
    const list = reviewerOptions('qwen3', false, servers, 'http://127.0.0.1:1234/v1')
    expect(list.some((r) => r.name === 'qwen3 directly')).toBe(true)
  })
})
