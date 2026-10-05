import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLobbies, rememberHosting, MAX_PLAYERS_CHOICES } from '../lib/table/lobby'
import { randomId } from '../lib/table/realtime'
import { firstName } from '../lib/table/players'
import { loadOwnDecks } from '../lib/table/decks'

// "Spieltisch": open lobbies of everyone on the site, live — join one or open your own.
export default function TablePage({ user }) {
  const navigate = useNavigate()
  const me = useMemo(() => ({ playerId: user.playerId, name: firstName(user.name) }), [user])
  const { lobbies, status } = useOpenLobbies(me)
  const [name, setName] = useState(`Runde von ${me.name}`)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [isPrivate, setIsPrivate] = useState(false)
  const own = useMemo(() => loadOwnDecks(), [])

  const createLobby = (event) => {
    event.preventDefault()
    const lobbyId = randomId()
    rememberHosting(lobbyId, { name: name.trim() || `Runde von ${me.name}`, maxPlayers, private: isPrivate, createdAt: Date.now() })
    navigate(`/spieltisch/${lobbyId}`)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1>Spieltisch</h1>
      <p className="mb-8 leading-relaxed max-w-3xl" style={{ color: 'var(--color-text-secondary)' }}>
        Commander mit Freunden wie am Küchentisch: Lobby öffnen oder beitreten, jeder bringt ein Deck mit,
        Lebenspunkte, Zähler und Commander-Schaden laufen live für alle mit. Die Regeln wendet ihr selbst an –
        sprechen könnt ihr nebenher z. B. über Discord.
      </p>

      {!user.playerId && (
        <div className="card mb-6" style={{ borderLeft: '4px solid var(--gold)' }}>
          <p className="text-sm text-fg">Bitte einmal ab- und wieder anmelden – deine Anmeldung ist von vor dem Spieltisch.</p>
        </div>
      )}

      {own.decks.length === 0 && (
        <div className="card mb-6" style={{ borderLeft: '4px solid var(--gold)' }}>
          <p className="text-sm text-fg leading-relaxed">
            Du hast noch kein eigenes Deck hier. Lade deine Sammlung hoch (<a href="/upload" className="underline">Sammlung</a>) –
            oder lass dir von einem Mitspieler ein Deck leihen, dann kannst du es in der Lobby auswählen.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Offene Lobbys</h2>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {status === 'SUBSCRIBED' ? 'live' : status === 'connecting' ? 'verbinde …' : 'Verbindung gestört – Seite neu laden'}
            </span>
          </div>

          {lobbies.length === 0 ? (
            <div className="card">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Gerade ist keine Lobby offen. Öffne rechts eine – sie erscheint hier sofort bei allen.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lobbies.map(lobby => {
                const players = lobby.players || []
                const full = players.length >= lobby.maxPlayers
                return (
                  <li key={lobby.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-fg">{lobby.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Gastgeber {lobby.hostName} · <span className="tabular-nums">{players.length}/{lobby.maxPlayers}</span> Spieler
                      </div>
                      {players.length > 0 && (
                        <div className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {players.map(player => `${player.name}${player.commander ? ` (${player.commander})` : ''}`).join(' · ')}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/spieltisch/${lobby.id}`)}
                      disabled={full}
                      className="btn-primary text-sm px-5 min-h-[44px] flex-shrink-0"
                    >
                      {full ? 'Voll' : 'Beitreten'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <form onSubmit={createLobby} className="card space-y-4">
          <h2 className="text-lg font-bold">Lobby öffnen</h2>
          <label className="block">
            <span className="text-sm block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full text-fg rounded-xl p-2.5 text-sm" />
          </label>
          <div>
            <span className="text-sm block mb-1" style={{ color: 'var(--color-text-secondary)' }}>Spieler</span>
            <div className="flex gap-2">
              {MAX_PLAYERS_CHOICES.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxPlayers(n)}
                  className="flex-1 min-h-[40px] text-sm font-semibold tabular-nums"
                  aria-pressed={maxPlayers === n}
                  style={{
                    background: maxPlayers === n ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: maxPlayers === n ? 'var(--color-bg)' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-1" />
            <span>Privat – nicht in der Liste, nur per Link</span>
          </label>
          <button type="submit" className="btn-primary w-full min-h-[44px]" disabled={!user.playerId}>Lobby öffnen</button>
        </form>
      </div>
    </div>
  )
}
