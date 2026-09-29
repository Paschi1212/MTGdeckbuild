import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection } from '../lib/collection'

const COLOR_OPTIONS = [
  { id: 'W', hex: '#F8F6D8' },
  { id: 'U', hex: '#4FA8F5' },
  { id: 'B', hex: '#1A1A1A' },
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
          <div className="font-bold text-white text-lg mb-1">{card.name}</div>
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

  const [collection] = useState(loadCollection)
  const [search, setSearch] = useState('')
  const [imageMap, setImageMap] = useState({})
  const [loadingImages, setLoadingImages] = useState(true)
  const [selectedColors, setSelectedColors] = useState([])
  const [selectedType, setSelectedType] = useState('')
  const [availability, setAvailability] = useState('all') // all | free | built
  const [minQuantity, setMinQuantity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortBy, setSortBy] = useState('none')
  const [modalIndex, setModalIndex] = useState(null)

  useEffect(() => {
    if (!collection?.cards?.length) {
      setLoadingImages(false)
      return
    }

    const ids = [...new Set(collection.cards.map(c => c.scryfallId).filter(Boolean))]
    if (ids.length === 0) {
      setLoadingImages(false)
      return
    }

    fetch('/.netlify/functions/get-card-price', {
      method: 'POST',
      body: JSON.stringify({ ids })
    })
      .then(res => (res.ok ? res.json() : {}))
      .then(setImageMap)
      .catch(() => {})
      .finally(() => setLoadingImages(false))
  }, [collection])

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
        const cardColorList = (imageMap[c.scryfallId]?.colors || '').split(' ').filter(Boolean)
        if (cardColorList.length === 0) return selectedColors.includes('C')
        return cardColorList.every(cc => selectedColors.includes(cc))
      })
    }

    if (selectedType) {
      result = result.filter(c => imageMap[c.scryfallId]?.typeLine?.includes(selectedType))
    }

    if (availability === 'free') {
      result = result.filter(c => c.binderType !== 'deck')
    } else if (availability === 'built') {
      result = result.filter(c => c.binderType === 'deck')
    }

    if (minQuantity) {
      result = result.filter(c => c.quantity >= Number(minQuantity))
    }

    if (maxPrice) {
      result = result.filter(c => c.purchasePrice <= Number(maxPrice))
    }

    const sortFn = PRICE_SORTS[sortBy]?.fn
    if (sortFn) {
      result = [...result].sort(sortFn)
    }

    return result
  }, [collection, search, selectedColors, selectedType, availability, minQuantity, maxPrice, sortBy, imageMap])

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
      <h1>🗂️ Meine Sammlung</h1>
      <p className="text-cmd-muted mb-6">{collection.totalCards} Karten insgesamt</p>

      <div className="card mb-6">
        <input
          type="text"
          placeholder="Karte suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-white rounded-xl p-3 mb-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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
                  style={{
                    backgroundColor: selectedColors.includes(color.id) ? color.hex : 'transparent',
                    border: `2px solid ${color.hex}`,
                    color: selectedColors.includes(color.id)
                      ? (color.id === 'B' || color.id === 'R' ? '#fff' : '#000')
                      : color.hex
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
              className="text-white rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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
              className="text-white rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              <option value="all">Alle</option>
              <option value="free">Frei verfügbar</option>
              <option value="built">Eingebaut (in Deck)</option>
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
              className="w-24 text-white rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            />
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Max. Preis (€)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="z.B. 10"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-28 text-white rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            />
          </div>

          <div>
            <label className="text-xs text-cmd-muted block mb-2">Sortieren</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-white rounded-xl p-2 text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              {Object.entries(PRICE_SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {(selectedColors.length > 0 || selectedType || availability !== 'all' || minQuantity || maxPrice || sortBy !== 'none' || search) && (
            <button
              onClick={() => {
                setSearch('')
                setSelectedColors([])
                setSelectedType('')
                setAvailability('all')
                setMinQuantity('')
                setMaxPrice('')
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
          const resolved = imageMap[card.scryfallId]
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
          resolved={imageMap[visibleCards[modalIndex].scryfallId]}
          onClose={() => setModalIndex(null)}
          onPrev={() => setModalIndex(i => (i - 1 + visibleCards.length) % visibleCards.length)}
          onNext={() => setModalIndex(i => (i + 1) % visibleCards.length)}
        />
      )}
    </div>
  )
}
