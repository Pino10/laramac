import type { ProjectKind, ServiceId } from './types'

/** Actions the assistant may propose. Anything outside this list is dropped. */
export type Action =
  | { action: 'install-php' | 'set-default-php'; version: string }
  | { action: 'install-service' | 'start-service' | 'stop-service'; id: ServiceId }
  | { action: 'create-project'; kind: ProjectKind; name: string }
  | { action: 'enable-ssl' | 'open-site'; site: string }

const SERVICES = ['nginx', 'apache', 'php', 'mysql', 'mailpit']
const KINDS = ['blank', 'wordpress', 'laravel']

/** Pulls laramac-action blocks out of a reply and validates them against the allowed list. */
export function parseActions(text: string): { prose: string; actions: Action[] } {
  const actions: Action[] = []
  const prose = text
    .replace(/```laramac-action\s*([\s\S]*?)```/g, (_, body: string) => {
      try {
        const a = JSON.parse(body.trim()) as Record<string, unknown>
        const str = (k: string): string | null => (typeof a[k] === 'string' ? (a[k] as string) : null)
        switch (a.action) {
          case 'install-php':
          case 'set-default-php':
            if (str('version') && /^\d+\.\d+$/.test(str('version')!)) actions.push(a as unknown as Action)
            break
          case 'install-service':
          case 'start-service':
          case 'stop-service':
            if (SERVICES.includes(str('id') ?? '')) actions.push(a as unknown as Action)
            break
          case 'create-project':
            if (KINDS.includes(str('kind') ?? '') && str('name')) actions.push(a as unknown as Action)
            break
          case 'enable-ssl':
          case 'open-site':
            if (str('site')) actions.push(a as unknown as Action)
            break
        }
      } catch {
        // Ignore malformed blocks.
      }
      return ''
    })
    .trim()
  return { prose, actions }
}

