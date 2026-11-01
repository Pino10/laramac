export type ServiceId =
  | 'nginx'
  | 'apache'
  | 'php'
  | 'mysql'
  | 'mariadb'
  | 'postgres'
  | 'redis'
  | 'mongodb'
  | 'mailpit'

export type ServiceGroup = 'web' | 'runtime' | 'database' | 'mail'

export type ServiceStatus = 'not-installed' | 'stopped' | 'starting' | 'running' | 'error'

export interface ServiceInfo {
  id: ServiceId
  name: string
  description: string
  status: ServiceStatus
  group: ServiceGroup
  port?: number
  version?: string
  /** How apps connect, for example "127.0.0.1:5432, user postgres". */
  connection?: string
  error?: string
}

export type SiteKind = 'laravel' | 'wordpress' | 'symfony' | 'php' | 'static' | 'node'

export interface SiteConfig {
  /** PHP minor version like "8.3", or undefined to use the default. */
  php?: string
  secure?: boolean
}

export interface SiteInfo {
  name: string
  path: string
  docRoot: string
  domain: string
  url: string
  httpsUrl: string
  kind: SiteKind
  secure: boolean
  /** PHP minor version actually used, or null when none is installed. */
  php: string | null
  shareUrl?: string
}

export interface PhpVersionInfo {
  minor: string
  latest: string
  installed: string | null
  isDefault: boolean
}

export interface JobInfo {
  id: string
  label: string
  /** 0-100, or null when the size is unknown. */
  percent: number | null
  status: 'running' | 'done' | 'error'
  error?: string
}

export interface ActivityItem {
  id: string
  at: number
  kind: 'info' | 'success' | 'error'
  title: string
  body?: string
}

/** How the window is drawn: native Liquid Glass (macOS 26), classic vibrancy, or plain. */
export type Material = 'liquid-glass' | 'vibrancy' | 'none'

export interface AppInfo {
  material: Material
  platform: string
  version: string
}

export interface LlmConfig {
  baseUrl: string
  model: string
}

export interface AppSettings {
  wwwPath: string
  tld: string
  glass: boolean
  defaultPhp: string | null
  phpFlavor: 'full' | 'light'
  mysqlVersion: string
  postgresMajor: string
  httpPort: number
  httpsPort: number
  apachePort: number
  apacheHttpsPort: number
  shareProvider: 'cloudflare' | 'ngrok'
  ngrokToken: string
  editor: 'cursor' | 'vscode'
  /** Let phones and other computers on the network open your sites. Off by default. */
  allowLan: boolean
  notifications: boolean
  siteConfig: Record<string, SiteConfig>
  llm: LlmConfig
}

export interface ToolsStatus {
  dnsReady: boolean
  caTrusted: boolean
  phpmyadmin: boolean
  adminer: boolean
  cloudflared: boolean
  ngrok: boolean
  composer: boolean
  homebrew: boolean
  editors: { cursor: boolean; vscode: boolean }
  claude: boolean
  platform: string
}

export interface LocalLlm {
  provider: 'Ollama' | 'LM Studio' | 'Custom'
  baseUrl: string
  models: string[]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ProjectKind = 'blank' | 'wordpress' | 'laravel'

/** What Laramac found inside a file or folder chosen for import. */
export interface ImportPlan {
  id: string
  sourceName: string
  hasProject: boolean
  suggestedName: string
  kind: SiteKind | null
  sqlFiles: { path: string; size: number }[]
  suggestedDb: string
  /** Installed engines that can take a MySQL dump. */
  engines: ('mysql' | 'mariadb')[]
  oldUrl: string | null
  configFile: 'wp-config.php' | '.env' | null
  hasVendor: boolean
  warnings: string[]
}

export interface ImportAnswers {
  name: string
  sqlFile: string | null
  engine: 'mysql' | 'mariadb'
  database: string
  updateConfig: boolean
  replaceUrl: boolean
  composerInstall: boolean
}

export interface ImportResult {
  site: string | null
  database: string | null
  skipped: number
  sites: SiteInfo[]
}

/** Every request the renderer can make to the main process. */
export interface Channels {
  'settings:get': { args: []; result: AppSettings }
  'settings:set': { args: [Partial<AppSettings>]; result: AppSettings }
  'services:list': { args: []; result: ServiceInfo[] }
  'services:toggle': { args: [ServiceId]; result: ServiceInfo[] }
  'services:install': { args: [ServiceId]; result: void }
  'services:start-all': { args: []; result: ServiceInfo[] }
  'services:stop-all': { args: []; result: ServiceInfo[] }
  'jobs:list': { args: []; result: JobInfo[] }
  'sites:list': { args: []; result: SiteInfo[] }
  'sites:set-config': { args: [string, SiteConfig]; result: SiteInfo[] }
  'sites:create': { args: [ProjectKind, string]; result: SiteInfo[] }
  'sites:open-folder': { args: [string]; result: void }
  'sites:open-url': { args: [string]; result: void }
  'sites:open-editor': { args: [string]; result: void }
  'sites:open-claude': { args: [string]; result: void }
  'sites:share': { args: [string]; result: string }
  'sites:unshare': { args: [string]; result: void }
  'www:reveal': { args: []; result: void }
  'php:list': { args: []; result: PhpVersionInfo[] }
  'php:install': { args: [string]; result: PhpVersionInfo[] }
  'php:remove': { args: [string]; result: PhpVersionInfo[] }
  'php:set-default': { args: [string]; result: PhpVersionInfo[] }
  'tools:status': { args: []; result: ToolsStatus }
  'tools:setup-dns': { args: []; result: ToolsStatus }
  'tools:trust-ca': { args: []; result: ToolsStatus }
  'tools:install': { args: ['phpmyadmin' | 'adminer' | 'cloudflared' | 'ngrok' | 'composer']; result: ToolsStatus }
  'tools:install-claude': { args: []; result: void }
  'tools:open-external': { args: [string]; result: void }
  'ai:detect': { args: []; result: LocalLlm[] }
  'ai:chat': { args: [ChatMessage[]]; result: string }
  'import:choose': { args: []; result: ImportPlan | null }
  'import:run': { args: [string, ImportAnswers]; result: ImportResult }
  'import:cancel': { args: [string]; result: void }
  'activity:list': { args: []; result: ActivityItem[] }
  'activity:clear': { args: []; result: ActivityItem[] }
  'app:info': { args: []; result: AppInfo }
}

export type ChannelName = keyof Channels

export interface Events {
  'services:changed': ServiceInfo[]
  'jobs:changed': JobInfo[]
  'sites:changed': SiteInfo[]
  'activity:changed': ActivityItem[]
}

export interface LaramacApi {
  invoke: <K extends ChannelName>(
    channel: K,
    ...args: Channels[K]['args']
  ) => Promise<Channels[K]['result']>
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => () => void
  platform: string
}
