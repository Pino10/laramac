import { useState } from 'react'
import { AppProvider, useApp } from './store'
import Sidebar, { type Page } from './components/Sidebar'
import JobsBar from './components/JobsBar'
import Dashboard from './pages/Dashboard'
import Sites from './pages/Sites'
import Php from './pages/Php'
import Tools from './pages/Tools'
import Assistant from './pages/Assistant'
import Settings from './pages/Settings'

function Shell(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const { toast } = useApp()

  return (
    <div className="flex h-full">
      <Sidebar page={page} onChange={setPage} />
      <main className="flex-1 overflow-y-auto p-6 pt-4">
        <div className="drag h-8" />
        {page === 'dashboard' && <Dashboard />}
        {page === 'sites' && <Sites />}
        {page === 'php' && <Php />}
        {page === 'tools' && <Tools />}
        {page === 'assistant' && <Assistant />}
        {page === 'settings' && <Settings />}
      </main>
      <JobsBar />
      {toast && (
        <div className="no-drag fixed left-1/2 top-4 z-50 -translate-x-1/2">
          <div
            className="glass glass-strong fade-in max-w-lg px-4 py-2 text-sm"
            style={{ color: toast.kind === 'error' ? 'var(--bad)' : 'var(--text)', userSelect: 'text' }}
          >
            {toast.text}
          </div>
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
