import { EventEmitter } from 'events'
import type { ServiceGroup, ServiceId, ServiceInfo, ServiceStatus } from '../shared/types'
import type { ServiceImpl } from './svc/types'
import { php } from './svc/php'
import { nginx, apache } from './svc/webservers'
import { mysql } from './svc/mysql'
import { mailpit } from './svc/mailpit'
import { mariadb } from './svc/mariadb'
import { postgres } from './svc/postgres'
import { redis } from './svc/redis'
import { mongodb } from './svc/mongodb'

/** Start order matters: mail and database first, then PHP, then the web servers. */
const IMPLS: ServiceImpl[] = [mailpit, mysql, mariadb, postgres, redis, mongodb, php, nginx, apache]

const GROUPS: Record<ServiceId, ServiceGroup> = {
  nginx: 'web',
  apache: 'web',
  php: 'runtime',
  mysql: 'database',
  mariadb: 'database',
  postgres: 'database',
  redis: 'database',
  mongodb: 'database',
  mailpit: 'mail'
}

/** What an app needs to connect, shown on the Databases page. */
const CONNECTIONS: Partial<Record<ServiceId, string>> = {
  mysql: 'mysql://root@127.0.0.1:3306',
  mariadb: 'mysql://root@127.0.0.1:3307',
  postgres: 'postgresql://postgres@127.0.0.1:5432',
  redis: 'redis://127.0.0.1:6379',
  mongodb: 'mongodb://127.0.0.1:27017',
  mailpit: 'smtp://127.0.0.1:1025'
}

class ServiceManager extends EventEmitter {
  private transient = new Map<ServiceId, { status: ServiceStatus; error?: string }>()

  private impl(id: ServiceId): ServiceImpl {
    const found = IMPLS.find((i) => i.id === id)
    if (!found) throw new Error(`Unknown service ${id}`)
    return found
  }

  list(): ServiceInfo[] {
    return IMPLS.map((i) => {
      const t = this.transient.get(i.id)
      let status: ServiceStatus
      if (t?.status === 'starting' || t?.status === 'error') status = t.status
      else if (!i.installed()) status = 'not-installed'
      else status = i.running() ? 'running' : 'stopped'
      return {
        id: i.id,
        name: i.name,
        description: i.description,
        group: GROUPS[i.id],
        connection: CONNECTIONS[i.id],
        status,
        port: i.port(),
        version: i.version(),
        error: t?.status === 'error' ? t.error : undefined
      }
    })
  }

  /** Re-sends the list, for example after a process exits on its own. */
  refresh(): void {
    this.publish()
  }

  private publish(): void {
    this.emit('changed', this.list())
  }

  async start(id: ServiceId): Promise<void> {
    const impl = this.impl(id)
    if (!impl.installed() || impl.running()) return
    this.transient.set(id, { status: 'starting' })
    this.publish()
    try {
      await impl.start()
      this.transient.delete(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.transient.set(id, { status: 'error', error: message })
      this.emit('failed', impl.name, message)
    }
    this.publish()
  }

  async stop(id: ServiceId): Promise<void> {
    const impl = this.impl(id)
    this.transient.delete(id)
    await impl.stop()
    this.publish()
  }

  async toggle(id: ServiceId): Promise<ServiceInfo[]> {
    const impl = this.impl(id)
    if (impl.running()) await this.stop(id)
    else await this.start(id)
    return this.list()
  }

  async install(id: ServiceId): Promise<void> {
    this.transient.delete(id)
    await this.impl(id).install()
    this.publish()
  }

  async startAll(): Promise<ServiceInfo[]> {
    for (const impl of IMPLS) {
      // Apache is optional and shares sites with Nginx, so only start what is installed.
      await this.start(impl.id)
    }
    return this.list()
  }

  async stopAll(): Promise<ServiceInfo[]> {
    for (const impl of [...IMPLS].reverse()) await this.stop(impl.id)
    return this.list()
  }

  /** Rebuilds web server configs after sites, SSL or settings change. */
  async reloadWeb(): Promise<void> {
    for (const impl of [php, nginx, apache]) {
      if (impl.running()) await impl.reload?.().catch(() => undefined)
    }
    this.publish()
  }

  anyRunning(): boolean {
    return IMPLS.some((i) => i.running())
  }
}

export const services = new ServiceManager()
