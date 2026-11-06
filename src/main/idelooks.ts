/**
 * The looks of Laramac Code. Each one is a different way of arranging and drawing the same
 * editor, in the spirit of well-known editors: where the tool strip sits, whether there is a
 * minimap, what the tabs, the buttons and the status bar look like, and which colours it uses.
 * The features are identical in all of them.
 */

export type CodeLook = 'studio' | 'classic' | 'zen' | 'notepad' | 'ember' | 'aurora' | 'orbit' | 'sunset' | 'terminal' | 'mono'

export const CODE_LOOKS: { id: CodeLook; name: string; about: string }[] = [
  { id: 'studio', name: 'Studio', about: 'Feels like a classic IDE: a narrow tool strip, grey panels, underlined tabs, a path bar on top.' },
  { id: 'classic', name: 'Classic', about: 'Feels like VS Code: icon bar on the left, minimap, a bold coloured status bar.' },
  { id: 'zen', name: 'Zen', about: 'Feels like Zed: no icon bar, almost no chrome, soft tabs, a tiny status bar.' },
  { id: 'notepad', name: 'Notepad', about: 'Feels like Notepad++: light grey chrome, coloured tab bars, a ruled status bar, no icon bar.' },
  { id: 'ember', name: 'Ember', about: 'Feels like Sublime Text: warm dark with a minimap, no icon bar, almost no lines.' },
  { id: 'aurora', name: 'Aurora', about: 'Agent-first: the AI panel stays open on the right, in floating glass cards.' },
  { id: 'orbit', name: 'Orbit', about: 'Feels like Antigravity: a wide agent panel on the right, gradient accents, flat dark panels.' },
  { id: 'sunset', name: 'Sunset', about: 'Warm plum and amber glow, icon bar along the bottom, big soft corners.' },
  { id: 'terminal', name: 'Terminal', about: 'Green on near-black, monospace everywhere, block cursor, relative line numbers.' },
  { id: 'mono', name: 'Mono', about: 'Pure black and white. Inverted status bar, hairlines, no colour at all.' }
]

export const isCodeLook = (v: unknown): v is CodeLook => typeof v === 'string' && CODE_LOOKS.some((l) => l.id === v)

/** The window colour shown while the editor loads, so there is no flash. */
export const LOOK_BACKGROUND: Record<CodeLook, { dark: string; light: string }> = {
  studio: { dark: '#2b2d30', light: '#f2f3f5' },
  classic: { dark: '#181818', light: '#f8f8f8' },
  zen: { dark: '#21252b', light: '#eaeaeb' },
  notepad: { dark: '#383838', light: '#e9e9e9' },
  ember: { dark: '#1e1f1c', light: '#eeeee6' },
  aurora: { dark: '#070913', light: '#e6eaf6' },
  orbit: { dark: '#0b0d12', light: '#f1f3f8' },
  sunset: { dark: '#0d070c', light: '#f6e3da' },
  terminal: { dark: '#010302', light: '#d5e8da' },
  mono: { dark: '#000000', light: '#ffffff' }
}

/**
 * Where things sit. Written to the editor's settings when you change look (and only then, so a
 * tweak of your own stays until the next change of look).
 */
