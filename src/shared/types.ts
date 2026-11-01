export type ServiceId =
  | 'nginx'
  | 'apache'
  | 'php'
  | 'mysql'
  | 'mariadb'
  | 'postgres'
  | 'redis'
  | 'mongodb'
  | 'meilisearch'
  | 'memcached'
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
  /** Newest build Laramac can install right now. */
  latest: string
  /** Newest release on php.net, which may still be building. */
  upstream: string | null
  installed: string | null
  isDefault: boolean
  updateAvailable: boolean
  /** Compiled-in extensions of the installed build. */
  extensions: string[]
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

export interface UpdateInfo {
  version: string
  current: string
  notes: string
  publishedAt: string
  url: string
}

export interface ResetOptions {
  /** Preferences and per-site settings. */
  settings: boolean
  /** Downloaded PHP, servers and tools. */
  software: boolean
  /** All database contents. */
  data: boolean
  /** The .test resolver and the trusted local certificate. Needs your password. */
  system: boolean
}

export interface SetupReport {
  done: string[]
  failed: { step: string; error: string }[]
}

export interface AiTool {
  id: string
  name: string
  description: string
  /** null when the tool has no command-line version. */
  cli: { installed: boolean } | null
  /** null when the tool has no Mac app. */
  app: { installed: boolean } | null
  installed: boolean
  /** Apple Silicon only, needs Node.js, and so on. */
  note?: string
  available: boolean
}

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: 'agent' | 'key' | 'password'
  keyPath?: string
  hasPassword: boolean
  /** Pinned SHA-256 host key fingerprint, set the first time you trust the server. */
  hostKey?: string
}

export interface SshServerInput {
  id?: string
  name: string
  host: string
  port: number
  user: string
  auth: 'agent' | 'key' | 'password'
  keyPath?: string
  /** Only sent when changed; stored encrypted with the macOS Keychain. */
  password?: string
}

export interface SftpEntry {
  name: string
  type: 'file' | 'dir' | 'link' | 'other'
  size: number
  modified: number
}

export interface SftpListing {
  path: string
  entries: SftpEntry[]
}

export interface McpStatus {
  enabled: boolean
  running: boolean
  url: string
  /** The command other tools can use to connect, with the token. */
  command: string
  claude: 'connected' | 'not-connected' | 'not-installed'
  error: string | null
}

export interface SnapshotInfo {
  id: string
  site: string
  note: string
  createdAt: number
  bytes: number
  database: { engine: 'mysql' | 'mariadb'; name: string } | null
  /** Why the database was left out, when the site has one. */
  databaseSkipped: string | null
}

export interface PackageInfo {
  id: string
  group: 'php' | 'database' | 'tool' | 'brew' | 'cache'
  name: string
  detail: string
  bytes: number
}

export interface DatabaseInfo {
  engine: 'mysql' | 'mariadb'
  name: string
  tables: number
  bytes: number
  rows: number
}

export type SshShellResult = { status: 'connected'; session: string } | { status: 'unknown-host'; fingerprint: string }

export type SftpConnectResult =
  | { status: 'connected'; session: string; home: string }
  | { status: 'unknown-host'; fingerprint: string }

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
  /** The web server on the standard ports. Apache by default. */
  primaryServer: 'apache' | 'nginx'
  /** Ports of the primary web server. */
  httpPort: number
  httpsPort: number
  /** Ports of the other web server, so both can run together. */
  secondaryHttpPort: number
  secondaryHttpsPort: number
  shareProvider: 'cloudflare' | 'ngrok'
  ngrokToken: string
  editor: 'cursor' | 'vscode'
  /** Let phones and other computers on the network open your sites. Off by default. */
  allowLan: boolean
  notifications: boolean
  autoUpdateCheck: boolean
  /** Lets Claude Code and other AI tools work with Laramac over MCP. */
  mcpEnabled: boolean
  /** Which AI coding tool the per-site button opens. */
  aiTool: string
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
  'app:check-update': { args: []; result: UpdateInfo | null }
  'app:install-update': { args: []; result: void }
  'app:reset': { args: [ResetOptions]; result: void }
  'settings:choose-www': { args: []; result: AppSettings | null }
  'php:edit-ini': { args: [string]; result: void }
  'setup:recommended': { args: []; result: SetupReport }
  'ai:tools': { args: []; result: AiTool[] }
  'ai:install-tool': { args: [string, 'cli' | 'app']; result: void }
  'ai:launch-tool': { args: [string, string | null, 'cli' | 'app' | null]; result: void }
  'ssh:list': { args: []; result: SshServer[] }
  'ssh:save': { args: [SshServerInput]; result: SshServer[] }
  'ssh:delete': { args: [string]; result: SshServer[] }
  'ssh:terminal': { args: [string]; result: void }
  'ssh:trust': { args: [string, string]; result: SshServer[] }
  'sftp:connect': { args: [string, string | null]; result: SftpConnectResult }
  'sftp:list': { args: [string, string]; result: SftpListing }
  'sftp:download': { args: [string, string[]]; result: number }
  'sftp:upload': { args: [string, string]; result: number }
  'sftp:mkdir': { args: [string, string, string]; result: void }
  'sftp:rename': { args: [string, string, string]; result: void }
  'sftp:delete': { args: [string, string, boolean]; result: void }
  'sftp:disconnect': { args: [string]; result: void }
  'shell:open': { args: [string, string | null, number, number]; result: SshShellResult }
  'shell:write': { args: [string, string]; result: void }
  'shell:resize': { args: [string, number, number]; result: void }
  'shell:close': { args: [string]; result: void }
  'snapshots:list': { args: [string]; result: SnapshotInfo[] }
  'snapshots:create': { args: [string, string]; result: SnapshotInfo[] }
  'snapshots:restore': { args: [string, string]; result: SnapshotInfo[] }
  'snapshots:export': { args: [string, string]; result: string | null }
  'snapshots:delete': { args: [string, string]; result: SnapshotInfo[] }
  'mcp:status': { args: []; result: McpStatus }
  'mcp:enable': { args: [boolean]; result: McpStatus }
  'mcp:connect': { args: []; result: McpStatus }
  'packages:list': { args: []; result: PackageInfo[] }
  'packages:remove': { args: [string]; result: PackageInfo[] }
  'db:list': { args: []; result: DatabaseInfo[] }
  'db:create': { args: ['mysql' | 'mariadb', string]; result: DatabaseInfo[] }
  'db:drop': { args: ['mysql' | 'mariadb', string]; result: DatabaseInfo[] }
  'db:export': { args: ['mysql' | 'mariadb', string]; result: string | null }
  'db:import': { args: ['mysql' | 'mariadb', string]; result: DatabaseInfo[] | null }
  'db:open': { args: ['mysql' | 'mariadb', string]; result: void }
}

export type ChannelName = keyof Channels

export interface Events {
  'services:changed': ServiceInfo[]
  'jobs:changed': JobInfo[]
  'sites:changed': SiteInfo[]
  'activity:changed': ActivityItem[]
  'update:available': UpdateInfo
  'shell:data': { session: string; data: string }
  'shell:exit': { session: string }
}

export interface LaramacApi {
  invoke: <K extends ChannelName>(
    channel: K,
    ...args: Channels[K]['args']
  ) => Promise<Channels[K]['result']>
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => () => void
  platform: string
}
