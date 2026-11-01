import { useState } from 'react'
import type { ProjectKind } from '@shared/types'
import { useApp } from '../store'

const kinds: { id: ProjectKind; title: string; hint: string }[] = [
  { id: 'blank', title: 'Blank PHP', hint: 'A single index.php to start from' },
  { id: 'wordpress', title: 'WordPress', hint: 'Latest release with a database ready' },
  { id: 'laravel', title: 'Laravel', hint: 'Fresh app via Composer, wired to MySQL and Mailpit' }
]

export default function NewProject({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { act, setSites, busy, settings } = useApp()
  const [kind, setKind] = useState<ProjectKind>('blank')
  const [name, setName] = useState('')
  const working = busy.has('create-project')

  const create = async (): Promise<void> => {
    const sites = await act('create-project', () => window.laramac.invoke('sites:create', kind, name.trim()))
    if (sites) {
      setSites(sites)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop no-drag" onClick={onClose}>
      <div className="glass glass-strong modal fade-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">New project</h2>
        <div className="mb-4 grid gap-2">
          {kinds.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className="rounded-xl p-3 text-left"
              style={{
                background: kind === k.id ? 'var(--glass-bg-strong)' : 'transparent',
                border: `1px solid ${kind === k.id ? 'var(--accent)' : 'var(--glass-border)'}`
              }}
            >
              <div className="text-sm font-medium">{k.title}</div>
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {k.hint}
              </div>
            </button>
          ))}
        </div>
        <label className="mb-1 block text-xs" style={{ color: 'var(--text-dim)' }}>
          Name
        </label>
        <input
          className="input mb-1 w-full"
          autoFocus
          placeholder="my-project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
        />
        <div className="mb-5 text-xs" style={{ color: 'var(--text-dim)' }}>
          Will be available at {name.trim() ? name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') : 'my-project'}.
          {settings?.tld ?? 'test'}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || working} onClick={create}>
            {working ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
