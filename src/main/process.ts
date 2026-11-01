import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync, readFileSync } from 'fs'
import { connect } from 'net'
import { EventEmitter } from 'events'

/** Every managed process reports unexpected exits here, so the app can tell the user. */
export const processEvents = new EventEmitter()

export function waitForPort(port: number, timeoutMs: number, host = '127.0.0.1'): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = (): void => {
      const socket = connect({ port, host })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, 200)
      })
    }
    attempt()
  })
}

export function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return waitForPort(port, 0, host)
}

export function tailFile(path: string, lines = 12): string {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf8').trim().split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

export interface ProcessSpec {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  logFile: string
  /** Runs in its own process group, so stopping also stops everything it started (npm, then Vite). */
  group?: boolean
}

/** A long-running child process with log capture, readiness checks and graceful shutdown. */
export class ManagedProcess extends EventEmitter {
  private child: ChildProcess | null = null
  private stopping = false
  private group = false

  constructor(public readonly name: string) {
    super()
  }

  get running(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  async start(spec: ProcessSpec, readyPort?: number, timeoutMs = 15000): Promise<void> {
    if (this.running) return
    this.stopping = false

    const log = createWriteStream(spec.logFile, { flags: 'a' })
    log.write(`\n--- ${new Date().toISOString()} starting ${this.name} ---\n`)

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !!spec.group
    })
    this.group = !!spec.group
    this.child = child
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })

    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => {
        log.end()
        if (this.child === child) this.child = null
        resolve(code)
        if (!this.stopping) {
          this.emit('crashed', code)
          processEvents.emit('crashed', this.name, code, spec.logFile)
        }
      })
      child.once('error', () => resolve(-1))
    })

    if (readyPort === undefined) return

    const ready = waitForPort(readyPort, timeoutMs)
    const winner = await Promise.race([ready.then(() => 'ready' as const), exited.then(() => 'exited' as const)])
    if (winner === 'exited') {
      throw new Error(`${this.name} stopped right after starting.\n${tailFile(spec.logFile)}`)
    }
    if (!(await ready)) {
      await this.stop()
      throw new Error(`${this.name} did not become ready in time.\n${tailFile(spec.logFile)}`)
    }
  }

  async stop(timeoutMs = 6000, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    const child = this.child
    if (!child || child.exitCode !== null) {
      this.child = null
      return
    }
    this.stopping = true
    await new Promise<void>((resolve) => {
      const kill = (sig: NodeJS.Signals): void => {
        if (this.group && child.pid) {
          try {
            process.kill(-child.pid, sig)
            return
          } catch {
            // The group is gone; fall back to the process itself.
          }
        }
        child.kill(sig)
      }
      const timer = setTimeout(() => kill('SIGKILL'), timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        // Children that outlived the leader still go.
        if (this.group && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            // Already gone.
          }
        }
        resolve()
      })
      kill(signal)
    })
    this.child = null
  }

  signal(sig: NodeJS.Signals): void {
    this.child?.kill(sig)
  }
}
