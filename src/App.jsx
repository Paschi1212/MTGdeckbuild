import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import CollectionPage from './pages/CollectionPage'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import CommanderSelectPage from './pages/CommanderSelectPage'
import StrategyPage from './pages/StrategyPage'
import AnalyzePage from './pages/AnalyzePage'
import EditDeckPage from './pages/EditDeckPage'
import ChatBuilderPage from './pages/ChatBuilderPage'
import PrivacyPage from './pages/PrivacyPage'
import ClaudeModePage from './pages/ClaudeModePage'
import DraftAnalysisPage from './pages/DraftAnalysisPage'
import SyncBanner from './components/SyncBanner'
import { pullFromCloud, scheduleCloudPush, checkForRemoteChanges } from './lib/cloudSync'
import { checkBridge } from './lib/aiMode'
import { flushBrainOutbox } from './lib/brain'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    checkAuth()
    // Claude-Modus: look for the local bridge — a no-op unless switched on for this device.
    // Re-checked on focus, so starting/stopping the bridge shows up without a reload.
    // …and hand any logbook entries queued elsewhere (e.g. on the phone) to Obsidian.
    const checkBridgeAndFlush = () => checkBridge().then(flushBrainOutbox)
    checkBridgeAndFlush()
    window.addEventListener('focus', checkBridgeAndFlush)
    return () => window.removeEventListener('focus', checkBridgeAndFlush)
  }, [])

  // Coming back to this tab: has another device (tablet ↔ PC) saved something meanwhile?
  useEffect(() => {
    if (!user) return undefined
    const onVisible = () => { if (document.visibilityState === 'visible') checkForRemoteChanges() }
    window.addEventListener('focus', checkForRemoteChanges)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', checkForRemoteChanges)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  const checkAuth = async () => {
    try {
      const response = await fetch('/.netlify/functions/auth-check', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        // Hydrate localStorage from the server BEFORE any page can mount and read it —
        // otherwise a page's own useState(loadCollection) would grab whatever (stale or
        // empty) was already in this browser's localStorage first. pullFromCloud() only ever
        // overwrites keys the server actually has, so on the very first login anywhere
        // (server has nothing yet) this is a no-op and this device's existing local data
        // survives untouched.
        const pulled = await pullFromCloud()
        // The pull may have brought the PC's Tailscale address (tablet) and logbook entries
        // queued on another device.
        checkBridge().then(flushBrainOutbox)
        // The FIRST device to ever log in seeds the server from its local data, instead of
        // leaving it empty until some unrelated edit triggers a push. (Not on every load —
        // that would count as a change and tell the other devices to reload.)
        if (pulled.ok && pulled.empty) scheduleCloudPush()
        setUser(data.user)
      }
    } catch (error) {
      console.log('Not authenticated')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = async () => {
    try {
      await fetch('/.netlify/functions/logout', { credentials: 'include' })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-gray-600 border-t-mtg-blue rounded-full mb-4"></div>
          <p className="text-fg-muted">Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Navigation user={user} onLogout={handleLogout} />
        <main className="container mx-auto px-4 md:px-12 py-8">
          {user && <SyncBanner />}
          <Routes>
            <Route path="/" element={<HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/upload" element={user ? <UploadPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/collection" element={user ? <CollectionPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/decks" element={user ? <DecksPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/decks/:deckName" element={user ? <DeckDetailPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/select-commander" element={user ? <CommanderSelectPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/strategy" element={user ? <StrategyPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/analyze" element={user ? <AnalyzePage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/edit-deck" element={user ? <EditDeckPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/chat-builder" element={user ? <ChatBuilderPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/claude-modus" element={user ? <ClaudeModePage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/drafts/:id/analyse" element={user ? <DraftAnalysisPage /> : <HomePage user={user} onLogin={handleLogin} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
