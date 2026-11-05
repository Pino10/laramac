/**
 * Pure functions that turn app state into config files for Nginx, Apache, PHP-FPM, PHP and MySQL.
 * They have no Electron or filesystem dependencies, so they are easy to test.
 */

export interface SiteConf {
  domain: string
  docRoot: string
  kind: 'laravel' | 'wordpress' | 'symfony' | 'php' | 'static' | 'node' | 'python' | 'dotnet' | 'go' | 'rust' | 'swift'
  /** Passes every request to a development server, such as http://127.0.0.1:5170. */
  proxyTo?: string
  /** Port of the PHP-FPM pool serving this site, or null when PHP is not installed. */
  phpPort: number | null
  secure: boolean
  cert?: { cert: string; key: string }
  /** More names that serve this site: name.localhost and any you add. */
  aliases?: string[]
  /** Answer cross-origin requests from local pages (localhost and .test addresses only). */
  cors?: { tld: string }
}

/** Origins that may call a site with CORS on: this Mac's own addresses, never the internet. */
export const corsOriginPattern = (tld: string): string => `^https?://(localhost|127\\.0\\.0\\.1|([a-z0-9-]+\\.)*${tld.replace(/[^a-z0-9-]/gi, '')})(:[0-9]+)?$`

/** One line per request in the access logs, read by the site page's Requests tab. */
export const NGINX_LOG_FORMAT = "log_format laramac 'n|$time_iso8601|$host|$request_method|$request_uri|$status|$request_time|$body_bytes_sent';"
export const APACHE_LOG_FORMAT = 'LogFormat "a|%{%Y-%m-%dT%H:%M:%S%z}t|%V|%m|%U%q|%>s|%D|%B" laramac'

function nginxCors(site: SiteConf): string {
  if (!site.cors) return ''
  return `
    set $laramac_cors "";
    if ($http_origin ~* "${corsOriginPattern(site.cors.tld)}") { set $laramac_cors $http_origin; }
    add_header Access-Control-Allow-Origin $laramac_cors always;
    add_header Access-Control-Allow-Credentials "true" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, X-CSRF-TOKEN, X-XSRF-TOKEN" always;
    add_header Vary Origin always;
    if ($request_method = OPTIONS) { return 204; }`
}

function apacheCors(cors: SiteConf['cors']): string {
  if (!cors) return ''
  return `
    <If "%{HTTP:Origin} =~ m#${corsOriginPattern(cors.tld)}#i">
        Header always set Access-Control-Allow-Origin "expr=%{req:Origin}"
        Header always set Access-Control-Allow-Credentials "true"
        Header always set Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, X-CSRF-TOKEN, X-XSRF-TOKEN"
        Header always merge Vary "Origin"
    </If>
    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} =OPTIONS
    RewriteCond %{HTTP:Origin} .
    RewriteRule ^ - [R=204,L]`
}

/** Serves every project folder at http://localhost/<folder>, the way Laragon does. */
export interface LocalhostRoot {
  root: string
  phpPort: number | null
}

/** Extra virtual hosts the app provides itself (phpMyAdmin, Mailpit). */
export interface ExtraHost {
  domain: string
  secure: boolean
  cert?: { cert: string; key: string }
  root?: string
  phpPort?: number | null
  proxyTo?: string
}

export function phpPortFor(minor: string): number {
  const [major, mn] = minor.split('.').map((n) => parseInt(n, 10))
  return 9000 + major * 10 + mn
}

const usesFrontController = (kind: SiteConf['kind']): boolean =>
  kind === 'laravel' || kind === 'wordpress' || kind === 'symfony' || kind === 'php'

const MIME_TYPES: Record<string, string> = {
  'text/html': 'html htm shtml',
  'text/css': 'css',
  'text/plain': 'txt',
  'text/xml': 'xml',
  'text/csv': 'csv',
  'application/javascript': 'js mjs',
  'application/json': 'json map',
  'application/manifest+json': 'webmanifest',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/wasm': 'wasm',
  'image/gif': 'gif',
  'image/jpeg': 'jpeg jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg svgz',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
}

