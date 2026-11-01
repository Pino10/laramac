import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useApp, type Page } from '../store'
import { NAV } from './Sidebar'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  keywords?: string
  run: () => unknown
}

/** ⌘K: one place to jump anywhere or do anything, without the mouse. */
export default function CommandPalette(): React.JSX.Element | null {
  const { paletteOpen, setPaletteOpen, setPage, setNewProject, setImportOpen, services, sites, php, tools, settings, act, setServices, setPhp, setTools } =
    useApp()
  const api = window.laramac
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const tld = settings?.tld ?? 'test'

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []
    const go = (p: Page) => () => setPage(p)
    for (const item of NAV.flat()) list.push({ id: `go-${item.id}`, group: 'Go to', label: item.label, run: go(item.id) })

    list.push({
      id: 'pma',
      group: 'Open',
      label: tools?.phpmyadmin ? 'phpMyAdmin' : 'Install phpMyAdmin',
      hint: tools?.phpmyadmin ? `phpmyadmin.${tld}` : undefined,
      keywords: 'database mysql mariadb sql admin',
      run: () =>
        tools?.phpmyadmin
          ? api.invoke('sites:open-url', `http://phpmyadmin.${tld}`)
          : act('tool-phpmyadmin', () => api.invoke('tools:install', 'phpmyadmin').then(setTools))
    })
    if (tools?.adminer) {
      list.push({ id: 'adminer', group: 'Open', label: 'Adminer', hint: `adminer.${tld}`, keywords: 'postgres database sql', run: () => api.invoke('sites:open-url', `http://adminer.${tld}`) })
    }
    list.push({ id: 'mail', group: 'Open', label: 'Mail inbox', keywords: 'mailpit email smtp', run: () => api.invoke('sites:open-url', 'http://127.0.0.1:8025') })
    list.push({ id: 'www', group: 'Open', label: 'Projects folder', keywords: 'www finder', run: () => api.invoke('www:reveal') })
    list.push({ id: 'new', group: 'Create', label: 'New project', hint: '⌘N', keywords: 'wordpress laravel site', run: () => setNewProject(true) })
    list.push({ id: 'import', group: 'Create', label: 'Import a project or database', hint: '⌘I', keywords: 'laragon zip tar sql dump restore backup migrate', run: () => setImportOpen(true) })

    for (const site of sites) {
      list.push({
        id: `site-${site.name}`,
        group: 'Sites',
        label: site.name,
        hint: site.domain,
        keywords: `${site.kind} open browser`,
        run: () => api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)
      })
    }

    for (const s of services) {
      if (s.status === 'not-installed') {
        list.push({
          id: `install-${s.id}`,
          group: 'Services',
          label: `Install ${s.name}`,
          keywords: s.description,
          run: () => act(`install-${s.id}`, async () => {
            await api.invoke('services:install', s.id)
            setServices(await api.invoke('services:list'))
          })
        })
      } else {
        const on = s.status === 'running'
        list.push({
          id: `toggle-${s.id}`,
          group: 'Services',
          label: `${on ? 'Stop' : 'Start'} ${s.name}`,
          hint: on ? 'Running' : 'Stopped',
          keywords: s.description,
          run: () => act(`toggle-${s.id}`, () => api.invoke('services:toggle', s.id).then(setServices))
        })
      }
    }

    for (const p of php) {
      if (!p.installed) {
        list.push({ id: `php-${p.minor}`, group: 'PHP', label: `Install PHP ${p.minor}`, hint: p.latest, run: () => act(`install-php-${p.minor}`, () => api.invoke('php:install', p.minor).then(setPhp)) })
      } else if (!p.isDefault) {
        list.push({ id: `phpdef-${p.minor}`, group: 'PHP', label: `Use PHP ${p.minor} by default`, run: () => act(`default-${p.minor}`, () => api.invoke('php:set-default', p.minor).then(setPhp)) })
      }
    }
    return list
  }, [services, sites, php, tools, tld, act, api, setPage, setNewProject, setImportOpen, setServices, setPhp, setTools])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return commands
    return commands.filter((c) => {
      const hay = `${c.group} ${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [commands, query])

  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setIndex(0)
    }
  }, [paletteOpen])
  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!paletteOpen) return null

  const run = (c: Command | undefined): void => {
    if (!c) return
    setPaletteOpen(false)
    void c.run()
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[index])
    } else if (e.key === 'Escape') {
      setPaletteOpen(false)
    }
  }

  let lastGroup = ''
  return (
    <div className="scrim" onMouseDown={() => setPaletteOpen(false)}>
      <div className="palette glass" role="dialog" aria-label="Command bar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Search sites, services and actions"
            aria-label="Search"
            aria-controls="palette-list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Nothing matches “{query}”.</div>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  className="palette-item"
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  {c.label}
                  {c.hint && <span className="palette-hint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
