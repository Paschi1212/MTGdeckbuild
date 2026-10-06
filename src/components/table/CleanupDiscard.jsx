import { useState } from 'react'
import { TableCard } from './TableCard'

export const MAX_HAND_SIZE = 7

// End of the turn with more than seven cards in hand: the active player discards down to
// seven (cleanup step, rule 514.1) — pick which ones, then the turn passes. With an effect
// that lifts the limit (Reliquary Tower, Thought Vessel …) the turn passes without discarding.
export default function CleanupDiscard({ hand, playerName, onDiscard, onSkip, onCancel, onHover }) {
  const excess = hand.length - MAX_HAND_SIZE
  const [chosen, setChosen] = useState([])
  const toggle = (iid) => setChosen(prev => (prev.includes(iid)
    ? prev.filter(id => id !== iid)
    : prev.length < excess ? [...prev, iid] : prev))
  const missing = excess - chosen.length

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(8,8,10,0.85)' }} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cleanup-title"
        className="w-full max-w-4xl max-h-[88vh] flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 id="cleanup-title" className="font-bold text-fg">
            Aufräumen{playerName ? ` · ${playerName}` : ''}: auf {MAX_HAND_SIZE} Handkarten abwerfen
          </h3>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="tabular-nums">{hand.length}</span> Karten auf der Hand – wähle{' '}
            <strong className="text-fg tabular-nums">{excess}</strong>, die auf den Friedhof {excess === 1 ? 'geht' : 'gehen'}.
          </p>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            {hand.map(card => {
              const on = chosen.includes(card.iid)
              const full = !on && missing === 0
              return (
                <button
                  key={card.iid}
                  type="button"
                  onClick={() => toggle(card.iid)}
                  aria-pressed={on}
                  className="flex flex-col items-center gap-1.5 p-1.5 text-xs font-semibold"
                  style={{
                    border: `2px solid ${on ? 'var(--r)' : 'transparent'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: on ? 'rgba(220,80,70,0.08)' : 'transparent',
                    opacity: full ? 0.55 : 1,
                    color: on ? 'var(--r)' : 'var(--color-text-muted)'
                  }}
                >
                  <TableCard card={card} width={112} onHover={onHover} />
                  {on ? 'wird abgeworfen' : 'behalten'}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onSkip} className="text-xs underline text-left" style={{ color: 'var(--color-text-muted)' }}>
            Kein Handkartenlimit (z. B. Reliquary Tower) – ohne Abwerfen abgeben
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary text-sm px-4 min-h-[44px]">Zurück zum Zug</button>
            <button
              type="button"
              onClick={() => onDiscard(chosen)}
              disabled={missing > 0}
              className="btn-primary text-sm px-5 min-h-[44px]"
            >
              {missing > 0 ? `Noch ${missing} wählen` : `${excess} abwerfen & Zug abgeben`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
