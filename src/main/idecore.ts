/**
 * Laramac Code, the parts without Electron (so they can be tested): which release file to
 * download, how to open a folder or a file at a line, and the settings Laramac manages.
 *
 * Laramac Code is code-server (the open-source VS Code, by Coder) running on 127.0.0.1 with a
 * password only Laramac knows, shown in a Laramac window. Extensions come from Open VSX.
 */

export interface IdeExtension {
  id: string
  name: string
  why: string
}

/** Installed with Laramac Code, for PHP first and the front end next to it. */
export const IDE_EXTENSIONS: IdeExtension[] = [
  { id: 'bmewburn.vscode-intelephense-client', name: 'PHP Intelephense', why: 'PHP completion, go to definition, find references, errors and formatting' },
  { id: 'phpactor.vscode-phpactor', name: 'Phpactor', why: 'PHP refactoring: rename, extract, import classes, generate methods (open source)' },
  { id: 'xdebug.php-debug', name: 'PHP Debug', why: 'Breakpoints and stepping through PHP with Xdebug' },
  { id: 'onecentlin.laravel-blade', name: 'Laravel Blade', why: 'Blade templates with snippets' },
  { id: 'mikestead.dotenv', name: 'DotENV', why: 'Colours for .env files' },
  { id: 'editorconfig.editorconfig', name: 'EditorConfig', why: 'The project’s own indentation and line endings' },
  { id: 'esbenp.prettier-vscode', name: 'Prettier', why: 'Formatting for JS, TS, CSS, HTML and more' },
  { id: 'dbaeumer.vscode-eslint', name: 'ESLint', why: 'JavaScript and TypeScript problems as you type' },
  { id: 'bradlc.vscode-tailwindcss', name: 'Tailwind CSS IntelliSense', why: 'Class name completion and previews' },
  { id: 'vue.volar', name: 'Vue', why: 'Vue single-file components' },
  { id: 'redhat.vscode-yaml', name: 'YAML', why: 'YAML with schema checks (Docker Compose, CI files)' }
]

export interface ReleaseAsset {
  name: string
  url: string
  /** GitHub's own SHA-256 of the file, as "sha256:…", when it has one. */
  digest?: string | null
}

/** code-server's standalone build for this Mac. */
export function macAsset(assets: ReleaseAsset[], tag: string, arch: string = process.arch): ReleaseAsset | null {
  const v = tag.replace(/^v/, '')
  const want = `code-server-${v}-macos-${arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`
  return assets.find((a) => a.name === want) ?? null
}

export function sha256Of(digest: string | null | undefined): string | null {
  const m = /^sha256:([a-f0-9]{64})$/i.exec(String(digest ?? ''))
  return m ? m[1].toLowerCase() : null
}

/**
 * The address that opens a folder, and optionally a file at a line, in Laramac Code. The web
 * workbench reads ?folder= and a payload of ["openFile", uri] plus ["gotoLineMode", "true"].
 */
export function openUrl(port: number, folder: string, file?: string, line?: number): string {
  const host = `127.0.0.1:${port}`
  const q = new URLSearchParams({ folder })
  if (file) {
    const at = line && line > 0 ? `:${Math.floor(line)}` : ''
    const payload: [string, string][] = [['openFile', `vscode-remote://${host}${encodeURI(file)}${at}`]]
    if (at) payload.push(['gotoLineMode', 'true'])
    q.set('payload', JSON.stringify(payload))
  }
  return `http://${host}/?${q.toString()}`
}

/** The folder to open for a file: its site (or www project) when it is inside one, otherwise the file's folder. */
export function folderFor(path: string, roots: string[], isDir: boolean): string {
  const clean = path.replace(/\/+$/, '')
  if (isDir) return clean
  const hit = roots.map((r) => r.replace(/\/+$/, '')).filter((r) => clean.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0]
  return hit ?? (clean.slice(0, clean.lastIndexOf('/')) || '/')
}

