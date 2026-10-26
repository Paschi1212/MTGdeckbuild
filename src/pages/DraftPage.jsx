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
          ? <DraftBoard view={draft.view} onPick={draft.pickCards} onHover={onHover} />
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
  const info = MODES[settings?.mode] || MODES.normal
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="mb-1">{settings?.name || 'Draft'}</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {info.label} · {settings?.setNames ? (new Set(settings.setNames).size === 1 ? settings.setNames[0] : settings.setNames.join(' · ')) : 'Editionen …'}
        {settings?.timer ? ' · mit Pick-Timer' : ''}
        {status !== 'SUBSCRIBED' && ' · verbinde …'}
      </p>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Am Tisch <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{members.length}/{settings?.maxPlayers || 8}</span></h2>
          <button type="button" onClick={copyLink} className="btn-secondary text-sm px-4 min-h-[40px]">{copied ? 'Link kopiert' : 'Link kopieren'}</button>
        </div>
        <ul className="space-y-1.5">
          {members.map(member => (
            <li key={member.playerId} className="text-sm text-fg">
              {member.name}{member.playerId === me.playerId ? ' (du)' : ''}{member.isHost ? <span style={{ color: 'var(--color-text-muted)' }}> · Gastgeber</span> : null}
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {info.picksPerTurn === 2 ? 'Pro Pick nimmst du 2 Karten. ' : ''}
          Die Booster gehen in Runde 1 und 3 nach links, in Runde 2 nach rechts. Danach baust du aus deinem Pool ein Deck
          (mind. {info.minDeck} Karten{info.picksPerTurn === 2 ? ' mit Commander' : ''}, Standardländer frei) und es geht an den Spieltisch.
        </p>
        {error && <p className="text-sm" style={{ color: 'var(--r)' }}>Booster konnten nicht geöffnet werden: {error}</p>}
        {hosting ? (
          <button type="button" onClick={start} disabled={starting || members.length < 2} className="btn-primary w-full min-h-[44px]">
            {starting ? 'Öffne die Booster …' : members.length < 2 ? 'Warte auf Mitspieler …' : `Draft mit ${members.length} Spielern starten`}
          </button>
        ) : (
          <p className="text-sm font-semibold text-fg">{starting ? 'Die Booster werden geöffnet …' : 'Warte, bis der Gastgeber startet …'}</p>
        )}
      </section>
    </div>
  )
}

function Countdown({ deadline }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!deadline) return undefined
    const timer = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(timer)
  }, [deadline])
  if (!deadline) return null
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  return (
    <span className="tabular-nums font-bold" style={{ color: left <= 10 ? 'var(--r)' : 'var(--color-text)' }}>
      ⏱ {left} s
    </span>
  )
}

function DraftBoard({ view, onPick, onHover }) {
  const info = MODES[view.mode]
  const want = Math.min(info.picksPerTurn, view.pack?.cards.length || 0)
  const [selected, setSelected] = useState([])
  useEffect(() => setSelected([]), [view.pack?.id])

  const toggle = (uid) => setSelected(prev => (prev.includes(uid)
    ? prev.filter(id => id !== uid)
    : want === 1 ? [uid] : prev.length < want ? [...prev, uid] : [...prev.slice(1), uid]))
  const confirm = (uids = selected) => { if (uids.length === want && view.pack) onPick(view.pack.id, uids) }
  const passTo = view.direction === -1 ? 'rechts' : 'links'

  return (
    <div>
      <div
        className="sticky z-30 flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-2.5"
        style={{ top: 'var(--nav-h, 0px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
      >
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{info.label} · Booster geht nach {passTo}</div>
          <div className="font-bold text-fg">Runde {view.round + 1}/{ROUNDS} · Pick {view.pickNumber}</div>
        </div>
        <Countdown deadline={view.pack ? view.deadline : null} />
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {view.table.map(seat => (
            <span key={seat.playerId} className="px-2 py-1" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} title={`${seat.picked} Karten gepickt`}>
              {seat.name} <span className="tabular-nums" style={{ color: seat.holding ? 'var(--color-text)' : 'var(--color-text-muted)' }}>{seat.holding ? `· ${seat.holding} Booster` : '· wartet'}</span>
            </span>
          ))}
        </div>
        {view.pack && (
          <button type="button" onClick={() => confirm()} disabled={selected.length !== want} className="btn-primary text-sm px-5 min-h-[44px]">
            {selected.length === want ? (want === 2 ? '2 Karten picken' : 'Picken') : want === 2 ? `Noch ${want - selected.length} wählen` : 'Karte wählen'}
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
        <section>
          {view.pack ? (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                {view.pack.cards.length} Karten im Booster{view.waiting ? ` · ${view.waiting} weitere warten auf dich` : ''} ·
                {want === 2 ? ' zwei Karten anklicken, dann „2 Karten picken“' : ' anklicken und „Picken“ – oder doppelklicken'}
              </p>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' }}>
                {[...view.pack.cards].sort(byRarity).map(card => {
                  const on = selected.includes(card.uid)
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
                      style={{ outline: on ? '3px solid var(--gold)' : 'none', outlineOffset: 2, borderRadius: 8 }}
                    >
                      {card.img
                        ? <img src={card.img} alt={card.n} loading="lazy" className="w-full block" style={{ borderRadius: 8, opacity: selected.length === want && !on ? 0.55 : 1 }} />
                        : <span className="flex items-center justify-center text-center text-xs p-2 aspect-[5/7]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>{card.n}</span>}
                      {card.leg && view.mode === 'commander' && (
                        <span className="absolute top-1 left-1 text-[10px] font-bold px-1" style={{ background: '#1d1f24', color: 'var(--gold)', borderRadius: 3 }}>Legende</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="card">
              <p className="font-semibold text-fg">Warte auf den nächsten Booster …</p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Dein Nachbar pickt noch. Dein Pool steht rechts.</p>
            </div>
          )}
        </section>

        <PoolList cards={view.pool} onHover={onHover} />
      </div>
    </div>
  )
}

function PoolList({ cards, onHover }) {
  return (
    <aside className="card lg:sticky" style={{ top: 'calc(var(--nav-h, 0px) + 6rem)' }}>
      <h2 className="text-sm font-bold mb-2">Dein Pool <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>({cards.length})</span></h2>
      {cards.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Noch nichts gepickt.</p>
      ) : (
        <ul className="text-sm space-y-0.5 max-h-[60vh] overflow-y-auto">
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
      )}
    </aside>
  )
}
