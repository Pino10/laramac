import type { ChatMessage } from '../shared/types'
import { services } from './services'
import { scanSites } from './sites'
import { listVersions } from './php'
import { chatWithLlm } from './integrations'

const PROTOCOL = `You are the Laramac assistant, built into a local web development app for macOS.
Laramac runs PHP (many versions), Nginx, Apache, MySQL, phpMyAdmin and Mailpit, and serves every
folder in ~/www as https://<folder>.test.

You can only act by proposing actions. The user presses a button to run each one. To propose an
action, write a fenced block like this, with one JSON object per block:

\`\`\`laramac-action
{"action":"install-php","version":"8.3"}
\`\`\`

Available actions:
- {"action":"install-php","version":"8.3"}
- {"action":"set-default-php","version":"8.3"}
- {"action":"install-service","id":"nginx|apache|php|mysql|mailpit"}
- {"action":"start-service","id":"nginx|apache|php|mysql|mailpit"}
- {"action":"stop-service","id":"nginx|apache|php|mysql|mailpit"}
- {"action":"create-project","kind":"blank|wordpress|laravel","name":"my-site"}
- {"action":"enable-ssl","site":"my-site"}
- {"action":"open-site","site":"my-site"}

Keep answers short. Explain what you propose in one or two sentences. Never invent actions.`

/** Builds the system prompt with a live snapshot of the user's setup. */
async function context(): Promise<string> {
  const svc = services.list().map((s) => `${s.name}: ${s.status}`).join(', ')
  const sites = scanSites()
    .map((s) => `${s.name} (${s.kind}, PHP ${s.php ?? 'none'}${s.secure ? ', https' : ''})`)
    .join('; ')
  const versions = (await listVersions().catch(() => []))
    .map((v) => `${v.minor}${v.installed ? ' installed' : ''}`)
    .join(', ')
  return `${PROTOCOL}

Current state:
Services: ${svc}
Sites: ${sites || 'none yet'}
PHP versions: ${versions || 'unknown'}`
}

export async function assistantChat(messages: ChatMessage[]): Promise<string> {
  const system: ChatMessage = { role: 'system', content: await context() }
  return chatWithLlm([system, ...messages.filter((m) => m.role !== 'system')])
}
