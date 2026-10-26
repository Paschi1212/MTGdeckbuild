import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLobby, hostingSettings } from '../lib/table/lobby'
import { firstName } from '../lib/table/players'
import { saveGameRecord } from '../lib/table/game'
import { useDraft } from '../lib/draft/useDraft'
import { MODES, ROUNDS, byRarity, sortPool } from '../lib/draft/packs'
import { HoverPreview } from '../components/table/TableCard'
import ManaCost from '../components/ManaCost'
import DraftDeckBuilder from '../components/draft/DraftDeckBuilder'
import DraftPod from '../components/draft/DraftPod'
import PoolStats from '../components/draft/PoolStats'
import { secondsForPick } from '../lib/draft/engine'

const RARITY_LABEL = { m: 'Mythic', r: 'Rare', u: 'Uncommon', c: 'Common' }

// /draft/:id — lobby, then picking boosters, then deck building, then off to the game table.
export default function DraftPage({ user }) {
  const { draftId } = useParams()
  const navigate = useNavigate()
  const me = useMemo(() => ({ playerId: user.playerId, name: firstName(user.name) }), [user])
  const hosting = useMemo(() => hostingSettings(draftId), [draftId])
  const isHost = Boolean(hosting)
  const draft = useDraft(draftId, me, { isHost })
  const [preview, setPreview] = useState(null)
  const onHover = useCallback((card, event) => setPreview(card && event ? { card, x: event.clientX, y: event.clientY } : null), [])

  // The host sent everyone to the game table: this player's built deck goes along.
  useEffect(() => {
    if (!draft.toTable) return
    const { seats, startedAt, startingLife, decks } = draft.toTable
    const myDeck = decks?.[me.playerId] || JSON.parse(localStorage.getItem(`mtg_draft_built:${draftId}`) || 'null')
    saveGameRecord(draftId, { seats, startedAt, events: [], startingLife, myDeck })
    navigate(`/spieltisch/${draftId}`)
  }, [draft.toTable, draftId, me.playerId, navigate])

  if (!user.playerId) return <p className="text-fg-muted">Bitte einmal ab- und wieder anmelden.</p>

  return (
    <div className="max-w-6xl mx-auto">
      {!draft.view
        ? <DraftLobby draftId={draftId} me={me} hosting={hosting} draft={draft} />
        : draft.view.phase === 'drafting'
          ? <DraftBoard view={draft.view} meId={me.playerId} onPick={draft.pickCards} onHover={onHover} />
          : <DraftDeckBuilder draftId={draftId} me={me} view={draft.view} isHost={isHost} draft={draft} onHover={onHover} settings={hosting} />}
      <HoverPreview preview={preview} />
    </div>
  )
}

