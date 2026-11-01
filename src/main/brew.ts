import { spawn } from 'child_process'
import { join } from 'path'
import { brewPrefix } from './platform'

/** Runs `brew <args>`, reporting each output line as a progress label. */
export function brew(args: string[], onLine: (line: string) => void): Promise<void> {
  const prefix = brewPrefix()
  if (!prefix) {
    return Promise.reject(
      new Error(
        'Homebrew is needed to install this server. Get it at https://brew.sh, then try again.'
      )
    )
  }
  return new Promise((resolve, reject) => {
    const child = spawn(join(prefix, 'bin', 'brew'), args, {
      env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1' }
    })
    let last = ''
    const handle = (buf: Buffer): void => {
      for (const line of buf.toString().split('\n')) {
        if (line.trim()) {
          last = line.trim()
          onLine(last)
        }
      }
    }
    child.stdout.on('data', handle)
    child.stderr.on('data', handle)
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`brew ${args.join(' ')} failed: ${last}`))
    )
  })
}
