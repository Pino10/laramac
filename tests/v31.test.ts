import { describe, expect, it } from 'vitest'
import { HEALTH_COMMAND, parseHealth } from '../src/main/serverhealth'
import { migrate } from '../src/main/settings'

// Output shaped like a real Ubuntu 24.04 server's answer to HEALTH_COMMAND.
const OUT = `#os
Linux 6.8.0-45-generic
#up
1209600.55 4821000.12
#load
0.52 0.61 0.70 1/432 98765
#cores
4
#mem
MemTotal:        8123456 kB
MemAvailable:    5123456 kB
SwapTotal:       2097148 kB
SwapFree:        2000000 kB
#disk
Filesystem     1024-blocks     Used Available Capacity Mounted on
/dev/vda1         50000000 20000000  30000000      40% /
#svc
cron.service
nginx.service
php8.3-fpm.service
mysql.service
ssh.service
systemd-journald.service
`

describe('server health', () => {
  it('asks with one fixed, read-only command', () => {
    expect(HEALTH_COMMAND.replace(/2>\/dev\/null/g, '')).not.toMatch(/\b(rm|reboot|shutdown|kill|sudo)\b|>/)
    expect(HEALTH_COMMAND).toContain('/proc/meminfo')
  })

  it('reads a real answer', () => {
    const h = parseHealth(OUT, 1)
    expect(h.os).toBe('Linux 6.8.0-45-generic')
    expect(h.uptimeSec).toBe(1209601)
    expect(h.cores).toBe(4)
    expect(h.load).toEqual([0.52, 0.61, 0.7])
    expect(h.memTotalKb).toBe(8123456)
    expect(h.memUsedKb).toBe(3000000)
    expect(h.swapUsedKb).toBe(97148)
    expect(h.diskTotalKb).toBe(50000000)
    expect(h.diskUsedKb).toBe(20000000)
    expect(h.services.map((s) => s.name)).toEqual(['Nginx', 'PHP-FPM', 'MySQL / MariaDB', 'Cron', 'SSH'])
  })

  it('never throws on a partial or strange answer', () => {
    const h = parseHealth('#up\n12.5 3.0\n#cores\nbanana\n')
    expect(h.uptimeSec).toBe(13)
    expect(h.cores).toBe(1)
    expect(h.memTotalKb).toBe(0)
    expect(h.services).toEqual([])
    expect(parseHealth('').load).toEqual([0, 0, 0])
  })
})

describe('the dark default', () => {
  it('moves "Like my Mac" to Dark once, and keeps what you chose', () => {
    const auto: Record<string, unknown> = { appearance: 'auto' }
    expect(migrate(auto as never)).toBe(true)
    expect(auto.appearance).toBe('dark')
    expect(auto.darkDefault).toBe(true)
    // Choosing "Like my Mac" afterwards sticks.
    const again: Record<string, unknown> = { appearance: 'auto', darkDefault: true }
    migrate(again as never)
    expect(again.appearance).toBe('auto')
    const light: Record<string, unknown> = { appearance: 'light' }
    migrate(light as never)
    expect(light.appearance).toBe('light')
  })
})
