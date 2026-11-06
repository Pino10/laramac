/**
 * Laramac Studio, the colour theme of Laramac Code: the app's dark and light looks, with syntax
 * colours in the spirit of Xcode's (pink keywords, warm strings, cyan types) so PHP, Blade, JS
 * and CSS read calmly for hours. The accent follows the colour chosen in Laramac.
 */

import type { CodeLook } from './idelooks'

export type Accent = 'blue' | 'violet' | 'teal' | 'amber' | 'rose'

export const ACCENTS: Record<Accent, { dark: string; light: string; name: string }> = {
  blue: { dark: '#8ab4f8', light: '#1a73e8', name: 'Blue' },
  violet: { dark: '#b9a4ff', light: '#6e4ee6', name: 'Violet' },
  teal: { dark: '#5eead4', light: '#0d9488', name: 'Teal' },
  amber: { dark: '#fcc96b', light: '#c26a00', name: 'Amber' },
  rose: { dark: '#ff8fb1', light: '#d6336c', name: 'Rose' }
}

export const isAccent = (v: unknown): v is Accent => typeof v === 'string' && v in ACCENTS

interface Palette {
  bg: string
  bg2: string
  bg3: string
  line: string
  fg: string
  fg2: string
  fg3: string
  sel: string
  keyword: string
  string: string
  number: string
  type: string
  func: string
  variable: string
  property: string
  comment: string
  tag: string
  attr: string
  constant: string
  regex: string
  error: string
  warn: string
  ok: string
  /** The base the islands sit on: title bar, status bar and the gaps between parts. */
  base: string
}

const DARK: Palette = {
  bg: '#0f131c',
  bg2: '#0b0e15',
  base: '#07090d',
  bg3: '#161b27',
  line: '#ffffff12',
  fg: '#e6e9f2',
  fg2: '#aab3c5',
  fg3: '#6b7690',
  sel: '#8ab4f833',
  keyword: '#ff7ab2',
  string: '#ff8170',
  number: '#d9c97c',
  type: '#5dd8ff',
  func: '#67b7a4',
  variable: '#e6e9f2',
  property: '#a1d9ff',
  comment: '#7f8ca3',
  tag: '#ff7ab2',
  attr: '#d0a8ff',
  constant: '#d9c97c',
  regex: '#ff8170',
  error: '#f28b82',
  warn: '#fdd663',
  ok: '#81c995'
}

const LIGHT: Palette = {
  bg: '#ffffff',
  bg2: '#f5f7fb',
  base: '#e8ecf3',
  bg3: '#eef1f7',
  line: '#0f172a14',
  fg: '#1d2433',
  fg2: '#4b5568',
  fg3: '#8a94a8',
  sel: '#1a73e826',
  keyword: '#ad3da4',
  string: '#d12f1b',
  number: '#272ad8',
  type: '#0b4f79',
  func: '#326d74',
  variable: '#1d2433',
  property: '#3e6d9a',
  comment: '#707f8c',
  tag: '#ad3da4',
  attr: '#804fb8',
  constant: '#272ad8',
  regex: '#d12f1b',
  error: '#d93025',
  warn: '#b06000',
  ok: '#188038'
}

/**
 * Each look has its own colours, so the looks are different at a glance and not only in layout.
 * Sunset and Terminal also bring their own accent; the others use the accent chosen in Laramac.
 */
const LOOK_COLORS: Record<CodeLook, { dark: Partial<Palette>; light: Partial<Palette>; accent?: { dark: string; light: string } }> = {
  aurora: { dark: { bg: '#0e1220', bg2: '#0a0d18', base: '#070913', bg3: '#171c30' }, light: { base: '#e6eaf6', bg2: '#f3f5fc' } },
  paper: {
    dark: { bg: '#181613', bg2: '#141210', base: '#181613', bg3: '#221f1b', fg: '#ece6dc', fg2: '#b5ab9c', fg3: '#7a7164', line: '#ffffff0f' },
    light: { bg: '#fbf8f2', bg2: '#f4efe6', base: '#fbf8f2', bg3: '#efe9de', fg: '#2b2620', fg2: '#5c5348', fg3: '#9a8f80' }
  },
  carbon: { dark: { bg: '#0b0c0e', bg2: '#08090b', base: '#030304', bg3: '#14161a', line: '#ffffff1a' }, light: { bg: '#f4f5f7', base: '#d9dce2', bg2: '#eceef2', line: '#0f172a24' } },
  sunset: {
    dark: { bg: '#1a1118', bg2: '#140c13', base: '#0d070c', bg3: '#27181f', keyword: '#ff8fb1', string: '#ffb86b', number: '#ffd37a', type: '#ff9a8b', func: '#ffc9a0', property: '#ffa6c9', attr: '#ffcf8a' },
    light: { bg: '#fff8f4', bg2: '#fdeee6', base: '#f6e3da', bg3: '#fbece4', keyword: '#c2255c', string: '#b35400', number: '#a8470d', type: '#a8321f' },
    accent: { dark: '#ff9a62', light: '#d9531e' }
  },
  terminal: {
    dark: { bg: '#050a07', bg2: '#030604', base: '#010302', bg3: '#0b150f', fg: '#c9f5d3', fg2: '#7fb892', fg3: '#4a7a5a', line: '#39ff8822', keyword: '#5af78e', string: '#f3f99d', number: '#ff9f6b', type: '#57c7ff', func: '#9aedfe', property: '#b4f9f8', comment: '#4f7a5f', tag: '#5af78e', attr: '#ff6ac1', constant: '#ff9f6b', variable: '#c9f5d3' },
    light: { bg: '#f3faf5', bg2: '#e8f4ec', base: '#d5e8da', bg3: '#e3f1e7', fg: '#12301c', fg2: '#2f5a3c', fg3: '#6b9179', keyword: '#0a7a3a', string: '#8a6d00', type: '#0b5f8a' },
    accent: { dark: '#39ff88', light: '#0a8f4a' }
  }
}

