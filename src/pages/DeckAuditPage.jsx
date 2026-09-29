import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'
import { loadCollection, getAvailableCardNames } from '../lib/collection'

export default function DeckAuditPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const { commander, deckName, deckCards, collectionSampleNames } = location.state || {}
  // collectionSampleNames is capped (~150 names) to keep the AI prompt a reasonable size —
  // fine for that, but using the same capped list to decide "do I own this suggestion" was
  // wrong: with a bigger collection, most owned cards simply aren't in that slice and got
  // misclassified as "needs buying". Ownership classification costs nothing to compute
  // locally, so it uses the full collection instead.
  const [collection] = useState(loadCollection)
  const fullAvailableNames = useMemo(
    () => getAvailableCardNames(collection, deckName),
    [collection, deckName]
  )

  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!commander || !deckCards) {
      setError('Ungültige Eingaben')
      setLoading(false)
      return
    }

    runAudit()
  }, [])

  const runAudit = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, collectionSampleNames })
      })

      if (response.ok) {
        const data = await response.json()
        setAudit(data)
      } else {
        setError(await readApiError(response))
      }
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const backToDeck = () => navigate(`/decks/${encodeURIComponent(deckName || '')}`)

  // Split "cards to add" into what's already owned vs. what would need buying — audit-deck
  // is allowed to suggest either (it only prefers owned cards when they strategically fit,
  // never restricted to them), but the single flat grid didn't make that distinction visible.
  const ownedNames = useMemo(() => new Set(fullAvailableNames.map(n => n.toLowerCase())), [fullAvailableNames])
  const ownedCardsToAdd = (audit?.cardsToAdd || []).filter(c => ownedNames.has((c.name || '').toLowerCase()))
  const toBuyCardsToAdd = (audit?.cardsToAdd || []).filter(c => !ownedNames.has((c.name || '').toLowerCase()))

  if (!commander || !deckCards) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-400 mb-4">Keine Daten zum Analysieren</p>
        <button onClick={() => navigate('/decks')} className="btn-primary">
          ← Zurück zu Meine Decks
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-gray-600 border-t-mtg-blue rounded-full mb-4"></div>
          <p className="text-gray-300 mb-2">Analysiere {deckName}...</p>
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
        <button onClick={runAudit} className="btn-primary w-full mb-3">
          Erneut versuchen
        </button>
        <button onClick={backToDeck} className="btn-secondary w-full">
          ← Zurück
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1>📊 Deck-Analyse: {deckName}</h1>
      <p className="text-cmd-muted mb-6">Commander: {commander}</p>

      <div className="card mb-6">
        <h2 className="text-2xl font-bold mb-4 text-mtg-gold">Analyse-Ergebnis</h2>

        {audit?.summary && (
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap mb-2">{audit.summary}</p>
        )}

        {audit?.parseError && (
          <p className="text-cmd-muted text-xs mt-2">
            Hinweis: Die strukturierte Antwort konnte nicht vollständig geparst werden — es wird nur der Rohtext angezeigt.
          </p>
        )}
      </div>

      {audit?.cardsToCut?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>✂️ Cards to Cut</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToCut.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      {ownedCardsToAdd.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--g)' }}>✅ Aus deiner Sammlung</h3>
          <p className="text-xs text-cmd-muted mb-3">Besitzt du bereits — nichts zu kaufen.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {ownedCardsToAdd.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      {toBuyCardsToAdd.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>🛒 Zusätzliche Vorschläge (Zukauf nötig)</h3>
          <p className="text-xs text-cmd-muted mb-3">Nicht in deiner Sammlung — die KI hält sie trotzdem für eine gute Ergänzung.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {toBuyCardsToAdd.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/edit-deck', {
            state: {
              deckName,
              commander,
              cardsToAdd: audit?.cardsToAdd,
              cardsToCut: audit?.cardsToCut
            }
          })}
          className="btn-primary flex-1"
        >
          ✏️ Deck Editieren
        </button>
        <button onClick={backToDeck} className="btn-secondary flex-1">
          ← Zurück zum Deck
        </button>
      </div>

      <ChatWidget
        commander={commander}
        cards={(deckCards || []).map(c => ({ name: c.name, count: c.quantity }))}
        collectionSampleNames={collectionSampleNames}
      />
    </div>
  )
}
