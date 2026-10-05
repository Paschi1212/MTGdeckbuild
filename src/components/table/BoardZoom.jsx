import { useEffect } from 'react'
import OpponentBoard from './OpponentBoard'

// Another player's board filling the screen — for a close look at what they have out.
// Tabs (or ← →) switch between the other players; Esc or ✕ goes back to the table.
export default function BoardZoom({ seats, others, current, onSelect, onClose, boardProps }) {
  const index = Math.max(0, others.findIndex(seat => seat.playerId === current))
  const seat = others[index]

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onSelect(others[(index + 1) % others.length].playerId)
      if (event.key === 'ArrowLeft') onSelect(others[(index - 1 + others.length) % others.length].playerId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, others, onSelect, onClose])

  if (!seat) return null
  return (
    <div className="fixed inset-0 z-[105] flex flex-col p-3 md:p-5 gap-3" style={{ background: 'rgba(8,8,10,0.94)' }} role="dialog" aria-label={`Board von ${seat.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        {others.map(other => (
          <button
            key={other.playerId}
            type="button"
            onClick={() => onSelect(other.playerId)}
            aria-pressed={other.playerId === seat.playerId}
            className="text-sm px-3 min-h-[40px] font-semibold"
            style={{
              background: other.playerId === seat.playerId ? 'var(--color-accent)' : 'var(--color-surface)',
              color: other.playerId === seat.playerId ? 'var(--color-bg)' : 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            {other.name}
          </button>
        ))}
        <span className="text-xs ml-1 hidden md:inline" style={{ color: 'rgba(255,255,255,0.55)' }}>← → wechseln · Esc schließt</span>
        <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 min-h-[40px] ml-auto">✕ Zurück zum Tisch</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <OpponentBoard key={seat.playerId} seat={seat} seats={seats} large {...boardProps(seat)} />
      </div>
    </div>
  )
}
