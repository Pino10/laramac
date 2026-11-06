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
  | 'ollama'

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
  /** The web server to install when there is none yet. */
  web?: 'apache' | 'nginx'
}

export type BackendKind = 'supabase' | 'firebase'

/** Supabase or Firebase, running on this Mac for one project. */
export interface BackendConfig {
  kind: BackendKind
  /** Which block of ports this project uses, so several can run at once. */
  slot?: number
  /** Supabase Studio, or the Firebase Emulator UI. */
  studioUrl?: string
  apiUrl?: string
  /** Firebase: the demo- project id. */
  projectId?: string
}

export interface BackendStatus {
  supabaseCli: boolean
  /** A container runtime is answering. */
  docker: boolean
  /** Docker Desktop, OrbStack or Colima, when one is installed. */
  dockerApp: string | null
  java: boolean
  homebrew: boolean
}

/** What a new project needs that this Mac does not have yet. */
export interface StarterReadiness {
  /** Apache or Nginx installed, and which is running. */
  web: { installed: ('apache' | 'nginx')[]; running: boolean }
  /** name.test addresses work. */
  dns: boolean
  mysql: boolean
  postgres: boolean
  backends: BackendStatus
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
  /** Supabase or Firebase for this project. */
  backend?: BackendConfig
  /** Fingerprint of the laramac.yml last applied. */
  projectHash?: string
  /** Node.js major version for this site, like "20". Unset: what the project asks for, else the main one. */
  node?: string
  /** Answer cross-origin requests from this Mac's own pages (localhost and .test). */
  cors?: boolean
  /** Background commands such as queue workers and schedulers. */
  workers?: WorkerConfig[]
  /** Commands you saved for this site (Commands tab), some on a schedule. */
  commands?: SavedCommand[]
  /** Forge or Ploi deploy hook, Vercel, Netlify or Azure App Service. */
  hosting?: HostingConfig
}

export interface IntegrationsInfo {
  webhook: { kind: 'slack' | 'teams' | 'discord' | 'generic'; events: 'errors' | 'all'; saved: boolean } | null
  raycastDir: string
  raycastInstalled: boolean
  cli: string
  /** Lines to paste into an Apple Shortcuts "Run Shell Script" action. */
  shortcuts: { title: string; command: string }[]
}

export interface WorkersInfo {
  suggested: WorkerConfig[]
  configured: WorkerConfig[]
  running: string[]
}

export interface RequestSummary {
  lines: { at: string; host: string; method: string; path: string; status: number; ms: number; bytes: number }[]
  count: number
  errors: number
  p50: number
  p95: number
  slowest: { path: string; method: string; ms: number; count: number }[]
}

export interface TestSummary {
  passed: number
  failed: number
  skipped: number
  failures: string[]
}

export interface CommandSchedule {
  every: 'minutes' | 'daily'
  minutes?: number
  at?: string
}

export interface SavedCommand {
  id: string
  name: string
  argv: string[]
  /** A folder inside the site, relative; empty for the site's own folder. */
  cwd?: string
  schedule?: CommandSchedule | null
}

export interface FoundCommand {
  name: string
  argv: string[]
  kind: 'script' | 'npm' | 'composer' | 'make'
  file?: string
}

export interface CommandRunInfo {
  id: string
  site: string
  name: string
  startedAt: number
  endedAt: number | null
  code: number | null
}

export interface CommandsInfo {
  saved: SavedCommand[]
  found: FoundCommand[]
  /** Folders of the site to run in, relative. */
  folders: string[]
  runs: CommandRunInfo[]
  /** The last run of each saved command: when, how it ended, how long it took. */
  last: Record<string, { at: number; code: number | null; ms: number }>
}

export interface WorkerConfig {
  id: string
  name: string
  command: string[]
  /** Start with the site's services. */
  auto?: boolean
}

export interface HostingConfig {
  kind: 'forge' | 'ploi' | 'vercel' | 'netlify' | 'azure'
  /** Forge and Ploi: the deploy hook address is kept in the Keychain; this says one is saved. */
  hookSaved?: boolean
  /** Azure App Service: the app name and resource group. */
  app?: string
  group?: string
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
  backend?: BackendConfig & { running?: boolean }
  /** A dev command found in package.json that can be set up with one click. */
  devSuggestion?: string
  /** The project has a laramac.yml that has not been applied, or has changed since. */
  projectFile?: 'new' | 'applied'
}

export interface ProfileFunction {
  name: string
  internal: boolean
  file: string
  line: number
  calls: number
  selfMs: number
  inclMs: number
  memoryKb: number
}

