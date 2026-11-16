import { useState } from 'react'
import { useApp } from '../store'

/** Extra addresses for a site. With `only`, just that site (shown on its own page). */
export default function SiteNames({ only }: { only?: string }): React.JSX.Element | null {
  const { sites, settings, act, busy, setSites, notify } = useApp()
  const api = window.laramac
  const [draft, setDraft] = useState<Record<string, string>>({})
  const list = only ? sites.filter((s) => s.name === only) : sites
  if (!settings || list.length === 0) return null
  const save = async (name: string, aliases: string[]): Promise<void> => {
    const next = await act(`alias-${name}`, () => api.invoke('sites:set-config', name, { aliases }))
    if (next) {
      setSites(next)
      setDraft((d) => ({ ...d, [name]: '' }))
    }
  }
  return (
    <>
      <div className="panel">
        <div className="pad" style={{ paddingBottom: 0 }}>
          <div className="row-title">Extra names</div>
          <div className="row-sub wrap">Any name works, like shop.local or api.shop.test. macOS asks for your password once to add it. HTTPS covers your .{settings.tld} addresses; extra names open over plain http.</div>
        </div>
        {list.map((site) => {
          const own = settings.siteConfig[site.name]?.aliases ?? []
          const value = draft[site.name] ?? ''
          return (
            <div key={site.name} className="row alias-row">
              <div className="row-main">
                {!only && <div className="row-title">{site.name}</div>}
                <div className="alias-chips">
                  <span className="chip-static">{site.domain}</span>
                  {site.aliases
                    .filter((a) => !own.includes(a))
                    .map((a) => (
                      <span key={a} className="chip-static">
                        {a}
                      </span>
                    ))}
                  {own.map((a) => (
                    <span key={a} className="chip-own">
                      {a}
                      <button aria-label={`Remove ${a}`} onClick={() => save(site.name, own.filter((x) => x !== a))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <form
                className="alias-add"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const v = value.trim()
                  if (!v) return
                  await save(site.name, [...own, v])
                  notify({ kind: 'info', text: `${site.name} now also opens at http://${v.toLowerCase()}` })
                }}
              >
                <input className="input" placeholder="Add a name" value={value} onChange={(e) => setDraft((d) => ({ ...d, [site.name]: e.target.value }))} aria-label={`Extra name for ${site.name}`} />
                <button className="btn btn-tonal btn-sm" disabled={!value.trim() || busy.has(`alias-${site.name}`)}>
                  Add
                </button>
              </form>
            </div>
          )
        })}
      </div>
    </>
  )
}
