import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { ServiceImpl } from './types'
import { dirs } from '../paths'
import { downloadFile, extract, removeQuarantine, sha256File, USER_AGENT } from '../download'
import { jobs } from '../jobs'
import { ManagedProcess } from '../process'

const proc = new ManagedProcess('Ollama')
const PORT = 11434
const home = (): string => join(dirs.root(), 'ollama')
const bin = (): string => join(home(), 'ollama')
const models = (): string => join(dirs.root(), 'data', 'ollama')

/** Picks this Mac's download and its checksum line from Ollama's release (sha256sum.txt). */
export function ollamaAsset(assets: { name: string; browser_download_url: string }[]): { url: string; name: string; sums: string | null } | null {
  const a = assets.find((x) => x.name === 'ollama-darwin.tgz')
  if (!a) return null
  return { url: a.browser_download_url, name: a.name, sums: assets.find((x) => x.name === 'sha256sum.txt')?.browser_download_url ?? null }
}

/** Local AI models (Llama, Qwen, Gemma and more) with an OpenAI-compatible API, run by Laramac. */
export const ollama: ServiceImpl = {
  id: 'ollama',
  name: 'Ollama',
  description: 'Local AI models with an OpenAI-compatible API',
  port: () => PORT,
  installed: () => existsSync(bin()),
  version: () => undefined,
  running: () => proc.running,

  async install() {
    await jobs.run('Installing Ollama', async (update) => {
      const res = await fetch('https://api.github.com/repos/ollama/ollama/releases/latest', { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
      const asset = ollamaAsset(((await res.json()) as { assets: { name: string; browser_download_url: string }[] }).assets)
      if (!asset) throw new Error('Ollama has no download for this Mac in its latest release.')
      const file = join(dirs.root(), 'downloads', asset.name)
      mkdirSync(join(dirs.root(), 'downloads'), { recursive: true })
      await downloadFile(asset.url, file, (p) => update(p, 'Downloading Ollama'))
      if (asset.sums) {
        const list = await (await fetch(asset.sums, { headers: { 'User-Agent': USER_AGENT } })).text()
        const want = list.split('\n').map((l) => /^([a-f0-9]{64})\s+\.?\/?(.+)$/i.exec(l.trim())).find((m) => m && m[2] === asset.name)?.[1]
        if (want && (await sha256File(file)) !== want.toLowerCase()) {
          rmSync(file, { force: true })
          throw new Error('The Ollama download did not match its published checksum, so it was not installed.')
        }
      }
      update(null, 'Unpacking Ollama')
      rmSync(home(), { recursive: true, force: true })
      await extract(file, home())
      rmSync(file, { force: true })
      // The archive may hold the binary at the top or in a folder.
      if (!existsSync(bin())) {
        const inner = readdirSync(home()).find((n) => existsSync(join(home(), n, 'ollama')))
        if (inner) {
          const { renameSync } = await import('fs')
          for (const n of readdirSync(join(home(), inner))) renameSync(join(home(), inner, n), join(home(), n))
        }
      }
      await removeQuarantine(home())
    })
  },

  async start() {
    mkdirSync(models(), { recursive: true })
    await proc.start(
      {
        command: bin(),
        args: ['serve'],
        cwd: home(),
        env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${PORT}`, OLLAMA_MODELS: models(), OLLAMA_ORIGINS: 'http://localhost,http://127.0.0.1' },
        logFile: join(dirs.logs(), 'ollama.log')
      },
      PORT,
      30000
    )
  },

  stop: () => proc.stop()
}
