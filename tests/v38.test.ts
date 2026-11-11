import { describe, expect, it } from 'vitest'
import { offerSwaps, swapQuestion } from '../src/renderer/src/components/swap'
import type { SwapChoice } from '../src/shared/types'

const my: SwapChoice = { id: 'mysql:8.4.8', name: 'MySQL', from: '8.4.6', to: '8.4.8', sameData: true }
const php: SwapChoice = { id: 'php:8.5', name: 'PHP', from: '8.4', to: '8.5', sameData: true }

describe('switching after an update', () => {
  it('says plainly what switching does and what stays', () => {
    const q = swapQuestion(my)
    expect(q.title).toBe('Use MySQL 8.4.8 now?')
    expect(q.label).toContain('same data')
    expect(q.cancel).toBe('Keep 8.4.6')
    expect(swapQuestion({ ...my, to: '9.0.1', sameData: false }).label).toContain('not deleted')
    expect(swapQuestion(php).label).toContain('choose their own PHP version keep it')
  })
  it('switches only what is accepted', async () => {
    const used: string[] = []
    const answers = ['yes', null]
    const n = await offerSwaps([my, php], async () => answers.shift() ?? null, async (id) => void used.push(id))
    expect(n).toBe(1)
    expect(used).toEqual(['mysql:8.4.8'])
  })
  it('asks nothing when nothing was installed next to the one in use', async () => {
    expect(await offerSwaps(undefined, async () => 'yes', async () => undefined)).toBe(0)
  })
})