export const LOOK_LAYOUT: Record<CodeLook, Record<string, unknown>> = {
  studio: { 'workbench.activityBar.location': 'default', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': true, 'window.commandCenter': false, 'workbench.tree.indent': 12, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': true, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 4 },
  classic: { 'workbench.activityBar.location': 'default', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': true, 'breadcrumbs.enabled': true, 'window.commandCenter': true, 'workbench.tree.indent': 8, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': true, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 0 },
  zen: { 'workbench.activityBar.location': 'hidden', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': true, 'window.commandCenter': false, 'workbench.tree.indent': 14, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': true, 'workbench.editor.tabSizing': 'shrink', 'editor.padding.top': 12 },
  notepad: { 'workbench.activityBar.location': 'hidden', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': false, 'window.commandCenter': false, 'workbench.tree.indent': 16, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': false, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 0 },
  ember: { 'workbench.activityBar.location': 'hidden', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': true, 'breadcrumbs.enabled': false, 'window.commandCenter': false, 'workbench.tree.indent': 10, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': false, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 0 },
  orbit: { 'workbench.activityBar.location': 'default', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'visibleInWorkspace', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': true, 'window.commandCenter': true, 'workbench.tree.indent': 12, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': true, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 8 },
  aurora: { 'workbench.activityBar.location': 'top', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'visibleInWorkspace', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': true, 'window.commandCenter': true, 'workbench.tree.indent': 12, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': true, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 8 },
  sunset: { 'workbench.activityBar.location': 'bottom', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'visibleInWorkspace', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': false, 'window.commandCenter': true, 'workbench.tree.indent': 16, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'line', 'editor.stickyScroll.enabled': false, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 10 },
  terminal: { 'workbench.activityBar.location': 'hidden', 'workbench.sideBar.location': 'right', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': false, 'window.commandCenter': false, 'workbench.tree.indent': 10, 'editor.lineNumbers': 'relative', 'editor.cursorStyle': 'block', 'editor.stickyScroll.enabled': false, 'workbench.editor.tabSizing': 'shrink', 'editor.padding.top': 0 },
  mono: { 'workbench.activityBar.location': 'top', 'workbench.sideBar.location': 'left', 'workbench.secondarySideBar.defaultVisibility': 'hidden', 'editor.minimap.enabled': false, 'breadcrumbs.enabled': false, 'window.commandCenter': true, 'workbench.tree.indent': 12, 'editor.lineNumbers': 'on', 'editor.cursorStyle': 'underline', 'editor.stickyScroll.enabled': false, 'workbench.editor.tabSizing': 'fit', 'editor.padding.top': 6 }
}

const PARTS = '.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar,.monaco-workbench .part.panel,.monaco-workbench .part.editor'
const TAB = '.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab'
const NO_TAB_LINES = `${TAB} .tab-border-top-container,${TAB} .tab-border-bottom-container{display:none!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title.tabs>.tabs-and-actions-container.tabs-border-bottom::after{display:none!important}`
const NO_SASH = '.monaco-workbench .sash:not(.active):not(:hover){background:transparent!important}'
const NO_INDICATOR = '.monaco-workbench .activitybar .active-item-indicator{display:none!important}'

const SHARED = `
.monaco-workbench .part.panel.bottom .composite.title{border-top:0!important}
.monaco-workbench .pane-header{border-top:0!important}
.monaco-workbench .monaco-scrollable-element>.scrollbar>.slider{border-radius:6px}
.monaco-workbench .part.editor .editor-group-watermark .letterpress{opacity:.3}
`

// Soft glass cards on a glowing backdrop, with the AI panel open on the right.
const AURORA = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 8%,transparent);--lc-glow:var(--vscode-focusBorder);background:radial-gradient(70% 55% at 6% -4%,color-mix(in srgb,var(--lc-glow) 26%,transparent),transparent 70%),radial-gradient(55% 60% at 104% 104%,color-mix(in srgb,var(--lc-glow) 16%,transparent),transparent 72%),var(--vscode-titleBar-activeBackground)!important}
${PARTS}{clip-path:inset(0 7px 8px 7px round 12px);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--vscode-foreground) 9%,transparent)}
.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar{background:color-mix(in srgb,var(--vscode-sideBar-background) 78%,transparent)!important}
.monaco-workbench .part.activitybar{background:transparent!important}
.monaco-workbench .activitybar .action-item .action-label{border-radius:12px}
.monaco-workbench .activitybar .action-item.checked .action-label,.monaco-workbench .activitybar .action-item:hover .action-label{background:color-mix(in srgb,var(--lc-glow) 18%,transparent)}
${NO_INDICATOR}
${TAB}{border:0!important;margin:6px 0 0 5px;height:30px!important;border-radius:999px!important;padding:0 6px}
${TAB}.active{background:color-mix(in srgb,var(--lc-glow) 16%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lc-glow) 42%,transparent),0 6px 18px -8px var(--lc-glow)}
${TAB}:not(.active){background:transparent!important}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .split-view-view>.pane>.pane-header{border-radius:10px;margin:0 8px}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:color-mix(in srgb,var(--vscode-editor-background) 60%,transparent)!important;backdrop-filter:blur(14px);border:1px solid var(--lc-line)!important;height:27px!important;border-radius:999px!important;width:42vw!important;max-width:560px}
.monaco-workbench .part.titlebar .command-center .command-center-center:hover{border-color:color-mix(in srgb,var(--lc-glow) 60%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--lc-glow) 16%,transparent)}
.monaco-workbench .part.statusbar{clip-path:inset(3px 12px 5px 12px round 10px);background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)!important;color:var(--vscode-descriptionForeground)!important;font-size:11.5px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:999px}
.monaco-workbench .monaco-button{border-radius:999px!important}
.monaco-workbench .quick-input-widget{border-radius:14px!important;backdrop-filter:blur(24px)}
${SHARED}`

// Aurora's glass with a warm glow, bigger corners, and the icon bar along the bottom.
const SUNSET = `${AURORA}
.monaco-workbench{--lc-glow:#ff8a5c;background:radial-gradient(70% 60% at 0% -6%,rgba(255,122,92,.34),transparent 70%),radial-gradient(60% 65% at 104% 0%,rgba(192,76,255,.26),transparent 70%),radial-gradient(70% 60% at 50% 112%,rgba(255,184,107,.2),transparent 70%),var(--vscode-titleBar-activeBackground)!important}
${PARTS}{clip-path:inset(0 8px 9px 8px round 14px)}
.monaco-workbench .part.statusbar{clip-path:inset(3px 14px 6px 14px round 10px)}
.monaco-workbench .quick-input-widget{border-radius:16px!important}`

// A classic IDE: narrow tool strip, grey flat panels with thin borders, underlined tabs.
const STUDIO = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 12%,transparent);background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.activitybar{width:40px;background:var(--vscode-titleBar-activeBackground)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .activitybar .action-item .action-label{border-radius:6px}
.monaco-workbench .activitybar .action-item.checked .action-label{background:color-mix(in srgb,var(--vscode-button-background) 28%,transparent);color:var(--vscode-foreground)!important}
${NO_INDICATOR}
.monaco-workbench .part.sidebar{background:var(--vscode-titleBar-activeBackground)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important}
.monaco-workbench .part.titlebar{border-bottom:1px solid var(--lc-line)!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{font-weight:600!important;font-size:12px;text-transform:none!important}
${TAB}{border:0!important;margin:0;height:34px!important;border-radius:0!important;background:transparent!important;border-right:1px solid var(--lc-line)!important}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 -3px 0 var(--vscode-button-background)}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;border-top:1px solid var(--lc-line)!important;color:var(--vscode-descriptionForeground)!important;font-size:11.5px;height:24px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:3px}
.monaco-workbench .monaco-button{border-radius:4px!important}
.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-list .monaco-list-row{border-radius:3px}
.monaco-workbench .quick-input-widget{border-radius:6px!important}
.monaco-workbench .breadcrumbs-control{border-bottom:1px solid var(--lc-line)}
${SHARED}`

// VS Code's own arrangement: wide icon bar with a marker, tabs with a top line, bold status bar.
const CLASSIC = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 12%,transparent);background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.activitybar{background:var(--vscode-sideBar-background)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.sidebar{border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important}
.monaco-workbench .part.titlebar{border-bottom:1px solid var(--lc-line)!important}
${TAB}{border:0!important;margin:0;height:35px!important;border-radius:0!important;border-right:1px solid var(--lc-line)!important}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 1px 0 var(--vscode-button-background)}
${TAB}:not(.active){background:color-mix(in srgb,var(--vscode-foreground) 4%,transparent)!important}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.statusbar{background:var(--vscode-button-background)!important;color:var(--vscode-button-foreground)!important;font-size:12px;height:22px}
.monaco-workbench .part.statusbar .statusbar-item,.monaco-workbench .part.statusbar .statusbar-item a{color:var(--vscode-button-foreground)!important}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:0}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:color-mix(in srgb,var(--vscode-foreground) 6%,transparent)!important;border:1px solid var(--lc-line)!important;height:24px!important;border-radius:6px!important;width:36vw!important;max-width:520px}
.monaco-workbench .monaco-button{border-radius:2px!important}
${SHARED}`

// Zed-like: no icon bar, quiet chrome, soft tabs, a tiny status bar.
const ZEN = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 7%,transparent);background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.sidebar{background:var(--vscode-titleBar-activeBackground)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important;background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important;background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.titlebar{border-bottom:0!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{font-weight:500!important;font-size:11.5px;color:var(--vscode-descriptionForeground)}
.monaco-workbench .part.editor>.content .editor-group-container>.title{background:var(--vscode-titleBar-activeBackground)!important}
${TAB}{border:0!important;margin:4px 2px 0 4px;height:28px!important;border-radius:6px!important;background:transparent!important;font-size:12px;opacity:.7}
${TAB}.active{background:var(--vscode-editor-background)!important;opacity:1}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;color:var(--vscode-descriptionForeground)!important;font-size:10.5px;height:20px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:4px}
.monaco-workbench .monaco-button{border-radius:6px!important}
.monaco-workbench .monaco-list .monaco-list-row{border-radius:5px}
.monaco-workbench .quick-input-widget{border-radius:10px!important}
${SHARED}`

