import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ServiceInfo, ServiceStatus } from '@shared/types'
import { useApp, type Page } from '../store'

interface MapNode {
  id: string
  col: 0 | 1 | 2 | 3
  name: string
  meta: string
  status: ServiceStatus
  live: boolean
  ghost?: boolean
  onClick: () => void
}

interface Edge {
  from: string
  to: string
}

const COLS = ['Sites', 'Web', 'PHP', 'Data and mail']
const MAX_SITES = 5

/**
 * A live picture of the local stack: sites flow into the web server, into PHP, into the
 * databases. A connection carries a moving current when both of its ends are running.
 */
export default function StackMap(): React.JSX.Element {
  const { services, sites, php, settings, act, setServices, setPage, tools } = useApp()
  const api = window.laramac
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<{ key: string; d: string; live: boolean }[]>([])

  const svc = (id: ServiceInfo['id']): ServiceInfo | undefined => services.find((s) => s.id === id)
  const running = (id: ServiceInfo['id']): boolean => svc(id)?.status === 'running'

  const { nodes, edges } = useMemo(() => {
    const nodes: MapNode[] = []
    const edges: Edge[] = []
    const go = (p: Page) => () => setPage(p)
    const toggle = (s: ServiceInfo) => () =>
      s.status === 'not-installed'
        ? setPage(s.group === 'database' || s.group === 'mail' ? 'databases' : 'dashboard')
        : void act(`toggle-${s.id}`, () => api.invoke('services:toggle', s.id).then(setServices))

    // Web servers
    const primary = settings?.primaryServer ?? 'apache'
    const web = ([primary, primary === 'apache' ? 'nginx' : 'apache'] as const)
      .map((id) => svc(id))
      .filter((s): s is ServiceInfo => !!s && (s.id === primary || s.status !== 'not-installed'))
    for (const s of web) {
      nodes.push({
        id: s.id,
        col: 1,
        name: s.name,
        meta: s.status === 'not-installed' ? 'Not installed' : `Port ${s.port}`,
        status: s.status,
        live: s.status === 'running',
        ghost: s.status === 'not-installed',
        onClick: toggle(s)
      })
    }

    // PHP versions
    const phpRunning = running('php')
    const installedPhp = php.filter((p) => p.installed)
    if (installedPhp.length === 0) {
      nodes.push({ id: 'php-none', col: 2, name: 'Add PHP', meta: 'Any version', status: 'not-installed', live: false, ghost: true, onClick: go('php') })
    }
    for (const p of installedPhp) {
      nodes.push({
        id: `php-${p.minor}`,
        col: 2,
        name: `PHP ${p.minor}`,
        meta: p.isDefault ? 'Default' : (p.installed ?? ''),
        status: phpRunning ? 'running' : 'stopped',
        live: phpRunning,
        onClick: go('php')
      })
    }

    // Data and mail
    const data = services.filter((s) => (s.group === 'database' || s.group === 'mail') && s.status !== 'not-installed')
    if (data.length === 0) {
      nodes.push({ id: 'data-none', col: 3, name: 'Add a database', meta: 'MySQL, PostgreSQL, Redis…', status: 'not-installed', live: false, ghost: true, onClick: go('databases') })
    }
    for (const s of data) {
      nodes.push({
        id: s.id,
        col: 3,
        name: s.name,
        meta: s.status === 'error' ? 'Failed to start' : `Port ${s.port}`,
        status: s.status,
        live: s.status === 'running',
        onClick: toggle(s)
      })
    }

    // Sites
    const webLive = web.some((w) => w.status === 'running')
    for (const site of sites.slice(0, MAX_SITES)) {
      nodes.push({
        id: `site-${site.name}`,
        col: 0,
        name: site.name,
        meta: site.domain,
        status: webLive ? 'running' : 'stopped',
        live: webLive && phpRunning,
        onClick: () => void api.invoke('sites:open-url', site.secure ? site.httpsUrl : site.url)
      })
    }
    if (sites.length === 0) {
      nodes.push({ id: 'site-none', col: 0, name: 'Add a site', meta: `Any folder in ${settings?.wwwPath.split('/').pop() ?? 'www'}`, status: 'not-installed', live: false, ghost: true, onClick: go('sites') })
    }

    // Connections between neighbouring columns
    const byCol = (c: number): MapNode[] => nodes.filter((n) => n.col === c)
    for (const a of byCol(0)) for (const b of byCol(1)) if (!b.ghost || a.ghost) edges.push({ from: a.id, to: b.id })
    for (const a of byCol(1)) for (const b of byCol(2)) edges.push({ from: a.id, to: b.id })
    // Only the default PHP version fans out to the data column; the map stays readable.
    const defaultPhp = installedPhp.find((p) => p.isDefault)?.minor
    const phpSources = byCol(2).filter((n) => n.ghost || n.id === `php-${defaultPhp}`)
    for (const a of phpSources.length ? phpSources : byCol(2).slice(0, 1)) for (const b of byCol(3)) edges.push({ from: a.id, to: b.id })
    return { nodes, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, sites, php, settings?.wwwPath, settings?.primaryServer, tools])

  const layout = useCallback(() => {
    const el = box.current
    if (!el) return
    const origin = el.getBoundingClientRect()
    const liveOf = (id: string): boolean => nodes.find((n) => n.id === id)?.live ?? false
    const next: { key: string; d: string; live: boolean }[] = []
    for (const e of edges) {
      const a = refs.current.get(e.from)?.getBoundingClientRect()
      const b = refs.current.get(e.to)?.getBoundingClientRect()
      if (!a || !b) continue
      const x1 = a.right - origin.left
      const y1 = a.top + a.height / 2 - origin.top
      const x2 = b.left - origin.left
      const y2 = b.top + b.height / 2 - origin.top
      const bend = (x2 - x1) * 0.5
      next.push({
        key: `${e.from}>${e.to}`,
        d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        live: liveOf(e.from) && liveOf(e.to)
      })
    }
    setPaths(next)
  }, [nodes, edges])

  useLayoutEffect(() => {
    layout()
    const ro = new ResizeObserver(layout)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [layout])

  return (
    <div className="map glass" ref={box} aria-label="Your stack">
      <svg className="map-svg" aria-hidden>
        {/* Idle connections first, so live ones draw on top. */}
        {paths.filter((p) => !p.live).map((p) => (
          <path key={p.key} d={p.d} className="edge" />
        ))}
        {paths.filter((p) => p.live).map((p) => (
          <g key={p.key}>
            <path d={p.d} className="edge edge-live" />
            <path d={p.d} className="edge-flow" />
          </g>
        ))}
      </svg>
      <div className="map-cols">
        {COLS.map((title, col) => {
          const colNodes = nodes.filter((n) => n.col === col)
          return (
            <div key={title}>
              <div className="map-col-title">{title}</div>
              <div className="map-nodes">
                {colNodes.map((n) => (
                  <button
                    key={n.id}
                    ref={(el) => {
                      if (el) refs.current.set(n.id, el)
                      else refs.current.delete(n.id)
                    }}
                    className="node"
                    data-live={n.live}
                    data-ghost={!!n.ghost}
                    onClick={n.onClick}
                    title={n.ghost ? undefined : n.col === 0 ? `Open ${n.meta}` : n.col === 2 ? 'Manage PHP versions' : n.live ? `Stop ${n.name}` : `Start ${n.name}`}
                  >
                    {!n.ghost && <span className="lamp" data-s={n.status} />}
                    <span className="node-main">
                      <span className="node-name" style={{ display: 'block' }}>
                        {n.name}
                      </span>
                      <span className="node-meta" style={{ display: 'block' }}>
                        {n.meta}
                      </span>
                    </span>
                  </button>
                ))}
                {col === 0 && sites.length > MAX_SITES && (
                  <button className="node-more link" onClick={() => setPage('sites')}>
                    {sites.length - MAX_SITES} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
