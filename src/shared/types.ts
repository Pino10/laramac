export type ServiceId = 'nginx' | 'apache' | 'php' | 'mysql' | 'mailpit'

export type ServiceStatus = 'not-installed' | 'stopped' | 'starting' | 'running' | 'error'

export interface ServiceInfo {
  id: ServiceId
  name: string
  description: string
  status: ServiceStatus
  port?: number
  version?: string
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
  httpPort: number
  httpsPort: number
  apachePort: number
  apacheHttpsPort: number
  shareProvider: 'cloudflare' | 'ngrok'
  ngrokToken: string
  editor: 'cursor' | 'vscode'
  siteConfig: Record<string, SiteConfig>
  llm: LlmConfig
}

export interface ToolsStatus {
  dnsReady: boolean
  caTrusted: boolean
  phpmyadmin: boolean
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
  'tools:install': { args: ['phpmyadmin' | 'cloudflared' | 'ngrok' | 'composer']; result: ToolsStatus }
  'tools:install-claude': { args: []; result: void }
  'tools:open-external': { args: [string]; result: void }
  'ai:detect': { args: []; result: LocalLlm[] }
  'ai:chat': { args: [ChatMessage[]]; result: string }
}

export type ChannelName = keyof Channels

export interface Events {
  'services:changed': ServiceInfo[]
  'jobs:changed': JobInfo[]
  'sites:changed': SiteInfo[]
}

export interface LaramacApi {
  invoke: <K extends ChannelName>(
    channel: K,
    ...args: Channels[K]['args']
  ) => Promise<Channels[K]['result']>
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => () => void
  platform: string
}
