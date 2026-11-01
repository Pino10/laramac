/**
 * Pure functions that turn app state into config files for Nginx, Apache, PHP-FPM, PHP and MySQL.
 * They have no Electron or filesystem dependencies, so they are easy to test.
 */

export interface SiteConf {
  domain: string
  docRoot: string
  kind: 'laravel' | 'wordpress' | 'symfony' | 'php' | 'static' | 'node'
  /** Port of the PHP-FPM pool serving this site, or null when PHP is not installed. */
  phpPort: number | null
  secure: boolean
  cert?: { cert: string; key: string }
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

export function generateNginxConf(o: NginxOptions): string {
  const servers: string[] = []

  for (const site of o.sites) {
    const secure = site.secure && !!site.cert
    const fallback = usesFrontController(site.kind) ? '/index.php?$query_string' : '=404'
    servers.push(`
server {
${nginxListen(secure, o)}
    server_name ${site.domain} *.${site.domain};
    root "${site.docRoot}";
    index index.php index.html index.htm;
${nginxSsl(site.cert, secure)}

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
    access_log "${o.accessLog}";
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
    port: number
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
    ServerName ${domain}${alias ? `\n    ServerAlias *.${domain}` : ''}
    DocumentRoot "${root}"
    DirectoryIndex index.php index.html${ssl}
    <Directory "${root}">
        Options Indexes FollowSymLinks
        AllowOverride All
        ${access}
    </Directory>${handler}
</VirtualHost>`
  }

  const blocks: string[] = []
  const emit = (
    domain: string,
    alias: boolean,
    root: string,
    phpPort: number | null,
    cert: { cert: string; key: string } | undefined,
    secure: boolean
  ): void => {
    blocks.push(vhost(domain, alias, root, phpPort, undefined, false, o.port))
    if (secure && cert) blocks.push(vhost(domain, alias, root, phpPort, cert, true, o.httpsPort))
  }

  for (const s of o.sites) emit(s.domain, true, s.docRoot, s.phpPort, s.cert, s.secure)
  for (const e of o.extras) {
    if (e.root) emit(e.domain, false, e.root, e.phpPort ?? null, e.cert, e.secure)
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
LogFormat "%h %l %u %t \\"%r\\" %>s %b" common
CustomLog "${o.accessLog}" common
${types}
${anySecure ? 'SSLSessionCache "shmcb:' + o.serverRoot + '/ssl_scache(512000)"\n' : ''}${blocks.join('\n')}
`
}

export function generateFpmConf(opts: { port: number; pidFile: string; errorLog: string }): string {
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
    lines.push('', '[MySQL]', 'mysqli.default_host = 127.0.0.1', 'mysqli.default_port = 3306', 'pdo_mysql.default_socket =')
  }
  if (o.extensions?.includes('apcu')) {
    lines.push('', '[APCu]', 'apc.enabled = 1', 'apc.shm_size = 128M', 'apc.enable_cli = 0')
  }
  if (o.extensions?.includes('intl')) {
    lines.push('', '[intl]', 'intl.default_locale = en_US')
  }
  if (o.sendmail) lines.push('', '[mail function]', `sendmail_path = "${o.sendmail}"`, 'mail.add_x_header = On')

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

export function generatePmaConfig(secret: string): string {
  return `<?php
$cfg['blowfish_secret'] = '${secret}';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = 3306;
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '';
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['Servers'][$i]['verbose'] = 'MySQL';
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = 3307;
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '';
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
export function patchLaravelEnv(env: string, dbName: string, domain: string): string {
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
  out = set(out, 'DB_PASSWORD', '')
  out = set(out, 'MAIL_MAILER', 'smtp')
  out = set(out, 'MAIL_HOST', '127.0.0.1')
  out = set(out, 'MAIL_PORT', '1025')
  return out
}
