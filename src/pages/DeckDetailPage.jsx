import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection, getCardsForBinder, getAvailableCardNames } from '../lib/collection'
import { getCommanderOverride, setCommanderOverride } from '../lib/commanderOverrides'

const SAMPLE_CARD_LIMIT = 150

function guessCommander(cards, imageMap) {
  let best = null
  for (const card of cards) {
    const info = imageMap[card.scryfallId]
    if (!info?.typeLine?.includes('Legendary')) continue
    if (!(info.typeLine.includes('Creature') || info.typeLine.includes('Planeswalker'))) continue
    if (!best || (info.eur || 0) > (imageMap[best.scryfallId]?.eur || 0)) {
      best = card
    }
  }
  return best?.name || ''
}

export default function DeckDetailPage() {
  const { deckName: encodedDeckName } = useParams()
  const deckName = decodeURIComponent(encodedDeckName)
  const navigate = useNavigate()

  const [collection] = useState(loadCollection)
  const [imageMap, setImageMap] = useState({})
  const [loadingImages, setLoadingImages] = useState(true)
  const initialOverride = getCommanderOverride(deckName)
  const [commander, setCommander] = useState(initialOverride)
  // A saved override is authoritative — skip the auto-guess entirely once one exists.
  const [commanderInitialized, setCommanderInitialized] = useState(!!initialOverride)
  const [savedOverride, setSavedOverride] = useState(initialOverride)

  const deckCards = useMemo(() => getCardsForBinder(collection, deckName), [collection, deckName])

  useEffect(() => {
    if (deckCards.length === 0) {
      setLoadingImages(false)
      return
    }

    const ids = [...new Set(deckCards.map(c => c.scryfallId).filter(Boolean))]
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
  }, [deckCards])

  useEffect(() => {
    if (!commanderInitialized && Object.keys(imageMap).length > 0) {
      setCommander(guessCommander(deckCards, imageMap))
      setCommanderInitialized(true)
    }
  }, [imageMap, commanderInitialized, deckCards])

  const handleSaveCommander = () => {
    const trimmed = commander.trim()
    setCommanderOverride(deckName, trimmed)
    setSavedOverride(trimmed)
  }

  const handleAnalyze = () => {
    if (!commander.trim()) return

    const deckCardNames = new Set(deckCards.map(c => c.name))
    // Available (not already committed to a DIFFERENT deck) and not already in this one —
    // don't suggest adding a card that's either already here or physically used elsewhere.
    const collectionSampleNames = getAvailableCardNames(collection, deckName)
      .filter(name => !deckCardNames.has(name))
      .slice(0, SAMPLE_CARD_LIMIT)

    navigate('/deck-audit', {
      state: {
        commander: commander.trim(),
        deckName,
        deckCards: deckCards.map(c => ({ name: c.name, quantity: c.quantity })),
        collectionSampleNames
      }
    })
  }

  if (!collection) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-cmd-muted mb-4">Noch keine Sammlung hochgeladen.</p>
        <button onClick={() => navigate('/upload')} className="btn-primary">Zum Upload</button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1>🃏 {deckName}</h1>
      <p className="text-cmd-muted mb-6">{deckCards.length} Karten</p>

      <div className="card mb-6">
        <label className="text-sm text-cmd-muted block mb-2">Commander (zur Analyse)</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="z.B. Wrexial, the Pet-Devourer"
            value={commander}
            onChange={(e) => setCommander(e.target.value)}
            className="flex-1 text-white rounded-xl p-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          />
          <button
            onClick={handleSaveCommander}
            disabled={!commander.trim() || commander.trim() === savedOverride}
            className="btn-secondary whitespace-nowrap"
            title="Merkt diesen Commander dauerhaft für dieses Deck, statt ihn jedes Mal neu zu erraten"
          >
            {commander.trim() && commander.trim() === savedOverride ? '✓ Gemerkt' : '📌 Merken'}
          </button>
          <button
            onClick={() => navigate('/edit-deck', { state: { deckName, commander } })}
            className="btn-secondary whitespace-nowrap"
          >
            ✏️ Im Editor öffnen
          </button>
          <button
            onClick={handleAnalyze}
            disabled={!commander.trim()}
            className="btn-primary whitespace-nowrap"
          >
            📊 Analysieren
          </button>
        </div>
        {!savedOverride && commanderInitialized && (
          <p className="text-xs text-cmd-muted mt-2">
            Dies ist nur eine Schätzung (teuerste legendäre Kreatur/Planeswalker im Deck). Falls falsch: korrigieren und auf "Merken" klicken.
          </p>
        )}
      </div>

      {loadingImages && (
        <p className="text-cmd-muted text-sm mb-4">Lade Kartenbilder…</p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {deckCards.map((card, index) => {
          const resolved = imageMap[card.scryfallId]
          return (
            <CardTile
              key={`${card.scryfallId || card.name}-${index}`}
              size="small"
              card={{
                name: card.name,
                image: resolved?.image,
                colors: resolved?.colors,
                eur: card.purchasePrice
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
