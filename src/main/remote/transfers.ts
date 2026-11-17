import { EventEmitter } from 'events'
import type { TransferInfo } from '../../shared/types'

/**
 * The copy queue behind the progress bar at the bottom of the window.
 * One transfer is one thing you asked for (a file, a folder, a zip) made of many small tasks.
 * Tasks run a few at a time, report bytes as they go, retry once or twice when the network hiccups,
 * and can be paused or cancelled. Pausing stops what is running and keeps what is already finished.
 */
export interface TransferTask {
  name: string
  size: number
  run: (progress: (bytes: number) => void, signal: AbortSignal) => Promise<void>
}

export interface TransferSpec {
  label: string
  server: string
  direction: TransferInfo['direction']
  tasks: TransferTask[]
  /** How many tasks may run at once. FTP is one. */
  parallel?: number
  reveal?: string
  doneLabel?: string
  /** Files and bytes that are part of the total but need no task (for a zip: the one archive). */
  /** How many times a failed file is tried again. */
  retries?: number
}

interface Live {
  info: TransferInfo
  spec: TransferSpec
  pending: TransferTask[]
  active: Map<TransferTask, { sent: number; abort: AbortController }>
  /** Bytes in tasks that have fully finished. */
  finished: number
  window: { at: number; bytes: number }[]
  paused: boolean
  cancelled: boolean
  failed: string | null
}

/** Says what went wrong in words that make sense without knowing what SFTP is. */
export function friendlyError(message: string): string {
  const m = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').trim()
  if (/no such file/i.test(m)) return 'it is not there (the folder or file is missing on the server, or was moved)'
  if (/permission denied/i.test(m)) return 'the server did not allow it (permissions)'
  if (/^failure$/i.test(m)) return 'the server could not save it (is its disk full?)'
  if (/ECONNRESET|EPIPE|not connected|closed|timed out|ETIMEDOUT|ENOTFOUND/i.test(m)) return 'the connection to the server dropped'
  if (/EACCES/i.test(m)) return 'this Mac did not allow it (permissions)'
  if (/ENOSPC/i.test(m)) return 'this Mac has no space left'
  return m || 'something went wrong'
}

export class Transfers extends EventEmitter {
  private all = new Map<string, Live>()
  private counter = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Bytes per second across everything, 0 for no limit. */
  limitBps = 0
  parallel = 3

  list(): TransferInfo[] {
    return [...this.all.values()].map((l) => ({ ...l.info }))
  }

  start(spec: TransferSpec): string {
    const id = `t${++this.counter}`
    const total = spec.tasks.reduce((n, t) => n + t.size, 0)
    const live: Live = {
      info: {
        id,
        label: spec.label,
        server: spec.server,
        direction: spec.direction,
        status: 'queued',
        done: 0,
        total,
        files: spec.tasks.length,
        filesDone: 0,
        speed: 0,
        eta: null,
        reveal: spec.reveal,
        doneLabel: spec.doneLabel
      },
      spec,
      pending: [...spec.tasks],
      active: new Map(),
      finished: 0,
      window: [],
      paused: false,
      cancelled: false,
      failed: null
    }
    this.all.set(id, live)
    this.publish(true)
    queueMicrotask(() => this.pump(live))
    return id
  }

  pause(id: string): void {
    const l = this.all.get(id)
    if (!l || !['queued', 'running'].includes(l.info.status)) return
    l.paused = true
    l.info.status = 'paused'
    l.info.speed = 0
    l.info.eta = null
    // What was half way goes back in the queue and starts again from its beginning on resume.
    for (const [task, run] of l.active) {
      run.abort.abort()
      l.pending.unshift(task)
    }
    l.active.clear()
    this.recount(l)
    this.publish(true)
  }

  resume(id: string): void {
    const l = this.all.get(id)
    if (!l || l.info.status !== 'paused') return
    l.paused = false
    l.info.status = 'running'
    this.publish(true)
    this.pump(l)
  }

  cancel(id: string): void {
    const l = this.all.get(id)
    if (!l || ['done', 'error', 'cancelled'].includes(l.info.status)) return
    l.cancelled = true
    for (const run of l.active.values()) run.abort.abort()
    l.active.clear()
    l.pending = []
    l.info.status = 'cancelled'
    l.info.speed = 0
    l.info.eta = null
    l.info.current = undefined
    this.publish(true)
    this.emit('finished', { ...l.info })
  }

