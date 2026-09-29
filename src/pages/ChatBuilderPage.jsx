import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ChatWidget from '../components/ChatWidget'
import { loadCollection, getAvailableQuantities, getAvailableCardNames } from '../lib/collection'
import { BASIC_LAND_NAMES, classifyType } from '../lib/cardType'
import { saveDraftDeck } from '../lib/draftDecks'

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Sonstige']
const COLLECTION_SAMPLE_LIMIT = 150
function buildContextNote(preferCollection) {
  const base = 'Der Nutzer baut hier ein komplett neues Deck ausschließlich per Chat auf (kein Formular) — führe ihn aktiv, warte nicht auf Bestätigung für jede einzelne Karte.'
  const collectionClause = preferCollection
    ? ' Bevorzuge Karten aus der Sammlung des Nutzers — aber NUR wenn sie strategisch wirklich passen. Bei einem Konflikt hat die beste Karte für die Strategie immer Vorrang vor "was er schon besitzt".'
    : ' Der Nutzer will hier NICHT auf seine Sammlung Rücksicht nehmen — schlage einfach die objektiv besten Karten für die Strategie vor, unabhängig davon, was er besitzt.'
  return base + collectionClause
}

export default function ChatBuilderPage() {
  const navigate = useNavigate()
  const [commander, setCommander] = useState('')
  const [commanderCard, setCommanderCard] = useState(null)
  const [cards, setCards] = useState([])
  const [priceMap, setPriceMap] = useState({})
  const [collection] = useState(loadCollection)
  const [strategyNote, setStrategyNote] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [preferCollection, setPreferCollection] = useState(true)
  const [draftId, setDraftId] = useState(null)
  const [savedNote, setSavedNote] = useState('')

  useEffect(() => {
    const landTotal = cards.filter(c => c.isLand === true).reduce((sum, c) => sum + c.count, 0)
    const totalCount = cards.reduce((sum, c) => sum + c.count, 0)
    console.log(`[ChatBuilderPage] cards state changed — ${cards.length} entries, land quantity sum: ${landTotal}, total quantity sum: ${totalCount}`)
  }, [cards])

  useEffect(() => {
    if (!commander) {
      setCommanderCard(null)
      return
    }
    fetch(`/.netlify/functions/get-card-price?card=${encodeURIComponent(commander)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(setCommanderCard)
      .catch(() => {})
  }, [commander])

  const namesKey = [...new Set(cards.map(c => c.name))].join('|')

  useEffect(() => {
    const names = namesKey ? namesKey.split('|') : []
    if (names.length === 0) return
    fetch('/.netlify/functions/get-card-price', {
      method: 'POST',
      body: JSON.stringify({ names })
    })
      .then(res => (res.ok ? res.json() : {}))
      .then(setPriceMap)
      .catch(() => {})
  }, [namesKey])

  const handleChatAction = (action) => {
    if (action.type === 'setCommander') {
      if (action.name) setCommander(action.name)
      return
    }

    const nameLower = (action.name || '').toLowerCase()
    if (!nameLower) return

    setCards(prev => {
      const existingIndex = prev.findIndex(c => c.name.toLowerCase() === nameLower)

      if (action.type === 'remove') {
        return existingIndex === -1 ? prev : prev.filter((_, i) => i !== existingIndex)
      }

      if (action.type === 'update') {
        if (existingIndex === -1 || !action.quantity) return prev
        const updated = [...prev]
        updated[existingIndex] = { ...updated[existingIndex], count: action.quantity }
        return updated
      }

      // add — increments the existing count (add_card means "one/more MORE copies",
      // not "set the count to this" — that's update_card_count's job). Overwriting here
      // was the bug behind counts silently shrinking mid-conversation. But only basic
      // lands may legally exceed 1 copy (Singleton format) — the assistant sometimes
      // re-suggests a nonbasic card across multiple build turns, so guard against that
      // silently creating an illegal 2nd copy instead of trusting it to never happen.
      if (existingIndex !== -1) {
        const updated = [...prev]
        const existing = updated[existingIndex]
        if (!BASIC_LAND_NAMES.has(existing.name)) return prev
        updated[existingIndex] = { ...existing, count: existing.count + (action.quantity || 1) }
        return updated
      }
      return [...prev, { name: action.name, count: action.quantity || 1, isLand: action.isLand }]
    })
  }

  // Owned vs. needs-buying, per card — new deck, so nothing to self-exclude (unlike
  // EditDeckPage, where a real deck's own committed copies shouldn't count against it).
  const availableQuantities = useMemo(() => getAvailableQuantities(collection), [collection])
  const availableCardNames = useMemo(
    () => getAvailableCardNames(collection).slice(0, COLLECTION_SAMPLE_LIMIT),
    [collection]
  )

  const enrichedCards = cards
    .map(c => {
      const available = availableQuantities.get(c.name)?.available || 0
      return {
        ...c,
        price: priceMap[c.name]?.eur || 0,
        image: priceMap[c.name]?.image,
        // The full-deck builder already knows for certain whether a card is a land (it built
        // lands/spells as separate, verified lists) — trust that over Scryfall's type_line,
        // which arrives async and can leave the count looking wrong for a moment (or longer,
        // for any name that fails to resolve) right after a big build lands all at once.
        type: c.isLand === true ? 'Land' : classifyType(priceMap[c.name]?.typeLine),
        missingCount: Math.max(c.count - available, 0)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const deckSize = cards.reduce((sum, c) => sum + c.count, 0)
  const deckTotal = enrichedCards.reduce((sum, c) => sum + c.count * c.price, 0)
  const landCount = enrichedCards.filter(c => c.type === 'Land').reduce((sum, c) => sum + c.count, 0)
  const missingCardCount = enrichedCards.reduce((sum, c) => sum + c.missingCount, 0)

  const displayGroups = TYPE_ORDER
    .map(type => ({ type, cards: enrichedCards.filter(c => c.type === type) }))
    .filter(group => group.cards.length > 0)

  const handleReset = () => {
    setCards([])
    setCommander('')
    setCommanderCard(null)
    setPriceMap({})
    setStrategyNote('')
    setDraftId(null)
    setSavedNote('')
    // Remounts ChatWidget (wipes its own internal chat history too) — otherwise the model
    // still "remembers" the previous, possibly-broken build and can act on stale context.
    setResetKey(k => k + 1)
  }

  const handleOpenInEditor = () => {
    navigate('/edit-deck', {
      state: {
        commander,
        cards: cards.map(c => ({ name: c.name, count: c.count, price: priceMap[c.name]?.eur || 0, isLand: c.isLand })),
        strategyNote
      }
    })
  }

  const handleSaveDraft = () => {
    const saved = saveDraftDeck({
      id: draftId,
      name: commanderCard?.name || commander || 'Unbenannter Entwurf',
      commander,
      cards: cards.map(c => ({ name: c.name, count: c.count, price: priceMap[c.name]?.eur || 0, isLand: c.isLand })),
      strategyNote
    })
    setDraftId(saved.id)
    setSavedNote(`Gespeichert ${new Date(saved.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} — in "Meine Entwürfe" zu finden.`)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="mb-1">🤖 Deck per Chat bauen</h1>
          <p className="text-cmd-muted">
            Beschreib einfach, was du spielen willst — der Assistent schlägt einen Commander vor und baut mit dir zusammen die Kartenliste auf. Kein Formular, nur Gespräch.
          </p>
        </div>
        {(cards.length > 0 || commander) && (
          <button onClick={handleReset} className="btn-secondary text-xs px-3 py-2 whitespace-nowrap flex-shrink-0">
            🔄 Neu anfangen
          </button>
        )}
      </div>

      {collection && (
        <label className="flex items-center gap-2 mb-6 text-sm text-cmd-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={preferCollection}
            onChange={(e) => setPreferCollection(e.target.checked)}
            className="w-4 h-4"
          />
          🎯 Meine Sammlung bevorzugen (nur wenn es zur Strategie passt)
        </label>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ChatWidget
            key={resetKey}
            embedded
            commander={commander}
            cards={cards}
            onAction={handleChatAction}
            contextNote={buildContextNote(preferCollection)}
            collectionSampleNames={preferCollection ? availableCardNames : undefined}
            bulkBuild
            onReply={setStrategyNote}
          />
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!collection && (
            <div className="card" style={{ borderColor: 'var(--u)' }}>
              <p className="text-sm text-cmd-muted">
                💡 Noch keine Sammlung hochgeladen — der Assistent schlägt dann Karten unabhängig davon vor, was du besitzt.{' '}
                <button onClick={() => navigate('/upload')} className="underline" style={{ color: 'var(--u)' }}>
                  Zum Upload
                </button>
              </p>
            </div>
          )}

          {commanderCard ? (
            <div className="card flex gap-4 items-center">
              {commanderCard.image && (
                <img src={commanderCard.image} alt={commanderCard.name} className="w-16 h-auto rounded-lg flex-shrink-0" />
              )}
              <div>
                <div className="text-xs text-cmd-muted uppercase tracking-wide">Commander</div>
                <div className="text-lg font-bold text-white">{commanderCard.name}</div>
              </div>
            </div>
          ) : (
            <div className="card">
              <p className="text-sm text-cmd-muted">
                Noch kein Commander gewählt — sag im Chat z.B. "Ich will aggressiv mit Rot/Weiß spielen" oder nenne direkt einen Namen.
              </p>
            </div>
          )}

          {strategyNote && (
            <div className="card" style={{ borderColor: 'var(--g)' }}>
              <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--g)' }}>📋 Strategie</h2>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto pr-1">
                {strategyNote}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="card">
              <div className="text-xs text-gray-400">Deck-Größe</div>
              <div className="text-xl font-bold text-mtg-gold">
                {deckSize} <span className="text-xs text-cmd-muted">/ 99</span>
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-400">Länder</div>
              <div className="text-xl font-bold text-mtg-blue">{landCount}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-400">Kosten</div>
              <div className="text-xl font-bold text-mtg-green">€{deckTotal.toFixed(2)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-gray-400">Zu kaufen</div>
              <div className="text-xl font-bold" style={{ color: missingCardCount > 0 ? 'var(--r)' : 'var(--g)' }}>
                {missingCardCount}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-sm font-bold mb-3 text-cmd-muted uppercase tracking-wide">
              Aktuelle Liste ({deckSize})
            </h2>

            {enrichedCards.length === 0 ? (
              <p className="text-sm text-cmd-muted text-center py-6">Noch keine Karten — leg im Chat los.</p>
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                {displayGroups.map(group => (
                  <div key={group.type}>
                    <div className="text-xs font-bold text-cmd-muted uppercase tracking-wide mb-1.5">
                      {group.type} ({group.cards.reduce((sum, c) => sum + c.count, 0)})
                    </div>
                    <div className="space-y-2">
                      {group.cards.map(card => (
                        <div
                          key={card.name}
                          className="rounded-lg p-2 flex items-center gap-2"
                          style={{ backgroundColor: 'var(--surface)' }}
                        >
                          <div className="w-7 h-10 rounded overflow-hidden bg-black/30 flex-shrink-0">
                            {card.image && (
                              <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{card.count > 1 ? `${card.count}x ` : ''}{card.name}</div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-cmd-muted">€{(card.count * card.price).toFixed(2)}</span>
                              {card.missingCount > 0 ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(239,106,99,0.15)', color: 'var(--r)' }}>
                                  🛒 {card.missingCount > 1 ? `${card.missingCount}x kaufen` : 'kaufen'}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(78,214,137,0.15)', color: 'var(--g)' }}>
                                  ✅ in Sammlung
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleChatAction({ type: 'remove', name: card.name })}
                            className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(commander || cards.length > 0) && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button onClick={handleSaveDraft} className="btn-secondary flex-1">
                  💾 {draftId ? 'Entwurf aktualisieren' : 'Als Entwurf speichern'}
                </button>
                <button onClick={handleOpenInEditor} className="btn-primary flex-1">
                  ✏️ Im Editor öffnen
                </button>
              </div>
              {savedNote && <p className="text-xs text-cmd-muted text-center">{savedNote}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
