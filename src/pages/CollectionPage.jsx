import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection } from '../lib/collection'
import { loadSecondaryCollections } from '../lib/secondaryCollections'

const COLOR_OPTIONS = [
  { id: 'W', hex: '#F8F6D8' },
  { id: 'U', hex: '#4FA8F5' },
  // True black doesn't work as a UI accent here — it's nearly identical to the dark-mode
  // card surface color, which made the border/text disappear into the background entirely.
  { id: 'B', hex: '#6b6b6b' },
  { id: 'R', hex: '#E8524A' },
  { id: 'G', hex: '#4ED689' },
  { id: 'C', hex: '#9CA3AF' } // colorless
]

const TYPE_OPTIONS = ['Creature', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle']

const PRICE_SORTS = {
  none: { label: 'Keine', fn: null },
  priceAsc: { label: 'Preis aufsteigend', fn: (a, b) => a.purchasePrice - b.purchasePrice },
  priceDesc: { label: 'Preis absteigend', fn: (a, b) => b.purchasePrice - a.purchasePrice },
  nameAsc: { label: 'Name A-Z', fn: (a, b) => a.name.localeCompare(b.name) }
}

function CardModal({ card, resolved, onClose, onPrev, onNext }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onPrev() }}
        className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-2xl text-white"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        aria-label="Vorherige Karte"
      >
        ‹
      </button>

      <div
        className="rounded-2xl overflow-hidden max-w-sm w-full"
        style={{ backgroundColor: 'var(--surface-solid)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black/20">
          {resolved?.image ? (
            <img src={resolved.image} alt={card.name} className="w-full h-auto" />
          ) : (
            <div className="aspect-[5/7] flex items-center justify-center text-cmd-muted">Kein Bild gefunden</div>
          )}
        </div>
        <div className="p-4">
          <div className="font-bold text-fg text-lg mb-1">{card.name}</div>
          <div className="text-sm text-cmd-muted mb-1">{resolved?.typeLine || card.rarity}</div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-cmd-muted">Anzahl: {card.quantity}</span>
            <span className="font-semibold" style={{ color: 'var(--g)' }}>€{card.purchasePrice.toFixed(2)}</span>
          </div>
          <div className="flex gap-2 mt-4 sm:hidden">
            <button onClick={onPrev} className="btn-secondary flex-1 text-sm">‹ Zurück</button>
            <button onClick={onNext} className="btn-secondary flex-1 text-sm">Weiter ›</button>
          </div>
          <button onClick={onClose} className="btn-secondary w-full mt-2 text-sm">Schließen</button>
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onNext() }}
        className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full items-center justify-center text-2xl text-white"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        aria-label="Nächste Karte"
      >
        ›
      </button>
    </div>
  )
}

