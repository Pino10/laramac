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
  { id: 'anthropic.claude-code', name: 'Claude Code', why: 'Claude in the side panel: ask, plan and edit with your Claude account' },
  { id: 'saoudrizwan.claude-dev', name: 'Cline', why: 'An AI coding agent for any model: your local model, Free LLM API or an API key (open source)' },
  { id: 'phpactor.vscode-phpactor', name: 'Phpactor', why: 'PHP refactoring: rename, extract, import classes, generate methods (open source)' },
  { id: 'xdebug.php-debug', name: 'PHP Debug', why: 'Breakpoints and stepping through PHP with Xdebug' },
  { id: 'onecentlin.laravel-blade', name: 'Laravel Blade', why: 'Blade templates with snippets' },
  { id: 'mikestead.dotenv', name: 'DotENV', why: 'Colours for .env files' },
  { id: 'editorconfig.editorconfig', name: 'EditorConfig', why: 'The project’s own indentation and line endings' },
  { id: 'esbenp.prettier-vscode', name: 'Prettier', why: 'Formatting for JS, TS, CSS, HTML and more' },
  { id: 'dbaeumer.vscode-eslint', name: 'ESLint', why: 'JavaScript and TypeScript problems as you type' },
  { id: 'bradlc.vscode-tailwindcss', name: 'Tailwind CSS IntelliSense', why: 'Class name completion and previews' },
  { id: 'vue.volar', name: 'Vue', why: 'Vue single-file components' },
  { id: 'redhat.vscode-yaml', name: 'YAML', why: 'YAML with schema checks (Docker Compose, CI files)' },
  { id: 'continue.continue', name: 'Continue', why: 'AI chat and agent with LM Studio, Ollama or the Free LLM API: it reads your project and edits many files at once (open source)' },
  { id: 'laravel.vscode-laravel', name: 'Laravel', why: 'The Laravel team’s own: routes, views, config and translations with completion and links. It runs your app’s PHP to learn them' },
  { id: 'recca0120.vscode-phpunit', name: 'PHPUnit and Pest', why: 'Run one test from its line with the ▶ next to it, or all of them from the Testing panel' },
  { id: 'vitest.explorer', name: 'Vitest', why: 'Run JavaScript and TypeScript tests from their line' },
  { id: 'ms-python.python', name: 'Python', why: 'Python: run, debug, virtual environments and Jupyter' },
  { id: 'detachhead.basedpyright', name: 'basedpyright', why: 'Python completion, types and errors (the open-source Pylance)' },
  { id: 'charliermarsh.ruff', name: 'Ruff', why: 'Fast Python lint and formatting' },
  { id: 'golang.go', name: 'Go', why: 'Go: completion, tests and debugging' },
  { id: 'rust-lang.rust-analyzer', name: 'rust-analyzer', why: 'Rust: completion, errors and refactoring' },
  { id: 'redhat.java', name: 'Java', why: 'Java and Maven or Gradle projects' },
  { id: 'ms-azuretools.vscode-docker', name: 'Docker', why: 'Dockerfiles and Compose files with completion' },
  { id: 'mtxr.sqltools', name: 'SQLTools', why: 'Run SQL against your databases from the editor' },
  { id: 'usernamehw.errorlens', name: 'Error Lens', why: 'Problems shown on the line itself, as you type' },
  { id: 'mhutchie.git-graph', name: 'Git Graph', why: 'See branches and history as a graph' },
  { id: 'miguelsolorio.fluent-icons', name: 'Fluent Icons', why: 'Softer, rounder icons for the whole window' },
  { id: 'pkief.material-icon-theme', name: 'Material Icon Theme', why: 'A clear icon for every kind of file' }
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
    // Laramac's own look. The AI chat is Claude Code (and Cline) in the side panel on the right,
    // which the layout buttons in the title bar show and hide. VS Code's built-in chat needs GitHub
    // Copilot, which this editor cannot use, so it stays off instead of showing a broken button.
    'workbench.activity.showAccounts': false,
    'workbench.layoutControl.enabled': true,
    'workbench.layoutControl.type': 'toggles',
    'chat.disableAIFeatures': true,
    'continue.telemetryEnabled': false,
    'continue.showInlineTip': false,
    // basedpyright is the Python language server, so the Python extension's own one stays off.
    'python.languageServer': 'None',
    'basedpyright.analysis.typeCheckingMode': 'standard',
    'claudeCode.preferredLocation': 'sidebar',
    'workbench.tips.enabled': false,
    ...(o.phpVersion ? { 'intelephense.environment.phpVersion': o.phpVersion } : {})
  }
  const defaults: Record<string, unknown> = {
    'workbench.startupEditor': 'none',
    'workbench.productIconTheme': 'fluent-icons',
    'workbench.iconTheme': 'material-icon-theme',
    'laramac.startPage': true,
    'errorLens.enabledDiagnosticLevels': ['error', 'warning'],
    'phpunit.showAfterExecution': 'onFailure',
    'workbench.activityBar.location': 'top',
    'workbench.secondarySideBar.defaultVisibility': 'visibleInWorkspace',
    'window.title': '${rootName}${separator}${activeEditorShort}',
    'workbench.editor.tabActionLocation': 'right',
    'breadcrumbs.enabled': true,
    'terminal.integrated.tabs.enabled': true,
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
export function serverArgs(o: { port: number | string; dataDir: string; extDir: string }): string[] {
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
        { command: 'laramac.menu', title: 'Laramac', category: 'Laramac' },
        { command: 'laramac.refreshProject', title: 'Refresh', category: 'Laramac', icon: '$(refresh)' },
        { command: 'laramac.startPage', title: 'Start page', category: 'Laramac' }
      ],
      views: { explorer: [{ id: 'laramac.project', name: 'Laravel and scripts' }] },
      menus: {
        'editor/title': [{ command: 'laramac.reviewFile', group: 'navigation@99', when: 'resourceScheme == file' }],
        'explorer/context': [{ command: 'laramac.reviewProject', group: 'laramac' }],
        'view/title': [{ command: 'laramac.refreshProject', when: 'view == laramac.project', group: 'navigation' }]
      },
      keybindings: [{ command: 'laramac.menu', key: 'cmd+alt+l' }],
      configuration: {
        title: 'Laramac',
        properties: {
          'laramac.startPage': { type: 'boolean', default: true, description: 'Show the start page when a project opens with no files open.' },
          'laramac.checkOnSave': { type: 'boolean', default: true, description: 'Check PHP files when you save them (PHP syntax, PHPStan, and Psalm when the project has psalm.xml).' },
          'laramac.phpstan': { type: 'boolean', default: true, description: 'Use PHPStan (the project’s own, or the one installed on Laramac’s PHP page).' },
          'laramac.phpstanLevel': { type: 'number', default: 5, minimum: 0, maximum: 10, description: 'PHPStan level for projects without their own phpstan.neon.' },
          'laramac.ai': { type: 'string', enum: ['ask', 'claude', 'claudelm', 'claudefree'], enumDescriptions: ['Ask each time', 'Claude Code with your Claude account', 'Claude Code on your local model (LM Studio or Ollama)', 'Claude Code on Free LLM API'], default: 'ask', description: 'Who reviews code when you choose Review with AI. Reviews only read: they never change files.' }
        }
      }
    }
  }
}