export function nginxMimeTypes(): string {
  const lines = Object.entries(MIME_TYPES).map(([type, exts]) => `  ${type} ${exts};`)
  return `types {\n${lines.join('\n')}\n}`
}

export function fastcgiParams(): string {
  return [
    'fastcgi_param QUERY_STRING $query_string;',
    'fastcgi_param REQUEST_METHOD $request_method;',
    'fastcgi_param CONTENT_TYPE $content_type;',
    'fastcgi_param CONTENT_LENGTH $content_length;',
    'fastcgi_param SCRIPT_NAME $fastcgi_script_name;',
    'fastcgi_param REQUEST_URI $request_uri;',
    'fastcgi_param DOCUMENT_URI $document_uri;',
    'fastcgi_param DOCUMENT_ROOT $document_root;',
    'fastcgi_param SERVER_PROTOCOL $server_protocol;',
    'fastcgi_param REQUEST_SCHEME $scheme;',
    'fastcgi_param HTTPS $https if_not_empty;',
    'fastcgi_param GATEWAY_INTERFACE CGI/1.1;',
    'fastcgi_param SERVER_SOFTWARE nginx/$nginx_version;',
    'fastcgi_param REMOTE_ADDR $remote_addr;',
    'fastcgi_param REMOTE_PORT $remote_port;',
    'fastcgi_param SERVER_ADDR $server_addr;',
    'fastcgi_param SERVER_PORT $server_port;',
    'fastcgi_param SERVER_NAME $server_name;',
    'fastcgi_param REDIRECT_STATUS 200;',
    ''
  ].join('\n')
}

export interface NginxOptions {
  sites: SiteConf[]
  extras: ExtraHost[]
  httpPort: number
  httpsPort: number
  pidFile: string
  errorLog: string
  accessLog: string
  fastcgiParamsFile: string
  tempDir: string
  /** When false, only this Mac may connect (tunnels connect locally, so they still work). */
  allowLan?: boolean
  localhost?: LocalhostRoot | null
}

function nginxListen(secure: boolean, o: NginxOptions): string {
  const lines = [`    listen ${o.httpPort};`]
  if (secure) lines.push(`    listen ${o.httpsPort} ssl;`)
  return lines.join('\n')
}

function nginxSsl(cert: { cert: string; key: string } | undefined, secure: boolean): string {
  if (!secure || !cert) return ''
  return [
    `    ssl_certificate "${cert.cert}";`,
    `    ssl_certificate_key "${cert.key}";`,
    '    ssl_protocols TLSv1.2 TLSv1.3;'
  ].join('\n')
}

function nginxPhpBlock(phpPort: number | null, o: NginxOptions): string {
  if (phpPort === null) return ''
  return `
    location ~ \\.php(?:$|/) {
        fastcgi_split_path_info ^(.+\\.php)(/.+)$;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        include "${o.fastcgiParamsFile}";
        fastcgi_pass 127.0.0.1:${phpPort};
        fastcgi_read_timeout 300;
    }`
}

/**
 * Passes a site through to its dev server. The dev server sees its own address as the host,
 * which is what Vite, Angular and others accept by default; the real name goes in X-Forwarded-Host.
 */
function nginxProxy(to: string, domain: string): string {
  const upstream = to.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `    error_page 502 504 = @devdown;
    location / {
        proxy_pass ${to};
        proxy_http_version 1.1;
        proxy_set_header Host ${upstream};
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
        proxy_buffering off;
    }
    location @devdown {
        default_type text/html;
        return 503 '${devDownPage(domain)}';
    }`
}

/** Shown when the dev server is not running, instead of a bare gateway error. */
export function devDownPage(domain: string): string {
  return `<!doctype html><meta charset=utf-8><title>${domain}</title><body style="font:15px -apple-system,system-ui;display:grid;place-items:center;height:90vh;color:#444;background:#f6f5fb"><div style="text-align:center"><h2 style="color:#7c3aed">${domain} is not running</h2><p>Start its dev server in Laramac, on the Sites page. This page reloads by itself.</p></div><script>setTimeout(function(){location.reload()},2500)</script></body>`
}

