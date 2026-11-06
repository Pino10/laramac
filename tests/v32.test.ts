import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { setRoot } from '../src/main/paths'
import { openHealth } from '../src/main/ssh'
import { createRequire } from 'module'
import { CODE_LOOKS, isCodeLook, lookCss, LOOK_BACKGROUND, LOOK_LAYOUT } from '../src/main/idelooks'
import { accentBuild, themeJson } from '../src/main/idetheme'
import { workbenchCss } from '../src/main/idecore'
import { sanitizeSettingsPatch } from '../src/main/validate'

const crypto = { available: () => false, encrypt: (s: string) => s, decrypt: (s: string) => s }

describe('Health on servers saved by older versions', () => {
  it('treats a missing protocol as SSH instead of refusing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lm-'))
    mkdirSync(root, { recursive: true })
    setRoot(root)
    // No "protocol" key, like a record written before FTP support.
    writeFileSync(join(root, 'servers.json'), JSON.stringify([{ id: 'old', name: 'Old', host: 'localhost', port: 1, user: 'me', auth: 'agent' }]))
    // It must get past the protocol check; any error now is about connecting, not about the protocol.
    await expect(openHealth('old', null, crypto)).rejects.not.toThrow(/needs a server you connect to with SSH/)
  })

  it('still refuses FTP servers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lm-'))
    setRoot(root)
    writeFileSync(join(root, 'servers.json'), JSON.stringify([{ id: 'f', name: 'F', host: 'localhost', port: 21, user: 'me', auth: 'password', protocol: 'ftp' }]))
    await expect(openHealth('f', null, crypto)).rejects.toThrow(/SSH/)
  })
})


const req = createRequire(import.meta.url)
const lib = req('../code-app/lib.js') as {
  readLaunch: (text: string, exists?: () => boolean) => { appearance: string; theme: number; update: { version: string; current: string } | null } | null
  bannerScript: (u: { version: string; current: string } | null) => string
  UPDATE_MARK: string
}

