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
  studio: {
    dark: { bg: '#1e1f22', bg2: '#2b2d30', base: '#2b2d30', bg3: '#2b2d30', fg: '#dfe1e5', fg2: '#9da0a8', fg3: '#6f737a', line: '#ffffff14', keyword: '#cf8e6d', string: '#6aab73', number: '#2aacb8', type: '#dfe1e5', func: '#56a8f5', variable: '#bcbec4', property: '#c77dbb', comment: '#7a7e85', tag: '#d5b778', attr: '#bababa', constant: '#c77dbb' },
    light: { bg: '#ffffff', bg2: '#f7f8fa', base: '#f2f3f5', bg3: '#f7f8fa', keyword: '#0033b3', string: '#067d17', number: '#1750eb', type: '#1d2433', func: '#00627a', property: '#871094', comment: '#8c8c8c', tag: '#0033b3', attr: '#174ad4', constant: '#871094' },
    accent: { dark: '#548af7', light: '#3574f0' }
  },
  classic: {
    dark: { bg: '#1f1f1f', bg2: '#181818', base: '#181818', bg3: '#2b2b2b', fg: '#cccccc', fg2: '#9d9d9d', fg3: '#6e7681', keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', type: '#4ec9b0', func: '#dcdcaa', variable: '#9cdcfe', property: '#9cdcfe', comment: '#6a9955', tag: '#569cd6', attr: '#9cdcfe', constant: '#4fc1ff' },
    light: { bg: '#ffffff', bg2: '#f8f8f8', base: '#f8f8f8', bg3: '#f3f3f3', keyword: '#0000ff', string: '#a31515', number: '#098658', type: '#267f99', func: '#795e26', variable: '#001080', property: '#001080', comment: '#008000', tag: '#800000', attr: '#e50000', constant: '#0070c1' },
    accent: { dark: '#0078d4', light: '#005fb8' }
  },
  zen: {
    dark: { bg: '#282c34', bg2: '#21252b', base: '#21252b', bg3: '#2c313a', fg: '#abb2bf', fg2: '#8b92a0', fg3: '#5c6370', keyword: '#c678dd', string: '#98c379', number: '#d19a66', type: '#e5c07b', func: '#61afef', variable: '#e06c75', property: '#e06c75', comment: '#5c6370', tag: '#e06c75', attr: '#d19a66', constant: '#d19a66' },
    light: { bg: '#fafafa', bg2: '#f0f0f1', base: '#eaeaeb', bg3: '#eeeeef', fg: '#383a42', fg2: '#696c77', fg3: '#a0a1a7', keyword: '#a626a4', string: '#50a14f', number: '#986801', type: '#c18401', func: '#4078f2', variable: '#e45649', property: '#e45649', comment: '#a0a1a7', tag: '#e45649', attr: '#986801', constant: '#986801' },
    accent: { dark: '#74ade8', light: '#3b82f6' }
  },
  notepad: {
    dark: { bg: '#2b2b2b', bg2: '#3a3a3a', base: '#383838', bg3: '#333333', fg: '#e0e0e0', fg2: '#b0b0b0', fg3: '#808080', keyword: '#6aa9ff', string: '#c3c3c3', number: '#ffa040', type: '#c586ff', func: '#9cc3ff', variable: '#e0e0e0', property: '#c586ff', comment: '#6fae6f', tag: '#6aa9ff', attr: '#ff7a7a', constant: '#ffa040' },
    light: { bg: '#ffffff', bg2: '#f0f0f0', base: '#ececec', bg3: '#f5f5f5', fg: '#000000', fg2: '#404040', fg3: '#808080', keyword: '#0000ff', string: '#808080', number: '#ff8000', type: '#8000ff', func: '#000080', variable: '#000000', property: '#8000ff', comment: '#008000', tag: '#000080', attr: '#ff0000', constant: '#ff8000', regex: '#000000' },
    accent: { dark: '#6ab7ff', light: '#2d7ee5' }
  },
  ember: {
    dark: { bg: '#272822', bg2: '#1e1f1c', base: '#1e1f1c', bg3: '#3e3d32', fg: '#f8f8f2', fg2: '#cfcfc2', fg3: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', type: '#66d9ef', func: '#a6e22e', variable: '#f8f8f2', property: '#66d9ef', comment: '#75715e', tag: '#f92672', attr: '#a6e22e', constant: '#ae81ff' },
    light: { bg: '#fafaf5', bg2: '#f1f1e9', base: '#eeeee6', bg3: '#ecece2', fg: '#272822', fg2: '#55564b', fg3: '#98998c', keyword: '#d6275f', string: '#8c7a00', number: '#7a4fd1', type: '#0a7fa0', func: '#5a8f00', comment: '#98998c', tag: '#d6275f', attr: '#5a8f00', constant: '#7a4fd1' },
    accent: { dark: '#fd971f', light: '#d9720b' }
  },
  orbit: {
    dark: { bg: '#0f1218', bg2: '#0b0d12', base: '#0b0d12', bg3: '#171b24', fg: '#e3e6ee', fg2: '#a4abbd', fg3: '#6b7390', keyword: '#c4a7ff', string: '#8bd5a0', number: '#ffb86b', type: '#7dc4ff', func: '#82aaff', variable: '#e3e6ee', property: '#a6c8ff', comment: '#6b7390', tag: '#c4a7ff', attr: '#ffb86b' },
    light: { bg: '#ffffff', bg2: '#f6f7fb', base: '#f1f3f8', bg3: '#eef1f8' },
    accent: { dark: '#6ea8ff', light: '#1a73e8' }
  },
  aurora: { dark: { bg: '#0e1220', bg2: '#0a0d18', base: '#070913', bg3: '#171c30' }, light: { base: '#e6eaf6', bg2: '#f3f5fc' } },
  sunset: {
    dark: { bg: '#1a1118', bg2: '#140c13', base: '#0d070c', bg3: '#27181f', keyword: '#ff8fb1', string: '#ffb86b', number: '#ffd37a', type: '#ff9a8b', func: '#ffc9a0', property: '#ffa6c9', attr: '#ffcf8a' },
    light: { bg: '#fff8f4', bg2: '#fdeee6', base: '#f6e3da', bg3: '#fbece4', keyword: '#c2255c', string: '#b35400', number: '#a8470d', type: '#a8321f' },
    accent: { dark: '#ff9a62', light: '#d9531e' }
  },
  terminal: {
    dark: { bg: '#050a07', bg2: '#030604', base: '#010302', bg3: '#0b150f', fg: '#c9f5d3', fg2: '#7fb892', fg3: '#4a7a5a', line: '#39ff8822', keyword: '#5af78e', string: '#f3f99d', number: '#ff9f6b', type: '#57c7ff', func: '#9aedfe', property: '#b4f9f8', comment: '#4f7a5f', tag: '#5af78e', attr: '#ff6ac1', constant: '#ff9f6b', variable: '#c9f5d3' },
    light: { bg: '#f3faf5', bg2: '#e8f4ec', base: '#d5e8da', bg3: '#e3f1e7', fg: '#12301c', fg2: '#2f5a3c', fg3: '#6b9179', keyword: '#0a7a3a', string: '#8a6d00', type: '#0b5f8a' },
    accent: { dark: '#39ff88', light: '#0a8f4a' }
  },
  mono: {
    dark: { bg: '#000000', bg2: '#000000', base: '#000000', bg3: '#111111', fg: '#ffffff', fg2: '#bdbdbd', fg3: '#7a7a7a', line: '#ffffff33', sel: '#ffffff2e', keyword: '#ffffff', string: '#d4d4d4', number: '#a8a8a8', type: '#ffffff', func: '#e6e6e6', variable: '#bdbdbd', property: '#cfcfcf', comment: '#777777', tag: '#ffffff', attr: '#bdbdbd', constant: '#a8a8a8', regex: '#d4d4d4', error: '#ffffff', warn: '#cfcfcf', ok: '#ffffff' },
    light: { bg: '#ffffff', bg2: '#ffffff', base: '#ffffff', bg3: '#f2f2f2', fg: '#000000', fg2: '#444444', fg3: '#8a8a8a', line: '#00000033', sel: '#0000002b', keyword: '#000000', string: '#333333', number: '#555555', type: '#000000', func: '#222222', variable: '#444444', property: '#333333', comment: '#8a8a8a', tag: '#000000', attr: '#444444', constant: '#555555', regex: '#333333', error: '#000000', warn: '#444444', ok: '#000000' },
    accent: { dark: '#ffffff', light: '#000000' }
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
export const accentBuild = (accent: Accent, look: CodeLook = 'aurora'): number => (Object.keys(ACCENTS).indexOf(accent) + 10) * 10 + ['studio', 'classic', 'zen', 'aurora', 'sunset', 'terminal', 'mono', 'notepad', 'ember', 'orbit'].indexOf(look)
