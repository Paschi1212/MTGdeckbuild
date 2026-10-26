import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLobbies } from '../lib/table/lobby'
import { firstName } from '../lib/table/players'
import { MODES } from '../lib/draft/packs'
import DraftSetup from '../components/draft/DraftSetup'

// "Draft": open drafts of everyone on the site, live — join one or open your own.
export default function DraftHubPage({ user }) {
  const navigate = useNavigate()
  const me = useMemo(() => ({ playerId: user.playerId, name: firstName(user.name) }), [user])
  const { lobbies, status } = useOpenLobbies(me)
  const drafts = lobbies.filter(lobby => lobby.kind === 'draft')

  return (
    <div className="max-w-5xl mx-auto">
      <h1>Draft</h1>
      <p className="mb-8 leading-relaxed max-w-3xl" style={{ color: 'var(--color-text-secondary)' }}>
        Booster öffnen, reihum picken, aus dem Pool ein Deck bauen – und dann direkt an den Spieltisch.
        Als normaler Draft oder als Commander-Draft wie bei Commander Legends, mit jeder Edition.
      </p>

      {!user.playerId && (
        <div className="card mb-6" style={{ borderLeft: '4px solid var(--gold)' }}>
          <p className="text-sm text-fg">Bitte einmal ab- und wieder anmelden – deine Anmeldung ist von vor dem Spieltisch.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Offene Drafts</h2>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {status === 'SUBSCRIBED' ? 'live' : status === 'connecting' ? 'verbinde …' : 'Verbindung gestört – Seite neu laden'}
            </span>
          </div>

          {drafts.length === 0 ? (
            <div className="card">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Gerade ist kein Draft offen. Öffne rechts einen – er erscheint hier sofort bei allen.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {drafts.map(lobby => {
                const players = lobby.players || []
                const full = players.length >= lobby.maxPlayers
                const sets = [...new Set(lobby.setNames || [])]
                return (
                  <li key={lobby.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-fg">
                        {lobby.name}
                        <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 align-middle" style={{ border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 'var(--radius-sm)' }}>
                          {MODES[lobby.mode]?.label || 'Draft'}
                        </span>
                      </div>
                      {sets.length > 0 && <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{sets.join(' · ')}</div>}
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Gastgeber {lobby.hostName} · <span className="tabular-nums">{players.length}/{lobby.maxPlayers}</span> Spieler
                        {players.length > 0 && ` · ${players.map(player => player.name).join(', ')}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/draft/${lobby.id}`)}
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

        <DraftSetup me={me} disabled={!user.playerId} />
      </div>
    </div>
  )
}
