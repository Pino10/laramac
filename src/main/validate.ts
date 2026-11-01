import { isAbsolute, normalize, sep } from 'path'
import type { AppSettings } from '../shared/types'

/**
 * Everything the renderer sends is treated as untrusted. These checks run in the main process,
 * so a compromised or buggy page cannot reach the filesystem, the shell or admin commands.
 */

export class ValidationError extends Error {}

const fail = (msg: string): never => {
  throw new ValidationError(msg)
}

/** Only reserved names: using a real TLD here would hijack real websites on this Mac. */
export const ALLOWED_TLDS = ['test', 'internal', 'lan', 'example'] as const

export const isMinor = (v: unknown): v is string => typeof v === 'string' && /^\d{1,2}\.\d{1,2}$/.test(v)

export function assertMinor(v: unknown): string {
  return isMinor(v) ? v : fail('That is not a PHP version like 8.3.')
}

const isPort = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 65535

const SYSTEM_DIRS = ['/System', '/usr', '/bin', '/sbin', '/etc', '/private', '/Library', '/Applications', '/var', '/dev']

export function assertProjectsFolder(v: unknown): string {
  if (typeof v !== 'string' || v.includes('\0') || !isAbsolute(v)) fail('The projects folder must be a full path.')
  const p = normalize(v as string).replace(/[/\\]+$/, '')
  if (p.split(sep).filter(Boolean).length < 2) fail('Choose a folder inside your home folder or on a drive.')
  if (SYSTEM_DIRS.some((d) => p === d || p.startsWith(d + sep))) fail('That is a system folder. Choose another one.')
  return p
}

function assertHttpUrl(v: unknown): string {
  if (typeof v !== 'string') return fail('Enter a web address.')
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') fail('Use an http or https address.')
    return v
  } catch {
    return fail('That web address is not valid.')
  }
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], what: string): T =>
  options.includes(v as T) ? (v as T) : fail(`${what} must be one of: ${options.join(', ')}.`)

const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(`${what} must be on or off.`))

/** Accepts only known settings keys with valid values. Unknown keys are rejected. */
export function sanitizeSettingsPatch(patch: unknown): Partial<AppSettings> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Settings must be an object.')
  const out: Partial<AppSettings> = {}
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    switch (key) {
      case 'wwwPath':
        out.wwwPath = assertProjectsFolder(value)
        break
      case 'tld':
        out.tld = oneOf(value, ALLOWED_TLDS, 'The domain suffix')
        break
      case 'glass':
      case 'notifications':
      case 'allowLan':
      case 'autoUpdateCheck':
        out[key] = bool(value, key)
        break
      case 'defaultPhp':
        out.defaultPhp = value === null ? null : assertMinor(value)
        break
      case 'phpFlavor':
        out.phpFlavor = oneOf(value, ['full', 'light'] as const, 'PHP build')
        break
      case 'mysqlVersion':
        out.mysqlVersion = typeof value === 'string' && (value === 'latest' || /^\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(value)) ? value : fail('Use latest, or a MySQL version like 8.4.11.')
        break
      case 'postgresMajor':
        out.postgresMajor = typeof value === 'string' && (value === 'latest' || /^\d{1,2}$/.test(value)) ? value : fail('Use latest, or a PostgreSQL major version like 17.')
        break
      case 'httpPort':
      case 'httpsPort':
      case 'secondaryHttpPort':
      case 'secondaryHttpsPort':
        out[key] = isPort(value) ? value : fail('Ports are whole numbers from 1 to 65535.')
        break
      case 'primaryServer':
        out.primaryServer = oneOf(value, ['apache', 'nginx'] as const, 'Main web server')
        break
      case 'aiTool':
        out.aiTool = typeof value === 'string' && /^[a-z0-9-]{1,32}$/.test(value) ? value : fail('Unknown AI tool.')
        break
      case 'shareProvider':
        out.shareProvider = oneOf(value, ['cloudflare', 'ngrok'] as const, 'Tunnel provider')
        break
      case 'ngrokToken':
        out.ngrokToken = typeof value === 'string' && /^[A-Za-z0-9_-]{0,200}$/.test(value) ? value : fail('That ngrok token has unexpected characters.')
        break
      case 'editor':
        out.editor = oneOf(value, ['cursor', 'vscode'] as const, 'Editor')
        break
      case 'llm': {
        const llm = value as { baseUrl?: unknown; model?: unknown }
        if (!llm || typeof llm !== 'object') fail('Model settings are not valid.')
        const model = llm.model ?? ''
        if (typeof model !== 'string' || model.length > 200 || /[\0-\x1f]/.test(model)) fail('That model name is not valid.')
        out.llm = { baseUrl: assertHttpUrl(llm.baseUrl), model: model as string }
        break
      }
      default:
        fail(`Unknown setting: ${key}`)
    }
  }
  return out
}

/** Only http and https links may be opened in the browser. */
export function isWebUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
