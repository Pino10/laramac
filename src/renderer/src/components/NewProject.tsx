import { useState } from 'react'
import type { ProjectKind } from '@shared/types'
import { useApp } from '../store'

const kinds: { id: ProjectKind; title: string; hint: string }[] = [
  { id: 'blank', title: 'Blank PHP', hint: 'A single index.php to start from.' },
  { id: 'wordpress', title: 'WordPress', hint: 'Latest release, with the database created and wp-config.php filled in.' },
  { id: 'laravel', title: 'Laravel', hint: 'New app from Composer, with .env pointing at MySQL and Mailpit.' }
]

export default function NewProject({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { act, setSites, busy, settings } = useApp()
  const [kind, setKind] = useState<ProjectKind>('blank')
  const [name, setName] = useState('')
  const working = busy.has('create-project')
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')

  const create = async (): Promise<void> => {
    const sites = await act('create-project', () => window.laramac.invoke('sites:create', kind, name.trim()))
    if (sites) {
      setSites(sites)
      onClose()
    }
  }

  return (
    <div className="scrim no-drag" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="New project" onClick={(e) => e.stopPropagation()}>
        <h2 className="page-title" style={{ fontSize: 16, marginBottom: 14 }}>
          New project
        </h2>
        <div role="radiogroup" aria-label="Project type" style={{ marginBottom: 14 }}>
          {kinds.map((k) => (
            <button key={k.id} role="radio" aria-checked={kind === k.id} className="choice" onClick={() => setKind(k.id)}>
              <div style={{ fontWeight: 500 }}>{k.title}</div>
              <div className="row-sub" style={{ whiteSpace: 'normal' }}>
                {k.hint}
              </div>
            </button>
          ))}
        </div>
        <label htmlFor="np-name" style={{ fontWeight: 500 }}>
          Folder name
        </label>
        <input
          id="np-name"
          className="input"
          style={{ width: '100%', margin: '4px 0' }}
          autoFocus
          placeholder="my-project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
        />
        <div className="row-sub" style={{ marginBottom: 18 }}>
          Opens at {slug || 'my-project'}.{settings?.tld ?? 'test'}
        </div>
        <div className="end">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || working} onClick={create}>
            {working ? 'Creating' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
