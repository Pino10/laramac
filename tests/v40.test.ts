import { describe, expect, it } from 'vitest'
import { IDE_EXTENSIONS, extensionsFor, ideSettings } from '../src/main/idecore'
import { TOUR } from '../src/renderer/src/components/Tour'
import { SKILLS } from '../src/main/seckit/skills'

describe('Laramac Code: a lighter start', () => {
  it('a new install gets the core set, not every language', () => {
    const ids = extensionsFor([])
    expect(ids).toContain('bmewburn.vscode-intelephense-client')
    expect(ids).toContain('anthropic.claude-code')
    expect(ids).not.toContain('golang.go')
    expect(ids).not.toContain('ms-python.python')
    expect(ids.length).toBeLessThan(IDE_EXTENSIONS.length)
  })
  it('a language’s extensions come when you have a project in it', () => {
    expect(extensionsFor(['python'])).toEqual(expect.arrayContaining(['ms-python.python', 'detachhead.basedpyright', 'charliermarsh.ruff']))
    expect(extensionsFor(['go', 'rust'])).toEqual(expect.arrayContaining(['golang.go', 'rust-lang.rust-analyzer']))
  })
  it('extras are never installed on their own', () => {
    const extras = IDE_EXTENSIONS.filter((e) => e.group === 'extra').map((e) => e.id)
    expect(extras.length).toBeGreaterThan(0)
    for (const id of extras) expect(extensionsFor(['python', 'go', 'rust', 'node', 'laravel'])).not.toContain(id)
  })
  it('every extension has a group', () => {
    for (const e of IDE_EXTENSIONS) expect(['core', 'python', 'go', 'rust', 'extra']).toContain(e.group)
  })
  it('a project’s own code only runs in a folder you trust', () => {
    const s = ideSettings({ font: 'system', fontSize: 14, appearance: 'auto' } as never)
    expect(s.managed['security.workspace.trust.enabled']).toBe(true)
    expect(s.managed['security.workspace.trust.startupPrompt']).toBe('once')
  })
})

describe('first run', () => {
  it('the tour is five stops, and none of them is a wall of text', () => {
    expect(TOUR).toHaveLength(5)
    for (const s of TOUR) expect(s.body.length).toBeLessThan(200)
  })
})

describe('skills', () => {
  it('there are 43', () => {
    expect(Object.keys(SKILLS)).toHaveLength(43)
  })
})
