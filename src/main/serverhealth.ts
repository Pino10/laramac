import type { ServerHealth } from '../shared/types'

/**
 * What Laramac asks a Linux server for its health. It is one fixed command: nothing the
 * person types is ever added to it, and it only reads.
 */
export const HEALTH_COMMAND =
  "echo '#os'; uname -sr; echo '#up'; cat /proc/uptime; echo '#load'; cat /proc/loadavg; echo '#cores'; nproc; " +
  "echo '#mem'; grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo; echo '#disk'; df -Pk /; " +
  "echo '#svc'; systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '{print $1}'"

/** Services worth showing by name, in the order they are shown. */
const INTERESTING: [RegExp, string][] = [
  [/^nginx/, 'Nginx'],
  [/^(apache2|httpd)/, 'Apache'],
  [/^php[\d.]*-fpm/, 'PHP-FPM'],
  [/^(mysql|mysqld|mariadb)/, 'MySQL / MariaDB'],
  [/^postgresql/, 'PostgreSQL'],
  [/^redis/, 'Redis'],
  [/^docker/, 'Docker'],
  [/^supervisor/, 'Supervisor'],
  [/^(cron|crond)/, 'Cron'],
  [/^(ssh|sshd)/, 'SSH'],
  [/^fail2ban/, 'Fail2ban'],
  [/^(ufw|firewalld)/, 'Firewall']
]

function sections(out: string): Record<string, string[]> {
  const res: Record<string, string[]> = {}
  let cur = ''
  for (const raw of out.split(/\r?\n/)) {
    const m = /^#(\w+)$/.exec(raw.trim())
    if (m) {
      cur = m[1]
      res[cur] = []
    } else if (cur && raw.trim()) res[cur].push(raw.trim())
  }
  return res
}

const num = (s: string | undefined): number => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Turns the command's output into numbers. Missing parts become zeros, never errors. */
export function parseHealth(out: string, at = Date.now()): ServerHealth {
  const s = sections(out)
  const kb = (key: string): number => num(new RegExp(`^${key}:\\s+(\\d+)`).exec((s.mem ?? []).find((l) => l.startsWith(`${key}:`)) ?? '')?.[1])
  const memTotal = kb('MemTotal')
  const memAvail = kb('MemAvailable')
  const swapTotal = kb('SwapTotal')
  const swapFree = kb('SwapFree')
  const load = (s.load?.[0] ?? '').split(/\s+/).slice(0, 3).map(num)
  // df -Pk /: the second line is "filesystem total used avail pct mount".
  const d = (s.disk?.[1] ?? '').split(/\s+/)
  const diskTotal = num(d[1])
  const diskUsed = num(d[2])
  const running = new Set<string>(s.svc ?? [])
  const services = INTERESTING.flatMap(([re, name]) => {
    const hit = [...running].find((u) => re.test(u))
    return hit ? [{ name, unit: hit.replace(/\.service$/, '') }] : []
  })
  return {
    at,
    os: s.os?.[0] ?? '',
    uptimeSec: Math.round(num((s.up?.[0] ?? '').split(/\s+/)[0])),
    cores: Math.max(1, Math.round(num(s.cores?.[0]))),
    load: [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0],
    memTotalKb: memTotal,
    memUsedKb: Math.max(0, memTotal - memAvail),
    swapTotalKb: swapTotal,
    swapUsedKb: Math.max(0, swapTotal - swapFree),
    diskTotalKb: diskTotal,
    diskUsedKb: diskUsed,
    services
  }
}
