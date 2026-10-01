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

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/.netlify/functions/auth-check', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
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
          <p className="text-gray-400">Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Navigation user={user} onLogout={handleLogout} />
        <main className="container mx-auto px-4 md:px-12 py-8">
          <Routes>
            <Route path="/" element={<HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/upload" element={user ? <UploadPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/collection" element={user ? <CollectionPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/decks" element={user ? <DecksPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/decks/:deckName" element={user ? <DeckDetailPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/select-commander" element={user ? <CommanderSelectPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/strategy" element={user ? <StrategyPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/analyze" element={user ? <AnalyzePage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/edit-deck" element={user ? <EditDeckPage /> : <HomePage user={user} onLogin={handleLogin} />} />
            <Route path="/chat-builder" element={user ? <ChatBuilderPage /> : <HomePage user={user} onLogin={handleLogin} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
