import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection, getAvailableCardNames } from '../lib/collection'
import { readApiError } from '../lib/apiError'
import { classifyType } from '../lib/cardType'
import ChatWidget from '../components/ChatWidget'

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Sonstige']

const SAMPLE_CARD_LIMIT = 150

function buildCollectionSummary() {
  const stored = loadCollection()
  return {
    total: stored?.totalCards ?? 0,
    value: stored?.totalValue ?? 0,
    // Only names with at least one copy not already committed to another real deck — a
    // brand-new deck proposal shouldn't "double-book" a physical card that's already built
    // into one of the user's existing decks.
    sampleCardNames: getAvailableCardNames(stored).slice(0, SAMPLE_CARD_LIMIT)
  }
}

export default function AnalyzePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const commander = location.state?.commander || sessionStorage.getItem('selectedCommander')
  // Memoized: sessionStorage.getItem + JSON.parse would otherwise create a new
  // object reference on every render, and having that in the effect's deps
  // below would re-trigger the (expensive, rate-limited) analysis on every
  // single re-render — an infinite request loop.
  const strategy = useMemo(
    () => location.state?.strategy || JSON.parse(sessionStorage.getItem('strategy') || '{}'),
    [location.state]
  )

  const [analysis, setAnalysis] = useState(null)
  const groupedCards = useMemo(() => {
    const groups = {}
    for (const card of analysis?.cards || []) {
      const type = classifyType(card.typeLine)
      if (!groups[type]) groups[type] = []
      groups[type].push(card)
    }
    return TYPE_ORDER
      .filter(type => groups[type]?.length)
      .map(type => ({ name: type, cards: groups[type] }))
  }, [analysis])
  const totalCardCount = (analysis?.cards || []).reduce((sum, c) => sum + (c.quantity || 0), 0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [collectionSummary] = useState(buildCollectionSummary)

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
          collection: collectionSummary,
          userFeedback: [],
          budget: strategy.budget
        })
      })

      if (analysisResponse.ok) {
        const data = await analysisResponse.json()
        setAnalysis(data)
      } else {
        setError(await readApiError(analysisResponse))
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
        <h1>📊 Analysieren</h1>
        <p className="text-cmd-muted mb-6">Was möchtest du analysieren lassen?</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button onClick={() => navigate('/select-commander')} className="card-hover text-left">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--u)' }}>🧙 Neuen Commander per KI finden</h3>
            <p className="text-cmd-muted text-sm">
              Fragebogen ausfüllen und ein komplett neues Deck von der KI vorschlagen lassen
            </p>
          </button>
          <button onClick={() => navigate('/decks')} className="card-hover text-left">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--g)' }}>🃏 Eigenes Deck analysieren</h3>
            <p className="text-cmd-muted text-sm">
              Eines deiner echten ManaBox-Decks auswählen und von der KI bewerten lassen
            </p>
          </button>
        </div>
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

  const categoryColors = ['var(--u)', 'var(--g)', 'var(--r)', 'var(--b)', 'var(--w)']

  const handleOpenInEditor = () => {
    const editorCards = (analysis?.cards || []).map(c => ({
      name: c.name,
      count: c.quantity || 1,
      price: c.eur || 0
    }))
    navigate('/edit-deck', { state: { commander, cards: editorCards, strategyNote: analysis?.summary } })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1>📊 Deck-Vorschlag für {commander}</h1>

      {collectionSummary.total === 0 && (
        <div className="card mb-6" style={{ borderColor: 'var(--u)' }}>
          <p className="text-sm text-cmd-muted">
            💡 Lade deine Sammlung hoch, damit der Vorschlag Karten berücksichtigt, die du bereits besitzt.{' '}
            <button onClick={() => navigate('/upload')} className="underline" style={{ color: 'var(--u)' }}>
              Zum Upload
            </button>
          </p>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-mtg-gold">Spielplan</h2>
          <span className="text-sm text-cmd-muted whitespace-nowrap">{totalCardCount} / 99 Karten</span>
        </div>

        {analysis?.summary && (
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap mb-2">{analysis.summary}</p>
        )}

        {analysis?.parseError && (
          <p className="text-cmd-muted text-xs mt-2">
            Hinweis: Die strukturierte Antwort konnte nicht vollständig geparst werden — es wird nur der Rohtext angezeigt.
          </p>
        )}
      </div>

      {groupedCards.map((group, i) => (
        <div key={group.name} className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: categoryColors[i % categoryColors.length] }}>
            {group.name} <span className="text-sm font-normal text-cmd-muted">({group.cards.reduce((sum, c) => sum + (c.quantity || 0), 0)})</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {group.cards.map(card => (
              <CardTile
                key={card.name}
                card={{ ...card, name: card.quantity > 1 ? `${card.quantity}x ${card.name}` : card.name }}
              />
            ))}
          </div>
        </div>
      ))}

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
          onClick={handleOpenInEditor}
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

      <ChatWidget
        commander={commander}
        cards={(analysis?.cards || []).map(c => ({ name: c.name, count: c.quantity }))}
        collectionSampleNames={collectionSummary.sampleCardNames}
      />
    </div>
  )
}