export const EDITOR_FONTS: Record<string, { name: string; family: string }> = {
  system: { name: 'SF Mono', family: "ui-monospace, 'SF Mono', Menlo, monospace" },
  jetbrains: { name: 'JetBrains Mono', family: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
  fira: { name: 'Fira Code', family: "'Fira Code', ui-monospace, Menlo, monospace" },
  cascadia: { name: 'Cascadia Code', family: "'Cascadia Code', ui-monospace, Menlo, monospace" },
  menlo: { name: 'Menlo', family: 'Menlo, monospace' }
}

export interface IdeSettingsInput {
  font: string
  fontSize: number
  phpPath: string | null
  phpVersion: string | null
  /** 'auto' follows the Mac's light and dark mode. */
  appearance: 'auto' | 'dark' | 'light'
}

/**
 * Phpactor does refactoring; Intelephense does completion. Phpactor's own completion and
 * diagnostics are switched off so the two do not show everything twice.
 */
export const PHPACTOR_COMPLETORS = ['doctrine_annotation', 'imported_names', 'worse_parameter', 'named_parameter', 'constructor', 'class_member', 'scf_class', 'local_variable', 'subscript', 'declared_function', 'declared_constant', 'declared_class', 'expression_name_search', 'use', 'attribute', 'class_like', 'type', 'keyword', 'docblock']
export function phpactorConfig(): Record<string, unknown> {
  return {
    ...Object.fromEntries(PHPACTOR_COMPLETORS.map((c) => [`completion_worse.completor.${c}.enabled`, false])),
    'language_server_worse_reflection.diagnostics.enable': false,
    'language_server_worse_reflection.inlay_hints.enable': false,
    'language_server_phpstan.enabled': false,
    'language_server_psalm.enabled': false,
    'language_server_php_cs_fixer.enabled': false,
    'language_server.enable_trust_check': false,
    'indexer.exclude_patterns': ['/vendor/**/Tests/**/*', '/vendor/**/tests/**/*', '/node_modules/**/*', '/storage/**/*']
  }
}

/**
 * Settings Laramac writes for Laramac Code. `managed` are always set (they follow Laramac);
 * `defaults` are only set when you have not set them yourself.
 */
export function ideSettings(o: IdeSettingsInput): { managed: Record<string, unknown>; defaults: Record<string, unknown> } {
  const family = (EDITOR_FONTS[o.font] ?? EDITOR_FONTS.system).family
  const managed: Record<string, unknown> = {
    'editor.fontFamily': family,
    'terminal.integrated.fontFamily': family,
    'editor.fontSize': o.fontSize,
    'terminal.integrated.fontSize': Math.max(11, o.fontSize - 1),
    'window.autoDetectColorScheme': o.appearance === 'auto',
    'workbench.preferredDarkColorTheme': 'Laramac Studio Dark',
    'workbench.preferredLightColorTheme': 'Laramac Studio Light',
    'workbench.colorTheme': o.appearance === 'light' ? 'Laramac Studio Light' : 'Laramac Studio Dark',
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'extensions.autoUpdate': true,
    'security.workspace.trust.enabled': false,
    ...(o.phpPath ? { 'php.validate.executablePath': o.phpPath, 'php.debug.executablePath': o.phpPath, 'phpactor.executablePath': o.phpPath } : {}),
    'phpactor.config': phpactorConfig(),
    // Laramac's own look: the activity bar on top, no layout clutter, no built-in AI chat (Laramac's checks and Claude Code do that).
    'workbench.activity.showAccounts': false,
    'workbench.layoutControl.enabled': false,
    'chat.commandCenter.enabled': false,
    'chat.disableAIFeatures': true,
    'workbench.tips.enabled': false,
    ...(o.phpVersion ? { 'intelephense.environment.phpVersion': o.phpVersion } : {})
  }
  const defaults: Record<string, unknown> = {
    'workbench.startupEditor': 'none',
    'workbench.activityBar.location': 'top',
    'workbench.tree.indent': 14,
    'workbench.tree.renderIndentGuides': 'onHover',
    'editor.minimap.enabled': false,
    'editor.scrollbar.verticalScrollbarSize': 9,
    'editor.scrollbar.horizontalScrollbarSize': 9,
    'explorer.compactFolders': false,
    'window.commandCenter': true,
    'laramac.checkOnSave': true,
    'laramac.ai': 'ask',
    'editor.fontLigatures': true,
    'editor.lineHeight': 1.6,
    'editor.smoothScrolling': true,
    'editor.cursorBlinking': 'smooth',
    'editor.cursorSmoothCaretAnimation': 'on',
    'editor.bracketPairColorization.enabled': true,
    'editor.guides.bracketPairs': 'active',
    'editor.renderLineHighlight': 'all',
    'editor.minimap.renderCharacters': false,
    'editor.stickyScroll.enabled': true,
    'editor.linkedEditing': true,
    'editor.padding.top': 8,
    'workbench.list.smoothScrolling': true,
    'terminal.integrated.smoothScrolling': true,
    'terminal.integrated.cursorStyle': 'line',
    'files.trimTrailingWhitespace': true,
    'files.insertFinalNewline': true,
    // Intelephense does PHP: the built-in suggestions would only repeat it.
    'php.suggest.basic': false,
    '[php]': { 'editor.defaultFormatter': 'bmewburn.vscode-intelephense-client' },
    '[blade]': { 'editor.autoClosingBrackets': 'always' },
    'emmet.includeLanguages': { blade: 'html', php: 'html' },
    'files.associations': { '*.blade.php': 'blade', '.env*': 'dotenv' },
    'search.exclude': { '**/vendor': true, '**/node_modules': true, '**/storage/framework': true, '**/public/build': true },
    'files.watcherExclude': { '**/vendor/**': true, '**/node_modules/**': true, '**/storage/**': true }
  }
  return { managed, defaults }
}

/** Your settings with Laramac's merged in: managed keys win, defaults only fill gaps. */
export function mergeSettings(current: Record<string, unknown>, s: { managed: Record<string, unknown>; defaults: Record<string, unknown> }): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current }
  for (const [k, v] of Object.entries(s.defaults)) if (!(k in out)) out[k] = v
  return { ...out, ...s.managed }
}