// Terminal: hard edges, accent frames, monospace everywhere.
const TERMINAL = `
.monaco-workbench,.monaco-workbench .part,.monaco-workbench .monaco-list,.monaco-workbench .monaco-menu,.monaco-workbench .quick-input-widget{font-family:ui-monospace,'SF Mono',Menlo,monospace!important;letter-spacing:0}
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 12%,transparent);--lc-edge:var(--vscode-button-background);background:var(--vscode-titleBar-activeBackground)!important;font-size:12.5px}
${PARTS}{clip-path:inset(0 1px 1px 1px round 0);box-shadow:inset 0 0 0 1px var(--lc-line)}
.monaco-workbench .part.editor{box-shadow:inset 0 2px 0 var(--lc-edge),inset 0 0 0 1px var(--lc-line)}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{text-transform:uppercase!important;font-size:10px!important;letter-spacing:.09em!important;font-weight:600}
${TAB}{border:0!important;margin:0 1px 0 0;height:32px!important;border-radius:0!important;background:color-mix(in srgb,var(--vscode-foreground) 4%,transparent)!important;font-size:12px}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 2px 0 var(--lc-edge)}
${TAB}.active::before{content:'> ';opacity:.8;color:var(--lc-edge)}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:transparent!important;border:1px solid var(--lc-line)!important;height:24px!important;border-radius:0!important}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;box-shadow:inset 0 1px 0 var(--lc-edge),0 -6px 22px -10px var(--lc-edge);font-size:10.5px;height:22px;color:var(--vscode-foreground)!important}
.monaco-workbench .monaco-button,.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-list .monaco-list-row,.monaco-workbench .monaco-inputbox,.monaco-workbench .quick-input-widget,.monaco-workbench .monaco-menu-container,.context-view .monaco-menu,.monaco-workbench .notifications-toasts .notification-toast{border-radius:0!important}
${SHARED}`