export function generateNginxConf(o: NginxOptions): string {
  const servers: string[] = []

  if (o.localhost) {
    servers.push(`
server {
    listen ${o.httpPort} default_server;
    server_name localhost 127.0.0.1 [::1];
    root "${o.localhost.root}";
    index index.php index.html index.htm;
    autoindex on;

    location / {
        try_files $uri $uri/ =404;
    }
${nginxPhpBlock(o.localhost.phpPort, o)}

    location ~ /\\.(?!well-known) {
        deny all;
    }
}`)
  }

  for (const site of o.sites) {
    const secure = site.secure && !!site.cert
    if (site.proxyTo) {
      servers.push(`
server {
${nginxListen(secure, o)}
    server_name ${site.domain} *.${site.domain}${(site.aliases ?? []).map((a) => ` ${a}`).join('')};
${nginxSsl(site.cert, secure)}${nginxCors(site)}
${nginxProxy(site.proxyTo, site.domain)}
}`)
      continue
    }
    const fallback = usesFrontController(site.kind) ? '/index.php?$query_string' : '=404'
    servers.push(`
server {
${nginxListen(secure, o)}
    server_name ${site.domain} *.${site.domain}${(site.aliases ?? []).map((a) => ` ${a}`).join('')};
    root "${site.docRoot}";
    index index.php index.html index.htm;
${nginxSsl(site.cert, secure)}${nginxCors(site)}

    location / {
        try_files $uri $uri/ ${fallback};
    }
${nginxPhpBlock(site.phpPort, o)}

    location ~ /\\.(?!well-known) {
        deny all;
    }
}`)
  }

  for (const host of o.extras) {
    const secure = host.secure && !!host.cert
    if (host.proxyTo) {
      servers.push(`
server {
${nginxListen(secure, o)}
    server_name ${host.domain};
${nginxSsl(host.cert, secure)}

    location / {
        proxy_pass ${host.proxyTo};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}`)
    } else if (host.root) {
      servers.push(`
server {
${nginxListen(secure, o)}
    server_name ${host.domain};
    root "${host.root}";
    index index.php index.html;
${nginxSsl(host.cert, secure)}

    location / {
        try_files $uri $uri/ =404;
    }
${nginxPhpBlock(host.phpPort ?? null, o)}
}`)
    }
  }

  return `# Generated by Laramac. Changes are overwritten.
worker_processes 1;
daemon off;
pid "${o.pidFile}";
error_log "${o.errorLog}" warn;

events {
    worker_connections 1024;
}

http {
${nginxMimeTypes()}
    default_type application/octet-stream;
    ${NGINX_LOG_FORMAT}
    access_log "${o.accessLog}" laramac;
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 512m;
${o.allowLan ? '' : '    allow 127.0.0.1;\n    allow ::1;\n    deny all;\n'}    server_names_hash_bucket_size 128;
    client_body_temp_path "${o.tempDir}/client_body";
    proxy_temp_path "${o.tempDir}/proxy";
    fastcgi_temp_path "${o.tempDir}/fastcgi";
    uwsgi_temp_path "${o.tempDir}/uwsgi";
    scgi_temp_path "${o.tempDir}/scgi";
${servers.join('\n')}
}
`
}

export interface ApacheOptions {
  sites: SiteConf[]
  extras: ExtraHost[]
  port: number
  httpsPort: number
  modulesDir: string
  mimeTypesFile?: string
  pidFile: string
  errorLog: string
  accessLog: string
  /** Directory Apache treats as its server root; used for relative paths only. */
  serverRoot: string
  allowLan?: boolean
  localhost?: LocalhostRoot | null
}

