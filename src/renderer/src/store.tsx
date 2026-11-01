import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActivityItem,
  AppInfo,
  AppSettings,
  JobInfo,
  LocalLlm,
  PhpVersionInfo,
  ServiceInfo,
  SiteInfo,
  ToolsStatus,
  UpdateInfo
} from '@shared/types'

export interface Toast {
  kind: 'error' | 'info'
  text: string
}

export type Page = 'dashboard' | 'sites' | 'php' | 'databases' | 'servers' | 'tools' | 'assistant' | 'settings'

interface AppCtx {
  page: Page
  setPage: (p: Page) => void
  newProject: boolean
  setNewProject: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  importOpen: boolean
  setImportOpen: (open: boolean) => void
  activity: ActivityItem[]
  clearActivity: () => void
  appInfo: AppInfo | null
  update: UpdateInfo | null
  setUpdate: (u: UpdateInfo | null) => void
  services: ServiceInfo[]
  sites: SiteInfo[]
  jobs: JobInfo[]
  settings: AppSettings | null
  php: PhpVersionInfo[]
  tools: ToolsStatus | null
  llms: LocalLlm[]
  toast: Toast | null
  busy: Set<string>
  setServices: (s: ServiceInfo[]) => void
  setSites: (s: SiteInfo[]) => void
  setPhp: (p: PhpVersionInfo[]) => void
  setTools: (t: ToolsStatus) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  refreshAll: () => void
  refreshLlms: () => void
  /** Runs an action, tracking a busy key and showing any error as a toast. */
  act: <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>
  notify: (toast: Toast) => void
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

const api = (): Window['laramac'] => window.laramac

/** Turns Electron's wrapped IPC error into a readable message. */
function readable(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [newProject, setNewProject] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [sites, setSites] = useState<SiteInfo[]>([])
  const [jobs, setJobs] = useState<JobInfo[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [php, setPhp] = useState<PhpVersionInfo[]>([])
  const [tools, setTools] = useState<ToolsStatus | null>(null)
  const [llms, setLlms] = useState<LocalLlm[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const toastTimer = useRef<number | undefined>(undefined)

  const notify = useCallback((t: Toast) => {
    setToast(t)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), t.kind === 'error' ? 9000 : 4000)
  }, [])

  const act = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy((b) => new Set(b).add(key))
      try {
        return await fn()
      } catch (err) {
        notify({ kind: 'error', text: readable(err) })
        return undefined
      } finally {
        setBusy((b) => {
          const next = new Set(b)
          next.delete(key)
          return next
        })
      }
    },
    [notify]
  )

  const refreshAll = useCallback(() => {
    api().invoke('services:list').then(setServices)
    api().invoke('sites:list').then(setSites)
    api().invoke('php:list').then(setPhp).catch(() => undefined)
    api().invoke('tools:status').then(setTools)
  }, [])

  const refreshLlms = useCallback(() => {
    api().invoke('ai:detect').then(setLlms)
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>): Promise<void> => {
      const next = await api().invoke('settings:set', patch)
      setSettings(next)
      api().invoke('sites:list').then(setSites)
    },
    []
  )

  const clearActivity = useCallback(() => {
    api().invoke('activity:clear').then(setActivity)
  }, [])

  useEffect(() => {
    api().invoke('app:info').then(setAppInfo)
    api().invoke('settings:get').then(setSettings)
    api().invoke('jobs:list').then(setJobs)
    api().invoke('activity:list').then(setActivity)
    api().invoke('app:check-update').then(setUpdate).catch(() => undefined)
    refreshAll()
    const offs = [
      api().on('services:changed', setServices),
      api().on('jobs:changed', setJobs),
      api().on('sites:changed', setSites),
      api().on('activity:changed', setActivity),
      api().on('update:available', setUpdate)
    ]
    window.addEventListener('focus', refreshAll)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('focus', refreshAll)
    }
  }, [refreshAll])

  // When a download finishes, the PHP list and tool status change.
  const finished = jobs.filter((j) => j.status === 'done').length
  useEffect(() => {
    if (finished > 0) {
      api().invoke('php:list').then(setPhp).catch(() => undefined)
      api().invoke('tools:status').then(setTools)
    }
  }, [finished])

  const value = useMemo<AppCtx>(
    () => ({
      page,
      setPage,
      newProject,
      setNewProject,
      paletteOpen,
      setPaletteOpen,
      importOpen,
      setImportOpen,
      activity,
      clearActivity,
      appInfo,
      update,
      setUpdate,
      services,
      sites,
      jobs,
      settings,
      php,
      tools,
      llms,
      toast,
      busy,
      setServices,
      setSites,
      setPhp,
      setTools,
      updateSettings,
      refreshAll,
      refreshLlms,
      act,
      notify
    }),
    [page, newProject, paletteOpen, importOpen, activity, clearActivity, appInfo, update, services, sites, jobs, settings, php, tools, llms, toast, busy, updateSettings, refreshAll, refreshLlms, act, notify]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