// Mono: black and white only. Inverted status bar and active tab, hairlines, outlined buttons.
const MONO = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 28%,transparent);background:var(--vscode-editor-background)!important}
.monaco-workbench .part.titlebar,.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar,.monaco-workbench .part.panel,.monaco-workbench .part.editor,.monaco-workbench .part.activitybar{background:var(--vscode-editor-background)!important}
.monaco-workbench .part.sidebar{border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part.titlebar{border-bottom:1px solid var(--lc-line)!important}
.monaco-workbench .activitybar .action-item .action-label{border-radius:0}
.monaco-workbench .activitybar .action-item.checked .action-label{background:var(--vscode-foreground);color:var(--vscode-editor-background)!important}
${NO_INDICATOR}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{text-transform:uppercase!important;font-size:10.5px!important;letter-spacing:.12em!important;font-weight:600}
${TAB}{border:0!important;margin:0;height:32px!important;border-radius:0!important;background:transparent!important;border-right:1px solid var(--lc-line)!important}
${TAB}.active{background:var(--vscode-foreground)!important;color:var(--vscode-editor-background)!important}
${TAB}.active *{color:var(--vscode-editor-background)!important}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.statusbar{background:var(--vscode-foreground)!important;color:var(--vscode-editor-background)!important;font-size:11px;height:22px}
.monaco-workbench .part.statusbar .statusbar-item,.monaco-workbench .part.statusbar .statusbar-item a{color:var(--vscode-editor-background)!important}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:transparent!important;border:1px solid var(--vscode-foreground)!important;height:24px!important;border-radius:0!important}
.monaco-workbench .monaco-button{background:transparent!important;color:var(--vscode-foreground)!important;border:1px solid var(--vscode-foreground)!important;border-radius:0!important}
.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-list .monaco-list-row,.monaco-workbench .quick-input-widget,.monaco-workbench .monaco-inputbox{border-radius:0!important}
.monaco-workbench .quick-input-widget{border:1px solid var(--vscode-foreground)!important}
${SHARED}`

// Notepad++-like: light grey chrome, coloured tab bars, a ruled status bar, no icon bar.
const NOTEPAD = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 18%,transparent);background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.titlebar{border-bottom:1px solid var(--lc-line)!important}
.monaco-workbench .part.sidebar{background:var(--vscode-titleBar-activeBackground)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{text-transform:none!important;font-weight:600!important;font-size:12px}
.monaco-workbench .part.editor>.content .editor-group-container>.title{background:var(--vscode-titleBar-activeBackground)!important;border-bottom:1px solid var(--lc-line)}
${TAB}{border:1px solid var(--lc-line)!important;border-bottom:0!important;margin:4px 2px 0 0;height:25px!important;border-radius:3px 3px 0 0!important;background:color-mix(in srgb,var(--vscode-foreground) 5%,var(--vscode-titleBar-activeBackground))!important;font-size:12px}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 3px 0 var(--vscode-button-background);height:27px!important;margin-top:2px}
${NO_TAB_LINES}
${NO_SASH}
.monaco-editor .margin{background:color-mix(in srgb,var(--vscode-foreground) 6%,var(--vscode-editor-background))!important}
.monaco-editor .current-line{background:color-mix(in srgb,var(--vscode-button-background) 12%,transparent)!important;border:0!important}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;border-top:1px solid var(--lc-line)!important;color:var(--vscode-foreground)!important;font-size:11.5px;height:22px}
.monaco-workbench .part.statusbar .statusbar-item{border-right:1px solid var(--lc-line)}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:0}
.monaco-workbench .monaco-button,.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-widget,.monaco-workbench .monaco-inputbox{border-radius:2px!important}
${SHARED}`

