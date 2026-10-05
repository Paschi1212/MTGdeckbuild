import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLobby, hostingSettings, forgetHosting } from '../lib/table/lobby'
import { useGame, loadGameRecord, saveGameRecord } from '../lib/table/game'
import { loadOwnDecks, fetchBorrowedDecks, loadCommanderCard, deckCardCount, artCrop } from '../lib/table/decks'
import { firstName, rememberPlayers } from '../lib/table/players'
import PlayerPanel from '../components/table/PlayerPanel'
import GameLog from '../components/table/GameLog'

// /spieltisch/:lobbyId — the lobby until the host starts, then the game for everyone.
export default function TableRoomPage({ user }) {
  const { lobbyId } = useParams()
  const me = useMemo(() => ({ playerId: user.playerId, name: firstName(user.name) }), [user])
  const [phase, setPhase] = useState(() => (loadGameRecord(lobbyId) ? 'game' : 'lobby'))

  if (phase === 'game') return <GameView lobbyId={lobbyId} me={me} />
  return <LobbyView lobbyId={lobbyId} me={me} onStarted={() => setPhase('game')} onSpectate={() => setPhase('game')} />
}

// ── Lobby ─────────────────────────────────────────────────────────────────────────────────

const SOURCE_GROUPS = [
  ['manabox', 'Deine Decks (ManaBox)'],
  ['draft', 'Deine Entwürfe'],
  ['borrowed', 'Geliehen']
]

function CommanderThumb({ image, size = 'md' }) {
  const art = artCrop(image)
  const cls = size === 'sm' ? 'w-10 h-7' : 'w-14 h-10'
  return art
    ? <img src={art} alt="" className={`${cls} object-cover flex-shrink-0`} style={{ borderRadius: 4 }} />
    : <span className={`${cls} flex-shrink-0`} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4 }} />
}

