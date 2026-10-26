// The draft table seen from above: every seat on a ring, you at the bottom. Boosters travel
// clockwise in rounds 1 and 3 (to your left), counter-clockwise in round 2 — the arrow in the
// middle shows which way. Each seat says how many boosters wait there; a seat holding two or
// more is the one slowing the table down (gold).
//
// seats: [{ playerId, name, bot?, holding?, empty? }] in seating order.
export default function DraftPod({ seats, meId, direction = 1, round = null, size = 220, caption }) {
  const n = seats.length
  const me = Math.max(0, seats.findIndex(seat => seat.playerId === meId))
  const radius = size / 2 - 30
  const center = size / 2

  // Seat i sits (i - me) steps clockwise from you; you are at the bottom (90°).
  const position = (index) => {
    const step = ((index - me) % n + n) % n
    const angle = Math.PI / 2 + (step * 2 * Math.PI) / n
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) }
  }
  const clockwise = direction !== -1

  return (
    <figure className="m-0">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="3 5" />
          <circle cx={center} cy={center} r={radius - 26} fill="var(--color-bg)" stroke="var(--color-border)" />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center" style={{ left: center - 40, top: center - 30, width: 80, height: 60 }}>
          <span className="text-2xl leading-none" style={{ color: 'var(--gold)' }} aria-hidden="true">{clockwise ? '↻' : '↺'}</span>
          <span className="text-[11px] mt-1 leading-tight" style={{ color: 'var(--color-text-muted)' }}>
            {round !== null && <span className="block">Runde {round + 1}</span>}
            nach {clockwise ? 'links' : 'rechts'}
          </span>
        </div>
        {seats.map((seat, index) => {
          const { x, y } = position(index)
          const isMe = seat.playerId === meId
          const busy = (seat.holding || 0) >= 2
          return (
            <div
              key={seat.playerId || `empty-${index}`}
              className="absolute flex flex-col items-center"
              style={{ left: x - 30, top: y - 18, width: 60, opacity: seat.bot || seat.empty ? 0.6 : 1 }}
              title={seat.empty ? 'freier Platz' : `${seat.name}${seat.holding ? ` · ${seat.holding} Booster` : ''}`}
            >
              <span
                className="relative flex items-center justify-center text-xs font-bold"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: isMe ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: isMe ? 'var(--color-bg)' : 'var(--color-text)',
                  border: seat.empty ? '1.5px dashed var(--color-text-muted)' : `1.5px solid ${busy ? 'var(--gold)' : 'var(--color-text-muted)'}`
                }}
              >
                {seat.empty ? '' : seat.bot ? '⚙' : seat.name.slice(0, 1).toUpperCase()}
                {seat.holding > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 text-[10px] font-bold tabular-nums leading-none px-1 py-0.5"
                    style={{ background: busy ? 'var(--gold)' : 'var(--color-text-secondary)', color: 'var(--color-bg)', borderRadius: 8 }}
                  >
                    {seat.holding}
                  </span>
                )}
              </span>
              <span className="text-[11px] mt-0.5 max-w-full truncate" style={{ color: isMe ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: isMe ? 700 : 400 }}>
                {seat.empty ? 'frei' : isMe ? 'du' : seat.name.replace(' (Bot)', '')}
              </span>
            </div>
          )
        })}
      </div>
      {caption && <figcaption className="text-[11px] text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>{caption}</figcaption>}
    </figure>
  )
}