export interface ProfileReport {
  cmd: string
  creator: string
  totalMs: number
  /** The slowest functions by their own time, at most 80. */
  functions: ProfileFunction[]
  /** How many functions ran in all. */
  count: number
}

export interface ProfileListItem {
  file: string
  at: number
  path: string
  size: number
}

export interface ProfilerInfo {
  /** The profiler is switched on. */
  on: boolean
  /** Xdebug is installed for this site's PHP, so profiling can work. */
  ready: boolean
  /** The site runs on PHP at all. */
  php: boolean
  items: ProfileListItem[]
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
  /** xdebug.so is installed beside this version. */
  xdebug: boolean
  /** A build with Xdebug can be downloaded for this version. */
  xdebugAvailable: boolean
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

/** A server's health, read over SSH. */
export interface ServerHealth {
  at: number
  os: string
  uptimeSec: number
  cores: number
  /** 1, 5 and 15 minute load averages. */
  load: [number, number, number]
  memTotalKb: number
  memUsedKb: number
  swapTotalKb: number
  swapUsedKb: number
  diskTotalKb: number
  diskUsedKb: number
  services: { name: string; unit: string }[]
}

export type HealthOpenResult = { status: 'connected'; session: string } | { status: 'unknown-host'; fingerprint: string }

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

export interface AzureAccount {
  org: string
  name: string
  email: string | null
}

export interface AzureProject {
  id: string
  name: string
  description: string | null
}

export interface AzureRepo {
  id: string
  name: string
  project: string
  projectId: string
  defaultBranch: string
  cloneUrl: string
  url: string
  size: number
  disabled: boolean
  /** No commits yet. */
  empty: boolean
}

export interface AzureRepoDetails {
  branches: string[]
  commits: { sha: string; message: string; author: string; date: string; url: string }[]
  pulls: { id: number; title: string; author: string; from: string; to: string; draft: boolean }[]
  builds: { id: number; name: string; number: string; status: string; result: string | null; branch: string; finished: string | null; url: string | null }[]
}

export interface GitHubRepoDetails {
  branches: { name: string; protected: boolean }[]
  releases: { tag: string; name: string; date: string; url: string; prerelease: boolean }[]
  commits: { sha: string; message: string; author: string; date: string; url: string }[]
  pulls: { number: number; title: string; url: string; author: string }[]
  issues: { number: number; title: string; url: string }[]
  /** GitHub Actions runs, newest first. */
  runs?: { id: number; name: string; status: string; conclusion: string | null; branch: string; url: string; date: string }[]
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
  body: { type: 'none' | 'json' | 'text' | 'form' | 'urlencoded' | 'graphql'; text: string; form: KV[]; /** GraphQL variables, as JSON. */ variables?: string }
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2'
    token: string
    user: string
    pass: string
    /** API key: the header or query name, such as X-API-Key. */
    keyName?: string
    keyIn?: 'header' | 'query'
    /** OAuth 2 client credentials. */
    tokenUrl?: string
    clientId?: string
    clientSecret?: string
    scope?: string
  }
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
  /** The request as it was sent, so it can be opened again. */
  request?: ApiRequest
}

