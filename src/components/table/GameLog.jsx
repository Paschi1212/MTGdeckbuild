import { PLAYER_COUNTERS } from '../../lib/table/game'

// "What just happened" for players who weren't looking: newest first, quick taps on the same
// number merged into one line ("Tom: Leben −5 → 35" instead of five "−1" lines).

const MERGE_WINDOW_MS = 5000
const counterLabel = (key) => PLAYER_COUNTERS.find(counter => counter.key === key)?.label || key
const signed = (delta) => (delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`)

function mergeKey(entry) {
  return [entry.type, entry.by, entry.target, entry.source || '', entry.key || ''].join('|')
}

function group(log) {
  const groups = []
  for (const entry of log) {
    const last = groups[groups.length - 1]
    if (last && ['life', 'counter', 'cmd', 'tax'].includes(entry.type) && mergeKey(last) === mergeKey(entry) && entry.ts - last.ts <= MERGE_WINDOW_MS) {
      last.delta += entry.delta
      last.after = entry.after
      last.lifeAfter = entry.lifeAfter
      last.ts = entry.ts
    } else {
      groups.push({ ...entry })
    }
  }
  return groups.filter(entry => !('delta' in entry) || entry.delta !== 0)
}

function describe(entry, nameOf, commanderOf) {
  const target = nameOf(entry.target)
  const actor = entry.by && entry.by !== entry.target ? `${nameOf(entry.by)} → ` : ''
  switch (entry.type) {
    case 'life': return `${actor}${target}: Leben ${signed(entry.delta)} → ${entry.after}`
    case 'counter': return `${actor}${target}: ${counterLabel(entry.key)} ${signed(entry.delta)} → ${entry.after}`
    case 'cmd': return `${commanderOf(entry.source)} → ${target}: Commander-Schaden ${signed(entry.delta)} → ${entry.after} (Leben ${entry.lifeAfter})`
    case 'tax': return `${target}: Commander-Steuer ${signed(entry.delta)} → +${entry.after}`
    case 'out': return entry.value ? `${target} ist ausgeschieden` : `${target} ist zurück im Spiel`
    case 'monarch': return entry.target ? `${target} wird Monarch` : 'Niemand ist mehr Monarch'
    case 'turn': return `Runde ${entry.round}: ${nameOf(entry.activePlayer)} ist am Zug`
    case 'note': return `${nameOf(entry.by)} ${entry.text}`
    default: return null
  }
}

export default function GameLog({ log, seats }) {
  const nameOf = (playerId) => seats.find(seat => seat.playerId === playerId)?.name || 'Jemand'
  const commanderOf = (playerId) => {
    const seat = seats.find(s => s.playerId === playerId)
    return seat?.deck?.commander ? `${seat.deck.commander} (${seat.name})` : nameOf(playerId)
  }
  const lines = group(log).reverse().slice(0, 80)

  return (
    <aside className="flex flex-col min-h-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <h3 className="px-3 py-2 text-sm font-semibold flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}>Spielverlauf</h3>
      {lines.length === 0 ? (
        <p className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>Noch nichts passiert. Viel Spaß!</p>
      ) : (
        <ol className="overflow-y-auto px-3 py-2 space-y-1.5 text-sm leading-snug">
          {lines.map(entry => {
            const text = describe(entry, nameOf, commanderOf)
            if (!text) return null
            return (
              <li key={entry.id} className="flex gap-2">
                <span className="tabular-nums text-xs pt-0.5 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  {new Date(entry.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
