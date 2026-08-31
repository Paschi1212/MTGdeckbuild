import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function AnalyzePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const commander = location.state?.commander || sessionStorage.getItem('selectedCommander')
  const strategy = location.state?.strategy || JSON.parse(sessionStorage.getItem('strategy') || '{}')

  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deckCards, setDeckCards] = useState({
    total: 0,
    byType: {}
  })

  useEffect(() => {
    if (!commander || !strategy.primaryWinCon) {
      setError('Ungültige Eingaben')
      setLoading(false)
      return
    }

    analyzeDecks()
  }, [commander, strategy])

  const analyzeDecks = async () => {
    try {
      setLoading(true)

      // Get EDHREC data for commander
      const edhecResponse = await fetch(
        `/.netlify/functions/get-commander-data?commander=${encodeURIComponent(commander)}`
      )

      let edhecData = null
      if (edhecResponse.ok) {
        edhecData = await edhecResponse.json()
      }

      // Analyze deck
      const analysisResponse = await fetch('/.netlify/functions/analyze-deck', {
        method: 'POST',
        body: JSON.stringify({
          commander,
          strategy,
          collection: deckCards,
          userFeedback: [],
          budget: strategy.budget
        })
      })

      if (analysisResponse.ok) {
        const data = await analysisResponse.json()
        setAnalysis(data)
      } else {
        setError('Fehler bei der Analyse')
      }
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!commander) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-400 mb-4">Keine Daten zum Analysieren</p>
        <button onClick={() => navigate('/select-commander')} className="btn-primary">
          ← Zurück zur Commander Auswahl
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-gray-600 border-t-mtg-blue rounded-full mb-4"></div>
          <p className="text-gray-300 mb-2">Analysiere {commander}...</p>
          <p className="text-sm text-gray-400">Dies kann eine Minute dauern</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card bg-red-900/20 border-red-700 mb-6">
          <p className="text-red-300">❌ {error}</p>
        </div>
        <button onClick={analyzeDecks} className="btn-primary w-full mb-3">
          Erneut versuchen
        </button>
        <button onClick={() => navigate('/select-commander')} className="btn-secondary w-full">
          ← Zurück
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1>📊 Deck-Analyse für {commander}</h1>

      <div className="card mb-6">
        <h2 className="text-2xl font-bold mb-4 text-mtg-gold">Analyse-Ergebnis</h2>

        {analysis && (
          <div className="prose prose-invert max-w-none">
            <div className="bg-gray-900 rounded-lg p-6 text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
              {analysis.analysis}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-lg font-bold mb-3 text-mtg-green">✅ Nächste Schritte</h3>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>1. Speichere die Empfehlungen</li>
            <li>2. Überprüfe Preise auf Scryfall</li>
            <li>3. Passe das Deck mit dem Editor an</li>
            <li>4. Teste das Deck gegen deine Playgroup</li>
          </ul>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold mb-3 text-mtg-blue">📈 Strategie-Info</h3>
          <div className="text-sm text-gray-300 space-y-1">
            <p><strong>Win Condition:</strong> {strategy.primaryWinCon}</p>
            <p><strong>Budget:</strong> €{strategy.budget}</p>
            <p><strong>Mechaniken:</strong> {strategy.keyMechanics.slice(0, 3).join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/edit-deck')}
          className="btn-primary flex-1"
        >
          ✏️ Deck Editieren
        </button>
        <button
          onClick={() => navigate('/select-commander')}
          className="btn-secondary flex-1"
        >
          ← Neuer Commander
        </button>
      </div>
    </div>
  )
}
