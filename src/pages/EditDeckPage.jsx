import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadCollection, getCardsForBinder, getAvailableQuantities, getAvailableCardNames } from '../lib/collection'
import { saveDraftDeck } from '../lib/draftDecks'
import { classifyType, BASIC_LAND_NAMES } from '../lib/cardType'
import { getSecondaryAvailability } from '../lib/secondaryCollections'
import { getDeckPreferences } from '../lib/deckPreferences'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { CardZoomModal } from '../components/CardTile'
import ChatWidget from '../components/ChatWidget'
import PlaytestModal from '../components/PlaytestModal'
import DeckList from '../components/editor/DeckList'
import CardSearch from '../components/editor/CardSearch'
import { SuggestionsPanel, ShoppingPanel, StatsPanel, StrategyPanel } from '../components/editor/EditorPanels'

const CMC_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const DECK_TARGET = 99

const COLOR_NAMES = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün', Multicolor: 'Mehrfarbig', Colorless: 'Farblos' }

// Fixed, always-rendered set (deckstats-style) when grouping by type — cards can be dragged
// into an empty category, so every category needs a visible drop target, not just ones that
// already happen to have a card in them.
const TYPE_GROUP_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Sonstige']
// German names as printed on German cards — the keys stay English (classifyType's output).
const TYPE_LABELS = {
  Creature: 'Kreaturen', Planeswalker: 'Planeswalker', Battle: 'Schlachten', Instant: 'Spontanzauber',
  Sorcery: 'Hexereien', Artifact: 'Artefakte', Enchantment: 'Verzauberungen', Land: 'Länder', Sonstige: 'Sonstige'
}

function colorGroupKey(colors) {
  const list = (colors || '').split(' ').filter(Boolean)
  if (list.length === 0) return 'Colorless'
  if (list.length > 1) return 'Multicolor'
  return list[0]
}

function loadInitialCards(deckName, commanderName, proposedCards) {
  if (deckName) {
    const collection = loadCollection()
    return getCardsForBinder(collection, deckName)
      .filter(row => row.name !== commanderName)
      .map(row => ({
        name: row.name,
        count: row.quantity,
        price: row.purchasePrice,
        scryfallId: row.scryfallId
      }))
  }

  // No real deck — this is a fresh AI-proposed decklist from AnalyzePage, if any.
  return proposedCards || []
}