export default function CollectionPage() {
  const navigate = useNavigate()

  const [myCollection] = useState(loadCollection)
  const [secondaryCollections] = useState(loadSecondaryCollections)
  // 'mine' or a friend collection's id — same search/filter UI works unchanged for either,
  // since both are the same parseCollectionCsv() shape. Never merged, purely a view switch.
  const [source, setSource] = useState('mine')
  const collection = source === 'mine' ? myCollection : secondaryCollections.find(c => c.id === source) || myCollection

  const [search, setSearch] = useState('')
  const [imageMap, setImageMap] = useState({ byId: {}, byName: {} })
  const [loadingImages, setLoadingImages] = useState(true)
  const [selectedColors, setSelectedColors] = useState([])
  const [selectedType, setSelectedType] = useState('')
  const [availability, setAvailability] = useState('all') // all | free | built
  const [minQuantity, setMinQuantity] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minCmc, setMinCmc] = useState('')
  const [maxCmc, setMaxCmc] = useState('')
  const [sortBy, setSortBy] = useState('none')
  const [selectedBinder, setSelectedBinder] = useState('')
  const [modalIndex, setModalIndex] = useState(null)

  // Built from whatever binders/decks actually exist in this collection — not hardcoded, so
  // it works for any ManaBox export, not just folder names like "Nr 2"/"Nr 3" this app
  // happened to be tested with.
  const binderOptions = useMemo(() => {
    if (!collection?.cards) return []
    const typeByName = new Map()
    for (const c of collection.cards) {
      if (c.binderName && !typeByName.has(c.binderName)) typeByName.set(c.binderName, c.binderType)
    }
    return [...typeByName.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [collection])

  useEffect(() => {
    if (!collection?.cards?.length) {
      setLoadingImages(false)
      return
    }

    const ids = [...new Set(collection.cards.map(c => c.scryfallId).filter(Boolean))]
    // A card with no Scryfall ID (blank in the CSV, or an export whose "Scryfall ID" column
    // was named/cased differently — e.g. a different ManaBox app version/locale, observed
    // live: both of a friend's uploaded collections had none) used to just never get an
    // image at all, since this only ever looked up by ID. Falling back to a by-NAME lookup
    // for exactly those cards (same dual-lookup pattern EditDeckPage/ChatBuilderPage already
    // use for manually-added cards) covers that instead of silently showing nothing.
    const namesWithoutId = [...new Set(collection.cards.filter(c => !c.scryfallId).map(c => c.name))]

    if (ids.length === 0 && namesWithoutId.length === 0) {
      setLoadingImages(false)
      return
    }

    Promise.all([
      ids.length
        ? fetch('/.netlify/functions/get-card-price', { method: 'POST', body: JSON.stringify({ ids }) })
          .then(res => (res.ok ? res.json() : {}))
          .catch(() => ({}))
        : {},
      namesWithoutId.length
        ? fetch('/.netlify/functions/get-card-price', { method: 'POST', body: JSON.stringify({ names: namesWithoutId }) })
          .then(res => (res.ok ? res.json() : {}))
          .catch(() => ({}))
        : {}
    ])
      .then(([byId, byNameRaw]) => {
        // The by-name batch endpoint (getBulkPrices) returns colorIdentity, not colors (the
        // by-ID endpoint's field, this page's color filter reads) — close enough a stand-in
        // for the color filter to work on cards only resolvable by name.
        const byName = Object.fromEntries(
          Object.entries(byNameRaw).map(([name, entry]) => [name, { ...entry, colors: entry.colorIdentity }])
        )
        setImageMap({ byId, byName })
      })
      .catch(() => {})
      .finally(() => setLoadingImages(false))
  }, [collection])

  // Prefer the by-ID match (exact printing) and fall back to by-name (any printing) — a card
  // with no Scryfall ID in the CSV only ever has a by-name entry to find.
  const resolveCard = (card) => imageMap.byId[card.scryfallId] ?? imageMap.byName[card.name]

  const toggleColor = (colorId) => {
    setSelectedColors(prev =>
      prev.includes(colorId) ? prev.filter(c => c !== colorId) : [...prev, colorId]
    )
  }

  const visibleCards = useMemo(() => {
    if (!collection?.cards) return []

    let result = collection.cards

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q))
    }

    if (selectedColors.length > 0) {
      result = result.filter(c => {
        // Subset match, not overlap: a card must not contain any color OUTSIDE the
        // selection (picking Blue+White was showing Red/White cards too, since they
        // do contain White — just not exclusively).
        const cardColorList = (resolveCard(c)?.colors || '').split(' ').filter(Boolean)
        if (cardColorList.length === 0) return selectedColors.includes('C')
        return cardColorList.every(cc => selectedColors.includes(cc))
      })
    }

    if (selectedType) {
      result = result.filter(c => resolveCard(c)?.typeLine?.includes(selectedType))
    }

    if (availability === 'free') {
      result = result.filter(c => c.binderType !== 'deck')
    } else if (availability === 'built') {
      result = result.filter(c => c.binderType === 'deck')
    }

    if (selectedBinder) {
      result = result.filter(c => c.binderName === selectedBinder)
    }

    if (minQuantity) {
      result = result.filter(c => c.quantity >= Number(minQuantity))
    }

    if (minPrice) {
      result = result.filter(c => c.purchasePrice >= Number(minPrice))
    }

    if (maxPrice) {
      result = result.filter(c => c.purchasePrice <= Number(maxPrice))
    }

    if (minCmc) {
      result = result.filter(c => (resolveCard(c)?.cmc ?? 0) >= Number(minCmc))
    }

    if (maxCmc) {
      result = result.filter(c => (resolveCard(c)?.cmc ?? 0) <= Number(maxCmc))
    }

    const sortFn = PRICE_SORTS[sortBy]?.fn
    if (sortFn) {
      result = [...result].sort(sortFn)
    }

    return result
  }, [collection, search, selectedColors, selectedType, availability, selectedBinder, minQuantity, minPrice, maxPrice, minCmc, maxCmc, sortBy, imageMap])

  if (!collection) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>🗂️ Meine Sammlung</h1>
        <div className="card">
          <p className="text-cmd-muted mb-4">Noch keine Sammlung hochgeladen.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary">
            Zum Upload
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1>🗂️ {source === 'mine' ? 'Meine Sammlung' : `${collection.label}s Sammlung`}</h1>
      <p className="text-cmd-muted mb-6">{collection.totalCards} Karten insgesamt</p>

      {secondaryCollections.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setSource('mine')}
            className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors"
            style={source === 'mine'
              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
              : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            🗂️ Meine Sammlung
          </button>
          {secondaryCollections.map(col => (
            <button
              key={col.id}
              onClick={() => setSource(col.id)}
              className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors"
              style={source === col.id
                ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
                : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              👥 {col.label}
            </button>
          ))}
        </div>
      )}

      <div className="card mb-6">
        <input
          type="text"
          placeholder="Karte suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-fg rounded-xl p-3 mb-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
        />

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-cmd-muted block mb-2">Farbe</label>
            <div className="flex gap-1">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color.id}
                  onClick={() => toggleColor(color.id)}
                  className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition"
                  aria-pressed={selectedColors.includes(color.id)}
                  style={{
                    // Mana-symbol tint with dark ink (same as the editor's pips) — readable on
                    // light and dark themes; a ring marks the selected colors.
                    backgroundColor: `var(--pip-${color.id.toLowerCase()})`,
                    color: 'var(--pip-ink)',
                    opacity: selectedColors.length === 0 || selectedColors.includes(color.id) ? 1 : 0.55,
                    boxShadow: selectedColors.includes(color.id)
                      ? '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-text)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.18)'
                  }}
                >
                  {color.id}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Typ</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="text-fg rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            >
              <option value="">Alle Typen</option>
              {TYPE_OPTIONS.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Verfügbarkeit</label>
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              className="text-fg rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            >
              <option value="all">Alle</option>
              <option value="free">Frei verfügbar</option>
              <option value="built">Eingebaut (in Deck)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Ordner / Deck</label>
            <select
              value={selectedBinder}
              onChange={(e) => setSelectedBinder(e.target.value)}
              className="text-fg rounded-xl p-2 text-sm max-w-[180px]"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            >
              <option value="">Alle</option>
              {binderOptions.map(([name, type]) => (
                <option key={name} value={name}>{type === 'deck' ? '🃏' : '📁'} {name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Min. Anzahl</label>
            <input
              type="number"
              min="1"
              placeholder="1"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              className="w-24 text-fg rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            />
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Preis (€)</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-20 text-fg rounded-xl p-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
              />
              <span className="text-cmd-muted text-xs">–</span>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-20 text-fg rounded-xl p-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">CMC</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                placeholder="min"
                value={minCmc}
                onChange={(e) => setMinCmc(e.target.value)}
                className="w-16 text-fg rounded-xl p-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
              />
              <span className="text-cmd-muted text-xs">–</span>
              <input
                type="number"
                min="0"
                placeholder="max"
                value={maxCmc}
                onChange={(e) => setMaxCmc(e.target.value)}
                className="w-16 text-fg rounded-xl p-2 text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Sortieren</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-fg rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            >
              {Object.entries(PRICE_SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {(selectedColors.length > 0 || selectedType || availability !== 'all' || selectedBinder || minQuantity || minPrice || maxPrice || minCmc || maxCmc || sortBy !== 'none' || search) && (
            <button
              onClick={() => {
                setSearch('')
                setSelectedColors([])
                setSelectedType('')
                setAvailability('all')
                setSelectedBinder('')
                setMinQuantity('')
                setMinPrice('')
                setMaxPrice('')
                setMinCmc('')
                setMaxCmc('')
                setSortBy('none')
              }}
              className="btn-secondary text-xs px-4 py-2"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {loadingImages && (
        <p className="text-cmd-muted text-sm mb-4">Lade Kartenbilder…</p>
      )}

      <p className="text-cmd-muted text-sm mb-4">{visibleCards.length} Karten</p>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {visibleCards.map((card, index) => {
          const resolved = resolveCard(card)
          return (
            <CardTile
              key={`${card.scryfallId || card.name}-${index}`}
              size="small"
              onClick={() => setModalIndex(index)}
              card={{
                name: card.name,
                image: resolved?.image,
                colors: resolved?.colors,
                eur: card.purchasePrice,
                deckBadge: card.binderType === 'deck' ? card.binderName : null
              }}
            />
          )
        })}
      </div>

      {modalIndex !== null && visibleCards[modalIndex] && (
        <CardModal
          card={visibleCards[modalIndex]}
          resolved={resolveCard(visibleCards[modalIndex])}
          onClose={() => setModalIndex(null)}
          onPrev={() => setModalIndex(i => (i - 1 + visibleCards.length) % visibleCards.length)}
          onNext={() => setModalIndex(i => (i + 1) % visibleCards.length)}
        />
      )}
    </div>
  )
}
