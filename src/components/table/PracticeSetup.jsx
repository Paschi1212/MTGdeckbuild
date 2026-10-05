import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { randomId } from '../../lib/table/realtime'
import { saveGameRecord } from '../../lib/table/game'
import { loadCommanderCard, deckCardCount } from '../../lib/table/decks'

const MAX_SEATS = 6

// "Probetisch": your own decks at one table, you play every seat (switching between them like
// passing the table around). Runs only in this browser — for trying the table, goldfishing a
// deck against others, or showing a game to someone sitting next to you.
export default function PracticeSetup({ decks }) {
  const navigate = useNavigate()
  const playable = decks.filter(deck => deck.commander && deckCardCount(deck) > 0)
  const [picked, setPicked] = useState([])
  const [starting, setStarting] = useState(false)

  const toggle = (key) => setPicked(prev => (prev.includes(key)
    ? prev.filter(k => k !== key)
    : prev.length < MAX_SEATS ? [...prev, key] : prev))

  const start = async () => {
    setStarting(true)
    const chosen = picked.map(key => playable.find(deck => deck.key === key)).filter(Boolean)
    const commanders = await Promise.all(chosen.map(deck => loadCommanderCard(deck.commander)))
    const seats = chosen.map((deck, index) => ({
      // Made-up seat ids, long enough for card ids ("<first 6>-<n>").
      playerId: `probe${index + 1}${randomId(8)}`,
      name: deck.label,
      deck: {
        label: deck.label,
        source: deck.source,
        commander: commanders[index]?.name || deck.commander,
        commanderImage: commanders[index]?.image || null,
        colorIdentity: commanders[index]?.colorIdentity || [],
        count: deckCardCount(deck)
      }
    }))
    const gameId = `probe-${randomId(8)}`
    saveGameRecord(gameId, {
      practice: true,
      seats,
      startedAt: Date.now(),
      events: [],
      decks: Object.fromEntries(seats.map((seat, index) => [seat.playerId, { label: chosen[index].label, commander: chosen[index].commander, cards: chosen[index].cards }]))
    })
    navigate(`/spieltisch/${gameId}`)
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">Probetisch</h2>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Deine Decks an einem Tisch – du spielst alle Plätze selbst und wechselst zwischen ihnen.
        Zum Ausprobieren, ohne Mitspieler.
      </p>
      {playable.length < 2 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Dafür brauchst du mindestens zwei Decks mit gemerktem Commander.
        </p>
      ) : (
        <>
          <ul className="max-h-64 overflow-y-auto -mx-1">
            {playable.map(deck => {
              const on = picked.includes(deck.key)
              const full = !on && picked.length >= MAX_SEATS
              return (
                <li key={deck.key}>
                  <label className="flex items-start gap-2 px-1 py-1.5 text-sm cursor-pointer" style={{ color: full ? 'var(--color-text-muted)' : 'var(--color-text)', opacity: full ? 0.6 : 1 }}>
                    <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(deck.key)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="font-medium">{deck.label}</span>
                      <span className="block text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{deck.commander}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={start} disabled={picked.length < 2 || starting} className="btn-primary w-full min-h-[44px]">
            {starting ? 'Decke den Tisch …' : picked.length < 2 ? 'Mindestens 2 Decks wählen' : `Probetisch mit ${picked.length} Decks starten`}
          </button>
        </>
      )}
    </section>
  )
}
