import { useState } from 'react'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'
import { getDeckPreferences, setDeckPreferences } from '../lib/deckPreferences'
import { getSecondaryAvailability } from '../lib/secondaryCollections'
import { aiFetch, isClaudeActive } from '../lib/aiMode'

// Embedded as the "Analyse" tab of a deck's consolidated detail page — no longer a standalone
// route. `cachedAudit`/`onAuditComplete` let the parent remember the last result across tab
// switches (so hopping to another tab and back doesn't silently re-run a real AI call), and
// `onOpenEditor`/`onBack` switch tabs on that page instead of navigating to a separate route.
export default function DeckAuditPage({ commander, deckName, deckCards, collectionSampleNames, powerLevel, cachedAudit, onAuditComplete, onOpenEditor, onBack }) {
  const rememberedStrategy = getDeckPreferences(deckName).strategyOverride || ''

  const [audit, setAudit] = useState(cachedAudit || null)
  const [loading, setLoading] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [error, setError] = useState(null)
  const [suggestionsError, setSuggestionsError] = useState(null)
  const [strategyDraft, setStrategyDraft] = useState(rememberedStrategy)
  const [editingStrategy, setEditingStrategy] = useState(false)

  const formatStrategy = (strategy) => strategy
    ? `Win Condition: ${strategy.winCondition}\n\nSpielplan: ${strategy.gamePlan}\n\nSchwächen: ${strategy.weaknesses}`
    : ''

  // cardsToAdd/cardsToBuy (the uncapped half, scanning a collection of up to 2000 names) ran
  // in the same request as the strategy read and reliably blew Netlify's 30s budget once both
  // the collection sample and the suggestion counts were uncapped. Split into two requests —
  // each with its own fresh 30s window — the same chunking idea already used for the
  // Preisgewinner scan. Phase 2 needs phase 1's "strategy" object as input, so it only starts
  // once phase 1 has actually returned one.
  const runSuggestions = async (strategy) => {
    try {
      setLoadingSuggestions(true)
      setSuggestionsError(null)

      const response = await aiFetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, collectionSampleNames, strategy, phase: 'suggestions' })
      })

      if (response.ok) {
        const data = await response.json()
        setAudit(prev => {
          const merged = { ...prev, cardsToAdd: data.cardsToAdd, cardsToBuy: data.cardsToBuy }
          onAuditComplete?.(merged)
          return merged
        })
        if (data.parseError) {
          setSuggestionsError('Die Kaufvorschläge wurden wegen Längenlimit abgeschnitten, bevor sie fertig waren.')
        }
      } else {
        setSuggestionsError(await readApiError(response))
      }
    } catch (err) {
      console.error('Error:', err)
      setSuggestionsError(err.message)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const runAudit = async (strategyOverride) => {
    try {
      setLoading(true)
      setError(null)
      setSuggestionsError(null)

      // Remembered with the result, so a saved analysis still says which AI wrote it.
      const engine = isClaudeActive() ? 'claude' : 'gemini'
      const response = await aiFetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, strategyOverride, powerLevel, phase: 'strategy' })
      })

      if (response.ok) {
        const data = await response.json()
        const partial = { ...data, cardsToAdd: [], cardsToBuy: [], engine }
        setAudit(partial)
        onAuditComplete?.(partial)
        // A fresh AI read (no override) is persisted too, not just an explicit manual
        // correction — otherwise running "Analysieren" once leaves nothing to show on the
        // deck's own page, since that page only ever read the remembered override.
        if (!strategyOverride) {
          const formatted = formatStrategy(data.strategy)
          setStrategyDraft(formatted)
          if (formatted) setDeckPreferences(deckName, { strategyOverride: formatted })
        }
        setEditingStrategy(false)
        setLoading(false)
        if (data.strategy && !data.parseError) {
          runSuggestions(data.strategy)
        }
      } else {
        setError(await readApiError(response))
        setLoading(false)
      }
    } catch (err) {
      console.error('Error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  if (!commander || !deckCards) {
    return <p className="text-red-400">Keine Daten zum Analysieren</p>
  }

  if (!audit && !loading && !error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <p className="text-cmd-muted mb-4">Noch keine Analyse für dieses Deck gelaufen.</p>
        <button onClick={() => runAudit(rememberedStrategy || undefined)} className="btn-primary">
          🔍 Jetzt analysieren
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-gray-600 border-t-mtg-blue rounded-full mb-4"></div>
          <p className="text-gray-300 mb-2">Analysiere {deckName}...</p>
          <p className="text-sm text-gray-400">
            {isClaudeActive()
              ? '🧠 Claude prüft Kartentexte auf Scryfall & EDHREC — das dauert 1–3 Minuten'
              : 'Dies kann eine Minute dauern'}
          </p>
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
        <button onClick={() => runAudit()} className="btn-primary w-full">
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div>
      {audit?.strategy && (
        <div className="card mb-6" style={{ borderColor: 'var(--u)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--u)' }}>🎯 Spielplan</h2>
            {!editingStrategy && (
              <button onClick={() => setEditingStrategy(true)} className="btn-secondary text-xs px-3 py-1.5">
                ✏️ Korrigieren
              </button>
            )}
          </div>
          <p className="text-xs text-cmd-muted mb-3">
            Alle Cuts/Adds unten sind gegen genau diesen Spielplan bewertet. Falls er danebenliegt, korrigiere ihn —
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
                <button
                  onClick={() => { setDeckPreferences(deckName, { strategyOverride: strategyDraft }); runAudit(strategyDraft) }}
                  className="btn-primary text-sm flex-1"
                >
                  🔄 Neu bewerten mit diesem Spielplan
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
              {rememberedStrategy && (
                <button
                  onClick={() => { setDeckPreferences(deckName, { strategyOverride: '' }); runAudit() }}
                  className="text-xs text-cmd-muted underline"
                >
                  Gemerkte Korrektur verwerfen & KI neu raten lassen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card mb-6">
        <h2 className="text-2xl font-bold mb-4 text-mtg-gold">
          Analyse-Ergebnis
          {audit?.engine && (
            <span className="ml-3 align-middle text-xs font-semibold px-2 py-1 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {audit.engine === 'claude' ? '🧠 von Claude' : '✨ von Gemini'}
            </span>
          )}
        </h2>

        {audit?.summary && (
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap mb-2">{audit.summary}</p>
        )}

        {audit?.parseError && (
          <button onClick={() => runAudit(rememberedStrategy || undefined)} className="btn-primary text-sm mt-2">
            🔄 Erneut versuchen
          </button>
        )}

        <button onClick={() => runAudit(rememberedStrategy || undefined)} className="btn-secondary text-xs mt-3">
          🔄 Neu analysieren
        </button>
      </div>

      {audit?.cardsToCut?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>✂️ Cards to Cut ({audit.cardsToCut.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToCut.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      {loadingSuggestions && (
        <div className="card mb-8 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-mtg-blue rounded-full flex-shrink-0"></div>
          <p className="text-sm text-gray-300">
            Lade Kaufvorschläge & Sammlungs-Treffer…{isClaudeActive() && ' (🧠 Claude, 1–3 Minuten)'}
          </p>
        </div>
      )}

      {suggestionsError && !loadingSuggestions && (
        <div className="card bg-red-900/20 border-red-700 mb-8">
          <p className="text-red-300 mb-3">❌ {suggestionsError}</p>
          <button onClick={() => runSuggestions(audit.strategy)} className="btn-primary text-sm">
            🔄 Kaufvorschläge erneut laden
          </button>
        </div>
      )}

      {audit?.cardsToAdd?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--g)' }}>✅ Aus deiner Sammlung ({audit.cardsToAdd.length})</h3>
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
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>🛒 Zusätzliche Kaufvorschläge ({audit.cardsToBuy.length})</h3>
          <p className="text-xs text-cmd-muted mb-3">Nicht in deiner Sammlung — unabhängig davon starke Verbesserungen für dieses Deck.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToBuy.map(card => (
              <CardTile key={card.name} card={{ ...card, friendAvailability: getSecondaryAvailability(card.name) }} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onOpenEditor?.([...(audit?.cardsToAdd || []), ...(audit?.cardsToBuy || [])], audit?.cardsToCut)}
          className="btn-primary flex-1"
        >
          ✏️ Deck Editieren
        </button>
        <button onClick={onBack} className="btn-secondary flex-1">
          ← Zurück zur Übersicht
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
