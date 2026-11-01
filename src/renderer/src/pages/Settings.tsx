import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { useApp } from '../store'

export default function Settings(): React.JSX.Element {
  const { settings, updateSettings, tools } = useApp()
  if (!settings) return <div />

  return (
    <div className="fade-in pb-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="glass no-drag">
        <TextRow label="Projects folder" hint="Folders inside become sites" value={settings.wwwPath} onSave={(v) => updateSettings({ wwwPath: v })} />
        <TextRow
          label="Domain suffix"
          hint={tools?.dnsReady ? 'Sites open at name.suffix' : 'Changing this needs the one-time domain setup again (Dashboard)'}
          value={settings.tld}
          onSave={(v) => updateSettings({ tld: v.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'test' })}
        />
        <NumberRow label="HTTP port" hint="Nginx" value={settings.httpPort} onSave={(v) => updateSettings({ httpPort: v })} />
        <NumberRow label="HTTPS port" hint="Nginx" value={settings.httpsPort} onSave={(v) => updateSettings({ httpsPort: v })} />
        <NumberRow label="Apache HTTP port" hint="Apache runs beside Nginx" value={settings.apachePort} onSave={(v) => updateSettings({ apachePort: v })} />
        <NumberRow label="Apache HTTPS port" hint="Apache" value={settings.apacheHttpsPort} onSave={(v) => updateSettings({ apacheHttpsPort: v })} />
        <Row title="PHP build" hint="Full includes intl, imagick, sodium and more. Applies to new installs.">
          <select
            className="input"
            value={settings.phpFlavor}
            onChange={(e) => updateSettings({ phpFlavor: e.target.value as AppSettings['phpFlavor'] })}
          >
            <option value="full">Full (larger download)</option>
            <option value="light">Lightweight</option>
          </select>
        </Row>
        <TextRow label="MySQL version" hint="Applies to new installs, for example 8.4.9" value={settings.mysqlVersion} onSave={(v) => updateSettings({ mysqlVersion: v })} />
        <TextRow label="ngrok authtoken" hint="Only needed when sharing with ngrok" value={settings.ngrokToken} secret onSave={(v) => updateSettings({ ngrokToken: v })} />
        <TextRow
          label="Local model address"
          hint="Any OpenAI-compatible server, for example http://127.0.0.1:11434/v1"
          value={settings.llm.baseUrl}
          onSave={(v) => updateSettings({ llm: { ...settings.llm, baseUrl: v } })}
        />
        <Row title="Liquid Glass" hint="Native effect on macOS 26, frosted blur on older versions. Restart to apply.">
          <button
            className={`toggle ${settings.glass ? 'on' : ''}`}
            onClick={() => updateSettings({ glass: !settings.glass })}
            aria-label="Toggle Liquid Glass"
          />
        </Row>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
        Port changes apply the next time a server starts.
      </p>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="row flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {hint}
        </div>
      </div>
      {children}
    </div>
  )
}

function TextRow({
  label,
  hint,
  value,
  onSave,
  secret
}: {
  label: string
  hint: string
  value: string
  onSave: (v: string) => void
  secret?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = (): void => {
    if (draft !== value) onSave(draft.trim())
  }
  return (
    <Row title={label} hint={hint}>
      <input
        className="input w-64"
        type={secret ? 'password' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Row>
  )
}

function NumberRow({ label, hint, value, onSave }: { label: string; hint: string; value: number; onSave: (v: number) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  const commit = (): void => {
    const n = parseInt(draft, 10)
    if (n > 0 && n < 65536 && n !== value) onSave(n)
    else setDraft(String(value))
  }
  return (
    <Row title={label} hint={hint}>
      <input
        className="input w-24"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Row>
  )
}
