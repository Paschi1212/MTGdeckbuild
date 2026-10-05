import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useLobby, hostingSettings, forgetHosting } from '../lib/table/lobby'
import { useGame, loadGameRecord, saveGameRecord, nextTurn, nextStep, TURN_STEPS } from '../lib/table/game'
import { loadOwnDecks, fetchBorrowedDecks, loadCommanderCard, deckCardCount, artCrop } from '../lib/table/decks'
import { firstName, rememberPlayers } from '../lib/table/players'
import PlayerPanel from '../components/table/PlayerPanel'
import GameLog from '../components/table/GameLog'
import OpponentBoard from '../components/table/OpponentBoard'
import MyArea from '../components/table/MyArea'
import { HoverPreview } from '../components/table/TableCard'
import { useOwnBoards } from '../lib/table/board'
import { OrderList, TurnOrderButton } from '../components/table/TurnOrder'
import PhaseBar from '../components/table/PhaseBar'

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
  const { record, state, online, status, dispatch, boards: publicBoards, publishBoard, practice } = useGame(lobbyId, me)
  const [waitedLong, setWaitedLong] = useState(false)
  const [detailsFor, setDetailsFor] = useState(null)
  const [showLog, setShowLog] = useState(() => window.innerWidth >= 1600)
  const [preview, setPreview] = useState(null)
  const seats = useMemo(() => record?.seats || [], [record])

  // The boards this browser plays: your seat online — every seat on the practice table.
  const controlled = useMemo(() => (practice
    ? seats.map(seat => ({ playerId: seat.playerId, deck: record?.decks?.[seat.playerId] }))
    : seats.filter(seat => seat.playerId === me.playerId).map(seat => ({ playerId: seat.playerId, deck: record?.myDeck }))
  ), [practice, seats, record, me.playerId])

  const onAction = useCallback((owner, result) => {
    if (result.note) dispatch('note', { text: result.note, by: owner })
    // Casting the commander from the command zone: the next cast costs 2 more.
    if (result.castCommander) dispatch('tax', { target: owner, delta: 2, by: owner })
  }, [dispatch])
  const { boards: ownBoards, act } = useOwnBoards(lobbyId, controlled, { publish: publishBoard, onAction })

  // The automatic steps of a turn, done by the browser that runs the active board: untap at the
  // start, draw on reaching the draw step (the starting player of a two-player game skips the
  // first draw — rule 103.7). Remembered per turn, so a reload never untaps or draws twice.
  const autoKey = `mtg_table_auto:${lobbyId}`
  const handled = useRef(null)
  if (!handled.current) {
    try { handled.current = new Set(JSON.parse(localStorage.getItem(autoKey) || '[]')) } catch { handled.current = new Set() }
  }
  const { turn } = state
  useEffect(() => {
    if (state.phase !== 'playing' || !turn.auto || !turn.key) return
    if (!controlled.some(seat => seat.playerId === turn.player)) return
    if (turn.step !== 'untap' && turn.step !== 'draw') return
    const key = `${turn.key}:${turn.step}`
    if (handled.current.has(key)) return
    handled.current.add(key)
    try { localStorage.setItem(autoKey, JSON.stringify([...handled.current].slice(-200))) } catch {}
    if (turn.step === 'untap') {
      act(turn.player, { type: 'untapAll', silent: true })
      dispatch('step', { step: 'upkeep', turnKey: turn.key, by: turn.player })
    } else {
      if (turn.firstTurn && seats.length <= 2) dispatch('note', { text: 'überspringt das erste Ziehen (Startspieler im Zweierspiel)', by: turn.player })
      else act(turn.player, { type: 'draw', count: 1 })
      dispatch('step', { step: 'main1', turnKey: turn.key, by: turn.player })
    }
  }, [state.phase, turn.auto, turn.key, turn.step, turn.player, turn.firstTurn, controlled, act, dispatch, seats.length, autoKey])

  // Practice: you sit at one seat at a time — by default the one whose turn it is.
  const [viewSeat, setViewSeat] = useState(null)
  const [followTurn, setFollowTurn] = useState(true)
  const activeId = state.turn.player || seats[0]?.playerId
  useEffect(() => { if (practice && followTurn && activeId) setViewSeat(activeId) }, [practice, followTurn, activeId])

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLong(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => { if (!practice) rememberPlayers(seats, me.playerId) }, [seats, me.playerId, practice])

  const onHover = useCallback((card, event) => setPreview(card && event ? { card, x: event.clientX, y: event.clientY } : null), [])

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
  const mySeatId = practice ? (viewSeat || activeId) : (seats.some(seat => seat.playerId === me.playerId) ? me.playerId : null)
  const mySeat = seats.find(seat => seat.playerId === mySeatId) || null
  // The others in turn order, starting after your seat.
  const seatOf = (playerId) => seats.find(seat => seat.playerId === playerId)
  const ordered = state.order.map(seatOf).filter(Boolean)
  const myIndex = ordered.findIndex(seat => seat.playerId === mySeatId)
  const others = myIndex >= 0 ? [...ordered.slice(myIndex + 1), ...ordered.slice(0, myIndex)] : ordered
  const active = seatOf(activeId) || seats[0]
  const nameOf = (playerId) => seatOf(playerId)?.name || '?'
  const setup = state.phase === 'setup'
  const detailsSeat = seats.find(seat => seat.playerId === detailsFor)
  // On the practice table you act as the seat you sit at (the log then names that seat).
  const seatDispatch = practice ? (type, fields) => dispatch(type, { by: mySeatId, ...fields }) : dispatch

  // "Zug abgeben": the next one in the turn order (cards may have changed it) is up.
  const passTurn = () => {
    const next = nextTurn(state)
    if (next) seatDispatch('turn', next)
  }
  const myTurn = !setup && (practice || active?.playerId === me.playerId)
  // Next step, or — in the end step — the next player.
  const upcoming = nextStep(turn.step)
  const advance = () => {
    if (!upcoming) passTurn()
    else seatDispatch('step', { step: upcoming, turnKey: turn.key })
  }
  const advanceLabel = upcoming ? `Weiter: ${TURN_STEPS.find(s => s.key === upcoming).label}` : 'Zug abgeben'
  const jumpTo = (step) => seatDispatch('step', { step, turnKey: turn.key })
  const allKept = seats.every(seat => state.players[seat.playerId]?.kept)
  const startGame = () => {
    seatDispatch('begin', { first: state.order[0], phases: true })
    if (practice) setFollowTurn(true) // after checking every opening hand: back to following the turn
  }
  const statusOf = (playerId) => {
    const mulligans = (practice ? ownBoards[playerId]?.mulligans : publicBoards[playerId]?.mulligans) || 0
    return `${state.players[playerId]?.kept ? '✓ behalten' : 'prüft Starthand'}${mulligans ? ` · ${mulligans} Mulligan` : ''}`
  }

  return (
    <div className="max-w-[1800px] mx-auto">
      <div
        className="sticky z-30 flex flex-wrap items-center justify-between gap-3 mb-3 px-4 py-2.5"
        style={{ top: 'var(--nav-h, 0px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
      >
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {practice ? 'Probetisch · ' : ''}
            {setup ? 'Vorbereitung' : <>Runde <span className="tabular-nums">{state.turn.round}</span><TurnOrderButton order={state.order} nameOf={nameOf} onSave={(order) => seatDispatch('order', { order })} /></>}
            {!practice && !mySeat && ' · du schaust zu'}
            {status !== 'SUBSCRIBED' && ' · Verbindung wird hergestellt …'}
          </div>
          <div className="font-bold text-fg truncate">
            {setup ? 'Starthände prüfen, Reihenfolge festlegen' : <>Am Zug: {active?.name}{active?.playerId === me.playerId && !practice && ' (du)'}</>}
          </div>
        </div>
        {!setup && (
          <div className="order-last basis-full">
            <PhaseBar step={turn.step} canControl={myTurn} onJump={jumpTo} />
          </div>
        )}
        {practice && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              Du sitzt bei
              <select value={mySeatId || ''} onChange={(e) => { setViewSeat(e.target.value); setFollowTurn(false) }} className="text-fg rounded-xl px-2 py-1.5 text-sm min-h-[40px]">
                {seats.map(seat => <option key={seat.playerId} value={seat.playerId}>{seat.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={followTurn} onChange={(e) => setFollowTurn(e.target.checked)} /> folgt dem Zug
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {setup && (mySeat || practice) && (
            <button type="button" onClick={startGame} className={allKept ? 'btn-primary text-sm px-5 min-h-[44px]' : 'btn-secondary text-sm px-5 min-h-[44px]'} title={allKept ? '' : 'Noch nicht alle haben ihre Starthand behalten'}>
              {allKept ? 'Spiel starten' : 'Trotzdem starten'}
            </button>
          )}
          {myTurn && <button type="button" onClick={advance} className="btn-primary text-sm px-5 min-h-[44px] whitespace-nowrap">{advanceLabel}</button>}
          {myTurn && upcoming && <button type="button" onClick={passTurn} className="btn-secondary text-sm px-4 min-h-[44px] whitespace-nowrap">Zug abgeben</button>}
          {!setup && !myTurn && mySeat && (
            // For when the active player stepped away and forgot.
            <button type="button" onClick={passTurn} className="text-xs underline px-1" style={{ color: 'var(--color-text-muted)' }}>Zug von {active?.name} beenden</button>
          )}
          <button type="button" onClick={() => setShowLog(v => !v)} className="btn-secondary text-sm px-4 min-h-[44px]" aria-pressed={showLog}>Verlauf</button>
          <button type="button" onClick={() => navigate('/spieltisch')} className="btn-secondary text-sm px-4 min-h-[44px]">Tisch verlassen</button>
        </div>
      </div>

      {setup && (
        <div className="mb-3 px-4 py-3 grid md:grid-cols-[minmax(0,420px)_1fr] gap-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--gold)', borderRadius: 'var(--radius-md)' }}>
          <div>
            <h2 className="text-sm font-bold mb-2 text-fg">Zugreihenfolge – wer oben steht, fängt an</h2>
            <OrderList order={state.order} nameOf={nameOf} statusOf={statusOf} onChange={(order) => seatDispatch('order', { order })} />
          </div>
          <p className="text-sm leading-relaxed self-center" style={{ color: 'var(--color-text-secondary)' }}>
            Jeder prüft unten seine Starthand und klickt <strong>Behalten</strong> oder <strong>Mulligan</strong>.
            Die Reihenfolge ist ausgelost – für Treachery z. B. den Leader nach oben schieben.
            {' '}Sind alle bereit, startet <strong>Spiel starten</strong> die erste Runde.
            {practice && ' Am Probetisch wechselst du oben über „Du sitzt bei“ zu den anderen Starthänden.'}
          </p>
        </div>
      )}

      <div className={showLog ? 'grid xl:grid-cols-[1fr_300px] gap-3 items-start' : ''}>
        <div className="flex flex-col gap-3 min-w-0">
          {others.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${others.length === 1 ? 560 : 380}px, 1fr))` }}>
              {others.map(seat => (
                <OpponentBoard
                  key={seat.playerId}
                  seat={seat}
                  seats={seats}
                  player={state.players[seat.playerId]}
                  snapshot={publicBoards[seat.playerId]}
                  isActive={seat.playerId === active?.playerId}
                  isMonarch={state.monarch === seat.playerId}
                  online={onlineIds.has(seat.playerId)}
                  dispatch={seatDispatch}
                  onDetails={() => setDetailsFor(seat.playerId)}
                  onHover={onHover}
                  compact={others.length > 3}
                />
              ))}
            </div>
          )}
          {mySeat && ownBoards[mySeat.playerId] && (
            <MyArea
              key={mySeat.playerId}
              seat={mySeat}
              seats={seats}
              player={state.players[mySeat.playerId]}
              board={ownBoards[mySeat.playerId]}
              act={(action) => act(mySeat.playerId, action)}
              isActive={mySeat.playerId === active?.playerId}
              isMonarch={state.monarch === mySeat.playerId}
              dispatch={seatDispatch}
              onDetails={() => setDetailsFor(mySeat.playerId)}
              onHover={onHover}
              label={practice ? mySeat.name : null}
              phase={state.phase}
              turnControls={myTurn && mySeat.playerId === active?.playerId ? { label: advanceLabel, onAdvance: advance, onPass: upcoming ? passTurn : null } : null}
            />
          )}
        </div>
        {showLog && (
          <div className="xl:sticky xl:max-h-[calc(100vh-9rem)] flex flex-col mt-3 xl:mt-0" style={{ top: 'calc(var(--nav-h, 0px) + 4.5rem)' }}>
            <GameLog log={state.log} seats={seats} />
          </div>
        )}
      </div>

      {detailsSeat && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(8,8,10,0.8)' }} onClick={() => setDetailsFor(null)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <PlayerPanel
              seat={detailsSeat}
              player={state.players[detailsSeat.playerId]}
              seats={seats}
              isMe={!practice && detailsSeat.playerId === me.playerId}
              isActive={detailsSeat.playerId === active?.playerId}
              isMonarch={state.monarch === detailsSeat.playerId}
              online={onlineIds.has(detailsSeat.playerId)}
              dispatch={seatDispatch}
            />
            <button type="button" onClick={() => setDetailsFor(null)} className="btn-secondary w-full mt-2 min-h-[44px]">Schließen</button>
          </div>
        </div>
      )}

      <HoverPreview preview={preview} />
    </div>
  )
}