/** code-server's command line: localhost only, a password, its own folders, quiet. */
export function serverArgs(o: { port: number; dataDir: string; extDir: string }): string[] {
  return [
    '--bind-addr', `127.0.0.1:${o.port}`,
    '--auth', 'password',
    '--user-data-dir', o.dataDir,
    '--extensions-dir', o.extDir,
    '--app-name', 'Laramac Code',
    '--disable-telemetry',
    '--disable-update-check',
    '--disable-workspace-trust',
    '--disable-getting-started-override',
    '--ignore-last-opened'
  ]
}

/** The Laramac Checks extension's manifest (the code is idext/extension.cjs). */
export function checksPackage(version: string): Record<string, unknown> {
  return {
    name: 'laramac-checks',
    displayName: 'Laramac Checks',
    description: 'Free checkers on save (PHP, PHPStan, Psalm), Semgrep from MacSec, and AI reviews with Laramac’s skills.',
    publisher: 'laramac',
    version,
    engines: { vscode: '^1.70.0' },
    categories: ['Linters'],
    main: './extension.js',
    activationEvents: ['onStartupFinished'],
    contributes: {
      commands: [
        { command: 'laramac.checkFile', title: 'Check this file', category: 'Laramac' },
        { command: 'laramac.checkProject', title: 'Check the project', category: 'Laramac' },
        { command: 'laramac.reviewFile', title: 'Review this file with AI', category: 'Laramac' },
        { command: 'laramac.reviewProject', title: 'Review the project with AI', category: 'Laramac' },
        { command: 'laramac.clear', title: 'Clear Laramac’s problems', category: 'Laramac' },
        { command: 'laramac.menu', title: 'Laramac', category: 'Laramac' }
      ],
      menus: {
        'editor/title': [{ command: 'laramac.reviewFile', group: 'navigation@99', when: 'resourceScheme == file' }],
        'explorer/context': [{ command: 'laramac.reviewProject', group: 'laramac' }]
      },
      keybindings: [{ command: 'laramac.menu', key: 'cmd+alt+l' }],
      configuration: {
        title: 'Laramac',
        properties: {
          'laramac.checkOnSave': { type: 'boolean', default: true, description: 'Check PHP files when you save them (PHP syntax, PHPStan, and Psalm when the project has psalm.xml).' },
          'laramac.phpstan': { type: 'boolean', default: true, description: 'Use PHPStan (the project’s own, or the one installed on Laramac’s PHP page).' },
          'laramac.phpstanLevel': { type: 'number', default: 5, minimum: 0, maximum: 10, description: 'PHPStan level for projects without their own phpstan.neon.' },
          'laramac.ai': { type: 'string', enum: ['ask', 'claude', 'claudelm', 'claudefree'], enumDescriptions: ['Ask each time', 'Claude Code with your Claude account', 'Claude Code on your local model (LM Studio or Ollama)', 'Claude Code on Free LLM API'], default: 'ask', description: 'Who reviews code when you choose Review with AI. Reviews only read: they never change files.' }
        }
      }
    }
  }
}

