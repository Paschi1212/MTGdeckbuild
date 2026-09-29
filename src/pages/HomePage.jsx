import { useNavigate } from 'react-router-dom'

const HERO_ART = 'https://api.scryfall.com/cards/named?exact=Atraxa%2C%20Praetors%27%20Voice&format=image&version=art_crop'

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
      <div className="max-w-3xl w-full">
        <div
          className="relative rounded-3xl overflow-hidden mb-10"
          style={{ border: '1px solid var(--border)', minHeight: 260 }}
        >
          <img
            src={HERO_ART}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(100deg, var(--bg) 20%, rgba(14,11,26,0.55) 60%, transparent 100%)' }}
          />
          <div className="relative px-8 py-12 md:px-12 md:py-16 text-center">
            <div className="flex justify-center gap-2 mb-5">
              <div className="w-4 h-4 rounded-full" style={{ background: 'var(--w)', boxShadow: '0 0 10px var(--w)' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: 'var(--u)', boxShadow: '0 0 10px var(--u)' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: 'var(--b)', boxShadow: '0 0 10px var(--b)' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: 'var(--g)', boxShadow: '0 0 10px var(--g)' }} />
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
              🎴 MTG Commander Deck Builder
            </h1>

            <p className="text-lg text-cmd-muted mb-8 max-w-xl mx-auto">
              Baue optimale Commander-Decks basierend auf deiner Sammlung.
              Nutze EDHREC-Daten, Gemini AI und persönliche Strategien.
            </p>

            {user ? (
              <button onClick={() => navigate('/upload')} className="btn-primary text-base">
                Zum Dashboard →
              </button>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="btn-primary text-base flex items-center justify-center gap-2 mx-auto"
              >
                <span>🔐</span>
                Mit Google anmelden
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--u)' }}>📊 Sammlung Analysieren</h3>
            <p className="text-cmd-muted text-sm">
              Lade deine ManaBox CSV und analysiere deine Kartensammlung
            </p>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--g)' }}>🎯 Decks Optimieren</h3>
            <p className="text-cmd-muted text-sm">
              Erhalte AI-gestützte Vorschläge für Cards to Add/Cut
            </p>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--r)' }}>💰 Budget Planen</h3>
            <p className="text-cmd-muted text-sm">
              Sehe Deck-Preise und finde Budget-Alternativen
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
