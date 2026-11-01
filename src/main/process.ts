import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync, readFileSync } from 'fs'
import { connect } from 'net'
import { EventEmitter } from 'events'

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
}

/** A long-running child process with log capture, readiness checks and graceful shutdown. */
export class ManagedProcess extends EventEmitter {
  private child: ChildProcess | null = null
  private stopping = false

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
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })

    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => {
        log.end()
        if (this.child === child) this.child = null
        resolve(code)
        if (!this.stopping) this.emit('crashed', code)
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
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill(signal)
    })
    this.child = null
  }

  signal(sig: NodeJS.Signals): void {
    this.child?.kill(sig)
  }
}