/**
 * Islands: the side bar, editor, panel and chat float as rounded panels on a deeper base, with
 * the title and status bars part of the base. This is what makes it Laramac Code and not a
 * stock VS Code window.
 */
const ISLANDS_CSS = `
.monaco-workbench{--lc-base:var(--vscode-titleBar-activeBackground);--lc-line:color-mix(in srgb,var(--vscode-foreground) 7%,transparent);background:var(--lc-base)!important}
.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar,.monaco-workbench .part.panel,.monaco-workbench .part.editor{clip-path:inset(0 4px 6px 4px round 12px)}
.monaco-workbench .part.editor>.content{background:var(--vscode-editor-background)}
.monaco-workbench .part.sidebar>.composite.title,.monaco-workbench .part.auxiliarybar>.composite.title{padding-left:6px}
.monaco-workbench .part.panel.bottom .composite.title{border-top:0!important}
.monaco-workbench .part.statusbar{color:var(--vscode-descriptionForeground)!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab{border:0!important;margin:5px 0 0 4px;height:29px!important;border-radius:8px!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab.active{background:color-mix(in srgb,var(--vscode-foreground) 7%,transparent)!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab:not(.active){background:transparent!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab .tab-border-top-container,.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab .tab-border-bottom-container{display:none!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title.tabs>.tabs-and-actions-container.tabs-border-bottom::after{display:none!important}
.monaco-workbench .sash:not(.active):not(:hover){background:transparent!important}
.monaco-workbench .pane-header{border-top:0!important}
.monaco-workbench .split-view-view>.pane>.pane-header{border-radius:8px;margin:0 6px}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:color-mix(in srgb,var(--vscode-editor-background) 80%,transparent)!important;border:1px solid var(--lc-line)!important;height:26px!important;border-radius:9px!important;width:42vw!important;max-width:560px}
.monaco-workbench .part.titlebar .command-center .command-center-center:hover{border-color:color-mix(in srgb,var(--vscode-focusBorder) 55%,transparent)!important}
.monaco-workbench .monaco-scrollable-element>.scrollbar>.slider{border-radius:6px}
.monaco-workbench .part.editor .editor-group-watermark .letterpress{opacity:.35}
`

