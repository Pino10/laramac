/**
 * The three looks of Laramac Code. Each one is a different layout of the same editor, not just a
 * different colour: Aurora floats soft glass cards on a glowing backdrop, Paper is one calm flat
 * page with almost no lines, and Carbon is a dense, sharp-edged console. The colours still come
 * from the Laramac Studio theme and the accent chosen in Laramac.
 */

export type CodeLook = 'aurora' | 'paper' | 'carbon' | 'sunset' | 'terminal'

export const CODE_LOOKS: { id: CodeLook; name: string; about: string }[] = [
  { id: 'aurora', name: 'Aurora', about: 'Soft floating glass cards on a glowing backdrop. Rounded and friendly.' },
  { id: 'paper', name: 'Paper', about: 'One calm, flat page with almost no lines. Quiet and spacious.' },
  { id: 'carbon', name: 'Carbon', about: 'Dense and sharp, with accent edges. Made for long sessions and big screens.' },
  { id: 'sunset', name: 'Sunset', about: 'Warm plum and amber glow, big soft corners. Its own colours.' },
  { id: 'terminal', name: 'Terminal', about: 'Green on near-black, monospace everywhere, hard edges. Its own colours.' }
]

export const isCodeLook = (v: unknown): v is CodeLook => typeof v === 'string' && CODE_LOOKS.some((l) => l.id === v)

/** The window colour shown while the editor loads, so there is no white flash. */
export const LOOK_BACKGROUND: Record<CodeLook, { dark: string; light: string }> = {
  aurora: { dark: '#070913', light: '#eef1f9' },
  paper: { dark: '#181613', light: '#fbf8f2' },
  carbon: { dark: '#030304', light: '#d9dce2' },
  sunset: { dark: '#0d070c', light: '#f6e3da' },
  terminal: { dark: '#010302', light: '#d5e8da' }
}

const PARTS = '.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar,.monaco-workbench .part.panel,.monaco-workbench .part.editor'
const TAB = '.monaco-workbench .part.editor>.content .editor-group-container>.title .tabs-container>.tab'
const NO_TAB_LINES = `${TAB} .tab-border-top-container,${TAB} .tab-border-bottom-container{display:none!important}
.monaco-workbench .part.editor>.content .editor-group-container>.title.tabs>.tabs-and-actions-container.tabs-border-bottom::after{display:none!important}`

const SHARED = `
.monaco-workbench .part.panel.bottom .composite.title{border-top:0!important}
.monaco-workbench .pane-header{border-top:0!important}
.monaco-workbench .monaco-scrollable-element>.scrollbar>.slider{border-radius:6px}
.monaco-workbench .part.editor .editor-group-watermark .letterpress{opacity:.3}
`

