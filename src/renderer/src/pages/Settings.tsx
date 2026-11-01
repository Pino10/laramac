import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { useApp } from '../store'
import { PageHead, Switch } from '../ui'

export default function Settings(): React.JSX.Element {
  const { settings, updateSettings, tools } = useApp()
  if (!settings) return <></>

  return (
    <>
      <PageHead title="Settings" desc="Ports apply the next time a server starts." />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        Sites
      </h2>
      <div className="panel">
        <TextRow label="Projects folder" hint="Every folder inside becomes a site." value={settings.wwwPath} wide onSave={(v) => updateSettings({ wwwPath: v })} />
        <TextRow
          label="Domain suffix"
          hint={tools?.dnsReady ? 'Sites open at name.suffix.' : 'Changing it means turning on domains again from the Dashboard.'}
          value={settings.tld}
          onSave={(v) => updateSettings({ tld: v.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'test' })}
        />
      </div>

      <h2 className="section-title">Ports</h2>
      <div className="panel">
        <NumberRow label="Nginx HTTP" value={settings.httpPort} onSave={(v) => updateSettings({ httpPort: v })} />
        <NumberRow label="Nginx HTTPS" value={settings.httpsPort} onSave={(v) => updateSettings({ httpsPort: v })} />
        <NumberRow label="Apache HTTP" value={settings.apachePort} onSave={(v) => updateSettings({ apachePort: v })} />
        <NumberRow label="Apache HTTPS" value={settings.apacheHttpsPort} onSave={(v) => updateSettings({ apacheHttpsPort: v })} />
      </div>

      <h2 className="section-title">Downloads</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">PHP build</div>
            <div className="row-sub">Full adds intl, imagick, sodium and more. Affects new installs.</div>
          </div>
          <select
            className="input no-drag"
            aria-label="PHP build"
            value={settings.phpFlavor}
            onChange={(e) => updateSettings({ phpFlavor: e.target.value as AppSettings['phpFlavor'] })}
          >
            <option value="full">Full</option>
            <option value="light">Lightweight</option>
          </select>
        </div>
        <TextRow label="MySQL version" hint="Affects new installs, for example 8.4.9." value={settings.mysqlVersion} onSave={(v) => updateSettings({ mysqlVersion: v })} />
        <TextRow label="PostgreSQL major version" hint="Affects new installs, for example 17." value={settings.postgresMajor} onSave={(v) => updateSettings({ postgresMajor: v.replace(/\D/g, '') || '17' })} />
      </div>

      <h2 className="section-title">Connections</h2>
      <div className="panel">
        <TextRow label="ngrok authtoken" hint="Only needed when sharing with ngrok." value={settings.ngrokToken} secret wide onSave={(v) => updateSettings({ ngrokToken: v })} />
        <TextRow
          label="Local model address"
          hint="Any OpenAI-compatible server, such as http://127.0.0.1:11434/v1."
          value={settings.llm.baseUrl}
          wide
          onSave={(v) => updateSettings({ llm: { ...settings.llm, baseUrl: v } })}
        />
      </div>

      <h2 className="section-title">Appearance</h2>
      <div className="panel">
        <div className="row row-set">
          <div className="row-main">
            <div className="row-title">Translucent sidebar</div>
            <div className="row-sub">Uses macOS Liquid Glass where available. Restart Laramac to apply.</div>
          </div>
          <Switch on={settings.glass} label="Translucent sidebar" onChange={() => updateSettings({ glass: !settings.glass })} />
        </div>
      </div>
    </>
  )
}

function TextRow({
  label,
  hint,
  value,
  onSave,
  secret,
  wide
}: {
  label: string
  hint: string
  value: string
  onSave: (v: string) => void
  secret?: boolean
  wide?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = (): void => {
    if (draft.trim() !== value) onSave(draft.trim())
  }
  return (
    <div className="row row-set">
      <div className="row-main">
        <div className="row-title">{label}</div>
        <div className="row-sub">{hint}</div>
      </div>
      <input
        className="input no-drag"
        style={{ width: wide ? 280 : 150 }}
        aria-label={label}
        type={secret ? 'password' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}

function NumberRow({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }): React.JSX.Element {
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
    <div className="row row-set" style={{ minHeight: 48 }}>
      <div className="row-title">{label}</div>
      <input
        className="input num no-drag"
        style={{ width: 86 }}
        aria-label={label}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}