function DraftLobby({ draftId, me, hosting, draft }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const onStart = useCallback(async (payload) => {
    if (!hosting) { setStarting(true); return }
    setStarting(true)
    setError(null)
    try {
      await draft.begin({
        seats: payload.seats.map(seat => seat.playerId),
        names: Object.fromEntries(payload.seats.map(seat => [seat.playerId, seat.name])),
        settings: hosting
      })
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }, [hosting, draft])
  const { members, status, update, start, lobby } = useLobby(draftId, me, { hosting, onStart })
  // Everyone in the room drafts: no deck to choose before.
  useEffect(() => { update({ deck: { label: 'Draft' }, ready: true }) }, [update])

  const settings = hosting || lobby
  // Bots fill the free seats up to settings.botsTo (they only draft).
  const bots = Math.max(0, Math.min(8, settings?.botsTo || 0) - members.length)
  const info = MODES[settings?.mode] || MODES.normal
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="mb-1">{settings?.name || 'Draft'}</h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {info.label}
        {settings?.timer ? ' · mit Pick-Timer' : ''}
        {settings?.botsTo ? ` · Bots füllen auf ${settings.botsTo} auf` : ''}
        {status !== 'SUBSCRIBED' && ' · verbinde …'}
      </p>

      {/* The three boosters, each with its edition's symbol. */}
      {settings?.setNames && (
        <ol className="grid grid-cols-3 gap-2 mb-5">
          {settings.setNames.map((setName, index) => (
            <li key={index} className="card flex items-center gap-3" style={{ padding: '0.75rem 1rem' }}>
              {settings.setIcons?.[index]
                ? <span aria-hidden="true" className="block w-7 h-7 flex-shrink-0" style={{ background: 'var(--color-text)', WebkitMask: `url(${settings.setIcons[index]}) center / contain no-repeat`, mask: `url(${settings.setIcons[index]}) center / contain no-repeat` }} />
                : null}
              <span className="min-w-0">
                <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Booster {index + 1}</span>
                <span className="block text-sm font-semibold text-fg truncate">{setName}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Am Tisch <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{members.length}/{settings?.maxPlayers || 8}</span></h2>
          <button type="button" onClick={copyLink} className="btn-secondary text-sm px-4 min-h-[40px]">{copied ? 'Link kopiert' : 'Link kopieren'}</button>
        </div>
        <DraftPod
          seats={[
            ...members.map(member => ({ playerId: member.playerId, name: member.name })),
            ...Array.from({ length: bots }, (_, index) => ({ playerId: `bot-preview-${index}`, name: 'Bot', bot: true })),
            ...Array.from({ length: Math.max(0, Math.min(8, settings?.maxPlayers || 8) - members.length - bots) }, (_, index) => ({ playerId: `free-${index}`, empty: true }))
          ]}
          meId={me.playerId}
          size={250}
          caption={bots ? `${bots} Bots setzen sich beim Start auf freie Plätze.` : 'Die Sitzordnung wird beim Start ausgelost.'}
        />
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {info.picksPerTurn === 2 ? 'Pro Pick nimmst du 2 Karten. ' : ''}
          Die Booster gehen in Runde 1 und 3 nach links, in Runde 2 nach rechts. Danach baust du aus deinem Pool ein Deck
          (mind. {info.minDeck} Karten{info.picksPerTurn === 2 ? ' mit Commander' : ''}, Standardländer frei) und es geht an den Spieltisch.
        </p>
        {error && <p className="text-sm" style={{ color: 'var(--r)' }}>Booster konnten nicht geöffnet werden: {error}</p>}
        {hosting ? (
          <button type="button" onClick={start} disabled={starting || members.length + bots < 2} className="btn-primary w-full min-h-[44px]">
            {starting
              ? 'Öffne die Booster …'
              : members.length + bots < 2
                ? 'Warte auf Mitspieler …'
                : `Draft mit ${members.length} ${members.length === 1 ? 'Spieler' : 'Spielern'}${bots ? ` + ${bots} Bots` : ''} starten`}
          </button>
        ) : (
          <p className="text-sm font-semibold text-fg">{starting ? 'Die Booster werden geöffnet …' : 'Warte, bis der Gastgeber startet …'}</p>
        )}
      </section>
    </div>
  )
}

// The pick timer as a bar that runs out (gold, red in the last 10 seconds).
function TimerBar({ deadline, total }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!deadline) return undefined
    const timer = setInterval(() => setTick(t => t + 1), 250)
    return () => clearInterval(timer)
  }, [deadline])
  if (!deadline || !total) return null
  const left = Math.max(0, (deadline - Date.now()) / 1000)
  const share = Math.min(1, left / total)
  const urgent = left <= 10
  return (
    <div className="flex items-center gap-2 min-w-[140px]" aria-label={`Noch ${Math.ceil(left)} Sekunden`}>
      <span className="flex-1 h-1.5" style={{ background: 'var(--color-bg)', borderRadius: 2 }}>
        <span className="block h-1.5" style={{ width: `${share * 100}%`, background: urgent ? 'var(--r)' : 'var(--gold)', borderRadius: 2, transition: 'width 0.25s linear' }} />
      </span>
      <span className="tabular-nums text-sm font-bold w-9 text-right" style={{ color: urgent ? 'var(--r)' : 'var(--color-text)' }}>{Math.ceil(left)} s</span>
    </div>
  )
}

// Three boosters: opened (done), the one in play, still sealed.
function BoosterProgress({ round }) {
  return (
    <span className="inline-flex gap-1 align-middle" aria-label={`Booster ${round + 1} von ${ROUNDS}`}>
      {Array.from({ length: ROUNDS }, (_, index) => (
        <span
          key={index}
          className="inline-block"
          style={{
            width: 10,
            height: 14,
            borderRadius: 2,
            background: index < round ? 'var(--color-text-muted)' : 'transparent',
            border: `1.5px solid ${index === round ? 'var(--gold)' : 'var(--color-text-muted)'}`
          }}
        />
      ))}
    </span>
  )
}

function DraftBoard({ view, meId, onPick, onHover }) {
  const info = MODES[view.mode]
  const want = Math.min(info.picksPerTurn, view.pack?.cards.length || 0)
  const [selected, setSelected] = useState([])
  useEffect(() => setSelected([]), [view.pack?.id])

  const toggle = (uid) => setSelected(prev => (prev.includes(uid)
    ? prev.filter(id => id !== uid)
    : want === 1 ? [uid] : prev.length < want ? [...prev, uid] : [...prev.slice(1), uid]))
  const confirm = (uids = selected) => { if (uids.length === want && view.pack) onPick(view.pack.id, uids) }
  const picksPerPack = Math.ceil(info.packSize / info.picksPerTurn)
  const total = secondsForPick(view.mode, view.pickNumber - 1)
  const waitingFor = view.table.find(seat => seat.holding > 0 && seat.playerId !== meId && view.table.findIndex(s => s.playerId === meId) === (view.table.findIndex(s => s.playerId === seat.playerId) + view.direction + view.table.length) % view.table.length)

  return (
    <div>
      <div
        className="sticky z-30 mb-4 px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2"
        style={{ top: 'var(--nav-h, 0px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
      >
        <div className="min-w-0">
          <div className="text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
            {info.label} <BoosterProgress round={view.round} />
          </div>
          <div className="font-bold text-fg">
            Booster {view.round + 1} · Pick <span className="tabular-nums">{Math.min(view.pickNumber, picksPerPack)}</span>
            <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}> von {picksPerPack}</span>
          </div>
        </div>
        {view.pack && <TimerBar deadline={view.deadline} total={total} />}
        {view.pack && (
          <button type="button" onClick={() => confirm()} disabled={selected.length !== want} className="btn-primary text-sm px-5 min-h-[44px]">
            {selected.length === want ? (want === 2 ? '2 Karten picken' : 'Picken') : want === 2 ? `Noch ${want - selected.length} wählen` : 'Karte wählen'}
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
        <section>
          {view.pack ? (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                {view.pack.cards.length} Karten im Booster{view.waiting ? ` · ${view.waiting} weitere warten auf dich` : ''} ·{' '}
                {want === 2 ? 'zwei Karten anklicken, dann „2 Karten picken“' : 'anklicken und „Picken“ – oder doppelklicken'}
              </p>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {[...view.pack.cards].sort(byRarity).map(card => {
                  const order = selected.indexOf(card.uid)
                  const on = order >= 0
                  const dimmed = selected.length === want && !on
                  return (
                    <button
                      key={card.uid}
                      type="button"
                      onClick={() => toggle(card.uid)}
                      onDoubleClick={() => { if (want === 1) confirm([card.uid]) }}
                      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ image: card.img, name: card.n }, e) }}
                      onPointerMove={(e) => { if (e.pointerType === 'mouse') onHover({ image: card.img, name: card.n }, e) }}
                      onPointerLeave={() => onHover(null)}
                      aria-pressed={on}
                      title={`${card.n} · ${RARITY_LABEL[card.r]}`}
                      className="relative block text-left"
                      style={{ outline: on ? '3px solid var(--gold)' : 'none', outlineOffset: 2, borderRadius: 9, transition: 'opacity 0.15s ease' }}
                    >
                      {card.img
                        ? <img src={card.img} alt={card.n} loading="lazy" className="w-full block" style={{ borderRadius: 9, opacity: dimmed ? 0.45 : 1 }} />
                        : <span className="flex items-center justify-center text-center text-xs p-2 aspect-[5/7]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 9 }}>{card.n}</span>}
                      {on && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[11px] font-bold px-2 py-0.5 whitespace-nowrap" style={{ background: 'var(--gold)', color: '#1d1f24', borderRadius: 3 }}>
                          {want === 2 ? `Pick ${order + 1}/2` : 'Pick'}
                        </span>
                      )}
                      {card.leg && view.mode === 'commander' && (
                        <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1" style={{ background: '#1d1f24', color: 'var(--gold)', borderRadius: 3 }}>Legende</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="card flex items-center gap-4">
              <span className="text-3xl" style={{ color: 'var(--gold)' }} aria-hidden="true">{view.direction === -1 ? '↺' : '↻'}</span>
              <div>
                <p className="font-semibold text-fg">Warte auf den nächsten Booster …</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {waitingFor ? `${waitingFor.name.replace(' (Bot)', '')} pickt noch.` : 'Der nächste Booster ist noch unterwegs.'} Sieh dir solange deinen Pool an.
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky" style={{ top: 'calc(var(--nav-h, 0px) + 6rem)' }}>
          <div className="card">
            <DraftPod seats={view.table} meId={meId} direction={view.direction} round={view.round} size={210} />
          </div>
          <div className="card">
            <PoolStats cards={view.pool} title={`Dein Pool · ${view.pool.length} Karten`} />
            {view.pool.length === 0 && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Noch nichts gepickt.</p>}
          </div>
          {view.pool.length > 0 && <PoolList cards={view.pool} onHover={onHover} />}
        </aside>
      </div>
    </div>
  )
}

function PoolList({ cards, onHover }) {
  return (
    <div className="card">
      <ul className="text-sm space-y-0.5 max-h-[40vh] overflow-y-auto">
        {sortPool(cards).map(card => (
          <li
            key={card.uid}
            className="flex items-center justify-between gap-2"
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover({ image: card.img, name: card.n }, e) }}
            onPointerLeave={() => onHover(null)}
          >
            <span className="truncate text-fg">{card.n}</span>
            {card.mc ? <ManaCost cost={card.mc} size={13} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