const AURORA = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 8%,transparent);--lc-glow:var(--vscode-focusBorder);background:radial-gradient(70% 55% at 6% -4%,color-mix(in srgb,var(--lc-glow) 26%,transparent),transparent 70%),radial-gradient(55% 60% at 104% 104%,color-mix(in srgb,var(--lc-glow) 16%,transparent),transparent 72%),var(--vscode-titleBar-activeBackground)!important}
${PARTS}{clip-path:inset(0 7px 8px 7px round 18px);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--vscode-foreground) 9%,transparent)}
.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar{background:color-mix(in srgb,var(--vscode-sideBar-background) 78%,transparent)!important}
.monaco-workbench .part.editor>.content{background:var(--vscode-editor-background)}
.monaco-workbench .part.activitybar{background:transparent!important}
.monaco-workbench .activitybar .action-item .action-label{border-radius:12px}
.monaco-workbench .activitybar .action-item.checked .action-label,.monaco-workbench .activitybar .action-item:hover .action-label{background:color-mix(in srgb,var(--lc-glow) 18%,transparent)}
.monaco-workbench .activitybar>.content :not(.monaco-menu)>.monaco-action-bar .action-item.checked .active-item-indicator:before,.monaco-workbench .activitybar .active-item-indicator{display:none!important}
${TAB}{border:0!important;margin:6px 0 0 5px;height:30px!important;border-radius:999px!important;padding:0 6px}
${TAB}.active{background:color-mix(in srgb,var(--lc-glow) 16%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lc-glow) 42%,transparent),0 6px 18px -8px var(--lc-glow)}
${TAB}:not(.active){background:transparent!important}
${NO_TAB_LINES}
.monaco-workbench .sash:not(.active):not(:hover){background:transparent!important}
.monaco-workbench .split-view-view>.pane>.pane-header{border-radius:10px;margin:0 8px}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:color-mix(in srgb,var(--vscode-editor-background) 60%,transparent)!important;backdrop-filter:blur(14px);border:1px solid var(--lc-line)!important;height:27px!important;border-radius:999px!important;width:42vw!important;max-width:560px}
.monaco-workbench .part.titlebar .command-center .command-center-center:hover{border-color:color-mix(in srgb,var(--lc-glow) 60%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--lc-glow) 16%,transparent)}
.monaco-workbench .part.statusbar{clip-path:inset(3px 12px 5px 12px round 999px);background:color-mix(in srgb,var(--vscode-editor-background) 72%,transparent)!important;color:var(--vscode-descriptionForeground)!important;font-size:11.5px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:999px}
.monaco-workbench .quick-input-widget{border-radius:20px!important;backdrop-filter:blur(24px)}
${SHARED}`

const PAPER = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 6%,transparent);background:var(--vscode-editor-background)!important}
.monaco-workbench .part.titlebar,.monaco-workbench .part.sidebar,.monaco-workbench .part.auxiliarybar,.monaco-workbench .part.panel,.monaco-workbench .part.editor,.monaco-workbench .part.activitybar,.monaco-workbench .part.statusbar{background:var(--vscode-editor-background)!important}
.monaco-workbench .part.sidebar{border-right:1px solid var(--lc-line)!important}
.monaco-workbench .part.auxiliarybar{border-left:1px solid var(--lc-line)!important}
.monaco-workbench .part.panel{border-top:1px solid var(--lc-line)!important}
.monaco-workbench .part.activitybar{width:46px}
.monaco-workbench .activitybar .action-item .action-label{border-radius:8px;opacity:.7}
.monaco-workbench .activitybar .action-item.checked .action-label,.monaco-workbench .activitybar .action-item:hover .action-label{opacity:1}
.monaco-workbench .activitybar .active-item-indicator{display:none!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{font-weight:500!important;font-size:11.5px;color:var(--vscode-descriptionForeground)}
${TAB}{border:0!important;margin:0 6px;height:36px!important;border-radius:0!important;background:transparent!important;opacity:.62;font-weight:400}
${TAB}.active{opacity:1;box-shadow:inset 0 -2px 0 var(--vscode-focusBorder)}
${NO_TAB_LINES}
.monaco-workbench .sash:not(.active):not(:hover){background:transparent!important}
.monaco-workbench .part.titlebar{border-bottom:0!important}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:transparent!important;border:0!important;height:26px!important;border-radius:8px!important;width:34vw!important;max-width:460px;color:var(--vscode-descriptionForeground)}
.monaco-workbench .part.titlebar .command-center .command-center-center:hover{background:color-mix(in srgb,var(--vscode-foreground) 6%,transparent)!important}
.monaco-workbench .part.statusbar{border-top:1px solid var(--lc-line)!important;color:var(--vscode-descriptionForeground)!important;font-size:11px;height:24px}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:4px}
.monaco-workbench .monaco-list .monaco-list-row{border-radius:6px}
.monaco-workbench .quick-input-widget{border-radius:12px!important}
${SHARED}`

