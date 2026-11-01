import { EventEmitter } from 'events'
import type { ServiceId, ServiceInfo, ServiceStatus } from '../shared/types'
import type { ServiceImpl } from './svc/types'
import { php } from './svc/php'
import { nginx, apache } from './svc/webservers'
import { mysql } from './svc/mysql'
import { mailpit } from './svc/mailpit'

/** Start order matters: mail and database first, then PHP, then the web servers. */
const IMPLS: ServiceImpl[] = [mailpit, mysql, php, nginx, apache]

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
        status,
        port: i.port(),
        version: i.version(),
        error: t?.status === 'error' ? t.error : undefined
      }
    })
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
      this.transient.set(id, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
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
