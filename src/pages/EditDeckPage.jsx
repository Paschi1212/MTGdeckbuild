import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { loadCollection, getCardsForBinder, getAvailableQuantities, getAvailableCardNames } from '../lib/collection'
import { saveDraftDeck } from '../lib/draftDecks'
import { classifyType, BASIC_LAND_NAMES } from '../lib/cardType'
import { CardZoomModal } from '../components/CardTile'
import ChatWidget from '../components/ChatWidget'

const CMC_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+']

// Same hex set CollectionPage's color filter already uses — keeps color meaning consistent
// across the app instead of inventing a second palette.
const COLOR_PIE_COLORS = { W: '#F8F6D8', U: '#4FA8F5', B: '#1A1A1A', R: '#E8524A', G: '#4ED689', Multicolor: '#c9a6f0', Colorless: '#9CA3AF' }
const COLOR_NAMES = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün', Multicolor: 'Mehrfarbig', Colorless: 'Farblos' }

// Fixed, always-rendered set (deckstats-style) when grouping by type — cards can be dragged
// into an empty category, so every category needs a visible drop target, not just ones that
// already happen to have a card in them.
const TYPE_GROUP_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Sonstige']

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

function CardRow({ card, compact, onUpdateCount, onRemove, cutReason, onZoom, draggable, onDragStart }) {
  const cutStyle = cutReason
    ? { backgroundColor: 'rgba(239,106,99,0.08)', border: '1px solid rgba(239,106,99,0.35)' }
    : { backgroundColor: 'var(--surface)' }
  const dragProps = draggable
    ? { draggable: true, onDragStart: (e) => onDragStart(e, card.index), style: { ...cutStyle, cursor: 'grab' } }
    : { style: cutStyle }

  if (compact) {
    return (
      <div className="rounded-lg p-2" {...dragProps}>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-11 rounded overflow-hidden bg-black/30 flex-shrink-0 cursor-pointer"
            onClick={() => onZoom(card)}
          >
            {card.image && (
              <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{card.name}</div>
            <div className="text-xs text-cmd-muted">CMC {card.cmc} · €{(card.count * card.price).toFixed(2)}</div>
            {card.missingCount > 0 && (
              <span className="text-[10px] font-semibold" style={{ color: 'var(--r)' }}>
                🛒 {card.missingCount > 1 ? `${card.missingCount}x kaufen` : 'kaufen'}
              </span>
            )}
          </div>
          <input
            type="number"
            min="1"
            value={card.count}
            onChange={(e) => onUpdateCount(card.index, parseInt(e.target.value))}
            className="w-12 text-white text-center text-xs rounded p-1"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
          />
          <button onClick={() => onRemove(card.index)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
        </div>
        {cutReason && (
          <div className="text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--r)' }}>
            ✂️ {cutReason}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl p-3" {...dragProps}>
      <div className="flex items-center justify-between gap-3">
        <div
          className="w-10 h-14 rounded overflow-hidden bg-black/30 flex-shrink-0 cursor-pointer"
          onClick={() => onZoom(card)}
        >
          {card.image && (
            <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{card.name}</div>
          <div className="text-xs text-gray-400">CMC {card.cmc}</div>
          {card.missingCount > 0 && (
            <span className="text-[10px] font-semibold" style={{ color: 'var(--r)' }}>
              🛒 {card.missingCount > 1 ? `${card.missingCount}x kaufen` : 'kaufen'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mr-4">
          <input
            type="number"
            min="1"
            value={card.count}
            onChange={(e) => onUpdateCount(card.index, parseInt(e.target.value))}
            className="w-16 text-white text-center rounded-lg p-1"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
          />
          <span className="text-gray-300">€{(card.count * card.price).toFixed(2)}</span>
        </div>

        <button onClick={() => onRemove(card.index)} className="text-red-400 hover:text-red-300 text-lg">✕</button>
      </div>
      {cutReason && (
        <div className="text-xs mt-2 leading-snug" style={{ color: 'var(--r)' }}>
          ✂️ KI-Vorschlag: {cutReason}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({ card, onAdd, onZoom }) {
  return (
    <div className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: 'rgba(78,214,137,0.08)', border: '1px solid rgba(78,214,137,0.3)' }}>
      <div
        className="w-10 h-14 rounded overflow-hidden bg-black/30 flex-shrink-0 cursor-pointer"
        onClick={() => onZoom(card)}
      >
        {card.image && (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white truncate">{card.name}</div>
        {card.reason && <p className="text-xs text-cmd-muted leading-snug mt-0.5 line-clamp-2">{card.reason}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: 'var(--g)' }}>{card.eur != null ? `€${card.eur.toFixed(2)}` : ''}</span>
          <button
            onClick={() => onAdd(card)}
            className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ backgroundColor: 'var(--g)', color: '#000' }}
          >
            + Hinzufügen
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EditDeckPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const deckName = location.state?.deckName
  const suggestedCardsToAdd = location.state?.cardsToAdd || []
  const suggestedCardsToCut = location.state?.cardsToCut || []
  const proposedCards = location.state?.cards
  const [strategyNote, setStrategyNote] = useState(location.state?.strategyNote || '')
  // Re-saving a draft you opened from "Meine Entwürfe" overwrites it in place instead of
  // piling up duplicates — only set when this session actually started from a saved draft.
  const [draftId, setDraftId] = useState(location.state?.draftId || null)

  // For a real ManaBox deck (deckName set), the commander is a fact about that binder —
  // don't let chat's set_commander action rewrite it, only the free-form proposal flow.
  const [commanderName, setCommanderName] = useState(location.state?.commander || '')
  const [cards, setCards] = useState(() => loadInitialCards(deckName, commanderName, proposedCards))
  const [collection] = useState(loadCollection)
  const [commanderCard, setCommanderCard] = useState(null)

  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('price')
  const [groupBy, setGroupBy] = useState('type')
  const [viewMode, setViewMode] = useState('columns')
  const [dragOverGroup, setDragOverGroup] = useState(null)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [newCard, setNewCard] = useState({ name: '', count: 1, price: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [priceMap, setPriceMap] = useState({})
  const [byIdMap, setByIdMap] = useState({})
  const [zoomedCard, setZoomedCard] = useState(null)

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
      return {
        ...card,
        index,
        image: byId?.image ?? byName?.image,
        // If this card came from the chat full-deck builder, the backend already knows
        // for certain whether it's a land (built as a separate, verified list) — trust
        // that over Scryfall type_line, which arrives async and can lag for a big batch.
        // A manual drag-drop recategorization (categoryOverride) wins over both.
        type: card.categoryOverride || (card.isLand === true ? 'Land' : classifyType(byId?.typeLine ?? byName?.typeLine)),
        cmc: byId?.cmc ?? byName?.cmc ?? 0,
        colors: byId?.colors ?? '',
        // Only meaningful for a non-real deck (AI proposal/chat build) — a real ManaBox
        // deck's cards are inherently already owned, no point marking that.
        missingCount: deckName ? undefined : Math.max(card.count - (availableQuantities.get(card.name)?.available || 0), 0)
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

  const colorPieData = useMemo(() => {
    const totals = {}
    for (const card of enrichedCards) {
      if (card.type === 'Land') continue
      const key = colorGroupKey(card.colors)
      totals[key] = (totals[key] || 0) + card.count
    }
    return Object.entries(totals)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ key, name: COLOR_NAMES[key] || key, count }))
  }, [enrichedCards])

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

  const groupLabel = (key) => (groupBy === 'color' ? (COLOR_NAMES[key] || key) : key)

  const cardsByCategory = {}
  for (const card of enrichedCards) {
    const key = categoryKeyFor(card)
    if (!cardsByCategory[key]) cardsByCategory[key] = []
    cardsByCategory[key].push(card)
  }

  const categories = groupBy === 'type'
    ? groupOrder.filter(cat => cat !== 'Sonstige' || cardsByCategory[cat]?.length)
    : groupOrder.filter(cat => cardsByCategory[cat]?.length)

  const filteredCards = filter === 'all' ? enrichedCards : (cardsByCategory[filter] || [])

  const sortWithin = (list) => [...list].sort((a, b) => {
    if (sortBy === 'price') return (b.price * b.count) - (a.price * a.count)
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'cmc') return a.cmc - b.cmc
    return 0
  })

  const displayGroups = filter === 'all'
    ? categories.map(cat => ({ name: cat, label: groupLabel(cat), cards: sortWithin(cardsByCategory[cat] || []) }))
    : [{ name: filter, label: groupLabel(filter), cards: sortWithin(filteredCards) }]

  const existingNames = new Set(cards.map(c => c.name))

  const cutReasonMap = useMemo(() => {
    const map = new Map()
    for (const c of suggestedCardsToCut) map.set(c.name, c.reason)
    return map
  }, [suggestedCardsToCut])

  const pendingSuggestions = useMemo(() => {
    return suggestedCardsToAdd.filter(c => c.name !== commanderName && !existingNames.has(c.name))
  }, [suggestedCardsToAdd, commanderName, cards])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !collection?.cards) return []
    const q = searchQuery.trim().toLowerCase()
    const seen = new Set()
    const results = []
    for (const row of collection.cards) {
      if (row.name === commanderName || existingNames.has(row.name) || seen.has(row.name)) continue
      if (!row.name.toLowerCase().includes(q)) continue
      if (!availableQuantities.get(row.name)?.available) continue
      seen.add(row.name)
      results.push(row)
      if (results.length >= 8) break
    }
    return results
  }, [searchQuery, collection, commanderName, cards, availableQuantities])

  const handleAddFromSearch = (row) => {
    setCards([...cards, { name: row.name, count: 1, price: row.purchasePrice, scryfallId: row.scryfallId }])
    setSearchQuery('')
  }

  const handleAddSuggestion = (card) => {
    setCards([...cards, { name: card.name, count: 1, price: card.eur || 0 }])
  }

  // The chat assistant can act on the deck directly (Gemini function calling) — it only
  // ever sends real card names back, but "update"/"remove" still no-op safely if the name
  // doesn't match anything currently in the deck rather than risk touching the wrong row.
  const handleChatAction = (action) => {
    if (action.type === 'setCommander') {
      if (action.name && !deckName) setCommanderName(action.name)
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
    setCards(cards.filter((_, i) => i !== index))
  }

  const handleUpdateCount = (index, value) => {
    const updated = [...cards]
    updated[index] = { ...updated[index], count: value }
    setCards(updated)
  }

  // Drag-and-drop recategorization (type grouping only — color/CMC are facts about the
  // real card, not something to override). Storing an explicit override on the card itself
  // means it survives re-sorting/re-filtering instead of living in separate UI state.
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
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

  const handleAddManualCard = () => {
    if (newCard.name && newCard.count > 0) {
      setCards([...cards, newCard])
      setNewCard({ name: '', count: 1, price: 0 })
      setShowManualAdd(false)
    }
  }

  const handleSave = () => {
    if (deckName) {
      // A real ManaBox deck's persistence would mean rewriting the actual imported
      // collection data — a separate, bigger feature, deliberately not built yet.
      alert('Änderungen an echten ManaBox-Decks werden aktuell noch nicht dauerhaft gespeichert — diese Ansicht dient zum Durchsehen/Ausprobieren.')
      navigate('/collection')
      return
    }

    const saved = saveDraftDeck({
      id: draftId,
      name: commanderCard?.name || commanderName || 'Unbenannter Entwurf',
      commander: commanderCard?.name || commanderName,
      cards: cards.map(c => ({ name: c.name, count: c.count, price: c.price || 0, isLand: c.isLand })),
      strategyNote
    })
    setDraftId(saved.id)
    navigate('/decks', { state: { tab: 'drafts' } })
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1>✏️ {deckName ? `Deck Editieren: ${deckName}` : 'Deck Editieren'}</h1>

      {deckName && (
        <p className="text-cmd-muted text-xs mb-4">
          Änderungen werden aktuell nicht gespeichert — diese Ansicht dient zum Durchsehen/Ausprobieren.
        </p>
      )}

      {commanderCard && (
        <div className="card mb-6 flex gap-4 items-center">
          {commanderCard.image && (
            <img src={commanderCard.image} alt={commanderCard.name} className="w-16 h-auto rounded-lg flex-shrink-0" />
          )}
          <div>
            <div className="text-xs text-cmd-muted uppercase tracking-wide">Commander</div>
            <div className="text-lg font-bold text-white">{commanderCard.name}</div>
          </div>
        </div>
      )}

      {strategyNote && (
        <div className="card mb-6" style={{ borderColor: 'var(--g)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--g)' }}>📋 Strategie</h2>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto pr-1">
            {strategyNote}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <div className="text-sm text-gray-400">Deck-Größe</div>
          <div className="text-3xl font-bold text-mtg-gold">
            {deckSize} <span className="text-base text-cmd-muted">/ 99</span>
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-gray-400">Deck-Kosten</div>
          <div className="text-3xl font-bold text-mtg-green">
            €{deckTotal.toFixed(2)}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-gray-400">Durchschnitt pro Karte</div>
          <div className="text-3xl font-bold text-mtg-blue">
            €{cards.length > 0 ? (deckTotal / cards.length).toFixed(2) : '0.00'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="text-lg font-bold mb-3">Mana-Kurve</h2>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={manaCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="cmc" tick={{ fill: '#a99fc4', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#a99fc4', fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ backgroundColor: '#171129', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: '#f3eefc' }} />
                <Bar dataKey="count" fill="#4fa8f5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold mb-3">Farbverteilung</h2>
          {colorPieData.length === 0 ? (
            <p className="text-sm text-cmd-muted py-8 text-center">Noch keine Farbdaten geladen</p>
          ) : (
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={colorPieData} dataKey="count" nameKey="name" innerRadius={35} outerRadius={65} paddingAngle={2}>
                    {colorPieData.map(entry => (
                      <Cell key={entry.key} fill={COLOR_PIE_COLORS[entry.key] || '#9CA3AF'} stroke="var(--surface-solid)" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#171129', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: '#f3eefc' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#a99fc4' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {shoppingList.length > 0 && (
        <div className="card mb-6" style={{ borderColor: 'var(--r)' }}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold" style={{ color: 'var(--r)' }}>🛒 Einkaufsliste</h2>
            <button onClick={handleExportShoppingList} className="btn-secondary text-xs px-3 py-1.5">
              ⬇️ Exportieren (.txt)
            </button>
          </div>
          <p className="text-xs text-cmd-muted mb-3">
            {shoppingList.reduce((sum, c) => sum + c.missingCount, 0)} Karte(n) nicht in deiner Sammlung — geschätzt €{shoppingTotal.toFixed(2)}
          </p>
          <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
            {shoppingList.map(c => (
              <div key={c.name} className="flex justify-between text-sm text-gray-300">
                <span>{c.missingCount}x {c.name}</span>
                <span className="text-cmd-muted">€{(c.missingCount * c.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingSuggestions.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--g)' }}>🤖 KI-Vorschläge zum Hinzufügen</h2>
          <p className="text-xs text-cmd-muted mb-4">Aus der letzten Analyse — mit Begründung, warum die Karte das Deck verbessern würde.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingSuggestions.map(card => (
              <SuggestionCard key={card.name} card={card} onAdd={handleAddSuggestion} onZoom={setZoomedCard} />
            ))}
          </div>
        </div>
      )}

      <div className="card mb-6">
        <label className="text-sm text-gray-400 block mb-2">
          {collection ? 'Karte aus deiner Sammlung hinzufügen' : 'Karte hinzufügen'}
        </label>
        {collection && (
          <p className="text-xs text-cmd-muted mb-2">
            Zeigt nur Karten, die nicht schon in einem anderen Deck verbaut sind.
          </p>
        )}

        {collection ? (
          <>
            <input
              type="text"
              placeholder="Kartennamen suchen…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-white rounded-xl p-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            />
            {searchResults.length > 0 && (
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {searchResults.map(row => (
                  <button
                    key={row.scryfallId || row.name}
                    onClick={() => handleAddFromSearch(row)}
                    className="w-full flex items-center justify-between gap-3 p-2 text-left hover:brightness-125 transition"
                    style={{ backgroundColor: 'var(--surface)' }}
                  >
                    <span className="text-sm text-white truncate">{row.name}</span>
                    <span className="text-xs text-cmd-muted whitespace-nowrap">€{row.purchasePrice.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowManualAdd(!showManualAdd)}
              className="text-xs text-cmd-muted underline mt-3"
            >
              {showManualAdd ? 'Manuellen Eintrag ausblenden' : 'Karte nicht in deiner Sammlung? Manuell hinzufügen'}
            </button>
          </>
        ) : (
          <button onClick={() => setShowManualAdd(!showManualAdd)} className="btn-success w-full">
            {showManualAdd ? '✕ Abbrechen' : '+ Karte hinzufügen'}
          </button>
        )}

        {showManualAdd && (
          <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Kartennamen"
                value={newCard.name}
                onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                className="w-full text-white rounded-xl p-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="1"
                  value={newCard.count}
                  onChange={(e) => setNewCard({ ...newCard, count: parseInt(e.target.value) })}
                  className="text-white rounded-xl p-2"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
                  placeholder="Anzahl"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newCard.price}
                  onChange={(e) => setNewCard({ ...newCard, price: parseFloat(e.target.value) })}
                  className="text-white rounded-xl p-2"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}
                  placeholder="Preis (€)"
                />
              </div>
              <button onClick={handleAddManualCard} className="btn-primary w-full">
                ✓ Hinzufügen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <div className="flex gap-3 mb-4">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Ansicht</label>
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button
                onClick={() => setViewMode('columns')}
                className="px-3 py-2 text-sm whitespace-nowrap transition"
                style={viewMode === 'columns'
                  ? { backgroundColor: 'var(--u)', color: '#000', fontWeight: 600 }
                  : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}
              >
                ▥ Typen nebeneinander
              </button>
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-2 text-sm whitespace-nowrap transition"
                style={viewMode === 'list'
                  ? { backgroundColor: 'var(--u)', color: '#000', fontWeight: 600 }
                  : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}
              >
                ☰ Liste
              </button>
            </div>
          </div>

          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">Gruppieren</label>
            <select
              value={groupBy}
              onChange={(e) => { setGroupBy(e.target.value); setFilter('all') }}
              className="w-full text-white rounded-xl p-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              <option value="type">Nach Typ</option>
              <option value="color">Nach Farbe</option>
              <option value="cmc">Nach Mana-Wert</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full text-white rounded-xl p-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              <option value="all">Alle</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{groupLabel(cat)} ({cardsByCategory[cat]?.length || 0})</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">Sortieren</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full text-white rounded-xl p-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              <option value="price">Nach Preis (Höchste zuerst)</option>
              <option value="name">Nach Name</option>
              <option value="cmc">Nach Mana-Wert</option>
            </select>
          </div>
        </div>
      </div>

      {enrichedCards.length === 0 ? (
        <div className="card mb-6">
          <p className="text-gray-400 text-center py-8">Noch keine Karten im Deck</p>
        </div>
      ) : viewMode === 'columns' ? (
        <div
          className="grid gap-4 mb-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'start' }}
        >
          {displayGroups.map(group => (
            <div
              key={group.name}
              className="card"
              style={groupBy === 'type' && dragOverGroup === group.name ? { borderColor: 'var(--u)', backgroundColor: 'rgba(79,168,245,0.08)' } : undefined}
              onDragOver={(e) => { if (groupBy === 'type') { e.preventDefault(); setDragOverGroup(group.name) } }}
              onDragLeave={() => setDragOverGroup(null)}
              onDrop={(e) => {
                if (groupBy !== 'type') return
                e.preventDefault()
                handleDropOnCategory(Number(e.dataTransfer.getData('text/plain')), group.name)
              }}
            >
              <h2 className="text-sm font-bold mb-3 text-cmd-muted uppercase tracking-wide">
                {group.label} <span className="font-normal">({group.cards.length})</span>
              </h2>
              <div className="space-y-2">
                {group.cards.map(card => (
                  <CardRow key={card.index} card={card} compact onUpdateCount={handleUpdateCount} onRemove={handleRemoveCard} cutReason={cutReasonMap.get(card.name)} onZoom={setZoomedCard} draggable={groupBy === 'type'} onDragStart={handleDragStart} />
                ))}
                {group.cards.length === 0 && groupBy === 'type' && (
                  <p className="text-xs text-cmd-muted italic py-2 text-center">Karten hierher ziehen</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        displayGroups.map(group => (
          <div
            key={group.name}
            className="card mb-6"
            style={groupBy === 'type' && dragOverGroup === group.name ? { borderColor: 'var(--u)', backgroundColor: 'rgba(79,168,245,0.08)' } : undefined}
            onDragOver={(e) => { if (groupBy === 'type') { e.preventDefault(); setDragOverGroup(group.name) } }}
            onDragLeave={() => setDragOverGroup(null)}
            onDrop={(e) => {
              if (groupBy !== 'type') return
              e.preventDefault()
              handleDropOnCategory(Number(e.dataTransfer.getData('text/plain')), group.name)
            }}
          >
            <h2 className="text-lg font-bold mb-4">{group.label} <span className="text-cmd-muted text-sm font-normal">({group.cards.length})</span></h2>
            <div className="space-y-2">
              {group.cards.map(card => (
                <CardRow key={card.index} card={card} onUpdateCount={handleUpdateCount} onRemove={handleRemoveCard} cutReason={cutReasonMap.get(card.name)} onZoom={setZoomedCard} draggable={groupBy === 'type'} onDragStart={handleDragStart} />
              ))}
              {group.cards.length === 0 && groupBy === 'type' && (
                <p className="text-xs text-cmd-muted italic py-2 text-center">Karten hierher ziehen</p>
              )}
            </div>
          </div>
        ))
      )}

      <div className="flex gap-3">
        <button
          onClick={() => navigate(deckName ? '/collection' : '/analyze')}
          className="btn-secondary flex-1"
        >
          ← Zurück
        </button>
        <button onClick={handleSave} className="btn-primary flex-1">
          {deckName ? '✓ Fertig' : '💾 Als Entwurf speichern'}
        </button>
      </div>

      {zoomedCard && (
        <CardZoomModal card={zoomedCard} onClose={() => setZoomedCard(null)} />
      )}

      <ChatWidget
        commander={commanderCard?.name || commanderName}
        cards={enrichedCards.map(c => ({ name: c.name, count: c.count }))}
        onAction={handleChatAction}
        collectionSampleNames={availableCardNames}
        onReply={setStrategyNote}
      />
    </div>
  )
}
