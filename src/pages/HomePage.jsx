import { useNavigate } from 'react-router-dom'

export default function HomePage({ user, onLogin }) {
  const navigate = useNavigate()

  const handleGoogleLogin = async () => {
    try {
      // Redirect to Google OAuth flow
      window.location.href = '/.netlify/functions/google-auth?action=login'
    } catch (error) {
      console.error('Login error:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 text-mtg-gold">
          🎴 MTG Commander Deck Builder
        </h1>

        <p className="text-xl text-gray-300 mb-8">
          Baue optimale Commander-Decks basierend auf deiner Sammlung.
          Nutze EDHREC-Daten, Claude AI und persönliche Strategien.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="card">
            <h3 className="text-lg font-bold mb-2 text-mtg-blue">📊 Sammlung Analysieren</h3>
            <p className="text-gray-400">
              Lade deine ManaBox CSV und analysiere deine Kartensammlung
            </p>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-2 text-mtg-green">🎯 Decks Optimieren</h3>
            <p className="text-gray-400">
              Erhalte AI-gestützte Vorschläge für Cards to Add/Cut
            </p>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-2 text-mtg-red">💰 Budget Planen</h3>
            <p className="text-gray-400">
              Sehe Deck-Preise und finde Budget-Alternativen
            </p>
          </div>
        </div>

        {user ? (
          <button
            onClick={() => navigate('/upload')}
            className="btn-primary text-lg px-8 py-3"
          >
            Zum Dashboard →
          </button>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="btn-primary text-lg px-8 py-3 flex items-center justify-center gap-2 mx-auto"
          >
            <span>🔐</span>
            Mit Google anmelden
          </button>
        )}
      </div>
    </div>
  )
}
