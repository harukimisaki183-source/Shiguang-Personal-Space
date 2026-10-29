import { useEffect, useState } from 'react'
import { MusicBar } from './components/MusicBar'
import { MusicDrawer } from './components/MusicDrawer'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { UpdateModal } from './components/UpdateModal'
import { APP_VERSION } from './changelog'
import { ConfirmProvider } from './contexts/ConfirmContext'
import { MusicProvider } from './contexts/MusicContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import { seedIfNeeded } from './db'
import { useHashRoute } from './hooks'
import { BlogPage } from './pages/BlogPage'
import { ChatPage } from './pages/ChatPage'
import { SettingsPage } from './pages/SettingsPage'
import { getLastSeenVersion, markVersionSeen } from './storage'

function AppShell() {
  const [page, navigate] = useHashRoute()
  const [updateOpen, setUpdateOpen] = useState(() => getLastSeenVersion() !== APP_VERSION)
  const isFirstRun = getLastSeenVersion() === null

  useEffect(() => {
    void seedIfNeeded()
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page])

  function closeUpdate() {
    markVersionSeen(APP_VERSION)
    setUpdateOpen(false)
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        onNavigate={navigate}
        onShowUpdateLog={() => setUpdateOpen(true)}
      />

      <main className="main">
        <Topbar page={page} onOpenSettings={() => navigate('settings')} />
        <div className="page">
          {page === 'blog' && <BlogPage />}
          {page === 'chat' && <ChatPage onGoSettings={() => navigate('settings')} />}
          {page === 'settings' && (
            <SettingsPage onShowUpdateLog={() => setUpdateOpen(true)} />
          )}
        </div>
      </main>

      <MusicBar />
      <MusicDrawer />
      <UpdateModal open={updateOpen} firstRun={isFirstRun} onClose={closeUpdate} />
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <MusicProvider>
            <AppShell />
          </MusicProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  )
}