export interface ApiStore {
  collections: ApiCollection[]
  environments: ApiEnvironment[]
  activeEnv: string | null
  history: ApiHistoryItem[]
  /** Keep cookies between requests, like a browser (on unless turned off). */
  cookies?: boolean
  /** Values saved from responses into a site's environment. */
  siteVars?: Record<string, KV[]>
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

export type ApiCodeLang = 'curl' | 'fetch' | 'axios' | 'php' | 'laravel' | 'python' | 'go' | 'httpie'

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

export interface SkillPackInfo {
  id: string
  name: string
  repo: string
  license: string
  about: string
  installed: boolean
  commit: string | null
  at: string | null
  loaded: string[]
  /** Reference guides that come with its skills (Cloudflare's audit has 14). */
  guides?: number
}

export interface PhpQuick {
  settings: { key: string; label: string; hint: string; options: { value: string; label: string }[]; value: string; fallback: string }[]
}

export interface PhpToolInfo {
  id: string
  name: string
  command: string
  about: string
  version: string | null
}

export interface OverviewPulse {
  /** The busiest sites today, each with its own last half hour. */
  bySite: { host: string; perMinute: number[]; today: number; errors: number; medianMs: number }[]
  /** Each running service or dev server, with what it uses now. */
  processes: { name: string; cpu: number; memMb: number; uptimeSec: number; count: number }[]
  perMinute: number[]
  today: number
  errorsToday: number
  medianMs: number
  /** Emails Mailpit caught, when it is running. */
  mail: number | null
  /** The newest database backup. */
  lastBackup: string | null
  /** The latest code review: its site and findings by severity. */
  review: { title: string; at: string; critical: number; high: number; medium: number; low: number } | null
}

export interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

export interface IdeStatus {
  /** The editor (code-server) is installed. */
  installed: boolean
  version: string | null
  /** The Laramac Code app is in ~/Applications, and its version. */
  appInstalled: boolean
  appVersion: string | null
  extensions: { id: string; name: string; why: string; state: 'installed' | 'failed' | 'missing' }[]
}

export interface FreeLlmInfo {
  baseUrl: string
  model: string
  hasKey: boolean
  /** Whether the claudefree command is written. */
  claudefree: boolean
  claudeCode: boolean
  models: string[]
  ok: boolean | null
  note: string
}

export interface ClaudeSetupStatus {
  claudeCode: boolean
  /** Laramac's tools in Claude Code (claude and claudelm). */
  mcpClaudeCode: McpStatus['claude']
  desktopApp: boolean
  desktopConnected: boolean
  skills: boolean
  claudeLm: { installed: boolean; model: string | null }
  /** The model chosen in the Assistant, used by claudelm and local reviews. */
  model: string | null
  inPath: boolean
  /** The model's context in LM Studio, when it was checked. */
  context: { ok: boolean; after: number | null; max: number | null; note: string } | null
  notes: string[]
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
  glassStyle: 'studio' | 'smoke' | 'frost' | 'aurora' | 'prism' | 'ion'
  /** Light or dark: follow the Mac, or always one. Every look has both. */
  appearance?: 'auto' | 'light' | 'dark'
  /** Set once the move to the dark default has been made, so it never repeats. */
  darkDefault?: boolean
  /** The first-run tour has been seen. */
  tourDone: boolean
  /** Send dump() and dd() to the Dumps window instead of the page. */
  dumps: boolean
  /** Xdebug loaded into PHP (step debugging). Off by default: it slows PHP down. */
  xdebug: boolean
  /** Xdebug's profiler, for pages that ask for it. Off by default. */
  profiler?: boolean
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
  /** 'auto' (the first editor found), an editor id from seckit/editors.ts, or 'custom' (editorApp). */
  editor: string
  /** The .app chosen with "Choose another app". */
  editorApp?: string | null
  /** Skill packs you removed, so they are not fetched again by themselves. */
  packsDeclined?: string[]
  /** The newest skill pack version already announced, so each update is announced once. */
  packsNotified?: Record<string, string>
  /** The accent colour of the Studio look and of Laramac Code's theme. */
  accent?: 'blue' | 'violet' | 'teal' | 'amber' | 'rose'
  /** The app's font: Apple's own (SF Pro) or Poppins. */
  uiFont?: 'system' | 'poppins'
  /** Laramac Code's font and size. */
  editorFont?: 'system' | 'jetbrains' | 'fira' | 'cascadia' | 'menlo'
  editorFontSize?: number
  /** Let phones and other computers on the network open your sites. Off by default. */
  allowLan: boolean
  notifications: boolean
  autoUpdateCheck: boolean
  /** Lets Claude Code and other AI tools work with Laramac over MCP. */
  mcpEnabled: boolean
  /** Serve every project at http://localhost/<folder> and http://127.0.0.1/<folder>. */
  hostLocalhostFolders: boolean
  /** Slack, Teams, Discord or other webhook for errors (and, if chosen, finished work). The address is in the Keychain. */
  webhook?: { kind: 'slack' | 'teams' | 'discord' | 'generic'; events: 'errors' | 'all' }
  /** The release whose look was last applied, so a new default look reaches everyone once. */
  lookVersion?: number
  /** Free LLM API's address and model. The key is in the Keychain. */
  freellm?: { baseUrl: string; model: string }
  /** Databases backed up once a day. */
  dbBackups?: { engine: 'mysql' | 'mariadb'; name: string }[]
  /** How many daily backups to keep per database. */
  dbBackupKeep?: number
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
  /** The editors and IDEs found on this Mac, and the one Laramac opens. */
  editors: { id: string; name: string }[]
  editor: string | null
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

/** Who reviews: Claude Code (your sign-in or your own model), Codex, Gemini CLI, CodeRabbit, or a model directly. */
export type ReviewerKind = 'claude' | 'claude-local' | 'claude-free' | 'codex' | 'gemini' | 'coderabbit' | 'model'

export type DeepEngine = 'cloudflare' | 'anthropic' | 'both'
export type DeepReviewerKind = 'claude' | 'claude-local' | 'claude-free' | 'claude-desktop'

export interface DeepPlanRequest {
  engine: DeepEngine
  reviewer: DeepReviewerKind
  /** A site name, to say where the notes go and estimate size. */
  site?: string | null
}

export interface DeepPlanLine {
  label: string
  text: string
}

export interface PackUpdateInfo {
  id: string
  current: string | null
  latest: string | null
  available: boolean
  checkedAt: string | null
  changes: string | null
  error?: string
}

export interface ReviewRequest {
  source: ReviewSource
  reviewer: ReviewerKind
  /** A deep audit with Cloudflare's and Anthropic's security reviews, through the Claude Code reviewer chosen. */
  deep?: { engine: DeepEngine }
  focus: ReviewFocus
  /** Run MacSec's scanners first (Semgrep, Gitleaks, OSV-Scanner) when MacSec is installed. */
  scanners?: boolean
  /** The skills to load (ids from review:skill-plan). Left out: the recommended ones. */
  skills?: string[]
}

export interface SkillChoice {
  id: string
  name: string
  source: string
  about: string
  guides: number
}

export interface SkillPlan {
  /** What the project is made of, as short tags (php, laravel, react...). */
  stack: string[]
  items: SkillChoice[]
  recommended: string[]
  files: number
}

export interface ReviewerOption {
  id: ReviewerKind
  name: string
  installed: boolean
  /** Why it cannot run yet, in words. */
  note?: string
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
  reviewer: ReviewerKind
  /** The Claude Code session that did the review, to carry on with it. */
  session?: string
  /** Skills the reviewer had. */
  skills?: string[]
  /** What you decided about each finding, by its number in the report. */
  triage?: Record<number, 'fixed' | 'accepted' | 'not-a-problem'>
  focus: ReviewFocus
  at: string
  counts: Record<'critical' | 'high' | 'medium' | 'low', number>
  secrets: number
  /** A deep audit: which method, and what it found. */
  deep?: { engine: DeepEngine; confirmed: number; leads: number; rejected: number }
  /** Downloaded for this review only; the copy was deleted when it finished. */
  remote?: boolean
}

export interface ReviewResult {
  id: string
  title: string
  folder: string
  reviewer: ReviewerKind
  session?: string
  skills?: string[]
  markdown: string
  secrets: SecretHit[]
  files: number
  ms: number
  reportPath: string
  counts: Record<'critical' | 'high' | 'medium' | 'low', number>
  remote?: boolean
}

export interface AuditFinding {
  tool: 'composer' | 'npm'
  package: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  title: string
  id?: string
  link?: string
  affected?: string
  fix?: string
}

export interface AuditResult {
  /** Which package managers were checked. */
  checked: string[]
  problems: string[]
  findings: AuditFinding[]
}

export interface ScanFinding {
  template: string
  name: string
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | 'unknown'
  matched: string
  description?: string
  remediation?: string
  reference?: string[]
  /** CWE ids from the template, like "cwe-79". */
  cwe?: string[]
  tags?: string[]
}

export interface ScanResult {
  target: string
  findings: ScanFinding[]
  ms: number
  /** The findings under the OWASP Top 10, and what this scan could see. */
  owasp?: OwaspChecklistInfo
}

export interface OwaspItemInfo {
  id: string
  name: string
  about: string
  howToCheck: string
  status: 'issues' | 'checked' | 'not-checked'
  count: number
  worst: 'critical' | 'high' | 'medium' | 'low' | 'info' | null
  examples: string[]
  checkedBy: string[]
}

export interface OwaspChecklistInfo {
  items: OwaspItemInfo[]
  other: number
  covered: number
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
export interface ImportSetupStep {
  id: 'env' | 'composer' | 'node' | 'build' | 'python' | 'go' | 'dotnet' | 'migrate'
  label: string
  /** The command, as shown to the person. */
  detail: string
  command: string[]
  /** A second command run right after the first. */
  then?: string[]
  /** Runs code from the project (install scripts, migrations). */
  runsCode: boolean
}

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
  /** What it takes to get the project running, for the person to agree to. */
  setup: ImportSetupStep[]
  /** The dev server command, for projects that run their own server. */
  dev: string | null
  /** Framework, when it can be told: Next.js, Vue, Django... */
  framework: string | null
  /** Where it came from: a file or folder on this Mac, or a Git address. */
  from: 'file' | 'git'
}

export interface ImportAnswers {
  name: string
  sqlFile: string | null
  engine: 'mysql' | 'mariadb'
  database: string
  updateConfig: boolean
  replaceUrl: boolean
  /** Ids of the setup steps to run. */
  setup: string[]
  /** Set up the dev server and start it. */
  startDev: boolean
}

export interface ImportResult {
  site: string | null
  database: string | null
  skipped: number
  sites: SiteInfo[]
  /** Setup steps that did not finish, with the reason. */
  failed: { label: string; error: string }[]
  /** The address to open: the dev server when there is one. */
  url: string | null
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
  'starters:readiness': { args: []; result: StarterReadiness }
  'backends:status': { args: []; result: BackendStatus }
  'backends:add': { args: [string, BackendKind]; result: SiteInfo[] }
  'backends:start': { args: [string]; result: SiteInfo[] }
  'backends:stop': { args: [string]; result: SiteInfo[] }
  'dev:start': { args: [string]; result: SiteInfo[] }
  'dev:stop': { args: [string]; result: SiteInfo[] }
  'dev:logs': { args: [string]; result: string }
  'dev:setup': { args: [string, string | null]; result: SiteInfo[] }
  'sites:open-folder': { args: [string]; result: void }
  'sites:open-url': { args: [string]; result: void }
  'sites:open-editor': { args: [string]; result: void }
  'editors:choose-app': { args: []; result: { app: string; name: string } | null }
  'sites:open-with': { args: [string, string]; result: void }
  'overview:pulse': { args: []; result: OverviewPulse }
  'php:quick': { args: []; result: PhpQuick }
  'php:quick-set': { args: [string, string]; result: PhpQuick }
  'phptools:list': { args: []; result: PhpToolInfo[] }
  'phptools:install': { args: [string]; result: PhpToolInfo[] }
  'phptools:remove': { args: [string]; result: PhpToolInfo[] }
  'site:artisan': { args: [string, string]; result: void }
  'ide:status': { args: []; result: IdeStatus }
  'ide:install': { args: []; result: IdeStatus }
  'ide:extensions': { args: []; result: IdeStatus }
  'ide:open': { args: [string | null]; result: void }
  /** Installs or updates the Laramac Code app from this version's release. */
  'ide:install-app': { args: []; result: IdeStatus }
  /** Whether MacSec, Laramac's security workbench, is on this Mac. */
  'macsec:status': { args: []; result: { installed: boolean } }
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
  'review:deep-plan': { args: [DeepPlanRequest]; result: DeepPlanLine[] }
  'review:deep-handoff': { args: [{ engine: DeepEngine; site: string }]; result: { copied: boolean; opened: boolean } }
  'packs:updates': { args: []; result: PackUpdateInfo[] }
  'packs:check-updates': { args: []; result: PackUpdateInfo[] }
  'review:skill-plan': { args: [string | null]; result: SkillPlan }
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
  'review:reviewers': { args: []; result: ReviewerOption[] }
  'recon:start': { args: [ReconRequest]; result: ReconInfo }
  'recon:diff': { args: [string]; result: ReconDiff }
  'recon:export': { args: [string, 'csv' | 'urls' | 'markdown']; result: string | null }
  'health:check': { args: []; result: HealthIssue[] }
  'health:fix': { args: [string]; result: HealthIssue[] }
  'site:facts': { args: [string]; result: SiteFacts }
  'site:node': { args: [string, string | null]; result: SiteNodeInfo }
  'node:versions': { args: []; result: NodeVersionsInfo }
  'site:requests': { args: [string]; result: RequestSummary }
  'integrations:get': { args: []; result: IntegrationsInfo }
  'webhook:set': { args: [{ kind: 'slack' | 'teams' | 'discord' | 'generic'; events: 'errors' | 'all' } | null, string | null]; result: IntegrationsInfo }
  'webhook:test': { args: []; result: void }
  'raycast:install': { args: []; result: IntegrationsInfo }
  'site:cors': { args: [string, boolean]; result: boolean }
  'site:lan': { args: [string]; result: { urls: string[]; allowLan: boolean; folders: boolean; share: string | null } }
  'site:debug-setup': { args: [string]; result: void }
  'workers:list': { args: [string]; result: WorkersInfo }
  'cmd:list': { args: [string]; result: CommandsInfo }
  'cmd:save': { args: [string, SavedCommand[]]; result: CommandsInfo }
  /** Runs typed words (text), a saved command (savedId) or a found one (argv), in a folder of the site. */
  'cmd:run': { args: [string, { text?: string; argv?: string[]; savedId?: string; cwd?: string; cols?: number; rows?: number }]; result: { id: string; name: string } }
  'cmd:input': { args: [string, string]; result: void }
  'cmd:stop': { args: [string]; result: void }
  'cmd:output': { args: [string]; result: string }
  /** Opens Terminal in the site's folder (for pipes and the like) with the command copied. */
  'cmd:terminal': { args: [string, string]; result: void }
  'workers:save': { args: [string, WorkerConfig[]]; result: WorkersInfo }
  'workers:start': { args: [string, string]; result: WorkersInfo }
  'workers:stop': { args: [string, string]; result: WorkersInfo }
  'workers:logs': { args: [string, string]; result: string }
  'tests:runners': { args: [string]; result: { id: string; name: string; command: string[] }[] }
  'tests:run': { args: [string, string]; result: { summary: TestSummary; output: string; ms: number } }
  'compose:status': { args: [string]; result: { file: string | null; docker: boolean; services: { name: string; state: string; status: string; ports: string }[] } }
  'compose:up': { args: [string]; result: void }
  'compose:down': { args: [string]; result: void }
  'compose:logs': { args: [string]; result: string }
  'hosting:set': { args: [string, HostingConfig, string | null]; result: HostingConfig }
  'hosting:deploy': { args: [string, boolean]; result: 'started' | 'terminal' }
  'db:scramble-plan': { args: [string, string]; result: { table: string; column: string; sql: string }[] }
  'db:scramble': { args: [string, string, string]; result: number }
  'db:schema-diff': { args: [string, string, string]; result: { onlyA: string[]; onlyB: string[]; changed: { table: string; column: string; a: string; b: string }[]; missingColumns: { table: string; column: string; side: 'a' | 'b' }[] } }
  'db:backups': { args: []; result: { list: { engine: string; name: string; files: { file: string; bytes: number; at: string }[] }[]; scheduled: { engine: 'mysql' | 'mariadb'; name: string }[] } }
  'db:backup-now': { args: [string, string]; result: void }
  'db:backup-schedule': { args: [string, string, boolean]; result: { engine: 'mysql' | 'mariadb'; name: string }[] }
  'db:backup-reveal': { args: []; result: void }
  'claude:status': { args: []; result: ClaudeSetupStatus }
  'packs:list': { args: []; result: SkillPackInfo[] }
  'packs:install': { args: [string]; result: SkillPackInfo[] }
  'packs:remove': { args: [string]; result: SkillPackInfo[] }
  'claude:setup': { args: [{ lmToken?: string }]; result: ClaudeSetupStatus }
  'claude:lm-context': { args: []; result: ClaudeSetupStatus }
  'claude:open-lm': { args: [string | null]; result: void }
  'claude:open-free': { args: [string | null]; result: void }
  'freellm:get': { args: []; result: FreeLlmInfo }
  'freellm:check': { args: []; result: FreeLlmInfo }
  'freellm:save': { args: [{ baseUrl: string; model: string; key?: string | null }]; result: FreeLlmInfo }
  'updates:check': { args: [boolean]; result: UpdatesReport }
  'updates:last': { args: []; result: UpdatesReport | null }
  'updates:apply': { args: [string[], boolean]; result: UpdatesApplied }
  'site:update-packages': { args: [string, { names?: string[]; latest?: boolean }]; result: OutdatedPackage[] }
  'node:install': { args: [string]; result: NodeVersionsInfo }
  'node:remove': { args: [string]; result: NodeVersionsInfo }
  'site:env-read': { args: [string, string]; result: string }
  'site:env-write': { args: [string, string, string]; result: void }
  'site:outdated': { args: [string]; result: OutdatedPackage[] }
  'db:tables': { args: ['mysql' | 'mariadb', string]; result: { name: string; rows: string }[] }
  'db:query': { args: ['mysql' | 'mariadb', string, string]; result: { columns: string[]; rows: string[][]; truncated: boolean } }
  'review:findings': { args: [string]; result: ReviewFinding[] }
  'review:owasp': { args: [string]; result: OwaspChecklistInfo }
  'review:triage': { args: [string, number, 'fixed' | 'accepted' | 'not-a-problem' | null]; result: ReviewFinding[] }
  'review:fix-one': { args: [string, number]; result: void }
  'recon:list': { args: []; result: ReconInfo[] }
  'recon:get': { args: [string]; result: ReconDetail }
  'recon:cancel': { args: [string]; result: void }
  'recon:delete': { args: [string]; result: ReconInfo[] }
  'recon:tools': { args: []; result: { subfinder: boolean } }
  'recon:install-subfinder': { args: []; result: { subfinder: boolean } }
  'review:continue': { args: [string, 'terminal' | 'desktop']; result: void }
  'skills:status': { args: []; result: { names: string[]; installed: boolean; desktop: boolean } }
  'skills:install': { args: [boolean]; result: { names: string[]; installed: boolean; desktop: boolean } }
  'desktop:connect': { args: []; result: { connected: boolean; path: string } }
  'desktop:status': { args: []; result: { app: boolean; connected: boolean; path: string } }
  'review:read': { args: [string]; result: string }
  'review:delete': { args: [string]; result: ReviewInfo[] }
  'review:open': { args: [string, 'report' | 'folder' | 'agent']; result: void }
  'scan:run': { args: [string, string | null]; result: ScanResult }
  'audit:run': { args: [string]; result: AuditResult }
  'review:repos': { args: ['github' | 'azure', string, string]; result: { name: string; url: string; private: boolean; project?: string }[] }
  'sites:secret-check': { args: [string]; result: SecretHit[] }
  'scan:status': { args: []; result: { installed: boolean; version: string | null } }
  'mail:save-relay': { args: [MailRelayInput]; result: MailRelay }
  'mail:test': { args: [string]; result: void }
  'llm:save': { args: [ModelServerInput]; result: ModelServer[] }
  'llm:delete': { args: [string]; result: ModelServer[] }
  'sites:doctor': { args: [string, ChatMessage[]]; result: { reply: string; sources: SiteLogSource[] } }
  'sites:open-log': { args: [string, string]; result: void }
  'import:choose': { args: []; result: ImportPlan | null }
  'php:xdebug': { args: [boolean]; result: PhpVersionInfo[] }
  'site:boost-state': { args: [site: string]; result: { laravel: boolean; installed: boolean; version: string | null } }
  'site:boost': { args: [site: string, action: 'install' | 'update']; result: void }
  'profiler:info': { args: [site: string]; result: ProfilerInfo }
  'profiler:set': { args: [on: boolean, site?: string]; result: ProfilerInfo | null }
  'profiler:run': { args: [site: string, path: string]; result: { file: string; status: number; report: ProfileReport | null } }
  'profiler:read': { args: [site: string, file: string]; result: ProfileReport }
  'profiler:clear': { args: [site: string]; result: ProfilerInfo }
  'php:import': { args: []; result: PhpVersionInfo[] | null }
  'import:git': { args: [string, string]; result: ImportPlan }
  'import:run': { args: [string, ImportAnswers]; result: ImportResult }
  'import:cancel': { args: [string]; result: void }
  'activity:list': { args: []; result: ActivityItem[] }
  'activity:clear': { args: []; result: ActivityItem[] }
  'activity:push': { args: ['info' | 'success' | 'error', string, string | undefined]; result: void }
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
  'health:open': { args: [string, string | null]; result: HealthOpenResult }
  'health:sample': { args: [string]; result: ServerHealth }
  'health:close': { args: [string]; result: void }
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
  'api:code': { args: [ApiRequest, string | null, string | null, ApiCodeLang]; result: string }
  'api:site-envs': { args: []; result: ApiEnvironment[] }
  'api:from-site': { args: [string]; result: ApiCollection }
  'api:cookies': { args: []; result: { host: string; names: string[] }[] }
  'api:clear-cookies': { args: []; result: void }
  'github:account': { args: []; result: { account: GitHubAccount | null; cli: boolean } }
  'azure:account': { args: []; result: AzureAccount | null }
  'azure:sign-in': { args: [string, string]; result: AzureAccount }
  'azure:sign-out': { args: []; result: void }
  'azure:projects': { args: []; result: AzureProject[] }
  'azure:repos': { args: []; result: AzureRepo[] }
  'azure:details': { args: [string, string]; result: AzureRepoDetails }
  'azure:create': { args: [{ projectId: string; name: string; clone: boolean }]; result: { repo: AzureRepo; sites: SiteInfo[] | null } }
  'azure:clone': { args: [string]; result: SiteInfo[] }
  'azure:pull-request': { args: [string, { from: string; to: string; title: string; description: string }]; result: { id: number; url: string } }
  'azure:push': { args: [string, GitPushOptions & { azureRepo?: string; azureCreate?: { projectId: string; name: string } }]; result: GitPushResult }
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
  'cmd:data': { id: string; data: string }
  'cmd:exit': { id: string; code: number | null }
  /** Open the Laramac Code page with this address (from "Open in editor" or the Laramac Code app). */
  'ide:show': { url: string | null }
  'services:changed': ServiceInfo[]
  'jobs:changed': JobInfo[]
  'sites:changed': SiteInfo[]
  'updates:changed': UpdatesReport
  'activity:changed': ActivityItem[]
  'update:available': UpdateInfo
  'shell:data': { session: string; data: string }
  'shell:exit': { session: string }
  /** The menu bar asks the window to show a page. */
  'app:navigate': string
  'dumps:new': DumpItem
  'recon:changed': ReconInfo
  'recon:line': { id: string; text: string }
}

// ---------------------------------------------------------------- Site page and Doctor

export interface HealthIssue {
  id: string
  level: 'error' | 'warn' | 'info'
  title: string
  detail: string
  site?: string
  /** What Laramac can do about it: start-web, setup-dns, restart:<service>, start-dev:<site>, logs:<site>. */
  fix?: string
  fixLabel?: string
}

export interface OutdatedPackage {
  name: string
  manager: 'npm' | 'composer'
  current: string
  wanted: string
  latest: string
  /** A new major version: read its changes before updating. */
  major: boolean
  dev: boolean
  abandoned?: boolean
}

export interface ReviewFinding {
  index: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  file?: string
  line?: number
  what?: string
  fix?: string
  /** The OWASP Top 10 category and CWE the reviewer gave, like "A05 Injection, CWE-89". */
  owasp?: string
  triage?: 'fixed' | 'accepted' | 'not-a-problem'
}

export interface ReconDiff {
  first: boolean
  since?: string
  newHosts: string[]
  goneHosts: string[]
  newSourceMaps: string[]
  newFindings: { severity: string; title: string }[]
  fixedFindings: { severity: string; title: string }[]
  newEndpoints: string[]
}

export interface UpdateItem {
  /** laramac, php:8.4, node:main, node:20, runtime:go, tool:composer, brew:httpd or site:shop. */
  id: string
  group: 'laramac' | 'php' | 'node' | 'runtime' | 'service' | 'tool' | 'site'
  name: string
  current: string | null
  latest: string
  detail: string
  jump?: 'major' | 'minor' | 'patch'
  /** Updating runs the project's own install scripts, so it needs the person's consent. */
  runsProjectCode?: boolean
  site?: string
}

export interface UpdatesReport {
  items: UpdateItem[]
  checkedAt: number
  /** Things that could not be checked, in words. */
  notes: string[]
}

export interface UpdatesApplied {
  done: string[]
  failed: { id: string; error: string }[]
  report: UpdatesReport
}

export interface SiteNodeInfo {
  /** The major version this site wants, or null when any works. */
  want: string | null
  /** Where that came from: .nvmrc, engines in package.json, chosen on its page... */
  source: string
  installed: boolean
  /** The site's own choice, when there is one. */
  chosen: string | null
  /** Major of the main Node. */
  main: string | null
}

export interface NodeVersionsInfo {
  installed: { major: string; version: string; main: boolean }[]
  /** Newest release of each major line, from nodejs.org; empty when offline. */
  available: { major: string; version: string; lts: string | false }[]
}

export interface SiteFacts {
  database: { engine: string; name: string } | null
  node: string | null
  nodeInfo: SiteNodeInfo
  git: boolean
  envFiles: { file: string; exists: boolean }[]
  reviews: ReviewInfo[]
  answers: number | null
}

// ---------------------------------------------------------------- Recon

export type ReconDepth = 'passive' | 'standard' | 'deep'
export type ReconSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface ReconStep {
  id: string
  label: string
  status: 'waiting' | 'running' | 'done' | 'skipped' | 'failed'
  detail?: string
  startedAt?: string
  ms?: number
}

export interface ReconFindingInfo {
  id: string
  severity: ReconSeverity
  title: string
  url?: string
  description?: string
  fix?: string
  kind: string
  verdict?: 'confirmed' | 'false-positive'
  aiNote?: string
}

export interface ReconInfo {
  id: string
  target: string
  domain: string
  depth: ReconDepth
  reviewer: ReviewerKind | 'none'
  createdAt: string
  finishedAt?: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  steps: ReconStep[]
  counts: Record<ReconSeverity, number>
  hosts?: number
  live?: number
  scripts?: number
  sourceMaps?: number
  endpoints?: number
  error?: string
}

export interface ReconDetail extends Omit<ReconInfo, 'hosts' | 'endpoints'> {
  findings: ReconFindingInfo[]
  hostCount?: number
  hosts: { host: string; ips: string[]; cname?: string; live?: { url: string; status: number; title?: string; tech: string[] }; sources: string[] }[]
  js: { url: string; bytes: number; sourceMap?: { url: string; files: number; sample: string[] }; endpoints: string[]; secrets: { kind: string; masked: string }[] }[]
  endpoints: string[]
  params: string[]
  urls: number
  report?: string
}

export interface ReconRequest {
  target: string
  depth: ReconDepth
  reviewer: ReviewerKind | 'none'
  /** You own the domain or have written permission to assess it. */
  authorized: boolean
}

export interface LaramacApi {
  invoke: <K extends ChannelName>(
    channel: K,
    ...args: Channels[K]['args']
  ) => Promise<Channels[K]['result']>
  on: <K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) => () => void
  platform: string
}
