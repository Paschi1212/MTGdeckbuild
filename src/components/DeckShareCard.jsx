import { useEffect, useState } from 'react'
import { loadKnownPlayers } from '../lib/table/players'

// "Deck verleihen": lets players you met at the game table play this deck too. Only the deck
// list is shared — never the rest of the collection — and always in its current state.
export default function DeckShareCard({ deckName }) {
  const [known] = useState(loadKnownPlayers)
  const [selected, setSelected] = useState(new Set())
  const [saved, setSaved] = useState(new Set())
  const [state, setState] = useState('loading') // loading | idle | saving | saved | error

  useEffect(() => {
    let cancelled = false
    fetch('/.netlify/functions/deck-shares?mine=1', { credentials: 'include' })
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(data => {
        if (cancelled) return
        const share = (data.shares || []).find(entry => entry.deckName === deckName)
        const ids = new Set((share?.players || []).map(player => player.playerId))
        setSelected(ids)
        setSaved(ids)
        setState('idle')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [deckName])

  const toggle = (playerId) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(playerId)) next.delete(playerId)
    else next.add(playerId)
    return next
  })

  const changed = selected.size !== saved.size || [...selected].some(id => !saved.has(id))

  const save = async () => {
    setState('saving')
    try {
      const players = known.filter(player => selected.has(player.playerId))
      const response = await fetch('/.netlify/functions/deck-shares', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ deckName, players })
      })
      if (!response.ok) throw new Error()
      setSaved(new Set(selected))
      setState('saved')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="card mb-6">
      <h3 className="text-base font-bold mb-1">Deck verleihen</h3>
      <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Ausgewählte Mitspieler können dieses Deck am <strong>Spieltisch</strong> spielen – immer in seinem aktuellen Stand.
        Sie sehen nur die Deckliste, nicht deine Sammlung.
      </p>

      {known.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Sobald du mit Freunden in einer Lobby am Spieltisch warst, kannst du ihnen hier Decks leihen.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {known.map(player => {
              const on = selected.has(player.playerId)
              return (
                <button
                  key={player.playerId}
                  type="button"
                  onClick={() => toggle(player.playerId)}
                  aria-pressed={on}
                  disabled={state === 'loading'}
                  className="text-sm px-3 min-h-[40px] font-medium"
                  style={{
                    background: on ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: on ? 'var(--color-bg)' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  {on ? '✓ ' : ''}{player.name}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={!changed || state === 'saving' || state === 'loading'} className="btn-primary text-sm px-4 min-h-[40px]">
              {state === 'saving' ? 'Speichere …' : selected.size ? `Für ${selected.size} freigeben` : 'Freigabe beenden'}
            </button>
            <span className="text-xs" style={{ color: state === 'error' ? 'var(--r)' : 'var(--color-text-muted)' }}>
              {state === 'error' && 'Konnte die Freigaben nicht laden/speichern – später noch einmal versuchen.'}
              {state === 'saved' && !changed && (saved.size ? `Freigegeben für ${saved.size}` : 'Nicht freigegeben')}
              {state === 'idle' && !changed && (saved.size ? `Freigegeben für ${saved.size}` : 'Nicht freigegeben')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
