import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DeckAuditPage from './DeckAuditPage'
import CommanderSearchInput from '../components/CommanderSearchInput'
import { getDraftDeck, saveDraftDeck, draftStorageKey } from '../lib/draftDecks'
import { loadCollection, getAvailableCardNames } from '../lib/collection'
import { getDeckPreferences, setDeckPreferences } from '../lib/deckPreferences'
import { getSavedAudit, setSavedAudit } from '../lib/deckAudit'

// Same limits/levels as a real deck's page (DeckDetailPage) — a draft gets the identical analysis.
const SAMPLE_CARD_LIMIT = 2000
const POWER_LEVELS = ['Casual', 'Semi-Casual', 'Semi-Competitive', 'Competitive']
const PLACEHOLDER_NAMES = new Set(['Importiertes Deck', 'Unbenannter Entwurf'])

// "📊 Analyse" for a saved draft (chat-built or imported list): the same DeckAuditPage a real
// ManaBox deck uses, with the result and strategy correction stored under "draft:<id>".
export default function DraftAnalysisPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const storageKey = draftStorageKey(id)

  const [draft, setDraft] = useState(() => getDraftDeck(id))
  const [collection] = useState(loadCollection)
  const [commanderInput, setCommanderInput] = useState(draft?.commander || '')
  const [editingCommander, setEditingCommander] = useState(!draft?.commander)
  const [powerLevel, setPowerLevel] = useState(() => getDeckPreferences(storageKey).powerLevel || 'Semi-Casual')
  const [audit, setAudit] = useState(() => getSavedAudit(storageKey))

  const commander = draft?.commander?.trim() || ''

  // Chat-built drafts can list the commander among the cards — it's not part of the 99.
  const deckCards = useMemo(() => (draft?.cards || [])
    .filter(c => c.name && c.name.toLowerCase() !== commander.toLowerCase())
    .map(c => ({ name: c.name, quantity: c.count || 1 })), [draft, commander])
  const deckSize = deckCards.reduce((sum, c) => sum + c.quantity, 0)

  // Only copies NOT already built into one of the real ManaBox decks can go into a draft.
  const collectionSampleNames = useMemo(() => {
    const inDraft = new Set(deckCards.map(c => c.name))
    return getAvailableCardNames(collection)
      .filter(name => !inDraft.has(name))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, SAMPLE_CARD_LIMIT)
  }, [collection, deckCards])

  const backToDrafts = () => navigate('/decks', { state: { tab: 'drafts' } })

  if (!draft) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-cmd-muted mb-4">Diesen Entwurf gibt es nicht (mehr).</p>
        <button onClick={backToDrafts} className="btn-primary">Zu den Entwürfen</button>
      </div>
    )
  }

  const displayName = draft.name || commander || 'Unbenannter Entwurf'

  const handleSetCommander = (name) => {
    const trimmed = (name ?? commanderInput).trim()
    if (!trimmed) return
    const keepName = draft.name && draft.name !== draft.commander && !PLACEHOLDER_NAMES.has(draft.name)
    const saved = saveDraftDeck({
      id: draft.id,
      name: keepName ? draft.name : trimmed,
      commander: trimmed,
      cards: draft.cards,
      strategyNote: draft.strategyNote
    })
    setDraft(saved)
    setCommanderInput(trimmed)
    setEditingCommander(false)
  }

  const handlePowerLevelChange = (level) => {
    setPowerLevel(level)
    setDeckPreferences(storageKey, { powerLevel: level })
  }

  // Stamped with the draft version it was made for, so a later edit shows up as "outdated".
  const handleAuditComplete = (data) => {
    const stamped = { ...data, draftUpdatedAt: draft.updatedAt }
    setAudit(stamped)
    setSavedAudit(storageKey, stamped)
  }

  const openEditor = (cardsToAdd, cardsToCut) => navigate('/edit-deck', {
    state: {
      draftId: draft.id,
      commander,
      cards: draft.cards,
      strategyNote: getDeckPreferences(storageKey).strategyOverride || draft.strategyNote || '',
      cardsToAdd,
      cardsToCut
    }
  })

  const auditOutdated = audit?.draftUpdatedAt && audit.draftUpdatedAt !== draft.updatedAt

  return (
    <div className="max-w-6xl mx-auto">
      <h1>📊 Analyse: {displayName}</h1>
      <p className="text-cmd-muted mb-6">
        Entwurf · {deckSize} Karten{commander ? ' + Commander' : ''} ·{' '}
        <button onClick={() => openEditor()} className="underline" style={{ color: 'var(--u)' }}>
          ✏️ im Editor öffnen
        </button>
      </p>

      <div className="card mb-6">
        <label className="text-sm text-cmd-muted block mb-2">Commander</label>
        {editingCommander ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <CommanderSearchInput
                value={commanderInput}
                onChange={setCommanderInput}
                onSubmit={handleSetCommander}
                placeholder="z.B. Magus Lucea Kane"
                className="w-full text-white rounded-xl p-3"
              />
            </div>
            <button onClick={() => handleSetCommander()} disabled={!commanderInput.trim()} className="btn-secondary whitespace-nowrap">
              📌 Übernehmen
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{commander}</span>
            <button onClick={() => setEditingCommander(true)} className="btn-secondary text-xs px-3 py-1.5">Ändern</button>
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="text-sm text-cmd-muted block mb-2">Power Level (für die Analyse)</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {POWER_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => handlePowerLevelChange(level)}
                className={`p-2 text-sm transition ${
                  powerLevel === level ? '' : 'text-cmd-muted hover:text-white bg-[color:var(--surface)] border border-[color:var(--border)]'
                }`}
                style={powerLevel === level ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {auditOutdated && (
        <div className="card mb-6" style={{ borderColor: 'var(--color-accent)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            ⚠️ Der Entwurf wurde nach dieser Analyse geändert — die Vorschläge unten können veraltet sein.
            Für einen aktuellen Stand unten auf „🔄 Neu analysieren“ klicken.
          </p>
        </div>
      )}

      {!commander ? (
        <p className="text-cmd-muted">Erst den Commander festlegen, dann kann der Entwurf analysiert werden.</p>
      ) : deckCards.length === 0 ? (
        <p className="text-cmd-muted">Der Entwurf enthält noch keine Karten.</p>
      ) : (
        <DeckAuditPage
          key={commander}
          commander={commander}
          deckName={displayName}
          storageKey={storageKey}
          deckCards={deckCards}
          collectionSampleNames={collectionSampleNames}
          powerLevel={powerLevel}
          cachedAudit={audit}
          onAuditComplete={handleAuditComplete}
          onOpenEditor={openEditor}
          onBack={backToDrafts}
          backLabel="← Zurück zu den Entwürfen"
        />
      )}
    </div>
  )
}