describe('Laramac Code looks', () => {
  it('has ten different looks, each with its own styles and window colour', () => {
    expect(CODE_LOOKS.map((l) => l.id)).toEqual(['studio', 'classic', 'zen', 'notepad', 'ember', 'aurora', 'orbit', 'sunset', 'terminal', 'mono'])
    const css = CODE_LOOKS.map((l) => lookCss(l.id))
    expect(new Set(css).size).toBe(10)
    for (const l of CODE_LOOKS) {
      expect(isCodeLook(l.id)).toBe(true)
      expect(LOOK_BACKGROUND[l.id].dark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(LOOK_BACKGROUND[l.id].light).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(isCodeLook('neon')).toBe(false)
  })

  it('puts the chosen look into the workbench CSS, Aurora by default', () => {
    expect(workbenchCss({ uiFont: 'poppins', look: 'mono' })).toContain(lookCss('mono'))
    expect(workbenchCss({ uiFont: 'poppins' })).toContain(lookCss('aurora'))
    expect(workbenchCss({ uiFont: 'poppins', look: 'zen' })).not.toContain(lookCss('mono'))
  })

  it('gives every look its own colours, in dark and light', () => {
    for (const kind of ['dark', 'light'] as const) {
      const bgs = CODE_LOOKS.map((l) => (themeJson(kind, 'blue', l.id) as { colors: Record<string, string> }).colors['editor.background'])
      expect(new Set(bgs).size).toBeGreaterThanOrEqual(kind === 'dark' ? 8 : 5)
    }
    const terminal = themeJson('dark', 'violet', 'terminal') as { colors: Record<string, string> }
    expect(terminal.colors['activityBar.foreground']).toBe('#39ff88')
    const aurora = themeJson('dark', 'violet', 'aurora') as { colors: Record<string, string> }
    expect(aurora.colors['activityBar.foreground']).toBe('#b9a4ff')
    const builds = new Set(CODE_LOOKS.map((l) => accentBuild('teal', l.id)))
    expect(builds.size).toBe(10)
  })

  it('arranges the editor differently in every look', () => {
    const where = CODE_LOOKS.map((l) => `${LOOK_LAYOUT[l.id]['workbench.activityBar.location']}/${LOOK_LAYOUT[l.id]['workbench.sideBar.location']}/${LOOK_LAYOUT[l.id]['editor.minimap.enabled']}/${LOOK_LAYOUT[l.id]['editor.cursorStyle']}`)
    expect(new Set(where).size).toBeGreaterThanOrEqual(6)
    expect(LOOK_LAYOUT.zen['workbench.activityBar.location']).toBe('hidden')
    expect(LOOK_LAYOUT.terminal['workbench.sideBar.location']).toBe('right')
    expect(LOOK_LAYOUT.classic['editor.minimap.enabled']).toBe(true)
    for (const l of CODE_LOOKS) expect(Object.keys(LOOK_LAYOUT[l.id]).sort()).toEqual(Object.keys(LOOK_LAYOUT.studio).sort())
  })

  it('mono really has no colour', () => {
    for (const kind of ['dark', 'light'] as const) {
      const theme = themeJson(kind, 'rose', 'mono') as { colors: Record<string, string>; tokenColors: { settings: { foreground?: string } }[] }
      const grey = (hex: string): boolean => /^#([0-9a-f]{2})\1\1([0-9a-f]{2})?$/i.test(hex)
      for (const k of ['editor.background', 'editor.foreground', 'activityBar.foreground', 'statusBar.background', 'button.background']) expect(grey(theme.colors[k])).toBe(true)
      for (const t of theme.tokenColors) if (t.settings.foreground) expect(grey(t.settings.foreground)).toBe(true)
    }
  })

  it('only accepts known modes from the window', () => {
    expect(sanitizeSettingsPatch({ codeAppearance: 'light' })).toEqual({ codeAppearance: 'light' })
    expect(() => sanitizeSettingsPatch({ codeAppearance: 'purple' })).toThrow()
  })

  it('only accepts known looks from the window', () => {
    expect(sanitizeSettingsPatch({ codeLook: 'zen' })).toEqual({ codeLook: 'zen' })
    expect(() => sanitizeSettingsPatch({ codeLook: 'url(javascript:1)' })).toThrow()
  })
})

describe('Update notice inside Laramac Code', () => {
  it('reads the mode and theme build, with safe fallbacks', () => {
    const l = lib.readLaunch(JSON.stringify({ bin: '/bin/sh', args: [], appearance: 'light', theme: 104 }), () => true)
    expect(l).toMatchObject({ appearance: 'light', theme: 104 })
    expect(lib.readLaunch(JSON.stringify({ bin: '/bin/sh', args: [], appearance: 'x' }), () => true)).toMatchObject({ appearance: 'system', theme: 0 })
  })

  const launch = (update: unknown): string => JSON.stringify({ bin: '/bin/sh', args: [], update })

  it('reads a valid update and ignores anything else', () => {
    expect(lib.readLaunch(launch({ version: '0.33.0', current: '0.32.0' }), () => true)?.update).toEqual({ version: '0.33.0', current: '0.32.0' })
    expect(lib.readLaunch(launch(null), () => true)?.update).toBeNull()
    expect(lib.readLaunch(launch({ version: '<script>', current: '0.32.0' }), () => true)?.update).toBeNull()
    expect(lib.readLaunch(launch({ version: "1.0.0'+alert(1)+'", current: '0.32.0' }), () => true)?.update).toBeNull()
  })

  it('builds a banner script that carries only the version', () => {
    const js = lib.bannerScript({ version: '0.33.0', current: '0.32.0' })
    expect(js).toContain('"0.33.0"')
    expect(js).toContain(lib.UPDATE_MARK)
    expect(js).not.toContain('innerHTML')
    expect(lib.bannerScript(null)).toContain('remove()')
  })
})

describe('Laramac Code window', () => {
  const lib2 = req('../code-app/lib.js') as { fontFaceCss: (f: { family: string; weight: number; data: string }[]) => string }
  it('builds a real @font-face from the font bytes, and nothing without fonts', () => {
    const css = lib2.fontFaceCss([{ family: 'Laramac Poppins', weight: 400, data: 'AAAA' }])
    expect(css).toContain('@font-face')
    expect(css).toContain('font-family:"Laramac Poppins"')
    expect(css).toContain('--vscode-font-family')
    expect(lib2.fontFaceCss([])).toBe('')
  })
  it('closes at once and relaxes only the font rule of the editor page', () => {
    const main = readFileSync(join(__dirname, '..', 'code-app', 'main.js'), 'utf8')
    expect(main).toContain("'will-prevent-unload'")
    expect(main).toContain('font-src')
    expect(main).toContain('ours(details.url)')
  })
})