/**
 * Poppins (from Laramac) for the interface, or the Mac's own font. Code keeps a monospaced font.
 * The editor's page only accepts fonts from itself, so the CSS names the font and the Laramac
 * Code app loads its bytes into the page (see code-app/lib.js fontScript).
 */
export function workbenchCss(o: { uiFont: 'system' | 'poppins' }): string {
  const faces = ''
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
${ISLANDS_CSS}`
}

/** The Laramac Code app's zip for this Mac's chip, in Laramac's release of that version. */
export function codeAppAsset<T extends { name: string }>(assets: T[], version: string, arch: string): T | null {
  const want = `Laramac-Code-${version}-${arch === 'arm64' ? 'arm64' : 'x64'}.zip`
  return assets.find((a) => a.name === want) ?? null
}

/** laramac-code://open?folder=…&file=…&line=…, for the Laramac Code app. */
export function openRequestUrl(o: { folder: string; file?: string; line?: number }): string {
  const q = new URLSearchParams({ folder: o.folder })
  if (o.file) q.set('file', o.file)
  if (o.file && o.line && o.line > 0) q.set('line', String(Math.floor(o.line)))
  return `laramac-code://open?${q.toString()}`
}

/**
 * The editor's environment for launch.json: Laramac's PATH and tool folders only. Nothing else
 * from Laramac's own environment is written, so no token or key can end up in the file.
 */
const LAUNCH_KEYS = /^(PATH|LANG|LC_[A-Z]+|COMPOSER_HOME|NVM_DIR|BUN_INSTALL|CARGO_HOME|RUSTUP_HOME|GOPATH|GOROOT|DOTNET_ROOT|PHP_INI_SCAN_DIR|PHPRC)$/
export function launchEnv(env: Record<string, string | undefined>, extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) if (LAUNCH_KEYS.test(k) && typeof v === 'string') out[k] = v
  return { ...out, ...extra }
}

export interface AiLaunch {
  servers: { name: string; provider: 'lmstudio' | 'ollama' | 'openai'; baseUrl: string; model?: string }[]
  freellm: { baseUrl: string; models: string[] } | null
}

/**
 * The chat models Laramac Code offers: LM Studio and Ollama (they list their own models), your
 * other OpenAI-style model servers that need no key, and the Free LLM API (its key stays in the
 * Keychain: the app adds it through a relay on this Mac). No key is ever in launch.json.
 */
export function aiLaunch(o: { llm?: { baseUrl: string; model: string }; servers: { name: string; baseUrl: string; api: string; hasKey: boolean }[]; freellm: { baseUrl: string } | null; freeModels: readonly string[] }): AiLaunch {
  const providerOf = (url: string): 'lmstudio' | 'ollama' | 'openai' => {
    const port = (() => {
      try {
        return new URL(url).port
      } catch {
        return ''
      }
    })()
    return port === '1234' ? 'lmstudio' : port === '11434' ? 'ollama' : 'openai'
  }
  const out: AiLaunch['servers'] = [
    { name: 'LM Studio', provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1' },
    { name: 'Ollama', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }
  ]
  const key = (u: string): string => u.replace(/\/+$/, '').replace('localhost', '127.0.0.1')
  const seen = new Set(out.map((s) => key(s.baseUrl)))
  const extra = [
    ...(o.llm?.baseUrl ? [{ name: 'Local model', baseUrl: o.llm.baseUrl, api: 'openai', hasKey: false, model: o.llm.model }] : []),
    ...o.servers.map((s) => ({ ...s, model: '' }))
  ]
  for (const s of extra) {
    if (s.hasKey || s.api !== 'openai' || seen.has(key(s.baseUrl)) || !/^https?:\/\//.test(s.baseUrl)) continue
    const name = s.name.replace(/[^\w .()-]/g, '').slice(0, 40) || 'Model server'
    const provider = providerOf(s.baseUrl)
    // A plain OpenAI-style server needs a model name; without one it is left out.
    if (provider === 'openai' && !s.model) continue
    seen.add(key(s.baseUrl))
    out.push({ name, provider, baseUrl: s.baseUrl, ...(s.model ? { model: s.model } : {}) })
  }
  return { servers: out.slice(0, 8), freellm: o.freellm ? { baseUrl: o.freellm.baseUrl, models: [...o.freeModels] } : null }
}
