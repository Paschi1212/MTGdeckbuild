import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loadCollection } from '../lib/collection'
import { loadDraftDecks, deleteDraftDeck } from '../lib/draftDecks'

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
        ? { backgroundImage: 'linear-gradient(135deg, var(--u), var(--b))', color: '#fff' }
        : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--cmd-muted, #a99fc4)' }}
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
        drafts.length === 0 ? (
          <div className="card">
            <p className="text-cmd-muted mb-4">
              Noch keine gespeicherten Entwürfe. Bau ein Deck über "Commander" → Chat-Aufbau und klick auf "Speichern" — es landet dann hier.
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
