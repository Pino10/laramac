import type { ServiceId } from '../../shared/types'

export interface ServiceImpl {
  id: ServiceId
  name: string
  description: string
  port(): number | undefined
  installed(): boolean
  version(): string | undefined
  install(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  running(): boolean
  /** Re-reads configuration after sites or settings change. */
  reload?(): Promise<void>
}