const APACHE_MODULES: [string, string][] = [
  ['mpm_event_module', 'mod_mpm_event.so'],
  ['authz_core_module', 'mod_authz_core.so'],
  // Provides "Require local", which keeps sites private to this Mac.
  ['authz_host_module', 'mod_authz_host.so'],
  ['unixd_module', 'mod_unixd.so'],
  ['log_config_module', 'mod_log_config.so'],
  ['mime_module', 'mod_mime.so'],
  ['dir_module', 'mod_dir.so'],
  ['alias_module', 'mod_alias.so'],
  ['rewrite_module', 'mod_rewrite.so'],
  ['headers_module', 'mod_headers.so'],
  ['proxy_module', 'mod_proxy.so'],
  ['proxy_fcgi_module', 'mod_proxy_fcgi.so'],
  // Passes sites through to their dev servers, including live-reload WebSockets.
  ['proxy_http_module', 'mod_proxy_http.so'],
  ['proxy_wstunnel_module', 'mod_proxy_wstunnel.so'],
  ['socache_shmcb_module', 'mod_socache_shmcb.so'],
  ['ssl_module', 'mod_ssl.so']
]

export function generateApacheConf(o: ApacheOptions): string {
  const anySecure =
    o.sites.some((s) => s.secure && s.cert) || o.extras.some((e) => e.secure && e.cert)

  const modules = APACHE_MODULES.filter(([, file]) => anySecure || !file.includes('ssl'))
    .map(([name, file]) => `LoadModule ${name} "${o.modulesDir}/${file}"`)
    .join('\n')

  // Apache must listen on every interface to use port 80 without root on macOS, so access is
  // limited here instead: "Require local" admits only this Mac (tunnels connect locally too).
  const access = o.allowLan ? 'Require all granted' : 'Require local'

  const vhost = (
    domain: string,
    alias: boolean,
    root: string,
    phpPort: number | null,
    cert: { cert: string; key: string } | undefined,
    secure: boolean,
    port: number,
    extraNames: string[] = [],
    cors?: SiteConf['cors']
  ): string => {
    const handler =
      phpPort === null
        ? ''
        : `
    <FilesMatch "\\.php$">
        SetHandler "proxy:fcgi://127.0.0.1:${phpPort}"
    </FilesMatch>`
    const ssl = secure && cert
      ? `
    SSLEngine on
    SSLCertificateFile "${cert.cert}"
    SSLCertificateKeyFile "${cert.key}"`
      : ''
    return `
<VirtualHost *:${port}>
    ServerName ${domain}${alias ? `\n    ServerAlias *.${domain}` : ''}${extraNames.length ? `\n    ServerAlias ${extraNames.join(' ')}` : ''}
    DocumentRoot "${root}"
    DirectoryIndex index.php index.html${ssl}${apacheCors(cors)}
    <Directory "${root}">
        Options Indexes FollowSymLinks
        AllowOverride All
        ${access}
    </Directory>${handler}
</VirtualHost>`
  }

  const proxyHost = (domain: string, to: string, cert: { cert: string; key: string } | undefined, secure: boolean, port: number, extraNames: string[], cors?: SiteConf['cors']): string => {
    const target = to.replace(/\/?$/, '/')
    const ssl = secure && cert ? `\n    SSLEngine on\n    SSLCertificateFile "${cert.cert}"\n    SSLCertificateKeyFile "${cert.key}"` : ''
    return `
<VirtualHost *:${port}>
    ServerName ${domain}
    ServerAlias *.${domain}${extraNames.length ? ` ${extraNames.join(' ')}` : ''}${ssl}
    ProxyRequests Off
    ProxyPreserveHost Off
    ProxyTimeout 3600
    RequestHeader set X-Forwarded-Proto "${secure ? 'https' : 'http'}"${apacheCors(cors)}
    <Location />
        ${access}
    </Location>
    ProxyPass / ${target} upgrade=websocket
    ProxyPassReverse / ${target}
    ErrorDocument 503 "${devDownPage(domain).replace(/"/g, "'")}"
</VirtualHost>`
  }

  const blocks: string[] = []
  const emit = (
    domain: string,
    alias: boolean,
    root: string,
    phpPort: number | null,
    cert: { cert: string; key: string } | undefined,
    secure: boolean,
    extraNames: string[] = [],
    cors?: SiteConf['cors']
  ): void => {
    blocks.push(vhost(domain, alias, root, phpPort, undefined, false, o.port, extraNames, cors))
    if (secure && cert) blocks.push(vhost(domain, alias, root, phpPort, cert, true, o.httpsPort, [], cors))
  }

  // The first virtual host answers any name Apache does not recognise, so localhost goes first.
  if (o.localhost) emit('localhost', false, o.localhost.root, o.localhost.phpPort, undefined, false, ['127.0.0.1', '[::1]'])
  for (const s of o.sites) {
    if (s.proxyTo) {
      blocks.push(proxyHost(s.domain, s.proxyTo, undefined, false, o.port, s.aliases ?? [], s.cors))
      if (s.secure && s.cert) blocks.push(proxyHost(s.domain, s.proxyTo, s.cert, true, o.httpsPort, s.aliases ?? [], s.cors))
    } else emit(s.domain, true, s.docRoot, s.phpPort, s.cert, s.secure, s.aliases ?? [], s.cors)
  }
  for (const e of o.extras) {
    if (e.root) emit(e.domain, false, e.root, e.phpPort ?? null, e.cert, e.secure)
    else if (e.proxyTo) blocks.push(proxyHost(e.domain, e.proxyTo, undefined, false, o.port, []))
  }

  const types = o.mimeTypesFile
    ? `TypesConfig "${o.mimeTypesFile}"`
    : [
        'AddType text/css .css',
        'AddType application/javascript .js .mjs',
        'AddType application/json .json',
        'AddType image/svg+xml .svg',
        'AddType image/webp .webp',
        'AddType font/woff2 .woff2'
      ].join('\n')

  return `# Generated by Laramac. Changes are overwritten.
ServerRoot "${o.serverRoot}"
Listen ${o.port}${anySecure ? `\nListen ${o.httpsPort}` : ''}
PidFile "${o.pidFile}"
ServerName localhost
${modules}

<Directory />
    AllowOverride none
    Require all denied
</Directory>

ErrorLog "${o.errorLog}"
LogLevel warn
${APACHE_LOG_FORMAT}
CustomLog "${o.accessLog}" laramac
${types}
${anySecure ? 'SSLSessionCache "shmcb:' + o.serverRoot + '/ssl_scache(512000)"\n' : ''}${blocks.join('\n')}
`
}

