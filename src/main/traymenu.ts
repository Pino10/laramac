/**
 * The menu bar menu, as plain data. index.ts turns it into a native macOS menu, and tests
 * can check it without Electron. Every item that does something carries an action.
 */
import type { ServiceInfo, SiteInfo } from '../shared/types'

export type TrayAction =
  | { kind: 'show'; page?: string }
  | { kind: 'service'; id: ServiceInfo['id']; on: boolean }
  | { kind: 'start-all' }
  | { kind: 'stop-all' }
  | { kind: 'dev'; site: string; on: boolean }
  | { kind: 'open-url'; url: string }
  | { kind: 'open-folder'; path: string }
  | { kind: 'editor'; path: string }
  | { kind: 'ai'; path: string }
  | { kind: 'quit' }

export interface TrayItem {
  label?: string
  separator?: true
  enabled?: boolean
  checked?: boolean
  action?: TrayAction
  submenu?: TrayItem[]
}

export interface TrayState {
  services: ServiceInfo[]
  sites: SiteInfo[]
  tld: string
  phpmyadmin: boolean
  editor: string
  aiName: string
}

const sep: TrayItem = { separator: true }

export function buildTrayMenu(s: TrayState): TrayItem[] {
  const installed = s.services.filter((x) => x.status !== 'not-installed')
  const running = installed.filter((x) => x.status === 'running').length
  const devSites = s.sites.filter((x) => x.dev)
  const devRunning = devSites.filter((x) => x.dev?.running).length

  const services: TrayItem[] = [
    ...installed.map((x) => ({
      label: `${x.name}${x.port ? `   :${x.port}` : ''}${x.status === 'error' ? '   (failed)' : x.status === 'starting' ? '   (starting)' : ''}`,
      checked: x.status === 'running',
      action: { kind: 'service', id: x.id, on: x.status !== 'running' } as TrayAction
    })),
    sep,
    { label: 'Start All', action: { kind: 'start-all' } },
    { label: 'Stop All', action: { kind: 'stop-all' } }
  ]

  const siteMenu = (x: SiteInfo): TrayItem => {
    const url = x.secure ? x.httpsUrl : x.url
    const items: TrayItem[] = [
      { label: `Open ${x.domain}`, action: { kind: 'open-url', url } },
      { label: `Open in ${s.editor}`, action: { kind: 'editor', path: x.path } },
      { label: `Open ${s.aiName} here`, action: { kind: 'ai', path: x.path } },
      { label: 'Show in Finder', action: { kind: 'open-folder', path: x.path } }
    ]
    if (x.dev) items.unshift({ label: x.dev.running ? 'Stop dev server' : 'Start dev server', action: { kind: 'dev', site: x.name, on: !x.dev.running } }, sep)
    return { label: x.dev?.running ? `${x.name}   ●` : x.name, submenu: items }
  }

  const menu: TrayItem[] = [
    { label: installed.length ? `${running} of ${installed.length} services running` : 'Nothing installed yet', enabled: false },
    ...(devSites.length ? [{ label: `${devRunning} of ${devSites.length} dev servers running`, enabled: false }] : []),
    { label: 'Open Laramac', action: { kind: 'show' } },
    sep,
    { label: 'Services', submenu: services }
  ]
  if (devSites.length) {
    menu.push({
      label: 'Dev servers',
      submenu: devSites.map((x) => ({ label: `${x.name}   :${x.dev!.port}`, checked: !!x.dev?.running, action: { kind: 'dev', site: x.name, on: !x.dev?.running } as TrayAction }))
    })
  }
  menu.push({ label: 'Sites', enabled: s.sites.length > 0, submenu: s.sites.length ? s.sites.slice(0, 40).map(siteMenu) : [{ label: 'No sites yet', enabled: false }] })
  menu.push(
    sep,
    { label: 'New Project…', action: { kind: 'show', page: 'starters' } },
    { label: 'Open phpMyAdmin', enabled: s.phpmyadmin, action: { kind: 'open-url', url: `http://phpmyadmin.${s.tld}` } },
    { label: 'Open Mail Inbox', action: { kind: 'open-url', url: 'http://127.0.0.1:8025' } },
    sep,
    { label: 'Quit Laramac', action: { kind: 'quit' } }
  )
  return menu
}
