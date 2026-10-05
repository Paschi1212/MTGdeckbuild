import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { loadCollection, getCardsForBinder, getAvailableCardNames } from '../lib/collection'
import { getCommanderOverride, setCommanderOverride } from '../lib/commanderOverrides'
import { getDeckPreferences, setDeckPreferences } from '../lib/deckPreferences'
import { getSavedAudit, setSavedAudit } from '../lib/deckAudit'
import CommanderAutocompleteInput from '../components/CommanderAutocompleteInput'
import DeckAuditPage from './DeckAuditPage'
import { getPendingAiJob } from '../lib/aiMode'
import EditDeckPage from './EditDeckPage'
import DeckLockCard from '../components/DeckLockCard'

// Was 150 — far too small to let the AI actually consider "which of my cards would fit" for
// a real collection (observed live: ~2790 unique priced cards, only the first 150 in
// arbitrary CSV order were ever shown to it). Raised to cover realistically every collection
// while still bounding worst-case prompt size for a pathologically huge one.
const SAMPLE_CARD_LIMIT = 2000
const POWER_LEVELS = ['Casual', 'Semi-Casual', 'Semi-Competitive', 'Competitive']
const TABS = [
  { id: 'overview', label: '🃏 Übersicht' },
  { id: 'analyse', label: '📊 Analyse' },
  { id: 'editor', label: '✏️ Editor' }
]

// Only a first guess until the player confirms one ("Merken"). The commander's colors must
// cover every colored card in the deck (color identity) — "most expensive legend" alone picked
// Sheoldred (black) in a blue-black Wrexial deck. Among the legends that fit, the priciest wins;
// if none covers everything alone (partners), all legends compete.
function guessCommander(cards, imageMap) {
  const known = cards.map(card => ({ card, info: imageMap[card.scryfallId] })).filter(entry => entry.info)
  const deckColors = new Set(known.filter(({ info }) => !info.typeLine?.includes('Land')).flatMap(({ info }) => info.colors || []))
  const legends = known.filter(({ info }) => info.typeLine?.includes('Legendary') && (info.typeLine.includes('Creature') || info.typeLine.includes('Planeswalker')))
  const fitting = legends.filter(({ info }) => [...deckColors].every(color => (info.colors || []).includes(color)))
  const pool = fitting.length ? fitting : legends
  pool.sort((a, b) => (b.info.eur || 0) - (a.info.eur || 0))
  return pool[0]?.card.name || ''
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

  // Übersicht / Analyse / Editor live as tabs on one page instead of three separate routes —
  // "view, analyze, edit" is one task, not three. auditResult is cached here (not inside
  // DeckAuditPage) so switching away and back to the Analyse tab doesn't silently re-run a
  // real AI call; editorHandoff carries an Analyse result's suggestions into the Editor tab.
  // An analysis still running on the PC (page reloaded meanwhile, e.g. tablet standby) opens
  // straight on the Analyse tab, where it is picked up again.
  const [activeTab, setActiveTab] = useState(() => (getPendingAiJob(`audit:${deckName}:strategy`) || getPendingAiJob(`audit:${deckName}:suggestions`) ? 'analyse' : 'overview'))
  // Hydrated from localStorage, not just in-memory — otherwise a page reload (not just a
  // tab switch within the session) silently lost the last analysis, forcing a re-run even
  // though nothing about the deck changed.
  const [auditResult, setAuditResult] = useState(() => getSavedAudit(deckName))
  const [editorHandoff, setEditorHandoff] = useState(null)

  const handleAuditComplete = (data) => {
    setAuditResult(data)
    setSavedAudit(deckName, data)
    // Analysing with a commander confirms it — no separate "Merken" needed for that.
    if (data.commander && data.commander !== savedOverride) {
      setCommanderOverride(deckName, data.commander)
      setSavedOverride(data.commander)
    }
  }

  const handlePowerLevelChange = (value) => {
    setPowerLevel(value)
    setDeckPreferences(deckName, { powerLevel: value })
  }

  // Set once a user has corrected/confirmed the AI's strategy read on the Deck-Analyse tab —
  // surfaced here too so it's visible without switching to Analyse.
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

  // Available (not already committed to a DIFFERENT deck) and not already in this one — don't
  // suggest adding a card that's either already here or physically used elsewhere.
  const collectionSampleNames = useMemo(() => {
    const deckCardNames = new Set(deckCards.map(c => c.name))
    return getAvailableCardNames(collection, deckName)
      .filter(name => !deckCardNames.has(name))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, SAMPLE_CARD_LIMIT)
  }, [collection, deckName, deckCards])

  const deckCardsForAnalyze = useMemo(() => deckCards.map(c => ({ name: c.name, quantity: c.quantity })), [deckCards])

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

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors"
            style={activeTab === tab.id
              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
              : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="card mb-6">
            <label className="text-sm text-cmd-muted block mb-2">Commander (zur Analyse)</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <CommanderAutocompleteInput
                  value={commander}
                  onChange={setCommander}
                  cardNames={collection?.uniqueCardNames || []}
                  placeholder="z.B. Wrexial, the Pet-Devourer"
                  className="w-full text-fg rounded-xl p-3"
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
            </div>
            {!savedOverride && commanderInitialized && (
              <p className="text-xs text-cmd-muted mt-2">
                Dies ist nur eine Schätzung (legendäre Kreatur, deren Farben das ganze Deck abdecken). Falls falsch: korrigieren und auf "Merken" klicken.
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
                        ? ''
                        : 'text-cmd-muted hover:text-fg bg-[color:var(--surface)] border border-[color:var(--border)]'
                    }`}
                    style={powerLevel === level ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
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
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--u)' }}>🎯 Spielplan</h2>
              <p className="text-sm text-fg-2 whitespace-pre-wrap leading-relaxed mb-3">{rememberedStrategy}</p>
              <p className="text-xs text-cmd-muted">
                Aus der letzten Analyse — wird bei jeder künftigen Analyse als Grundlage verwendet. Zum Ändern:
                Tab "📊 Analyse" öffnen und dort auf "✏️ Korrigieren" klicken.
              </p>
            </div>
          )}

          <DeckLockCard deckName={deckName} />

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
        </>
      )}

      {activeTab === 'analyse' && (
        commander.trim() ? (
          <DeckAuditPage
            commander={commander.trim()}
            deckName={deckName}
            deckCards={deckCardsForAnalyze}
            collectionSampleNames={collectionSampleNames}
            powerLevel={powerLevel}
            cachedAudit={auditResult}
            onAuditComplete={handleAuditComplete}
            onOpenEditor={(cardsToAdd, cardsToCut) => {
              setEditorHandoff({ cardsToAdd, cardsToCut })
              setActiveTab('editor')
            }}
            onBack={() => setActiveTab('overview')}
            onChangeCommander={() => setActiveTab('overview')}
          />
        ) : (
          <p className="text-cmd-muted">Erst einen Commander im Tab "Übersicht" setzen (oder bestätigen), um analysieren zu können.</p>
        )
      )}

      {activeTab === 'editor' && (
        <EditDeckPage
          deckName={deckName}
          commander={commander.trim()}
          cardsToAdd={editorHandoff?.cardsToAdd}
          cardsToCut={editorHandoff?.cardsToCut}
          onBack={() => setActiveTab('overview')}
        />
      )}
    </div>
  )
}
