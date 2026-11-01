import { useState } from 'react'
import { AppProvider, useApp } from './store'
import Sidebar, { type Page } from './components/Sidebar'
import JobsBar from './components/JobsBar'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Php from './pages/Php'
import Databases from './pages/Databases'
import Tools from './pages/Tools'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'

function Shell(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const { toast } = useApp()

  return (
    <div className="shell">
      <Sidebar page={page} onChange={setPage} />
      <main className="main">
        <div className="titlebar drag" />
        <div className="main-inner">
          {page === 'dashboard' && <Dashboard />}
          {page === 'sites' && <Sites />}
          {page === 'php' && <Php />}
          {page === 'databases' && <Databases />}
          {page === 'tools' && <Tools />}
          {page === 'assistant' && <Assistant />}
          {page === 'settings' && <Settings />}
        </div>
      </main>
      <JobsBar />
      {toast && (
        <div className="toast no-drag" data-kind={toast.kind} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
