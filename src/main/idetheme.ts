/**
 * Laramac Studio, the colour theme of Laramac Code: the app's dark and light looks, with syntax
 * colours in the spirit of Xcode's (pink keywords, warm strings, cyan types) so PHP, Blade, JS
 * and CSS read calmly for hours. The accent follows the colour chosen in Laramac.
 */

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
}

const DARK: Palette = {
  bg: '#0f131c',
  bg2: '#0b0e15',
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

/** A VS Code colour theme (the JSON inside a theme extension). */
export function themeJson(kind: 'dark' | 'light', accent: Accent): Record<string, unknown> {
  const p = kind === 'dark' ? DARK : LIGHT
  const a = ACCENTS[accent][kind]
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
      'editorGroupHeader.tabsBackground': p.bg2,
      'editorGroup.border': p.line,
      'editorWidget.background': p.bg3,
      'editorWidget.border': p.line,
      'editorSuggestWidget.background': p.bg3,
      'editorSuggestWidget.selectedBackground': `${a}2e`,
      'editorHoverWidget.background': p.bg3,
      'tab.activeBackground': p.bg,
      'tab.activeForeground': p.fg,
      'tab.inactiveBackground': p.bg2,
      'tab.inactiveForeground': p.fg2,
      'tab.border': p.bg2,
      'tab.activeBorderTop': a,
      'sideBar.background': p.bg2,
      'sideBar.foreground': p.fg2,
      'sideBar.border': p.line,
      'sideBarTitle.foreground': p.fg,
      'sideBarSectionHeader.background': p.bg2,
      'activityBar.background': p.bg2,
      'activityBar.foreground': a,
      'activityBar.inactiveForeground': p.fg3,
      'activityBar.border': p.line,
      'activityBarBadge.background': a,
      'activityBarBadge.foreground': onAccent,
      'titleBar.activeBackground': p.bg2,
      'titleBar.activeForeground': p.fg2,
      'titleBar.inactiveBackground': p.bg2,
      'titleBar.border': p.line,
      'statusBar.background': p.bg2,
      'statusBar.foreground': p.fg2,
      'statusBar.border': p.line,
      'statusBar.debuggingBackground': a,
      'statusBar.debuggingForeground': onAccent,
      'statusBarItem.remoteBackground': a,
      'statusBarItem.remoteForeground': onAccent,
      'panel.background': p.bg2,
      'panel.border': p.line,
      'panelTitle.activeBorder': a,
      'terminal.background': p.bg2,
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
export function themePackage(accent: Accent, build: number): Record<string, unknown> {
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
    laramacAccent: accent
  }
}

/** A VSIX is a zip with these two files at its root, and the extension under extension/. */
export function vsixManifest(version: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="laramac-studio-theme" Version="${version}" Publisher="laramac" />
    <DisplayName>Laramac Studio</DisplayName>
    <Description xml:space="preserve">The Laramac Studio look for Laramac Code.</Description>
    <Categories>Themes</Categories>
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
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json" /><Default Extension=".vsixmanifest" ContentType="text/xml" /></Types>
`

/** A small number that changes when the accent does, for the theme's version. */
export const accentBuild = (accent: Accent): number => Object.keys(ACCENTS).indexOf(accent) + 10
