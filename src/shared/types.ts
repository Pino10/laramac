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
  | 's3'
  | 'rabbitmq'

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

export type SiteKind = 'laravel' | 'wordpress' | 'symfony' | 'php' | 'static' | 'node' | 'python' | 'dotnet' | 'go' | 'rust' | 'swift'

export type RuntimeId = 'node' | 'bun' | 'python' | 'dotnet' | 'go' | 'rust' | 'swift' | 'php'

export interface RuntimeInfo {
  id: RuntimeId
  name: string
  description: string
  installed: boolean
  version: string | null
  /** Installed by Laramac (true) or found on this Mac (false). */
  managed: boolean
  path: string | null
  /** Laramac can download and install it. Swift comes from Apple instead. */
  canInstall: boolean
  note?: string
}

/** How a project's own development server runs. */
export interface DevConfig {
  command: string[]
  port: number
  /** name.test is passed through to the dev server. */
  proxy: boolean
  env?: Record<string, string>
}

export interface StarterRequest {
  starter: string
  name: string
  options: Record<string, string>
  /** Start the dev server when done. */
  start: boolean
  git: boolean
}

export interface SiteConfig {
  /** PHP minor version like "8.3", or undefined to use the default. */
  php?: string
  secure?: boolean
  /** Extra names for this site, such as shop.local or api.shop.test. */
  aliases?: string[]
  /** Where Deploy sends this site. */
  deploy?: DeployTarget
  dev?: DevConfig
  /** Fingerprint of the laramac.yml last applied. */
  projectHash?: string
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
  /** Other addresses that open this site. */
  aliases: string[]
  dev?: { port: number; proxy: boolean; running: boolean; command: string }
  /** A dev command found in package.json that can be set up with one click. */
  devSuggestion?: string
  /** The project has a laramac.yml that has not been applied, or has changed since. */
  projectFile?: 'new' | 'applied'
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

export interface ReleaseNote {
  version: string
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
  /** How Laramac talks to it. FTP and FTPS have files only, no terminal. */
  protocol: 'sftp' | 'ftp' | 'ftps'
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
  protocol?: 'sftp' | 'ftp' | 'ftps'
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

export interface GitHubAccount {
  login: string
  name: string | null
  /** Permissions of a classic token; null for fine-grained tokens. */
  scopes?: string[] | null
}

export interface GitHubRepoDetails {
  branches: { name: string; protected: boolean }[]
  releases: { tag: string; name: string; date: string; url: string; prerelease: boolean }[]
  commits: { sha: string; message: string; author: string; date: string; url: string }[]
  pulls: { number: number; title: string; url: string; author: string }[]
  issues: { number: number; title: string; url: string }[]
}

export interface GitHubRepo {
  fullName: string
  name: string
  private: boolean
  description: string | null
  language: string | null
  updatedAt: string
  defaultBranch: string
  url: string
  cloneUrl: string
  stars: number
  fork: boolean
  archived: boolean
  homepage: string | null
}

export interface GitSiteStatus {
  isRepo: boolean
  branch: string | null
  /** owner/name when the remote is on GitHub. */
  remote: string | null
  changed: number
  lastTag: string | null
}

export interface GitPushOptions {
  /** main: update the main branch. branch: a new branch. tag: main plus a version tag. release: tag plus a GitHub release. */
  mode: 'main' | 'branch' | 'tag' | 'release'
  message: string
  branch?: string
  base?: string
  tag?: string
  notes?: string
  /** Overwrite what is on GitHub when it has commits this Mac does not. */
  replace?: boolean
  /** Push to this existing repository (owner/name). */
  repo?: string
  /** Or create a new one. */
  create?: { name: string; private: boolean }
}

export interface GitPushResult {
  mode: GitPushOptions['mode']
  commit: string
  ref: string
  url?: string
}

export interface KV {
  key: string
  value: string
  enabled: boolean
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface ApiAssertion {
  enabled: boolean
  /** What to check in the response. */
  source: 'status' | 'time' | 'header' | 'body' | 'json'
  /** Header name or JSON path (like data.items[0].id), when the source needs one. */
  path: string
  op: 'eq' | 'neq' | 'contains' | 'exists' | 'lt' | 'gt'
  value: string
}

export interface ApiExtract {
  enabled: boolean
  /** Variable to set, such as token. */
  name: string
  /** JSON path in the response body, or header:Name for a header. */
  path: string
}

export interface ApiTestResult {
  name: string
  pass: boolean
  detail: string
}

export interface ApiRequest {
  id: string
  name: string
  /** Folder inside the collection, like "Orders/Admin". */
  folder?: string
  tests?: ApiAssertion[]
  extract?: ApiExtract[]
  method: HttpMethod
  url: string
  query: KV[]
  headers: KV[]
  body: { type: 'none' | 'json' | 'text' | 'form' | 'urlencoded'; text: string; form: KV[] }
  auth: { type: 'none' | 'bearer' | 'basic'; token: string; user: string; pass: string }
}

export interface ApiCollection {
  id: string
  name: string
  requests: ApiRequest[]
  /** Collection variables, used when the environment does not set the same name. */
  variables?: KV[]
}

export interface ApiEnvironment {
  id: string
  name: string
  vars: KV[]
}

export interface ApiHistoryItem {
  at: number
  method: HttpMethod
  url: string
  status: number
  ms: number
}

export interface ApiStore {
  collections: ApiCollection[]
  environments: ApiEnvironment[]
  activeEnv: string | null
  history: ApiHistoryItem[]
}

export interface ApiResponse {
  status: number
  statusText: string
  ms: number
  bytes: number
  headers: [string, string][]
  body: string
  contentType: string
  truncated: boolean
  /** The address actually requested, after variables were filled in. */
  url: string
  tests: ApiTestResult[]
  /** Variables saved from this response into the active environment. */
  saved: { key: string; value: string }[]
}

export interface ApiImportResult {
  collection?: ApiCollection
  environment?: ApiEnvironment
}

export interface ApiRunResult {
  id: string
  name: string
  status: number | null
  ms: number
  tests: ApiTestResult[]
  error: string | null
}

export interface DeployResult {
  uploaded: number
  skipped: number
  bytes: number
  seconds: number
}

export interface DeployTarget {
  serverId: string
  remotePath: string
  /** Extra names or paths to leave out, like uploads or *.sql. */
  excludes?: string[]
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
  /** smoke: dark smoked glass everywhere. frost: light frosted glass that follows light and dark mode. */
  glassStyle: 'smoke' | 'frost' | 'aurora' | 'midnight'
  /** The first-run tour has been seen. */
  tourDone: boolean
  /** Send dump() and dd() to the Dumps window instead of the page. */
  dumps: boolean
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
  shareProvider: 'cloudflare' | 'ngrok' | 'localhostrun' | 'pinggy'
  ngrokToken: string
  editor: 'cursor' | 'vscode'
  /** Let phones and other computers on the network open your sites. Off by default. */
  allowLan: boolean
  notifications: boolean
  autoUpdateCheck: boolean
  /** Lets Claude Code and other AI tools work with Laramac over MCP. */
  mcpEnabled: boolean
  /** Serve every project at http://localhost/<folder> and http://127.0.0.1/<folder>. */
  hostLocalhostFolders: boolean
  /** Also answer <name>.localhost for every site. */
  hostDotLocalhost: boolean
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

/** Whether Mailpit only catches mail, or also sends it on through a real provider. */
export interface MailRelay {
  /** catch: keep everything in Mailpit. release: send only what you release. all: send everything. */
  mode: 'catch' | 'release' | 'all'
  preset: string
  host: string
  port: number
  security: 'starttls' | 'tls' | 'none'
  username: string
  /** Sender to use for every message, or empty to keep each app's own. */
  from: string
  hasPassword: boolean
}

export interface MailRelayInput extends Omit<MailRelay, 'hasPassword'> {
  /** A new password, null to remove it, or left out to keep it. */
  password?: string | null
}

/** The settings in a project's laramac.yml. */
export interface ProjectFile {
  php?: string
  https?: boolean
  aliases?: string[]
  services?: ServiceId[]
  database?: { engine: 'mysql' | 'mariadb' | 'postgres'; name: string }
  dev?: { command: string; proxy: boolean }
  setup?: string[]
}

export interface ProjectPlan {
  steps: string[]
  /** Commands from the file, shown word for word before they run. */
  commands: string[]
}

export interface DumpItem {
  id: string
  /** Symfony's HTML rendering, shown in a sandboxed frame. */
  html: string
  text: string
  file: string | null
  line: number | null
  name: string | null
  uri: string | null
  method: string | null
  command: string | null
  at: number
}

export type ReviewFocus = 'security' | 'bugs' | 'all'

export type ReviewSource = { kind: 'site'; site: string } | { kind: 'github'; repo: string } | { kind: 'git'; url: string; token?: string }

export interface ReviewRequest {
  source: ReviewSource
  reviewer: 'claude' | 'model'
  focus: ReviewFocus
}

export interface SecretHit {
  file: string
  line: number
  kind: string
}

export interface ReviewInfo {
  id: string
  title: string
  folder: string
  reviewer: 'claude' | 'model'
  focus: ReviewFocus
  at: string
  counts: Record<'critical' | 'high' | 'medium' | 'low', number>
  secrets: number
}

export interface ReviewResult {
  id: string
  title: string
  folder: string
  reviewer: 'claude' | 'model'
  markdown: string
  secrets: SecretHit[]
  files: number
  ms: number
  reportPath: string
  counts: Record<'critical' | 'high' | 'medium' | 'low', number>
}

export interface ScanFinding {
  template: string
  name: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  matched: string
  description?: string
  remediation?: string
  reference?: string[]
}

export interface ScanResult {
  target: string
  findings: ScanFinding[]
  ms: number
}

export type ModelApi = 'openai' | 'anthropic'

/** A model server you added yourself. The key stays in the main process. */
export interface ModelServer {
  id: string
  name: string
  baseUrl: string
  api: ModelApi
  hasKey: boolean
}

export interface ModelServerInput {
  id?: string
  name: string
  baseUrl: string
  api: ModelApi
  /** A new key, null to remove the key, or left out to keep the current one. */
  key?: string | null
}

export interface LocalLlm {
  /** Set for servers you saved. */
  id?: string
  /** LM Studio, Ollama, vMLX (:8000), or the name you gave it. */
  provider: string
  /** The AI tool card this server belongs to, when known. */
  toolId?: 'ollama' | 'lmstudio' | 'vmlx' | 'omlx'
  baseUrl: string
  api: ModelApi
  /** Chat models only (embedding models cannot chat), loaded ones first. */
  models: string[]
  /** Models already in memory, which answer straight away. */
  loaded: string[]
  /** Not on this Mac: prompts leave it. */
  remote: boolean
  saved: boolean
  /** For saved servers: whether it answered just now. */
  online?: boolean
}

export interface LlmTest {
  ok: boolean
  ms: number
  reply?: string
  error?: string
}

export interface SiteLogSource {
  name: string
  path: string
  /** Empty when sent back to the window; only the model sees the text. */
  text: string
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
  'runtimes:list': { args: []; result: RuntimeInfo[] }
  'runtimes:latest': { args: []; result: Partial<Record<RuntimeId, string>> }
  'runtimes:install': { args: [RuntimeId]; result: RuntimeInfo[] }
  'starters:versions': { args: []; result: Record<string, string> }
  'starters:create': { args: [StarterRequest]; result: SiteInfo[] }
  'dev:start': { args: [string]; result: SiteInfo[] }
  'dev:stop': { args: [string]; result: SiteInfo[] }
  'dev:logs': { args: [string]; result: string }
  'dev:setup': { args: [string, string | null]; result: SiteInfo[] }
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
  'ai:test': { args: [string, string]; result: LlmTest }
  'llm:servers': { args: []; result: ModelServer[] }
  'mail:relay': { args: []; result: MailRelay }
  'review:run': { args: [ReviewRequest]; result: ReviewResult }
  'dumps:list': { args: []; result: DumpItem[] }
  'db:root-password': { args: ['mysql' | 'mariadb']; result: { set: boolean } }
  'db:set-root-password': { args: ['mysql' | 'mariadb', string]; result: { set: boolean } }
  'sites:logs': { args: [string]; result: SiteLogSource[] }
  'sites:thumbnail': { args: [string, boolean]; result: string | null }
  'cli:status': { args: []; result: { installed: boolean; inPath: boolean; path: string } }
  'cli:install': { args: []; result: { installed: boolean; inPath: boolean; path: string } }
  'project:plan': { args: [string]; result: { file: ProjectFile; plan: ProjectPlan } }
  'project:apply': { args: [string, boolean]; result: SiteInfo[] }
  'project:export': { args: [string]; result: string }
  'dumps:clear': { args: []; result: void }
  'dumps:enable': { args: [boolean]; result: { enabled: boolean; running: boolean } }
  'dumps:status': { args: []; result: { enabled: boolean; running: boolean } }
  'dumps:open-file': { args: [string, number | null]; result: void }
  'review:list': { args: []; result: ReviewInfo[] }
  'review:read': { args: [string]; result: string }
  'review:delete': { args: [string]; result: ReviewInfo[] }
  'review:open': { args: [string, 'report' | 'folder' | 'agent']; result: void }
  'scan:run': { args: [string, string | null]; result: ScanResult }
  'scan:status': { args: []; result: { installed: boolean; version: string | null } }
  'mail:save-relay': { args: [MailRelayInput]; result: MailRelay }
  'mail:test': { args: [string]; result: void }
  'llm:save': { args: [ModelServerInput]; result: ModelServer[] }
  'llm:delete': { args: [string]; result: ModelServer[] }
  'sites:doctor': { args: [string, ChatMessage[]]; result: { reply: string; sources: SiteLogSource[] } }
  'sites:open-log': { args: [string, string]; result: void }
  'import:choose': { args: []; result: ImportPlan | null }
  'import:run': { args: [string, ImportAnswers]; result: ImportResult }
  'import:cancel': { args: [string]; result: void }
  'activity:list': { args: []; result: ActivityItem[] }
  'activity:clear': { args: []; result: ActivityItem[] }
  'app:info': { args: []; result: AppInfo }
  'app:check-update': { args: []; result: UpdateInfo | null }
  'app:install-update': { args: []; result: void }
  'app:changelog': { args: []; result: ReleaseNote[] }
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
  'sftp:upload-folder': { args: [string, string]; result: DeployResult | null }
  'sftp:mkdir': { args: [string, string, string]; result: void }
  'sftp:rename': { args: [string, string, string]; result: void }
  'sftp:delete': { args: [string, string, boolean]; result: void }
  'sftp:disconnect': { args: [string]; result: void }
  'shell:open': { args: [string, string | null, number, number]; result: SshShellResult }
  'shell:write': { args: [string, string]; result: void }
  'shell:resize': { args: [string, number, number]; result: void }
  'shell:close': { args: [string]; result: void }
  'api:load': { args: []; result: ApiStore }
  'api:save': { args: [ApiStore]; result: void }
  'api:send': { args: [ApiRequest, string | null, string | null]; result: ApiResponse }
  'api:run': { args: [string, string | null, string | null]; result: ApiRunResult[] }
  'api:import': { args: [string]; result: ApiImportResult }
  'api:import-file': { args: []; result: ApiImportResult | null }
  'api:export': { args: [string]; result: string | null }
  'api:code': { args: [ApiRequest, string | null, string | null, 'curl' | 'fetch' | 'php' | 'python']; result: string }
  'github:account': { args: []; result: { account: GitHubAccount | null; cli: boolean } }
  'github:sign-in': { args: [string]; result: GitHubAccount }
  'github:sign-in-cli': { args: []; result: GitHubAccount }
  'github:sign-out': { args: []; result: void }
  'github:repos': { args: []; result: GitHubRepo[] }
  'github:edit': { args: [string, { description?: string; private?: boolean; homepage?: string }]; result: GitHubRepo }
  'github:clone': { args: [string]; result: SiteInfo[] }
  'github:site-status': { args: [string]; result: GitSiteStatus & { next: string } }
  'github:push': { args: [string, GitPushOptions]; result: GitPushResult }
  'github:create': { args: [{ name: string; description: string; private: boolean; readme: boolean; clone: boolean }]; result: { repo: GitHubRepo; sites: SiteInfo[] | null } }
  'github:delete': { args: [string]; result: void }
  'github:details': { args: [string]; result: GitHubRepoDetails }
  'github:download-zip': { args: [string]; result: string | null }
  'github:pull': { args: [string]; result: string }
  'deploy:run': { args: [string, DeployTarget, boolean, string | null]; result: DeployResult }
  'clipboard:read': { args: []; result: string }
  'clipboard:write': { args: [string]; result: void }
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
  /** The menu bar asks the window to show a page. */
  'app:navigate': string
  'dumps:new': DumpItem
}

export interface LaramacApi {
  invoke: <K extends ChannelName>(
    channel: K,
    ...args: Channels[K]['args']
  ) => Promise<Channels[K]['result']>
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => () => void
  platform: string
}