/** A VS Code colour theme (the JSON inside a theme extension). */
export function themeJson(kind: 'dark' | 'light', accent: Accent, look: CodeLook = 'aurora'): Record<string, unknown> {
  const lc = LOOK_COLORS[look]
  const p: Palette = { ...(kind === 'dark' ? DARK : LIGHT), ...lc[kind] }
  const a = lc.accent?.[kind] ?? ACCENTS[accent][kind]
  const onAccent = kind === 'dark' ? '#0b1020' : '#ffffff'
  return {
    name: `Laramac Studio ${kind === 'dark' ? 'Dark' : 'Light'}`,
    type: kind,
    semanticHighlighting: true,
    colors: {
      foreground: p.fg,
      focusBorder: `${a}99`,
      'selection.background': p.sel,
      'widget.shadow': kind === 'dark' ? '#00000066' : '#0f172a1f',
      'editor.background': p.bg,
      'editor.foreground': p.fg,
      'editor.lineHighlightBackground': kind === 'dark' ? '#ffffff08' : '#0f172a06',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': p.sel,
      'editor.inactiveSelectionBackground': `${a}1a`,
      'editor.wordHighlightBackground': `${a}22`,
      'editor.findMatchBackground': `${a}55`,
      'editor.findMatchHighlightBackground': `${a}26`,
      'editorCursor.foreground': a,
      'editorLineNumber.foreground': p.fg3,
      'editorLineNumber.activeForeground': p.fg,
      'editorIndentGuide.background1': p.line,
      'editorIndentGuide.activeBackground1': `${a}55`,
      'editorBracketMatch.background': `${a}22`,
      'editorBracketMatch.border': `${a}88`,
      'editorWhitespace.foreground': p.line,
      'editorGutter.background': p.bg,
      'editorError.foreground': p.error,
      'editorWarning.foreground': p.warn,
      'editorGroupHeader.tabsBackground': p.bg,
      'editorGroup.border': p.line,
      'editorWidget.background': p.bg3,
      'editorWidget.border': p.line,
      'editorSuggestWidget.background': p.bg3,
      'editorSuggestWidget.selectedBackground': `${a}2e`,
      'editorHoverWidget.background': p.bg3,
      'tab.activeBackground': p.bg,
      'tab.activeForeground': p.fg,
      'tab.inactiveBackground': p.bg,
      'tab.inactiveForeground': p.fg2,
      'tab.border': p.bg,
      'tab.activeBorderTop': a,
      'sideBar.background': p.bg,
      'sideBar.foreground': p.fg2,
      'sideBar.border': '#00000000',
      'sideBarTitle.foreground': p.fg,
      'sideBarSectionHeader.background': p.bg,
      'activityBar.background': p.bg,
      'activityBar.foreground': a,
      'activityBar.inactiveForeground': p.fg3,
      'activityBar.border': '#00000000',
      'activityBarBadge.background': a,
      'activityBarBadge.foreground': onAccent,
      'titleBar.activeBackground': p.base,
      'titleBar.activeForeground': p.fg2,
      'titleBar.inactiveBackground': p.base,
      'titleBar.border': '#00000000',
      'statusBar.background': p.base,
      'statusBar.foreground': p.fg2,
      'statusBar.border': '#00000000',
      'statusBar.debuggingBackground': a,
      'statusBar.debuggingForeground': onAccent,
      'statusBarItem.remoteBackground': a,
      'statusBarItem.remoteForeground': onAccent,
      'panel.background': p.bg,
      'panel.border': '#00000000',
      'panelTitle.activeBorder': a,
      'terminal.background': p.bg,
      'terminal.foreground': p.fg,
      'terminalCursor.foreground': a,
      'terminal.ansiBlue': kind === 'dark' ? '#8ab4f8' : '#1a73e8',
      'terminal.ansiCyan': p.type,
      'terminal.ansiGreen': p.ok,
      'terminal.ansiMagenta': p.keyword,
      'terminal.ansiRed': p.error,
      'terminal.ansiYellow': p.warn,
      'list.activeSelectionBackground': `${a}2e`,
      'list.activeSelectionForeground': p.fg,
      'list.inactiveSelectionBackground': `${a}1a`,
      'list.hoverBackground': kind === 'dark' ? '#ffffff0a' : '#0f172a08',
      'list.highlightForeground': a,
      'button.background': a,
      'button.foreground': onAccent,
      'button.hoverBackground': `${a}dd`,
      'badge.background': a,
      'badge.foreground': onAccent,
      'progressBar.background': a,
      'input.background': p.bg3,
      'input.border': p.line,
      'inputOption.activeBorder': a,
      'dropdown.background': p.bg3,
      'quickInput.background': p.bg3,
      'textLink.foreground': a,
      'textLink.activeForeground': a,
      'scrollbarSlider.background': kind === 'dark' ? '#ffffff14' : '#0f172a14',
      'scrollbarSlider.hoverBackground': kind === 'dark' ? '#ffffff22' : '#0f172a22',
      'gitDecoration.modifiedResourceForeground': p.warn,
      'gitDecoration.untrackedResourceForeground': p.ok,
      'gitDecoration.deletedResourceForeground': p.error,
      'debugToolBar.background': p.bg3
    },
    tokenColors: [
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: p.comment, fontStyle: 'italic' } },
      { scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new', 'keyword.other.use', 'keyword.other.namespace'], settings: { foreground: p.keyword } },
      { scope: ['keyword.operator'], settings: { foreground: p.fg2 } },
      { scope: ['string', 'string.quoted', 'punctuation.definition.string'], settings: { foreground: p.string } },
      { scope: ['constant.numeric'], settings: { foreground: p.number } },
      { scope: ['constant.language', 'support.constant', 'constant.other'], settings: { foreground: p.constant } },
      { scope: ['entity.name.type', 'entity.name.class', 'support.class', 'entity.other.inherited-class', 'support.type', 'entity.name.namespace'], settings: { foreground: p.type } },
      { scope: ['entity.name.function', 'support.function', 'meta.function-call', 'entity.name.function.method'], settings: { foreground: p.func } },
      { scope: ['variable', 'variable.other.php', 'variable.parameter'], settings: { foreground: p.variable } },
      { scope: ['punctuation.definition.variable.php'], settings: { foreground: p.fg3 } },
      { scope: ['variable.other.property', 'support.variable.property', 'meta.object-literal.key', 'variable.other.object.property'], settings: { foreground: p.property } },
      { scope: ['entity.name.tag', 'meta.tag.sgml'], settings: { foreground: p.tag } },
      { scope: ['entity.other.attribute-name'], settings: { foreground: p.attr } },
      { scope: ['string.regexp'], settings: { foreground: p.regex } },
      { scope: ['support.type.property-name.css', 'support.type.property-name'], settings: { foreground: p.property } },
      { scope: ['keyword.blade', 'support.function.construct.begin.blade', 'support.function.construct.end.blade', 'keyword.control.blade'], settings: { foreground: p.keyword } },
      { scope: ['markup.heading'], settings: { foreground: p.type, fontStyle: 'bold' } },
      { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
      { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
      { scope: ['invalid'], settings: { foreground: p.error } }
    ],
    semanticTokenColors: {
      'class': p.type,
      'interface': p.type,
      'enum': p.type,
      'function': p.func,
      'method': p.func,
      'property': p.property,
      'parameter': p.variable,
      'namespace': p.type
    }
  }
}

/** The theme extension's package.json. The version changes with the accent so code-server reinstalls it. */
export function themePackage(accent: Accent, build: number, look: CodeLook = 'aurora'): Record<string, unknown> {
  return {
    name: 'laramac-studio-theme',
    displayName: 'Laramac Studio',
    description: 'The Laramac Studio look for Laramac Code.',
    publisher: 'laramac',
    version: `1.0.${build}`,
    engines: { vscode: '^1.70.0' },
    categories: ['Themes'],
    contributes: {
      themes: [
        { label: 'Laramac Studio Dark', uiTheme: 'vs-dark', path: './themes/dark.json' },
        { label: 'Laramac Studio Light', uiTheme: 'vs', path: './themes/light.json' }
      ]
    },
    laramacAccent: accent,
    laramacLook: look
  }
}

/** A VSIX is a zip with these two files at its root, and the extension under extension/. */
export function vsixManifest(version: string, o: { id: string; name: string; description: string; category: string } = { id: 'laramac-studio-theme', name: 'Laramac Studio', description: 'The Laramac Studio look for Laramac Code.', category: 'Themes' }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${o.id}" Version="${version}" Publisher="laramac" />
    <DisplayName>${o.name}</DisplayName>
    <Description xml:space="preserve">${o.description}</Description>
    <Categories>${o.category}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.70.0" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`
}

export const VSIX_CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json" /><Default Extension=".js" ContentType="application/javascript" /><Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>
`

/** A small number that changes when the accent does, for the theme's version. */
export const accentBuild = (accent: Accent, look: CodeLook = 'aurora'): number => (Object.keys(ACCENTS).indexOf(accent) + 10) * 10 + ['aurora', 'paper', 'carbon', 'sunset', 'terminal'].indexOf(look)
