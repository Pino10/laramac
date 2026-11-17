import type { SshServer } from '../../shared/types'
import { redact } from './redact'

/**
 * Help from Claude for a server, without giving Claude the keys to it.
 * Laramac runs one fixed set of read only commands, removes secrets from what they print, and saves the result
 * as a report. Claude reads the report on this Mac. It is never given a password, a key or a way in, and
 * anything that would change the server is something it suggests and you run yourself.
 */
export const DIAG_COMMAND = [
  "echo '#uptime'; uptime 2>/dev/null",
  "echo '#system'; (head -4 /etc/os-release 2>/dev/null || uname -a)",
  "echo '#disk'; df -h 2>/dev/null | head -20",
  "echo '#inodes'; df -i 2>/dev/null | head -10",
  "echo '#memory'; (free -m 2>/dev/null || vm_stat 2>/dev/null | head -8)",
  "echo '#busiest-processes'; ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -8",
  "echo '#failed-services'; systemctl --failed --no-pager --no-legend 2>/dev/null | head -20",
  "echo '#listening'; (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | head -30",
  "echo '#recent-errors'; journalctl -p err -n 50 --no-pager 2>/dev/null | tail -50",
  'for f in /var/log/nginx/error.log /var/log/apache2/error.log /var/log/httpd/error_log /var/log/php*-fpm.log /var/log/php-fpm/*.log /var/log/mysql/error.log /var/log/syslog /var/log/messages; do [ -r "$f" ] && { echo "#log $f"; tail -n 40 "$f"; }; done',
  "echo '#updates'; (apt list --upgradable 2>/dev/null | head -12)",
  "echo '#end'"
].join('; ')

export function buildReport(server: SshServer, output: string, at = new Date()): string {
  const clean = redact(output).slice(0, 120_000)
  return [
    `# Server report: ${server.name}`,
    '',
    `Taken ${at.toISOString()} from ${server.user}@${server.host}${server.port !== 22 ? `:${server.port}` : ''}${server.tag ? ` (${server.tag})` : ''}.`,
    server.notes ? `\nYour notes about this server: ${redact(server.notes).slice(0, 600)}` : '',
    '',
    'Everything below was read with fixed, read only commands. Passwords, keys and tokens were removed before saving.',
    '',
    '```',
    clean.trim(),
    '```',
    ''
  ].join('\n')
}

export function buildPrompt(kind: 'ask' | 'troubleshoot', question: string | null, reportPath: string, server: SshServer): string {
  const rules =
    'You have no access to the server and must not try to log in. Work only from the report. If you want to change anything, write the exact command for me to read and run myself, and say what it does and how to undo it.'
  const where = `${server.name}${server.tag === 'production' ? ' (a PRODUCTION server, so be extra careful)' : ''}`
  if (kind === 'troubleshoot') return `Read the server report in ${reportPath} for ${where}. Find what is wrong or about to go wrong (full disks, failing services, error logs, memory, updates), rank it by how urgent it is, and explain each point in plain English. ${rules}`
  const q = (question ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)
  return `I need help with my server ${where}. ${q ? `My question: ${q} ` : ''}The latest read only report is in ${reportPath}. ${rules}`
}
