import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'

export default function DeckAuditPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const { commander, deckName, deckCards, collectionSampleNames } = location.state || {}

  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Once the AI's own read of the deck's strategy comes back, this holds the editable text
  // version of it — the user can correct it before asking for a re-evaluation, instead of
  // the cuts/adds being anchored to a strategy read they never got to see or fix.
  const [strategyDraft, setStrategyDraft] = useState('')
  const [editingStrategy, setEditingStrategy] = useState(false)
  // React 18 StrictMode (dev only) intentionally double-invokes a mount effect — without
  // this guard, that fired two full audit requests (EDHREC + Gemini) on every page load,
  // competing for the same rate limits and making a 30s timeout much more likely. Also
  // guards against a real double-click firing this same initial request twice.
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    if (!commander || !deckCards) {
      setError('Ungültige Eingaben')
      setLoading(false)
      return
    }

    runAudit()
  }, [])

  const formatStrategy = (strategy) => strategy
    ? `Win Condition: ${strategy.winCondition}\n\nSpielplan: ${strategy.gamePlan}\n\nSchwächen: ${strategy.weaknesses}`
    : ''

  const runAudit = async (strategyOverride) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, collectionSampleNames, strategyOverride })
      })

      if (response.ok) {
        const data = await response.json()
        setAudit(data)
        // Only seed the draft from a fresh AI read — a re-run using the user's own
        // (possibly edited) override shouldn't silently overwrite what they just typed.
        if (!strategyOverride) setStrategyDraft(formatStrategy(data.strategy))
        setEditingStrategy(false)
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
        <button onClick={() => runAudit()} className="btn-primary w-full mb-3">
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

      {audit?.strategy && (
        <div className="card mb-6" style={{ borderColor: 'var(--u)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--u)' }}>🎯 Erkannte Strategie</h2>
            {!editingStrategy && (
              <button onClick={() => setEditingStrategy(true)} className="btn-secondary text-xs px-3 py-1.5">
                ✏️ Korrigieren
              </button>
            )}
          </div>
          <p className="text-xs text-cmd-muted mb-3">
            Alle Cuts/Adds unten sind gegen genau diese Strategie bewertet. Falls sie danebenliegt, korrigiere sie —
            die Bewertung wird dann strikt an deiner Version ausgerichtet, statt neu zu raten.
          </p>

          {editingStrategy ? (
            <>
              <textarea
                value={strategyDraft}
                onChange={(e) => setStrategyDraft(e.target.value)}
                className="w-full text-white rounded-xl p-3 h-40 resize-y text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => runAudit(strategyDraft)} className="btn-primary text-sm flex-1">
                  🔄 Neu bewerten mit dieser Strategie
                </button>
                <button onClick={() => { setEditingStrategy(false); setStrategyDraft(formatStrategy(audit.strategy)) }} className="btn-secondary text-sm px-4">
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-300 space-y-2 whitespace-pre-wrap leading-relaxed">
              <p><strong>Win Condition:</strong> {audit.strategy.winCondition}</p>
              <p><strong>Spielplan:</strong> {audit.strategy.gamePlan}</p>
              <p><strong>Schwächen:</strong> {audit.strategy.weaknesses}</p>
            </div>
          )}
        </div>
      )}

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

      {audit?.cardsToAdd?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--g)' }}>✅ Aus deiner Sammlung</h3>
          <p className="text-xs text-cmd-muted mb-3">Besitzt du bereits — nichts zu kaufen.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToAdd.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      {audit?.cardsToBuy?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>🛒 Zusätzliche Kaufvorschläge</h3>
          <p className="text-xs text-cmd-muted mb-3">Nicht in deiner Sammlung — unabhängig davon starke Verbesserungen für dieses Deck.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToBuy.map(card => (
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
              cardsToAdd: [...(audit?.cardsToAdd || []), ...(audit?.cardsToBuy || [])],
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