// Standalone route usage (AI-proposed drafts from ChatBuilderPage/AnalyzePage/DeckAuditPage)
// reads everything from router location.state, as before. Embedded usage (a real deck's
// "Editor" tab on its consolidated detail page) passes the same shape directly as props —
// there's no route navigation into a tab, so there's no location.state to read there.
export default function EditDeckPage(embeddedState) {
  const location = useLocation()
  const navigate = useNavigate()
  // Set only by the embedded "Editor" tab on a deck's consolidated page — lets "Zurück"/
  // "Fertig" switch back to that page's own Übersicht tab instead of navigating away to a
  // whole different route, which would otherwise exit the deck entirely.
  const onBack = embeddedState?.onBack
  const state = embeddedState?.deckName !== undefined || embeddedState?.cards !== undefined
    ? embeddedState
    : (location.state || {})
  const deckName = state.deckName
  const suggestedCardsToAdd = state.cardsToAdd || []
  const suggestedCardsToCut = state.cardsToCut || []
  const proposedCards = state.cards
  // A real deck's strategy correction (the "✏️ Korrigieren" box on the Analyse tab) is
  // persisted in deckPreferences, not passed down as a prop — opening the Editor tab
  // directly (not via the Analyse result's "Deck Editieren" button, which DOES pass
  // strategyNote explicitly) left this blank even though a correction was saved, so the
  // Editor silently showed no strategy at all. Falls back to the saved override for a real
  // deck when nothing more specific was handed down.
  const [strategyNote, setStrategyNote] = useState(
    state.strategyNote || (deckName ? getDeckPreferences(deckName).strategyOverride : '') || ''
  )
  // Re-saving a draft you opened from "Meine Entwürfe" overwrites it in place instead of
  // piling up duplicates — only set when this session actually started from a saved draft.
  const [draftId, setDraftId] = useState(state.draftId || null)

  // For a real ManaBox deck (deckName set), the commander is a fact about that binder —
  // don't let chat's set_commander action rewrite it, only the free-form proposal flow.
  const [commanderName, setCommanderName] = useState(state.commander || '')
  const [cards, setCards] = useState(() => loadInitialCards(deckName, commanderName, proposedCards))
  const [collection] = useState(loadCollection)
  const [commanderCard, setCommanderCard] = useState(null)

  // Mana value then name — the order decklists are read in; price stays one click away.
  const [sortBy, setSortBy] = useState('cmc')
  const [groupBy, setGroupBy] = useState('type')
  const [dragOverGroup, setDragOverGroup] = useState(null)
  // Empty categories only earn their keep as visible drop targets while a drag is actually
  // in progress — otherwise they're just clutter (e.g. "Battle (0)" on a deck with none).
  const [isDragging, setIsDragging] = useState(false)
  // Desktop: side panel next to the list. Phone: one tab bar, the deck itself first.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [panel, setPanel] = useState(null)
  const [mobileTab, setMobileTab] = useState('deck')
  const [showStrategy, setShowStrategy] = useState(false)
  // The side panel sticks just below the deck bar, whose height changes (strategy shown,
  // notice for ManaBox decks) — measured instead of guessed.
  const deckBarRef = useRef(null)
  const [deckBarHeight, setDeckBarHeight] = useState(88)
  useEffect(() => {
    const bar = deckBarRef.current
    if (!bar) return
    const observer = new ResizeObserver(() => setDeckBarHeight(bar.offsetHeight))
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const [priceMap, setPriceMap] = useState({})
  const [byIdMap, setByIdMap] = useState({})
  const [zoomedCard, setZoomedCard] = useState(null)
  const [showPlaytest, setShowPlaytest] = useState(false)

  useEffect(() => {
    if (!commanderName) return
    fetch(`/.netlify/functions/get-card-price?card=${encodeURIComponent(commanderName)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(setCommanderCard)
      .catch(() => {})
  }, [commanderName])

  // Cards from a real ManaBox deck have a scryfallId — resolve those via the
  // fast by-ID batch lookup (also gives us cmc/typeLine for grouping + the
  // mana curve). Manually added cards have no scryfallId and fall back to
  // the by-name lookup below (image/price only, no type/cmc).
  const scryfallIdsKey = [...new Set(cards.filter(c => c.scryfallId).map(c => c.scryfallId))].join('|')

  useEffect(() => {
    const ids = scryfallIdsKey ? scryfallIdsKey.split('|') : []
    if (ids.length === 0) return

    fetch('/.netlify/functions/get-card-price', {
      method: 'POST',
      body: JSON.stringify({ ids })
    })
      .then(res => (res.ok ? res.json() : {}))
      .then(setByIdMap)
      .catch(() => {})
  }, [scryfallIdsKey])

  const namesWithoutIdKey = [...new Set(cards.filter(c => !c.scryfallId).map(c => c.name))].join('|')

  useEffect(() => {
    const names = namesWithoutIdKey ? namesWithoutIdKey.split('|') : []
    if (names.length === 0) return

    fetch('/.netlify/functions/get-card-price', {
      method: 'POST',
      body: JSON.stringify({ names })
    })
      .then(res => (res.ok ? res.json() : {}))
      .then(setPriceMap)
      .catch(() => {})
  }, [namesWithoutIdKey])

  // Cards already built into one of the user's OTHER real decks aren't free to add here —
  // that physical copy is committed elsewhere. This deck's own cards don't count against
  // themselves (excludeBinderName), so re-searching within the same deck still works fine.
  const availableQuantities = useMemo(() => getAvailableQuantities(collection, deckName), [collection, deckName])
  const availableCardNames = useMemo(
    () => getAvailableCardNames(collection, deckName).slice(0, 150),
    [collection, deckName]
  )

  const enrichedCards = useMemo(() => {
    return cards.map((card, index) => {
      const byId = byIdMap[card.scryfallId]
      const byName = priceMap[card.name]
      // Only meaningful for a non-real deck (AI proposal/chat build) — a real ManaBox
      // deck's cards are inherently already owned, no point marking that.
      const missingCount = deckName ? undefined : Math.max(card.count - (availableQuantities.get(card.name)?.available || 0), 0)
      return {
        ...card,
        index,
        // A real deck's cards carry what the user paid (ManaBox purchase price); drafts,
        // chat builds and imported lists don't — they used to show €0.00 everywhere, which
        // also zeroed the shopping list. Fall back to the current Scryfall price.
        price: card.price || byId?.eur || byName?.eur || 0,
        image: byId?.image ?? byName?.image,
        // If this card came from the chat full-deck builder, the backend already knows
        // for certain whether it's a land (built as a separate, verified list) — trust
        // that over Scryfall type_line, which arrives async and can lag for a big batch.
        // A manual drag-drop recategorization (categoryOverride) wins over both.
        type: card.categoryOverride || (card.isLand === true ? 'Land' : classifyType(byId?.typeLine ?? byName?.typeLine)),
        cmc: byId?.cmc ?? byName?.cmc ?? 0,
        manaCost: byId?.manaCost ?? byName?.manaCost ?? '',
        // By-name lookups (every draft card) only carry color identity — still the right
        // signal for the color chart, which showed whole Temur decks as "colorless" before.
        colors: byId?.colors ?? byName?.colorIdentity ?? '',
        missingCount,
        // A separately-uploaded friend's collection has this card — only worth checking (and
        // showing) for a card the user actually still needs to buy.
        friendAvailability: missingCount > 0 ? getSecondaryAvailability(card.name) : []
      }
    })
  }, [cards, byIdMap, priceMap, availableQuantities, deckName])

  const deckTotal = enrichedCards.reduce((sum, c) => sum + c.count * c.price, 0)
  const deckSize = enrichedCards.reduce((sum, c) => sum + c.count, 0)

  const shoppingList = useMemo(
    () => enrichedCards.filter(c => c.missingCount > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [enrichedCards]
  )
  const shoppingTotal = shoppingList.reduce((sum, c) => sum + c.missingCount * c.price, 0)

  const handleExportShoppingList = () => {
    const title = commanderCard?.name || commanderName || 'Deck'
    const lines = [
      `Einkaufsliste – ${title}`,
      `Stand: ${new Date().toLocaleDateString('de-DE')}`,
      '',
      ...shoppingList.map(c => `${c.missingCount}x ${c.name} — €${(c.missingCount * c.price).toFixed(2)}`),
      '',
      `Gesamt: €${shoppingTotal.toFixed(2)}`
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `einkaufsliste-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const manaCurveData = useMemo(() => {
    const buckets = CMC_BUCKETS.map(label => ({ cmc: label, count: 0 }))
    for (const card of enrichedCards) {
      if (card.type === 'Land') continue
      const bucketIndex = Math.min(Math.round(card.cmc), 7)
      buckets[bucketIndex].count += card.count
    }
    return buckets
  }, [enrichedCards])

  // Nonland cards per color — the color bars in the Statistik panel.
  const colorCounts = useMemo(() => {
    const totals = {}
    for (const card of enrichedCards) {
      if (card.type === 'Land') continue
      const key = colorGroupKey(card.colors)
      totals[key] = (totals[key] || 0) + card.count
    }
    return totals
  }, [enrichedCards])

  const nonlandCards = enrichedCards.filter(c => c.type !== 'Land')
  const nonlandCount = nonlandCards.reduce((sum, c) => sum + c.count, 0)
  const averageCmc = nonlandCount ? nonlandCards.reduce((sum, c) => sum + c.cmc * c.count, 0) / nonlandCount : 0
  const landCount = deckSize - nonlandCount

  // "type" grouping always shows every standard category (even empty ones) so there's
  // always a drop target to drag a card into — matches deckstats' "Drop cards here" columns.
  // Other groupings only make sense to show buckets that actually have cards in them.
  const categoryKeyFor = (card) => {
    if (groupBy === 'color') return colorGroupKey(card.colors)
    if (groupBy === 'cmc') {
      if (card.type === 'Land') return 'Land'
      const rounded = Math.round(card.cmc)
      return rounded >= 7 ? '7+' : String(rounded)
    }
    return card.type
  }

  const groupOrder = groupBy === 'color'
    ? ['W', 'U', 'B', 'R', 'G', 'Multicolor', 'Colorless']
    : groupBy === 'cmc'
      ? [...CMC_BUCKETS, 'Land']
      : TYPE_GROUP_ORDER

  const groupLabel = (key) => {
    if (groupBy === 'color') return COLOR_NAMES[key] || key
    if (groupBy === 'cmc') return key === 'Land' ? 'Länder' : `Manawert ${key}`
    return TYPE_LABELS[key] || key
  }

  const cardsByCategory = {}
  for (const card of enrichedCards) {
    const key = categoryKeyFor(card)
    if (!cardsByCategory[key]) cardsByCategory[key] = []
    cardsByCategory[key].push(card)
  }

  // Empty categories stay hidden by default — they only reappear as visible drop targets
  // while actively dragging a card, so recategorizing into a currently-empty type is still
  // possible without permanently cluttering the view with "Battle (0)"-style empty headers.
  const categories = groupBy === 'type'
    ? groupOrder.filter(cat => cardsByCategory[cat]?.length || (isDragging && cat !== 'Sonstige'))
    : groupOrder.filter(cat => cardsByCategory[cat]?.length)

  const sortWithin = (list) => [...list].sort((a, b) => {
    if (sortBy === 'price') return (b.price * b.count) - (a.price * a.count) || a.name.localeCompare(b.name)
    if (sortBy === 'cmc') return a.cmc - b.cmc || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  })

  const displayGroups = categories.map(cat => ({ key: cat, label: groupLabel(cat), cards: sortWithin(cardsByCategory[cat] || []) }))

  // Always per card type, whatever the list is grouped by — for the Statistik panel.
  const typeCounts = TYPE_GROUP_ORDER
    .map(type => ({ label: TYPE_LABELS[type], count: enrichedCards.filter(c => c.type === type).reduce((sum, c) => sum + c.count, 0) }))
    .filter(t => t.count > 0)

  const existingNames = useMemo(() => new Set(cards.map(c => c.name)), [cards])

  const cutReasonMap = useMemo(() => {
    const map = new Map()
    for (const c of suggestedCardsToCut) map.set(c.name, c.reason)
    return map
  }, [suggestedCardsToCut])

  // Cut suggestions still in the deck (one disappears from the panel once removed).
  const cutsInDeck = enrichedCards
    .filter(card => cutReasonMap.has(card.name))
    .map(card => ({ name: card.name, reason: cutReasonMap.get(card.name), card }))

  const pendingSuggestions = useMemo(() => {
    return suggestedCardsToAdd.filter(c => c.name !== commanderName && !existingNames.has(c.name))
  }, [suggestedCardsToAdd, commanderName, existingNames])

  const isOwned = (name) => (availableQuantities.get(name)?.available || 0) > 0

  const handleAddFromSearch = (row) => {
    setCards(prev => [...prev, { name: row.name, count: 1, price: row.purchasePrice, scryfallId: row.scryfallId }])
  }

  // Any card by name (not owned, or owned but committed elsewhere) — price, image and type
  // arrive with the by-name Scryfall lookup.
  const handleAddByName = (name) => {
    setCards(prev => (prev.some(c => c.name === name) ? prev : [...prev, { name, count: 1, price: 0 }]))
  }

  const handleAddSuggestion = (card) => {
    setCards(prev => (prev.some(c => c.name === card.name) ? prev : [...prev, { name: card.name, count: 1, price: card.eur || 0 }]))
  }

  const handleAddAllOwnedSuggestions = () => {
    const owned = pendingSuggestions.filter(card => isOwned(card.name))
    setCards(prev => [...prev, ...owned.filter(card => !prev.some(c => c.name === card.name)).map(card => ({ name: card.name, count: 1, price: card.eur || 0 }))])
  }

  const handleRemoveAllCuts = () => {
    setCards(prev => prev.filter(card => !cutReasonMap.has(card.name)))
  }

  // The chat assistant can act on the deck directly (Gemini function calling) — it only
  // ever sends real card names back, but "update"/"remove" still no-op safely if the name
  // doesn't match anything currently in the deck rather than risk touching the wrong row.
  const handleChatAction = (action) => {
    if (action.type === 'setCommander') {
      if (action.name && !deckName) setCommanderName(action.name)
      return
    }

    // A full build_full_deck result — a complete, self-contained 99-card deck, not an
    // increment to whatever was already here. Replacing the whole list (rather than
    // funneling each card through the same +N semantics as a single add_card request) is
    // what actually fixes runaway counts from asking for a rebuild more than once per
    // session — "add" on a basic land used to stack a second manabase on top of the first.
    if (action.type === 'replaceDeck') {
      setCards((action.cards || []).map(c => ({ name: c.name, count: c.quantity, price: 0, isLand: c.isLand })))
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
      return [...prev, { name: action.name, count: action.quantity || 1, price: 0 }]
    })
  }

  const handleRemoveCard = (index) => {
    setCards(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateCount = (index, value) => {
    if (!Number.isFinite(value) || value < 1) return
    setCards(prev => prev.map((card, i) => (i === index ? { ...card, count: value } : card)))
  }

  // Drag-and-drop recategorization (type grouping only — color/CMC are facts about the
  // real card, not something to override). Storing an explicit override on the card itself
  // means it survives re-sorting/re-filtering instead of living in separate UI state.
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDragOverGroup(null)
  }

  const handleDropOnCategory = (index, categoryName) => {
    setDragOverGroup(null)
    setCards(prev => {
      const updated = [...prev]
      const current = updated[index]
      if (!current) return prev
      updated[index] = { ...current, categoryOverride: categoryName }
      return updated
    })
  }

  const saveAsDraft = () => {
    const saved = saveDraftDeck({
      id: draftId,
      name: commanderCard?.name || commanderName || 'Unbenannter Entwurf',
      commander: commanderCard?.name || commanderName,
      cards: cards.map(c => ({ name: c.name, count: c.count, price: c.price || 0, isLand: c.isLand })),
      strategyNote
    })
    setDraftId(saved.id)
    return saved
  }

  // Saves first, so the analysis always sees exactly what's on screen right now.
  const handleSaveAndAnalyze = () => {
    const saved = saveAsDraft()
    navigate(`/drafts/${saved.id}/analyse`)
  }

  const handleSave = () => {
    if (deckName) {
      // A real ManaBox deck's persistence would mean rewriting the actual imported
      // collection data — a separate, bigger feature, deliberately not built yet.
      alert('Änderungen an echten ManaBox-Decks werden aktuell noch nicht dauerhaft gespeichert — diese Ansicht dient zum Durchsehen/Ausprobieren.')
      if (onBack) onBack()
      else navigate('/collection')
      return
    }

    saveAsDraft()
    navigate('/decks', { state: { tab: 'drafts' } })
  }

  const goBack = () => (onBack ? onBack() : navigate(-1))

  const shoppingCount = shoppingList.reduce((sum, c) => sum + c.missingCount, 0)
  const suggestionCount = cutsInDeck.length + pendingSuggestions.length
  const countTone = deckSize === DECK_TARGET ? 'var(--g)' : deckSize > DECK_TARGET ? 'var(--r)' : 'var(--w)'
  const countHint = deckSize === DECK_TARGET
    ? 'Genau 99 Karten plus Commander'
    : deckSize > DECK_TARGET ? `${deckSize - DECK_TARGET} zu viel` : `${DECK_TARGET - deckSize} fehlen noch`

  const panels = [
    { id: 'suggestions', label: 'Vorschläge', count: suggestionCount },
    ...(deckName ? [] : [{ id: 'shopping', label: 'Einkauf', count: shoppingCount }]),
    { id: 'stats', label: 'Statistik' }
  ]
  const defaultPanel = suggestionCount > 0 ? 'suggestions' : shoppingCount > 0 ? 'shopping' : 'stats'
  const activePanel = panels.some(p => p.id === panel) ? panel : defaultPanel

  const renderPanel = (id) => {
    if (id === 'suggestions') {
      return (
        <SuggestionsPanel
          cuts={cutsInDeck}
          adds={pendingSuggestions}
          isOwned={isOwned}
          friendsFor={getSecondaryAvailability}
          onRemove={handleRemoveCard}
          onRemoveAll={handleRemoveAllCuts}
          onAdd={handleAddSuggestion}
          onAddAllOwned={handleAddAllOwnedSuggestions}
          onZoom={setZoomedCard}
          emptyHint={deckName
            ? 'Keine offenen Vorschläge. Streich- und Ergänzungsvorschläge liefert der Tab „Analyse“.'
            : 'Keine offenen Vorschläge. „Speichern & analysieren“ liefert Streich- und Ergänzungsvorschläge.'}
        />
      )
    }
    if (id === 'shopping') return <ShoppingPanel items={shoppingList} total={shoppingTotal} onExport={handleExportShoppingList} />
    return (
      <StatsPanel
        manaCurve={manaCurveData}
        colorCounts={colorCounts}
        typeCounts={typeCounts}
        averageCmc={averageCmc}
        landCount={landCount}
        deckValue={deckTotal}
        valuePerCard={deckSize ? deckTotal / deckSize : 0}
      />
    )
  }

  const selectStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }

  const deckArea = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <CardSearch
          collection={collection}
          availableQuantities={availableQuantities}
          existingNames={existingNames}
          commanderName={commanderCard?.name || commanderName}
          onAddOwned={handleAddFromSearch}
          onAddByName={handleAddByName}
        />
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="hidden sm:inline">Gruppieren</span>
          <select aria-label="Gruppieren" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="text-sm px-2 py-1.5" style={selectStyle}>
            <option value="type">nach Typ</option>
            <option value="color">nach Farbe</option>
            <option value="cmc">nach Manawert</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="hidden sm:inline">Sortieren</span>
          <select aria-label="Sortieren" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm px-2 py-1.5" style={selectStyle}>
            <option value="cmc">nach Manawert</option>
            <option value="name">nach Name</option>
            <option value="price">nach Preis</option>
          </select>
        </label>
      </div>

      {enrichedCards.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Noch keine Karten im Deck</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Füge oben über die Suche Karten hinzu – oder lass dir im Chat unten rechts ein komplettes Deck bauen.
          </p>
        </div>
      ) : (
        <DeckList
          groups={displayGroups}
          groupBy={groupBy}
          cutReasonMap={cutReasonMap}
          onUpdateCount={handleUpdateCount}
          onRemove={handleRemoveCard}
          onZoom={setZoomedCard}
          isDragging={isDragging}
          dragOverGroup={dragOverGroup}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOverGroup={setDragOverGroup}
          onDropOnGroup={handleDropOnCategory}
        />
      )}
    </>
  )

  const actionButtons = [
    { label: 'Zurück', onClick: goBack, className: 'btn-secondary' },
    { label: 'Live Tester', mobileLabel: 'Testen', onClick: () => setShowPlaytest(true), disabled: enrichedCards.length === 0, className: 'btn-secondary' },
    ...(deckName ? [] : [{ label: 'Speichern & analysieren', mobileLabel: 'Analysieren', onClick: handleSaveAndAnalyze, disabled: cards.length === 0, className: 'btn-secondary' }]),
    { label: deckName ? 'Fertig' : 'Speichern', onClick: handleSave, className: 'btn-primary' }
  ]

  return (
    <div className={`max-w-7xl mx-auto ${isDesktop ? '' : 'pb-24'}`}>
      {/* Deck bar: stays in view while scrolling — the numbers that matter and every action. */}
      <header ref={deckBarRef} className="sticky z-30 pt-2 pb-3 mb-5" style={{ top: 'var(--nav-h)', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-3 lg:gap-6">
          {commanderCard?.image && (
            <button type="button" onClick={() => setZoomedCard(commanderCard)} className="flex-shrink-0" aria-label={`${commanderCard.name} vergrößern`}>
              <img src={commanderCard.image} alt="" className="w-9 md:w-10 rounded-sm block" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
              {deckName ? `ManaBox-Deck · ${deckName}` : draftId ? 'Entwurf' : 'Neuer Entwurf'}
              {strategyNote && (
                <button
                  type="button"
                  onClick={() => setShowStrategy(open => !open)}
                  aria-expanded={showStrategy}
                  className="ml-2 underline underline-offset-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Strategie {showStrategy ? 'ausblenden' : 'anzeigen'}
                </button>
              )}
            </div>
            <h1 className="m-0 font-semibold truncate" style={{ fontSize: isDesktop ? '1.25rem' : '1.05rem', letterSpacing: 0, lineHeight: 1.25 }}>
              {commanderCard?.name || commanderName || 'Ohne Commander'}
            </h1>
          </div>
          <dl className="flex items-baseline gap-4 lg:gap-6 flex-shrink-0">
            <div title={countHint}>
              <dt className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Karten</dt>
              <dd className="m-0 font-semibold tabular-nums" style={{ color: countTone }}>{deckSize}/{DECK_TARGET}</dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Wert</dt>
              <dd className="m-0 font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>€{deckTotal.toFixed(0)}</dd>
            </div>
            {shoppingCount > 0 && (
              <div title={`${shoppingCount} ${shoppingCount === 1 ? 'Karte fehlt' : 'Karten fehlen'} in deiner Sammlung`}>
                <dt className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Zukauf</dt>
                <dd className="m-0 font-semibold tabular-nums" style={{ color: 'var(--r)' }}>€{shoppingTotal.toFixed(0)}</dd>
              </div>
            )}
          </dl>
          {isDesktop && (
            <div className="flex gap-2 flex-shrink-0">
              {actionButtons.map(action => (
                <button key={action.label} onClick={action.onClick} disabled={action.disabled} className={`${action.className} text-sm px-4 py-2`}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {deckName && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Änderungen an ManaBox-Decks werden nicht gespeichert – diese Ansicht ist zum Ausprobieren.
          </p>
        )}
        {showStrategy && strategyNote && (
          <div className="mt-3 p-3 max-h-[40vh] overflow-y-auto" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <StrategyPanel note={strategyNote} />
          </div>
        )}
        {!isDesktop && (
          <div className="mt-3">
            <EditorTabs tabs={[{ id: 'deck', label: 'Deck', count: deckSize }, ...panels]} active={mobileTab} onChange={setMobileTab} />
          </div>
        )}
      </header>

      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
          <div className="min-w-0">{deckArea}</div>
          <aside
            className="sticky overflow-y-auto p-4"
            style={{
              top: `calc(var(--nav-h) + ${deckBarHeight + 12}px)`,
              maxHeight: `calc(100vh - var(--nav-h) - ${deckBarHeight + 28}px)`,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            <EditorTabs tabs={panels} active={activePanel} onChange={setPanel} />
            <div className="pt-4">{renderPanel(activePanel)}</div>
          </aside>
        </div>
      ) : (
        mobileTab === 'deck' ? deckArea : <div>{renderPanel(mobileTab)}</div>
      )}

      {!isDesktop && (
        <nav
          className="fixed bottom-0 inset-x-0 z-40 grid gap-2 px-3 py-3"
          style={{ gridTemplateColumns: `repeat(${actionButtons.length}, minmax(0, 1fr))`, background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}
          aria-label="Deck-Aktionen"
        >
          {actionButtons.map(action => (
            <button key={action.label} onClick={action.onClick} disabled={action.disabled} className={`${action.className} text-xs px-2 py-2.5`}>
              {action.mobileLabel || action.label}
            </button>
          ))}
        </nav>
      )}

      {zoomedCard && (
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
      )}

      {showPlaytest && (
        <PlaytestModal
          cards={enrichedCards}
          commanderCard={commanderCard}
          onClose={() => setShowPlaytest(false)}
        />
      )}

      <ChatWidget
        commander={commanderCard?.name || commanderName}
        cards={enrichedCards.map(c => ({ name: c.name, count: c.count }))}
        onAction={handleChatAction}
        collectionSampleNames={availableCardNames}
        onReply={setStrategyNote}
        floatingBottom={isDesktop ? 24 : 84}
      />
    </div>
  )
}

function EditorTabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" className="flex overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border)', scrollbarWidth: 'none' }}>
      {tabs.map(tab => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className="flex-1 px-2 py-2 text-[13px] whitespace-nowrap -mb-px"
            style={{
              color: selected ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontWeight: selected ? 600 : 400,
              borderBottom: `2px solid ${selected ? 'var(--color-accent)' : 'transparent'}`
            }}
          >
            {tab.label}
            {tab.count > 0 && <span className="ml-1 text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