  /** Removes finished, failed and cancelled ones from the bar. */
  clear(): void {
    for (const [id, l] of this.all) if (['done', 'error', 'cancelled'].includes(l.info.status)) this.all.delete(id)
    this.publish(true)
  }

  private recount(l: Live): void {
    let live = 0
    for (const r of l.active.values()) live += r.sent
    l.info.done = Math.min(l.info.total || l.finished + live, l.finished + live)
  }

  private pump(l: Live): void {
    if (l.paused || l.cancelled || l.failed) return
    if (l.info.status === 'queued') l.info.status = 'running'
    const slots = Math.max(1, Math.min(l.spec.parallel ?? this.parallel, this.parallel))
    while (l.active.size < slots && l.pending.length > 0) {
      const task = l.pending.shift()!
      void this.runTask(l, task)
    }
    if (l.active.size === 0 && l.pending.length === 0) this.finish(l)
    this.publish()
  }

  private async runTask(l: Live, task: TransferTask): Promise<void> {
    const abort = new AbortController()
    const run = { sent: 0, abort }
    l.active.set(task, run)
    l.info.current = task.name
    const retries = l.spec.retries ?? 2
    let lastErr: Error | null = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      run.sent = 0
      try {
        await task.run((bytes) => this.onBytes(l, run, bytes), abort.signal)
        lastErr = null
        break
      } catch (err) {
        if (abort.signal.aborted) return // paused or cancelled: whoever did that has put things in order
        lastErr = err as Error
        // A missing file or a refused permission will not get better by asking again.
        if (/permission|denied|no such file|not found|read.?only/i.test(lastErr.message)) break
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    if (!l.active.has(task)) return
    l.active.delete(task)
    if (lastErr) {
      l.failed = `${task.name}: ${friendlyError(lastErr.message)}`
      for (const r of l.active.values()) r.abort.abort()
      l.active.clear()
      l.pending = []
      l.info.status = 'error'
      l.info.error = l.failed
      l.info.speed = 0
      l.info.eta = null
      this.publish(true)
      this.emit('finished', { ...l.info })
      return
    }
    l.finished += task.size
    l.info.filesDone++
    this.recount(l)
    this.pump(l)
  }

  private onBytes(l: Live, run: { sent: number }, bytes: number): void {
    run.sent += bytes
    this.recount(l)
    const now = Date.now()
    l.window.push({ at: now, bytes })
    while (l.window.length > 1 && now - l.window[0].at > 3000) l.window.shift()
    const span = Math.max(500, now - l.window[0].at)
    l.info.speed = Math.round(l.window.reduce((n, w) => n + w.bytes, 0) / (span / 1000))
    l.info.eta = l.info.speed > 0 && l.info.total > l.info.done ? Math.round((l.info.total - l.info.done) / l.info.speed) : null
    this.publish()
  }

  private finish(l: Live): void {
    if (['done', 'error', 'cancelled'].includes(l.info.status)) return
    l.info.status = 'done'
    l.info.done = l.info.total
    l.info.filesDone = l.info.files
    l.info.speed = 0
    l.info.eta = 0
    l.info.current = undefined
    this.publish(true)
    this.emit('finished', { ...l.info })
  }

  /** Progress arrives many times a second; the window hears about it a few times a second. */
  private publish(now = false): void {
    if (now) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.emit('changed', this.list())
      return
    }
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.emit('changed', this.list())
    }, 150)
  }
}

/** Slows a copy down to a limit, so a big upload does not use up the connection. 0 means no limit. */
export function throttle(limitBps: number): (bytes: number) => Promise<void> {
  let windowStart = Date.now()
  let used = 0
  return async (bytes) => {
    if (limitBps <= 0) return
    used += bytes
    const due = windowStart + (used / limitBps) * 1000
    const wait = due - Date.now()
    if (wait > 5) await new Promise((r) => setTimeout(r, wait))
    if (Date.now() - windowStart > 4000) {
      windowStart = Date.now()
      used = 0
    }
  }
}

export const transfers = new Transfers()