export function generateFpmConf(opts: { port: number; pidFile: string; errorLog: string; env?: Record<string, string> }): string {
  return `[global]
pid = ${opts.pidFile}
error_log = ${opts.errorLog}
daemonize = no

[www]
listen = 127.0.0.1:${opts.port}
pm = dynamic
pm.max_children = 8
pm.start_servers = 2
pm.min_spare_servers = 1
pm.max_spare_servers = 3
clear_env = no
catch_workers_output = yes
decorate_workers_output = no
${Object.entries(opts.env ?? {})
  .map(([k, v]) => `env[${k}] = ${v}`)
  .join('\n')}
`
}

export interface PhpIniOptions {
  minor?: string
  sendmail?: string
  errorLog: string
  sessionDir?: string
  /** Extensions compiled into this build, used to add their settings. */
  extensions?: string[]
  /** Your own lines, appended last so they win. */
  custom?: string
  timezone?: string
  /** MySQL's socket, so 'localhost' in a project's config reaches Laramac's MySQL. */
  mysqlSocket?: string
  /** Full path of xdebug.so, when Xdebug (debugging or the profiler) is turned on. */
  xdebug?: string | null
  /** Step debugging. On unless this says false (the profiler alone loads Xdebug too). */
  debug?: boolean
  /** Where profiles go, when the profiler is on. */
  profileDir?: string | null
}