function LobbyView({ lobbyId, me, onStarted, onSpectate }) {
  const navigate = useNavigate()
  const hosting = useMemo(() => hostingSettings(lobbyId), [lobbyId])
  const own = useMemo(() => loadOwnDecks(), [])
  const [borrowed, setBorrowed] = useState([])
  const [deckKey, setDeckKey] = useState('')
  const [commanderCard, setCommanderCard] = useState(null)
  const [copied, setCopied] = useState(false)
  const [waitedLong, setWaitedLong] = useState(false)
  const decks = useMemo(() => [...own.decks, ...borrowed], [own, borrowed])
  const selected = decks.find(deck => deck.key === deckKey) || null

  // A friend may lend a deck while this lobby is open — keep the list current.
  useEffect(() => {
    const refresh = () => fetchBorrowedDecks().then(setBorrowed)
    refresh()
    const timer = setInterval(refresh, 20000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setWaitedLong(true), 6000)
    return () => clearTimeout(timer)
  }, [])

  const handleStart = (payload) => {
    const mySeat = payload.seats.find(seat => seat.playerId === me.playerId)
    saveGameRecord(lobbyId, {
      seats: payload.seats,
      startedAt: payload.startedAt,
      events: [],
      // The full list of the deck this player brought — for the card table (step 2).
      myDeck: mySeat && selected ? { label: selected.label, commander: selected.commander, cards: selected.cards } : null
    })
    forgetHosting(lobbyId)
    onStarted()
  }

  const { members, status, mine, update, start, host, lobby } = useLobby(lobbyId, me, { hosting, onStart: handleStart })

  useEffect(() => { rememberPlayers(members, me.playerId) }, [members, me.playerId])

  // Picking a deck: show its commander and tell the others (without the card list).
  useEffect(() => {
    let cancelled = false
    setCommanderCard(null)
    if (!selected) { update({ deck: null, ready: false }); return undefined }
    loadCommanderCard(selected.commander).then(card => {
      if (cancelled) return
      setCommanderCard(card)
      update({
        deck: {
          label: selected.label,
          source: selected.source,
          ownerName: selected.ownerName || null,
          commander: card?.name || selected.commander || '',
          commanderImage: card?.image || null,
          colorIdentity: card?.colorIdentity || [],
          count: deckCardCount(selected)
        },
        ready: false
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey, selected?.commander])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the address bar has the link too.
    }
  }

  const leave = () => {
    forgetHosting(lobbyId)
    navigate('/spieltisch')
  }

  const isHost = Boolean(hosting)
  const maxPlayers = lobby?.maxPlayers || hosting?.maxPlayers || 6
  const myIndex = members.findIndex(member => member.playerId === me.playerId)
  const overCapacity = myIndex >= maxPlayers
  const readyCount = members.filter(member => member.ready).length
  const canReady = Boolean(selected && (commanderCard?.name || selected.commander) && deckCardCount(selected) > 0)

  // Nobody hosts this lobby (any more): wrong link, host left, or the game already runs.
  if (!isHost && !host && waitedLong && status === 'SUBSCRIBED') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>Lobby nicht gefunden</h1>
        <p className="mb-6 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Diese Lobby ist geschlossen – der Gastgeber hat sie verlassen – oder die Partie läuft schon.
          Läuft sie schon, kannst du zuschauen.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onSpectate} className="btn-primary min-h-[44px] px-5">Zuschauen</button>
          <Link to="/spieltisch" className="btn-secondary min-h-[44px] px-5 inline-flex items-center">Zu den offenen Lobbys</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="mb-1">{lobby?.name || hosting?.name || 'Lobby'}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {lobby?.hostName ? `Gastgeber ${lobby.hostName}` : 'Verbinde …'} · <span className="tabular-nums">{Math.min(members.length, maxPlayers)}/{maxPlayers}</span> Spieler
            {lobby?.private && ' · privat'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copyLink} className="btn-secondary text-sm px-4 min-h-[44px]">{copied ? '✓ Link kopiert' : 'Link kopieren'}</button>
          <button type="button" onClick={leave} className="btn-secondary text-sm px-4 min-h-[44px]">Verlassen</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <section className="card">
          <h2 className="text-lg font-bold mb-3">Am Tisch</h2>
          {members.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Verbinde …</p>
          ) : (
            <ul>
              {members.map((member, index) => (
                <li key={member.playerId} className="flex items-center gap-3 py-2.5" style={{ borderTop: index ? '1px solid var(--color-border)' : 'none', opacity: index >= maxPlayers ? 0.5 : 1 }}>
                  <CommanderThumb image={member.deck?.commanderImage} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-fg leading-tight">
                      {member.name}
                      {member.isHost && <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}> · Gastgeber</span>}
                      {member.playerId === me.playerId && <span className="font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}> · du</span>}
                    </div>
                    <div className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {member.deck
                        ? <>{member.deck.commander || 'ohne Commander'} · {member.deck.label}{member.deck.ownerName && ` (geliehen von ${member.deck.ownerName})`}</>
                        : 'wählt noch ein Deck'}
                    </div>
                  </div>
                  <span className="text-sm font-semibold flex-shrink-0" style={{ color: index >= maxPlayers ? 'var(--color-text-muted)' : member.ready ? 'var(--g)' : 'var(--color-text-muted)' }}>
                    {index >= maxPlayers ? 'kein Platz' : member.ready ? 'bereit' : 'nicht bereit'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isHost && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button type="button" onClick={start} disabled={readyCount < 2} className="btn-primary w-full min-h-[48px]">
                Partie starten{readyCount >= 2 ? ` (${Math.min(readyCount, maxPlayers)} Spieler)` : ''}
              </button>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                {readyCount < 2
                  ? 'Sobald mindestens zwei Spieler bereit sind, kannst du starten.'
                  : readyCount < members.length ? 'Wer nicht bereit ist, schaut zu.' : 'Alle sind bereit. Die Sitzreihenfolge wird ausgelost.'}
              </p>
            </div>
          )}
          {!isHost && host && (
            <p className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>{lobby?.hostName || 'Der Gastgeber'} startet die Partie, sobald alle bereit sind.</p>
          )}
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-bold">Dein Deck</h2>
          {overCapacity && (
            <p className="text-sm" style={{ color: 'var(--r)' }}>Die Lobby ist voll – du kannst zuschauen, sobald die Partie läuft.</p>
          )}
          {decks.length === 0 ? (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Du hast noch kein Deck hier. <Link to="/upload" className="underline">Sammlung hochladen</Link> oder dir von einem
              Mitspieler ein Deck leihen lassen – geliehene Decks erscheinen hier automatisch.
            </p>
          ) : (
            <select
              value={deckKey}
              onChange={(e) => setDeckKey(e.target.value)}
              className="w-full text-fg rounded-xl p-2.5 text-sm min-h-[44px]"
              aria-label="Deck wählen"
            >
              <option value="">Deck wählen …</option>
              {SOURCE_GROUPS.map(([source, label]) => {
                const group = decks.filter(deck => deck.source === source)
                if (!group.length) return null
                return (
                  <optgroup key={source} label={label}>
                    {group.map(deck => (
                      <option key={deck.key} value={deck.key}>
                        {deck.label}{deck.commander ? ` – ${deck.commander}` : ''}{deck.ownerName ? ` (von ${deck.ownerName})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          )}

          {selected && (
            <div className="flex items-center gap-3">
              <CommanderThumb image={commanderCard?.image} />
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-fg truncate">{commanderCard?.name || selected.commander || 'Kein Commander festgelegt'}</div>
                <div style={{ color: 'var(--color-text-muted)' }}><span className="tabular-nums">{deckCardCount(selected)}</span> Karten</div>
              </div>
            </div>
          )}
          {selected && !selected.commander && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--r)' }}>
              Für dieses Deck ist noch kein Commander gemerkt.{' '}
              {selected.source === 'manabox' && <Link to={`/decks/${encodeURIComponent(selected.label)}`} className="underline">Auf der Deck-Seite festlegen</Link>}
            </p>
          )}

          <button
            type="button"
            onClick={() => update({ ready: !mine.ready })}
            disabled={!canReady || overCapacity}
            className={mine.ready ? 'btn-secondary w-full min-h-[48px]' : 'btn-primary w-full min-h-[48px]'}
          >
            {mine.ready ? 'Doch nicht bereit' : 'Bereit'}
          </button>
        </section>
      </div>
    </div>
  )
}

// ── Game ──────────────────────────────────────────────────────────────────────────────────

function GameView({ lobbyId, me }) {
  const navigate = useNavigate()
  const { record, state, online, status, dispatch } = useGame(lobbyId, me)
  const [waitedLong, setWaitedLong] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaitedLong(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  const seats = record?.seats || []
  useEffect(() => { rememberPlayers(seats, me.playerId) }, [seats, me.playerId])

  if (!seats.length) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>{waitedLong ? 'Keine laufende Partie gefunden' : 'Verbinde mit der Partie …'}</h1>
        {waitedLong && (
          <>
            <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>Niemand von dieser Partie ist gerade online.</p>
            <Link to="/spieltisch" className="btn-secondary min-h-[44px] px-5 inline-flex items-center">Zu den offenen Lobbys</Link>
          </>
        )}
      </div>
    )
  }

  const onlineIds = new Set(online.map(entry => entry.playerId))
  const seated = seats.some(seat => seat.playerId === me.playerId)
  // Table order, but starting with your own seat.
  const myIndex = seats.findIndex(seat => seat.playerId === me.playerId)
  const ordered = myIndex > 0 ? [...seats.slice(myIndex), ...seats.slice(0, myIndex)] : seats
  const active = seats[state.turn.seat] || seats[0]

  const endTurn = () => {
    let next = state.turn.seat
    let round = state.turn.round
    for (let step = 0; step < seats.length; step++) {
      next = (next + 1) % seats.length
      if (next === 0) round += 1
      if (!state.players[seats[next].playerId]?.out) break
    }
    dispatch('turn', { seat: next, round, activePlayer: seats[next].playerId })
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      <div
        className="sticky z-20 flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3"
        style={{ top: 'var(--nav-h, 0px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
      >
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Runde <span className="tabular-nums">{state.turn.round}</span>
            {!seated && ' · du schaust zu'}
            {status !== 'SUBSCRIBED' && ' · Verbindung wird hergestellt …'}
          </div>
          <div className="font-bold text-fg truncate">Am Zug: {active?.name}{active?.playerId === me.playerId && ' (du)'}</div>
        </div>
        <div className="flex gap-2">
          {seated && <button type="button" onClick={endTurn} className="btn-primary text-sm px-5 min-h-[44px]">Zug beenden</button>}
          <button type="button" onClick={() => navigate('/spieltisch')} className="btn-secondary text-sm px-4 min-h-[44px]">Tisch verlassen</button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="grid md:grid-cols-2 gap-4">
          {ordered.map(seat => (
            <PlayerPanel
              key={seat.playerId}
              seat={seat}
              player={state.players[seat.playerId]}
              seats={seats}
              isMe={seat.playerId === me.playerId}
              isActive={seat.playerId === active?.playerId}
              isMonarch={state.monarch === seat.playerId}
              online={onlineIds.has(seat.playerId)}
              dispatch={dispatch}
            />
          ))}
        </div>
        <div className="xl:sticky xl:max-h-[calc(100vh-10rem)] flex flex-col" style={{ top: 'calc(var(--nav-h, 0px) + 5.5rem)' }}>
          <GameLog log={state.log} seats={seats} />
        </div>
      </div>
    </div>
  )
}