// Sublime-like: warm dark, no lines, no icon bar, the minimap on.
const EMBER = `
.monaco-workbench{background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.sidebar,.monaco-workbench .part.panel,.monaco-workbench .part.auxiliarybar{background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.titlebar{border-bottom:0!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{text-transform:none!important;font-weight:500!important;font-size:11.5px;color:var(--vscode-descriptionForeground)}
.monaco-workbench .part.editor>.content .editor-group-container>.title{background:var(--vscode-titleBar-activeBackground)!important}
${TAB}{border:0!important;margin:0 1px 0 0;height:32px!important;border-radius:0!important;background:color-mix(in srgb,var(--vscode-foreground) 5%,var(--vscode-titleBar-activeBackground))!important;font-size:12px;opacity:.75}
${TAB}.active{background:var(--vscode-editor-background)!important;opacity:1}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;color:var(--vscode-descriptionForeground)!important;font-size:11px;height:22px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:0}
.monaco-workbench .monaco-button{border-radius:3px!important}
.monaco-workbench .quick-input-widget{border-radius:6px!important}
${SHARED}`

// Antigravity-like: flat dark panels, a wide agent panel on the right, gradient accents.
const ORBIT = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 9%,transparent);--lc-grad:linear-gradient(90deg,#4285f4,#a142f4);background:var(--vscode-titleBar-activeBackground)!important}
.monaco-workbench .part.sidebar{border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important;background:color-mix(in srgb,var(--vscode-sideBar-background) 88%,#4285f4)!important;box-shadow:inset 0 2px 0 transparent,inset 0 1px 0 var(--lc-line);border-image:none}
.monaco-workbench .part.auxiliarybar::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:var(--lc-grad);z-index:5;pointer-events:none}
.monaco-workbench .part.titlebar{border-bottom:1px solid var(--lc-line)!important}
.monaco-workbench .part.activitybar{background:var(--vscode-titleBar-activeBackground)!important;border-right:1px solid var(--lc-line)!important}
.monaco-workbench .activitybar .action-item .action-label{border-radius:10px}
.monaco-workbench .activitybar .action-item.checked .action-label{background:color-mix(in srgb,#4285f4 22%,transparent)}
${NO_INDICATOR}
${TAB}{border:0!important;margin:5px 2px 0 3px;height:30px!important;border-radius:9px 9px 0 0!important;background:transparent!important}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 -2px 0 transparent;background-image:var(--lc-grad);background-size:100% 2px;background-repeat:no-repeat;background-position:bottom;background-color:var(--vscode-editor-background)!important}
${NO_TAB_LINES}
${NO_SASH}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:var(--vscode-editor-background)!important;border:1px solid transparent!important;background-image:linear-gradient(var(--vscode-editor-background),var(--vscode-editor-background)),var(--lc-grad);background-origin:border-box;background-clip:padding-box,border-box;height:27px!important;border-radius:999px!important;width:40vw!important;max-width:540px}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;color:var(--vscode-descriptionForeground)!important;font-size:11.5px;height:23px;box-shadow:inset 0 1px 0 var(--lc-line)}
.monaco-workbench .monaco-button{background-image:var(--lc-grad)!important;border-radius:8px!important;color:#fff!important}
.monaco-workbench .quick-input-widget{border-radius:14px!important}
${SHARED}`

export const lookCss = (look: CodeLook): string =>
  ({ studio: STUDIO, classic: CLASSIC, zen: ZEN, notepad: NOTEPAD, ember: EMBER, aurora: AURORA, orbit: ORBIT, sunset: SUNSET, terminal: TERMINAL, mono: MONO })[look] ?? AURORA