/** Host first, so each site's profiles can be told apart: cachegrind.out.<host>.<time><path>. */
export const PROFILE_NAME = 'cachegrind.out.%H.%u%R'

/** The php.ini lines for Xdebug, for step debugging, profiling or both. */
export function xdebugIni(so: string, o: { debug: boolean; profile: boolean; outputDir: string }): string[] {
  const modes = [o.debug && 'debug', o.profile && 'profile'].filter(Boolean).join(',')
  return [
    '',
    '[xdebug]',
    `zend_extension = "${so}"`,
    `xdebug.mode = ${modes}`,
    // With the profiler on, only requests that ask (the XDEBUG_PROFILE cookie) are profiled, so
    // pages stay fast, and the debugger waits for its own trigger (XDEBUG_SESSION) too.
    // Debugging alone starts on every request, as before.
    `xdebug.start_with_request = ${o.profile ? 'trigger' : 'yes'}`,
    'xdebug.client_host = 127.0.0.1',
    'xdebug.client_port = 9003',
    ...(o.profile ? [`xdebug.output_dir = "${o.outputDir}"`, `xdebug.profiler_output_name = ${PROFILE_NAME}`] : []),
    // No warning in the log on every request when the editor is not listening.
    'xdebug.log_level = 0'
  ]
}

/**
 * php.ini tuned for local development and for the PHP version in use. Extensions in Laramac's
 * builds are compiled in, so nothing needs an extension= line; this sets what they need instead.
 */
export function generatePhpIni(o: PhpIniOptions): string {
  const [major, minor] = (o.minor ?? '8.4').split('.').map((n) => parseInt(n, 10))
  const at = (ma: number, mi: number): boolean => major > ma || (major === ma && minor >= mi)
  const has = (ext: string): boolean => !o.extensions || o.extensions.length === 0 || o.extensions.includes(ext)

  const lines = [
    `; Generated by Laramac for PHP ${o.minor ?? ''}. Changes here are overwritten:`,
    '; put your own settings in the custom file (PHP page > Edit php.ini).',
    '',
    '[PHP]',
    'memory_limit = 512M',
    'upload_max_filesize = 256M',
    'post_max_size = 256M',
    'max_execution_time = 300',
    'max_input_time = 300',
    'max_input_vars = 10000',
    'display_errors = On',
    'display_startup_errors = On',
    'error_reporting = E_ALL',
    'log_errors = On',
    `error_log = "${o.errorLog}"`,
    'html_errors = On',
    'expose_php = Off',
    'short_open_tag = Off',
    'variables_order = "EGPCS"',
    'default_charset = "UTF-8"',
    'realpath_cache_size = 4096K',
    'realpath_cache_ttl = 600',
    // Assertions on, as frameworks and tests expect in development.
    'zend.assertions = 1',
    '',
    '[Date]',
    `date.timezone = "${o.timezone ?? 'UTC'}"`,
    '',
    '[Session]',
    ...(o.sessionDir ? [`session.save_path = "${o.sessionDir}"`] : []),
    'session.use_strict_mode = 1',
    'session.cookie_httponly = On',
    'session.cookie_samesite = "Lax"',
    // PHP 8.4 deprecated session.sid_length and session.sid_bits_per_character; they are left unset.
    '',
    '[TLS]',
    // Static builds cannot find the system certificates on their own.
    'openssl.cafile = "/etc/ssl/cert.pem"',
    'curl.cainfo = "/etc/ssl/cert.pem"',
    '',
    '[opcache]',
    'opcache.enable = 1',
    'opcache.enable_cli = 0',
    'opcache.memory_consumption = 256',
    'opcache.interned_strings_buffer = 32',
    'opcache.max_accelerated_files = 50000',
    'opcache.validate_timestamps = 1',
    'opcache.revalidate_freq = 0',
    'opcache.save_comments = 1',
    // JIT stays off: it gets in the way of debuggers. 8.4+ already defaults to opcache.jit=disable.
    ...(at(8, 4) ? [] : ['opcache.jit = off'])
  ]

  if (has('mysqli') || has('pdo_mysql')) {
    // PHP treats the host "localhost" as "use the socket file" rather than TCP, so point every
    // MySQL extension at Laramac's socket. Then 'localhost', '127.0.0.1' and 'localhost:3306' all work.
    const sock = o.mysqlSocket ? `"${o.mysqlSocket}"` : ''
    lines.push(
      '',
      '[MySQL]',
      'mysqli.default_host = 127.0.0.1',
      'mysqli.default_port = 3306',
      `mysqli.default_socket = ${sock}`,
      `pdo_mysql.default_socket = ${sock}`,
      `mysql.default_socket = ${sock}`
    )
  }
  if (o.extensions?.includes('apcu')) {
    lines.push('', '[APCu]', 'apc.enabled = 1', 'apc.shm_size = 128M', 'apc.enable_cli = 0')
  }
  if (o.extensions?.includes('intl')) {
    lines.push('', '[intl]', 'intl.default_locale = en_US')
  }
  if (o.sendmail) lines.push('', '[mail function]', `sendmail_path = "${o.sendmail}"`, 'mail.add_x_header = On')

  if (o.xdebug && (o.debug !== false || o.profileDir)) {
    lines.push(...xdebugIni(o.xdebug, { debug: o.debug !== false, profile: !!o.profileDir, outputDir: o.profileDir ?? '' }))
  }
  if (o.custom && o.custom.trim()) {
    lines.push('', '; ---- Your settings (php.custom.ini) ----', o.custom.trim())
  }
  return lines.join('\n') + '\n'
}

