import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection, getCardsForBinder, getAvailableCardNames } from '../lib/collection'
import { getCommanderOverride, setCommanderOverride } from '../lib/commanderOverrides'
import { getDeckPreferences, setDeckPreferences } from '../lib/deckPreferences'
import CommanderAutocompleteInput from '../components/CommanderAutocompleteInput'

const SAMPLE_CARD_LIMIT = 150
const POWER_LEVELS = ['Casual', 'Semi-Casual', 'Semi-Competitive', 'Competitive']

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
  // "Weak card" means something different in a Casual precon upgrade than in a
  // Competitive/cEDH list — remembered per deck so it's set once, not re-picked every audit.
  const [powerLevel, setPowerLevel] = useState(() => getDeckPreferences(deckName).powerLevel || 'Semi-Casual')

  const handlePowerLevelChange = (value) => {
    setPowerLevel(value)
    setDeckPreferences(deckName, { powerLevel: value })
  }

  // Set once a user has corrected/confirmed the AI's strategy read on the Deck-Analyse page
  // (DeckAuditPage) — surfaced here too so it's visible without re-running a full analysis.
  const rememberedStrategy = getDeckPreferences(deckName).strategyOverride || ''

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
        collectionSampleNames,
        powerLevel
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
      {/* deckCards.length counts distinct rows, not physical copies — a row for "7x Forest"
          is one row but 7 cards, so the displayed size undercounted decks with stacked basics. */}
      <p className="text-cmd-muted mb-6">{deckCards.reduce((sum, c) => sum + c.quantity, 0)} Karten</p>

      <div className="card mb-6">
        <label className="text-sm text-cmd-muted block mb-2">Commander (zur Analyse)</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <CommanderAutocompleteInput
              value={commander}
              onChange={setCommander}
              cardNames={collection?.uniqueCardNames || []}
              placeholder="z.B. Wrexial, the Pet-Devourer"
              className="w-full text-white rounded-xl p-3"
            />
          </div>
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

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="text-sm text-cmd-muted block mb-2">Power Level (für die Analyse)</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {POWER_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => handlePowerLevelChange(level)}
                className={`p-2 text-sm transition ${
                  powerLevel === level
                    ? 'text-white'
                    : 'text-cmd-muted hover:text-white bg-[color:var(--surface)] border border-[color:var(--border)]'
                }`}
                style={powerLevel === level ? { backgroundImage: 'linear-gradient(135deg, var(--u), var(--b))' } : undefined}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-xs text-cmd-muted mt-2">
            Bestimmt, was "schwache Karte" bei der Analyse bedeutet — wird gespeichert.
          </p>
        </div>
      </div>

      {rememberedStrategy && (
        <div className="card mb-6" style={{ borderColor: 'var(--u)' }}>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--u)' }}>🎯 Strategie</h2>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">{rememberedStrategy}</p>
          <p className="text-xs text-cmd-muted">
            Von dir bestätigt/korrigiert — wird bei jeder Analyse als Grundlage verwendet. Zum Ändern:
            "📊 Analysieren" ausführen und dort auf "✏️ Korrigieren" klicken.
          </p>
        </div>
      )}

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