const CARBON = `
.monaco-workbench{--lc-line:color-mix(in srgb,var(--vscode-foreground) 12%,transparent);--lc-edge:var(--vscode-focusBorder);background:var(--vscode-titleBar-activeBackground)!important;font-size:12.5px}
${PARTS}{clip-path:inset(0 2px 2px 2px round 4px);box-shadow:inset 0 0 0 1px var(--lc-line)}
.monaco-workbench .part.editor{box-shadow:inset 0 2px 0 var(--lc-edge),inset 0 0 0 1px var(--lc-line)}
.monaco-workbench .part.activitybar{background:var(--vscode-titleBar-activeBackground)!important;width:44px}
.monaco-workbench .activitybar .action-item .action-label{border-radius:3px}
.monaco-workbench .activitybar .action-item.checked .action-label{color:var(--lc-edge)!important;background:color-mix(in srgb,var(--lc-edge) 14%,transparent)}
.monaco-workbench .activitybar .active-item-indicator{display:none!important}
.monaco-workbench .part>.title .title-label h2,.monaco-workbench .pane-header .title{text-transform:uppercase!important;font-size:10px!important;letter-spacing:.09em!important;font-weight:600}
${TAB}{border:0!important;margin:0 1px 0 0;height:32px!important;border-radius:0!important;background:color-mix(in srgb,var(--vscode-foreground) 4%,transparent)!important;font-size:12px}
${TAB}.active{background:var(--vscode-editor-background)!important;box-shadow:inset 0 2px 0 var(--lc-edge)}
${NO_TAB_LINES}
.monaco-workbench .sash:not(.active):not(:hover){background:transparent!important}
.monaco-workbench .split-view-view>.pane>.pane-header{border-radius:3px;margin:0 3px;background:color-mix(in srgb,var(--vscode-foreground) 5%,transparent)!important}
.monaco-workbench .part.titlebar .command-center .command-center-center{background:color-mix(in srgb,var(--vscode-foreground) 5%,transparent)!important;border:1px solid var(--lc-line)!important;height:24px!important;border-radius:3px!important;width:38vw!important;max-width:520px}
.monaco-workbench .part.titlebar .command-center .command-center-center:hover{border-color:var(--lc-edge)!important}
.monaco-workbench .part.statusbar{background:linear-gradient(90deg,color-mix(in srgb,var(--lc-edge) 22%,var(--vscode-titleBar-activeBackground)),var(--vscode-titleBar-activeBackground) 60%)!important;box-shadow:inset 0 1px 0 var(--lc-edge);font-family:ui-monospace,'SF Mono',Menlo,monospace!important;font-size:10.5px;height:22px;color:var(--vscode-foreground)!important}
.monaco-workbench .part.statusbar .statusbar-item .statusbar-item-label{border-radius:2px}
.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-list .monaco-list-row{border-radius:3px}
.monaco-workbench .quick-input-widget,.monaco-workbench .monaco-menu-container,.context-view .monaco-menu,.monaco-workbench .monaco-menu .actions-container,.monaco-workbench .notifications-toasts .notification-toast,.monaco-workbench .notifications-center{border-radius:5px!important}
.monaco-workbench .monaco-button{border-radius:3px!important}
${SHARED}`

// Sunset is Aurora's layout with bigger corners and its own warm glow.
const SUNSET = `${AURORA}
.monaco-workbench{--lc-glow:#ff8a5c;background:radial-gradient(70% 60% at 0% -6%,rgba(255,122,92,.34),transparent 70%),radial-gradient(60% 65% at 104% 0%,rgba(192,76,255,.26),transparent 70%),radial-gradient(70% 60% at 50% 112%,rgba(255,184,107,.2),transparent 70%),var(--vscode-titleBar-activeBackground)!important}
${PARTS}{clip-path:inset(0 8px 9px 8px round 26px)}
.monaco-workbench .part.statusbar{clip-path:inset(3px 14px 6px 14px round 999px)}
.monaco-workbench .quick-input-widget{border-radius:24px!important}`

// Terminal is Carbon's layout with monospace everywhere and phosphor-green edges.
const TERMINAL = `${CARBON}
.monaco-workbench,.monaco-workbench .part,.monaco-workbench .monaco-list,.monaco-workbench .monaco-menu,.monaco-workbench .quick-input-widget{font-family:ui-monospace,'SF Mono',Menlo,monospace!important;letter-spacing:0}
${PARTS}{clip-path:inset(0 1px 1px 1px round 0)}
${TAB}.active::before{content:'> ';opacity:.8;color:var(--lc-edge)}
.monaco-workbench .monaco-button,.monaco-workbench .monaco-list .monaco-list-row,.monaco-workbench .quick-input-widget,.monaco-workbench .monaco-inputbox{border-radius:0!important}
.monaco-workbench .part.statusbar{background:var(--vscode-titleBar-activeBackground)!important;box-shadow:inset 0 1px 0 var(--lc-edge),0 -6px 22px -10px var(--lc-edge)}`

export const lookCss = (look: CodeLook): string => (look === 'paper' ? PAPER : look === 'carbon' ? CARBON : look === 'sunset' ? SUNSET : look === 'terminal' ? TERMINAL : AURORA)