export function generateMyCnf(opts: {
  baseDir: string
  dataDir: string
  socket: string
  pidFile: string
  errorLog: string
  port: number
  nativePassword: boolean
}): string {
  return `[mysqld]
basedir = "${opts.baseDir}"
datadir = "${opts.dataDir}"
port = ${opts.port}
bind-address = 127.0.0.1
mysqlx = OFF
socket = "${opts.socket}"
pid-file = "${opts.pidFile}"
log-error = "${opts.errorLog}"
max_allowed_packet = 256M
${opts.nativePassword ? 'mysql_native_password = ON\n' : ''}
[client]
socket = "${opts.socket}"
`
}

export function generatePmaConfig(secret: string, passwords: { mysql?: string; mariadb?: string } = {}): string {
  const q = (s = ''): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `<?php
$cfg['blowfish_secret'] = '${secret}';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = 3306;
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '${q(passwords.mysql)}';
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['Servers'][$i]['verbose'] = 'MySQL';
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = 3307;
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '${q(passwords.mariadb)}';
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['Servers'][$i]['verbose'] = 'MariaDB';
$cfg['ServerDefault'] = 1;
$cfg['ThemeDefault'] = 'pmahomme';
$cfg['ShowPhpInfo'] = false;
$cfg['VersionCheck'] = false;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
`
}

/** Points a Laravel .env at the local MySQL and Mailpit. */
export function patchLaravelEnv(env: string, dbName: string, domain: string, password = ''): string {
  const set = (text: string, key: string, value: string): string => {
    const re = new RegExp(`^#?\\s*${key}=.*$`, 'm')
    return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`
  }
  let out = env
  out = set(out, 'APP_URL', `http://${domain}`)
  out = set(out, 'DB_CONNECTION', 'mysql')
  out = set(out, 'DB_HOST', '127.0.0.1')
  out = set(out, 'DB_PORT', '3306')
  out = set(out, 'DB_DATABASE', dbName)
  out = set(out, 'DB_USERNAME', 'root')
  out = set(out, 'DB_PASSWORD', password)
  out = set(out, 'MAIL_MAILER', 'smtp')
  out = set(out, 'MAIL_HOST', '127.0.0.1')
  out = set(out, 'MAIL_PORT', '1025')
  return out
}
