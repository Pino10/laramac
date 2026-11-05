import { useEffect } from 'react'
import { Search } from 'lucide-react'
import { AppProvider, useApp } from './store'
import Sidebar, { PAGE_ORDER } from './components/Sidebar'
import Tour from './components/Tour'
import Dumps from './components/Dumps'
import JobsBar from './components/JobsBar'
import CommandPalette from './components/CommandPalette'
import Activity from './components/Activity'
import NewProject from './components/NewProject'
import ImportWizard from './components/ImportWizard'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Php from './pages/Php'
import Databases from './pages/Databases'
import Tools from './pages/Tools'
import Services from './pages/Services'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'
import Servers from './pages/Servers'
import Packages from './pages/Packages'
import ApiClient from './pages/ApiClient'
import Starters from './pages/Starters'
import Languages from './pages/Languages'
import Recon from './pages/Recon'
import Security from './pages/Security'
import GitHub from './pages/GitHub'
import Updates from './pages/Updates'
import UpdateBanner from './components/UpdateBanner'

function Shell(): React.JSX.Element {
  const { page, setPage, toast, appInfo, paletteOpen, setPaletteOpen, newProject, setNewProject, setImportOpen, settings } = useApp()

  useEffect(() => {
    document.documentElement.dataset.material = appInfo?.material ?? 'none'
  }, [appInfo])
  useEffect(() => {
    const style = settings?.glassStyle ?? 'studio'
    document.documentElement.dataset.glass = style
    document.documentElement.dataset.tone = style === 'frost' ? 'light' : 'dark'
  }, [settings?.glassStyle])

  // ⌘K command bar, ⌘1 to ⌘7 pages, ⌘N new project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen(!paletteOpen)
      } else if (key === 'n') {
        e.preventDefault()
        setNewProject(true)
      } else if (key === 'i') {
        e.preventDefault()
        setImportOpen(true)
      } else if (/^[1-9]$/.test(key)) {
        e.preventDefault()
        setPage(PAGE_ORDER[Number(key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, setPaletteOpen, setNewProject, setPage, setImportOpen])

  return (
    <>
      <div className="canvas" aria-hidden />
      <div className="shell">
        <Sidebar />
        <Tour />
        <main className="main">
          <header className="topbar drag">
            <button className="search-pill glass" onClick={() => setPaletteOpen(true)}>
              <Search size={14} />
              Search or run a command
              <span className="kbd">⌘K</span>
            </button>
            <Dumps />
            <Activity />
          </header>
          <div className="scroll">
            <div className="main-inner" data-page={page} key={page}>
              {page !== 'updates' && <UpdateBanner />}
              {page === 'dashboard' && <Dashboard />}
              {page === 'sites' && <Sites />}
              {page === 'starters' && <Starters />}
              {page === 'languages' && <Languages />}
              {page === 'recon' && <Recon />}
              {page === 'security' && <Security />}
              {page === 'php' && <Php />}
              {page === 'databases' && <Databases />}
              {page === 'servers' && <Servers />}
              {page === 'services' && <Services />}
              {page === 'tools' && <Tools />}
              {page === 'packages' && <Packages />}
              {page === 'api' && <ApiClient />}
              {page === 'github' && <GitHub />}
              {page === 'updates' && <Updates />}
              {page === 'assistant' && <Assistant />}
              {page === 'settings' && <Settings />}
            </div>
          </div>
        </main>
      </div>
      <JobsBar />
      <CommandPalette />
      {newProject && <NewProject onClose={() => setNewProject(false)} />}
      <ImportWizard />
      {toast && (
        <div className="toast" data-kind={toast.kind} role="status">
          {toast.text}
        </div>
      )}
    </>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
