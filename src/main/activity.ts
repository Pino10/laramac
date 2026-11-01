import { EventEmitter } from 'events'
import { Notification } from 'electron'
import type { ActivityItem } from '../shared/types'
import { getSettings } from './settings'

const MAX = 60

/** Recent events shown in the app, mirrored to macOS notifications when useful. */
class Activity extends EventEmitter {
  private items: ActivityItem[] = []
  private counter = 0
  /** Set by the main process: is a Laramac window focused right now? */
  isFocused: () => boolean = () => false
  /** Set by the main process: bring the window forward when a notification is clicked. */
  onNotificationClick: () => void = () => undefined

  list(): ActivityItem[] {
    return this.items
  }

  clear(): ActivityItem[] {
    this.items = []
    this.emit('changed', this.items)
    return this.items
  }

  push(kind: ActivityItem['kind'], title: string, body?: string): void {
    const item: ActivityItem = { id: `a${++this.counter}`, at: Date.now(), kind, title, body }
    this.items = [item, ...this.items].slice(0, MAX)
    this.emit('changed', this.items)

    // Errors always notify. Good news only notifies when you are in another app.
    const wanted = kind === 'error' || !this.isFocused()
    if (!wanted || !getSettings().notifications || !Notification.isSupported()) return
    const n = new Notification({
      title,
      body: body ? body.split('\n')[0].slice(0, 180) : undefined,
      silent: kind !== 'error'
    })
    n.on('click', () => this.onNotificationClick())
    n.show()
  }
}

export const activity = new Activity()
