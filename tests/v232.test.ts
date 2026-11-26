import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sanitizeSettingsPatch } from '../src/main/validate'
import { readFileSync as rf } from 'node:fs'

describe('Graphite and Spectrum looks', () => {
  it('is accepted and is the default for new installs', () => {
    expect(sanitizeSettingsPatch({ glassStyle: 'graphite' })).toEqual({ glassStyle: 'graphite' })
    expect(sanitizeSettingsPatch({ glassStyle: 'spectrum' })).toEqual({ glassStyle: 'spectrum' })
    expect(rf('src/main/settings.ts', 'utf8')).toContain("glassStyle: 'spectrum'")
    expect(() => sanitizeSettingsPatch({ glassStyle: 'midnight' })).toThrow()
  })
  it('has a stylesheet that only applies to the Graphite look', () => {
    const css = readFileSync('src/renderer/src/design.css', 'utf8')
    const rules = css.split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('/*') && !s.startsWith('.gp-'))
    for (const sel of rules) for (const part of sel.split(',')) expect(/^html(:root)?\[data-glass='(graphite|spectrum)'\]/.test(part.trim())).toBe(true)
  })
})
