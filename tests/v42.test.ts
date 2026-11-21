import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { setRoot } from '../src/main/paths'
import { pythonBinDir, runtimeEnv } from '../src/main/runtimes'
import { listPackages } from '../src/main/packages'

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'laramac-v42-'))
  setRoot(root)
  return root
}

describe('Laramac keeps its own Python for projects', () => {
  it('does not touch uv settings before uv is installed', () => {
    freshRoot()
    const env = runtimeEnv()
    expect(env.UV_PYTHON_INSTALL_DIR).toBeUndefined()
    expect(env.UV_PYTHON_BIN_DIR).toBeUndefined()
  })

  it('keeps Python inside Laramac and puts python and python3 first on the path', () => {
    const root = freshRoot()
    mkdirSync(join(root, 'runtimes', 'uv', 'bin'), { recursive: true })
    writeFileSync(join(root, 'runtimes', 'uv', 'bin', 'uv'), '')
    mkdirSync(pythonBinDir(), { recursive: true })
    const env = runtimeEnv()
    expect(env.UV_PYTHON_INSTALL_DIR).toBe(join(root, 'runtimes', 'python', 'versions'))
    expect(env.UV_PYTHON_BIN_DIR).toBe(join(root, 'runtimes', 'python', 'bin'))
    expect(env.PATH!.split(':')[0]).toBe(join(root, 'runtimes', 'python', 'bin'))
  })

  it('does not add a python folder to the path until it exists', () => {
    const root = freshRoot()
    mkdirSync(join(root, 'runtimes', 'uv', 'bin'), { recursive: true })
    writeFileSync(join(root, 'runtimes', 'uv', 'bin', 'uv'), '')
    expect(runtimeEnv().PATH!.split(':')).not.toContain(join(root, 'runtimes', 'python', 'bin'))
  })
})

describe('Packages shows the languages Laramac installed', () => {
  it('lists Python and Node.js, with sizes', async () => {
    const root = freshRoot()
    mkdirSync(join(root, 'runtimes', 'python', 'versions', 'cpython-3.13'), { recursive: true })
    writeFileSync(join(root, 'runtimes', 'python', 'versions', 'cpython-3.13', 'x'), 'x'.repeat(5000))
    mkdirSync(join(root, 'runtimes', 'node', 'bin'), { recursive: true })
    writeFileSync(join(root, 'runtimes', 'node', 'bin', 'node'), 'x')
    const all = await listPackages()
    const langs = all.filter((p) => p.group === 'language').map((p) => p.name)
    expect(langs).toEqual(expect.arrayContaining(['Python', 'Node.js']))
    expect(all.find((p) => p.name === 'Python')!.bytes).toBeGreaterThan(0)
  })

  it('shows no languages when none were installed', async () => {
    freshRoot()
    expect((await listPackages()).filter((p) => p.group === 'language')).toEqual([])
  })
})

describe('Python apps are recognised', () => {
  const make = (files: string[]): string => {
    const dir = mkdtempSync(join(tmpdir(), 'laramac-kind-'))
    for (const f of files) {
      mkdirSync(join(dir, f, '..'), { recursive: true })
      writeFileSync(join(dir, f), '')
    }
    return dir
  }
  it('treats a folder of Python scripts (requirements in a subfolder) as Python', async () => {
    const { detectKind } = await import('../src/main/sites')
    expect(detectKind(make(['mcp_server.py', 'console/app.py', 'console/requirements.txt', 'README.md']))).toBe('python')
  })
  it('keeps a website with a helper script static', async () => {
    const { detectKind } = await import('../src/main/sites')
    expect(detectKind(make(['index.html', 'build.py']))).toBe('static')
  })
  it('still picks PHP and Node first', async () => {
    const { detectKind } = await import('../src/main/sites')
    expect(detectKind(make(['index.php', 'tool.py']))).toBe('php')
    expect(detectKind(make(['package.json', 'tool.py']))).toBe('node')
    expect(detectKind(make(['manage.py']))).toBe('python')
  })
})