/** Poppins (from Laramac) for the interface, or the Mac's own font. Code keeps a monospaced font. */
export function workbenchCss(o: { uiFont: 'system' | 'poppins'; fonts: { weight: number; url: string }[] }): string {
  const faces = o.uiFont === 'poppins' ? o.fonts.map((f) => `@font-face{font-family:'Laramac Poppins';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(${f.url}) format('woff2')}`).join('') : ''
  const family = o.uiFont === 'poppins' ? "'Laramac Poppins', -apple-system, BlinkMacSystemFont, sans-serif" : "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
  return `${faces}
.monaco-workbench{font-family:${family}!important;-webkit-font-smoothing:antialiased}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title,.monaco-workbench .composite.title .title-label{text-transform:none!important;letter-spacing:.01em;font-weight:600}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab{border-radius:9px 9px 0 0}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab.active{font-weight:500}
.monaco-workbench .activitybar .action-item .action-label,.monaco-workbench .composite-bar .action-item .action-label{border-radius:8px}
.monaco-workbench .quick-input-widget{border-radius:14px!important;overflow:hidden;box-shadow:0 28px 70px -16px rgba(0,0,0,.5)!important}
.monaco-workbench .quick-input-widget .monaco-inputbox,.monaco-workbench .monaco-inputbox{border-radius:8px!important}
.monaco-workbench .quick-input-list .monaco-list-row,.monaco-workbench .monaco-list .monaco-list-row{border-radius:6px}
.monaco-workbench .monaco-menu-container,.context-view .monaco-menu,.monaco-workbench .monaco-menu .actions-container{border-radius:12px!important}
.monaco-workbench .notifications-toasts .notification-toast,.monaco-workbench .notifications-center{border-radius:12px!important;overflow:hidden}
.monaco-editor .suggest-widget,.monaco-editor .monaco-hover,.monaco-workbench .monaco-hover,.monaco-editor .parameter-hints-widget{border-radius:10px!important;overflow:hidden}
.monaco-workbench .monaco-button{border-radius:8px!important}
.monaco-workbench .part.statusbar{font-size:11.5px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:6px}
.monaco-workbench .command-center .command-center-center{border-radius:8px!important}
.monaco-workbench .welcomePageContainer .welcomePage h1{font-weight:600}
`
}
