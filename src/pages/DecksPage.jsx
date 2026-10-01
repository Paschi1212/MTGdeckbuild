import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loadCollection } from '../lib/collection'
import { loadDraftDecks, deleteDraftDeck, saveDraftDeck } from '../lib/draftDecks'
import { parseDeckListText } from '../lib/deckListImport'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
      style={active
        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
        : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
    >
      {children}
    </button>
  )
}

export default function DecksPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab === 'drafts' ? 'drafts' : 'decks')
  const [collection] = useState(loadCollection)
  const [drafts, setDrafts] = useState(loadDraftDecks)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importCommander, setImportCommander] = useState('')
  const [importError, setImportError] = useState('')

  // Importing an externally-built deck (Moxfield, Archidekt, EDHREC export, ...) as a draft
  // lets the Editor's existing "🛒 kaufen" / "📦 bei <Freund>" badges check it against the
  // user's own and friends' collections — the whole point of this feature, not just storage.
  const handleImport = () => {
    const parsed = parseDeckListText(importText)
    if (parsed.cards.length === 0) {
      setImportError('Keine Karten erkannt — bitte eine gültige Decklist einfügen (z.B. "1 Sol Ring" pro Zeile).')
      return
    }
    const commander = importCommander.trim() || parsed.commander || ''
    const saved = saveDraftDeck({
      name: commander || 'Importiertes Deck',
      commander,
      cards: parsed.cards.map(c => ({ name: c.name, count: c.count, price: 0 })),
      strategyNote: ''
    })
    setShowImport(false)
    setImportText('')
    setImportCommander('')
    setImportError('')
    navigate('/edit-deck', {
      state: { draftId: saved.id, commander: saved.commander, cards: saved.cards, strategyNote: saved.strategyNote }
    })
  }

  const handleDeleteDraft = (id, name) => {
    if (!window.confirm(`Entwurf "${name || 'Unbenannt'}" wirklich löschen?`)) return
    deleteDraftDeck(id)
    setDrafts(loadDraftDecks())
  }

  const handleOpenDraft = (draft) => {
    navigate('/edit-deck', {
      state: {
        draftId: draft.id,
        commander: draft.commander,
        cards: draft.cards,
        strategyNote: draft.strategyNote
      }
    })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1>🃏 Meine Decks</h1>

      <div className="flex gap-2 mb-6">
        <TabButton active={tab === 'decks'} onClick={() => setTab('decks')}>Decks</TabButton>
        <TabButton active={tab === 'drafts'} onClick={() => setTab('drafts')}>
          Entwürfe{drafts.length > 0 ? ` (${drafts.length})` : ''}
        </TabButton>
      </div>

      {tab === 'decks' && (
        !collection ? (
          <div className="card">
            <p className="text-cmd-muted mb-4">Noch keine Sammlung hochgeladen.</p>
            <button onClick={() => navigate('/upload')} className="btn-primary">
              Zum Upload
            </button>
          </div>
        ) : collection.decks.length === 0 ? (
          <div className="card">
            <p className="text-cmd-muted">
              In deiner Sammlung sind keine ManaBox-"Deck"-Binder erkannt worden — nur eine allgemeine Sammlung.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {collection.decks.map(deck => (
              <button
                key={deck.name}
                onClick={() => navigate(`/decks/${encodeURIComponent(deck.name)}`)}
                className="card-hover text-left"
              >
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--u)' }}>{deck.name}</h3>
                <div className="flex justify-between text-sm text-cmd-muted">
                  <span>{deck.cardCount} Karten</span>
                  <span style={{ color: 'var(--g)' }}>€{(deck.totalValue ?? 0).toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'drafts' && (
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold mb-1">📋 Decklist importieren</h2>
              <p className="text-xs text-cmd-muted">
                Ein extern gebautes Deck (Moxfield, Archidekt, EDHREC, ...) als .txt einfügen — landet als Entwurf,
                den du im Editor gegen deine Sammlung und Freundes-Sammlungen abgleichen kannst.
              </p>
            </div>
            <button onClick={() => setShowImport(v => !v)} className="btn-secondary text-xs px-3 py-2 whitespace-nowrap flex-shrink-0 ml-4">
              {showImport ? '✕ Abbrechen' : '+ Importieren'}
            </button>
          </div>

          {showImport && (
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Commander (optional, wird aus der Liste erkannt wenn markiert)"
                value={importCommander}
                onChange={(e) => setImportCommander(e.target.value)}
                className="w-full text-white rounded-xl p-3 text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'1 Sol Ring\n1 Isshin, Two Heavens as One *CMDR*\n4x Island\n...'}
                className="w-full text-white rounded-xl p-3 text-sm font-mono h-48 resize-y"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
              />
              {importError && <p className="text-xs" style={{ color: 'var(--r)' }}>{importError}</p>}
              <button onClick={handleImport} disabled={!importText.trim()} className="btn-primary w-full text-sm">
                Importieren & im Editor öffnen
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'drafts' && (
        drafts.length === 0 ? (
          <div className="card">
            <p className="text-cmd-muted mb-4">
              Noch keine gespeicherten Entwürfe. Bau ein Deck über "Commander" → Chat-Aufbau und klick auf "Speichern", oder importiere oben eine Decklist.
            </p>
            <button onClick={() => navigate('/select-commander')} className="btn-primary">
              🧙 Zu Commander
            </button>
          </div>
        ) : (
          <>
            <p className="text-cmd-muted text-sm mb-4">Lokal gespeicherte Deck-Entwürfe — noch nicht Teil deiner echten ManaBox-Sammlung.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {drafts.map(draft => {
                const deckSize = (draft.cards || []).reduce((sum, c) => sum + (c.count || 1), 0)
                const deckTotal = (draft.cards || []).reduce((sum, c) => sum + (c.count || 1) * (c.price || 0), 0)

                return (
                  <div key={draft.id} className="card">
                    <button onClick={() => handleOpenDraft(draft)} className="text-left w-full">
                      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--u)' }}>
                        {draft.name || draft.commander || 'Unbenannter Entwurf'}
                      </h3>
                      {draft.commander && draft.name && draft.name !== draft.commander && (
                        <p className="text-xs text-cmd-muted mb-2">Commander: {draft.commander}</p>
                      )}
                      <div className="flex justify-between text-sm text-cmd-muted mb-1">
                        <span>{deckSize} / 99 Karten</span>
                        <span style={{ color: 'var(--g)' }}>€{deckTotal.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-cmd-muted">Zuletzt geändert: {formatDate(draft.updatedAt)}</p>
                    </button>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleOpenDraft(draft)} className="btn-secondary flex-1 text-xs px-3 py-2">
                        ✏️ Öffnen
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(draft.id, draft.name || draft.commander)}
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{ color: 'var(--r)', border: '1px solid rgba(239,106,99,0.35)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}
    </div>
  )
}
