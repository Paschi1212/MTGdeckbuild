import { useCallback, useState } from 'react'
import BoardHeader from './BoardHeader'
import CardMenu from './CardMenu'
import ZoneViewer, { SmallButton, TopCardsViewer } from './ZoneViewer'
import { Battlefield, TableCard, CardBack } from './TableCard'
import NumberPrompt from './NumberPrompt'
import TokenPicker from './TokenPicker'
import CounterEditor from './CounterEditor'
import { BF_W, CARD_W, ZONE_LABEL } from '../../lib/table/board'

const HAND_CARD_W = 88
const PILE_CARD_W = 58
const LONG_PRESS_MS = 450
const DRAG_THRESHOLD = 6

// Your side of the table, Live-Tester style: the battlefield to arrange freely, the piles
// (command zone, library, graveyard, exile) and your hand — which only you see.
// Mouse and touch work the same: drag a card to move it, tap a battlefield card to tap/untap,
// long-press or right-click any card for everything else.
// `phase`: 'setup' shows the opening-hand strip (keep / mulligan); `turnControls`
// ({ label, onAdvance, onPass }) is set while it is this seat's turn.
export default function MyArea({ seat, seats, player, board, act, isActive, isMonarch, dispatch, onDetails, onHover, label, phase, turnControls }) {
  const [drag, setDrag] = useState(null) // { card, from, w, h, offset, x, y }
  const [menu, setMenu] = useState(null)
  const [viewer, setViewer] = useState(null) // 'graveyard' | 'exile' | 'search' | { top: n }
  const [prompt, setPrompt] = useState(null) // "how many?" for draw/look/mill X
  const [pickingToken, setPickingToken] = useState(false)
  const [countersFor, setCountersFor] = useState(null) // iid of the card whose counters are open
  const zone = (name) => `${seat.playerId}:${name}`

  const move = useCallback((card, to, at) => act({ type: 'move', iid: card.iid, to, at }), [act])

  const menuFor = useCallback((card, from, x, y) => {
    const items = []
    if (from === 'battlefield') {
      items.push({ label: card.tapped ? 'Enttappen' : 'Tappen', onClick: () => act({ type: 'tap', iid: card.iid }) })
      items.push({ label: 'Marken …', onClick: () => setCountersFor(card.iid) })
      items.push({ label: '+1/+1-Marke', onClick: () => act({ type: 'counter', iid: card.iid, key: '+1/+1', delta: 1 }) })
      items.push({ label: 'Kopie als Spielmarke', onClick: () => act({ type: 'copy', iid: card.iid }) })
    }
    // A token exists only on the battlefield — anywhere else it would just vanish.
    if (card.token) {
      items.push({ label: 'Entfernen (Spielmarke verschwindet)', onClick: () => move(card, 'graveyard'), danger: true })
      setMenu({ title: `${card.name} · Spielmarke`, x, y, items })
      return
    }
    if (from !== 'battlefield') items.push({ label: from === 'command' ? 'Wirken (aufs Spielfeld)' : from === 'hand' ? 'Ausspielen' : 'Aufs Spielfeld', onClick: () => move(card, 'battlefield') })
    if (from !== 'hand') items.push({ label: 'Auf die Hand', onClick: () => move(card, 'hand') })
    if (from !== 'graveyard') items.push({ label: from === 'hand' ? 'Abwerfen (Friedhof)' : 'Auf den Friedhof', onClick: () => move(card, 'graveyard') })
    if (from !== 'exile') items.push({ label: 'Ins Exil', onClick: () => move(card, 'exile') })
    if (card.commander && from !== 'command') items.push({ label: 'Zurück in die Commandzone', onClick: () => move(card, 'command') })
    if (!card.commander) {
      items.push({ label: 'Oben auf die Bibliothek', onClick: () => move(card, 'library', 'top') })
      items.push({ label: 'Unter die Bibliothek', onClick: () => move(card, 'library', 'bottom') })
    }
    setMenu({ title: `${card.name} · ${ZONE_LABEL[from]}`, x, y, items })
  }, [act, move])

  // Drop: whatever own zone is under the pointer.
  const drop = useCallback((card, from, clientX, clientY, offset, width) => {
    const target = document.elementsFromPoint(clientX, clientY).map(el => el.closest?.('[data-dropzone]')).find(Boolean)
    const name = target?.dataset.dropzone
    if (!name?.startsWith(`${seat.playerId}:`)) return
    const to = name.slice(seat.playerId.length + 1)
    if (to === 'battlefield') {
      const rect = target.getBoundingClientRect()
      const scale = rect.width / BF_W
      // Grab point kept proportionally: a hand card is bigger than a battlefield card.
      const ratio = (CARD_W * scale) / width
      const x = (clientX - rect.left - offset.x * ratio) / scale
      const y = (clientY - rect.top - offset.y * ratio) / scale
      if (from === 'battlefield') act({ type: 'position', iid: card.iid, x, y })
      else move(card, 'battlefield', { x, y })
    } else if (to !== from) {
      move(card, to, to === 'library' ? 'top' : undefined)
    }
  }, [act, move, seat.playerId])

  const onCardPointerDown = useCallback((event, card, from) => {
    if (event.button === 2) return // right-click → context menu
    event.preventDefault()
    onHover?.(null)
    const startX = event.clientX
    const startY = event.clientY
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = { x: startX - rect.left, y: startY - rect.top }
    let dragging = false
    let pressed = false
    const timer = setTimeout(() => { pressed = true; menuFor(card, from, startX, startY) }, LONG_PRESS_MS)

    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (e) => {
      if (pressed) return
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_THRESHOLD) {
        dragging = true
        clearTimeout(timer)
      }
      if (dragging) setDrag({ card, from, w: rect.width, h: rect.height, offset, x: e.clientX - offset.x, y: e.clientY - offset.y })
    }
    const onUp = (e) => {
      cleanup()
      if (pressed) return
      if (!dragging) {
        // A tap: battlefield cards tap/untap, everything else opens its menu.
        if (from === 'battlefield') act({ type: 'tap', iid: card.iid })
        else menuFor(card, from, e.clientX, e.clientY)
        return
      }
      setDrag(null)
      drop(card, from, e.clientX, e.clientY, offset, rect.width)
    }
    const onCancel = () => { cleanup(); setDrag(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [act, drop, menuFor, onHover])

  const onCardContextMenu = useCallback((event, card, from) => {
    event.preventDefault()
    menuFor(card, from, event.clientX, event.clientY)
  }, [menuFor])

  const libraryMenu = (event) => {
    const r = event.currentTarget.getBoundingClientRect()
    setMenu({
      title: `Bibliothek · ${board.library.length} Karten`,
      x: r.left + r.width / 2,
      y: r.bottom,
      items: [
        { label: 'Karte ziehen', onClick: () => act({ type: 'draw', count: 1 }) },
        { label: 'Karten ziehen …', onClick: () => setPrompt({ title: 'Wie viele Karten ziehen?', initial: 2, max: board.library.length, confirmLabel: 'Ziehen', onConfirm: (n) => act({ type: 'draw', count: n }) }) },
        { label: 'Oberste Karte ansehen', onClick: () => setViewer({ top: 1 }) },
        { label: 'Oberste … ansehen (Scry, Surveil)', onClick: () => setPrompt({ title: 'Wie viele oberste Karten ansehen?', initial: 2, max: board.library.length, confirmLabel: 'Ansehen', onConfirm: (n) => setViewer({ top: n }) }) },
        { label: 'Durchsuchen', onClick: () => setViewer('search') },
        { label: 'Karten fräsen …', onClick: () => setPrompt({ title: 'Wie viele Karten fräsen?', initial: 1, max: board.library.length, confirmLabel: 'Fräsen', onConfirm: (n) => act({ type: 'mill', count: n }) }) },
        { label: 'Mischen', onClick: () => act({ type: 'shuffle' }) },
        { label: 'Mulligan (neue 7 Karten)', onClick: () => act({ type: 'mulligan' }), danger: true }
      ]
    })
  }

  const pileActions = (from) => (card) => (
    <>
      {from !== 'hand' && <SmallButton onClick={() => move(card, 'hand')}>Hand</SmallButton>}
      <SmallButton onClick={() => { move(card, 'battlefield'); if (from !== 'search') setViewer(null) }}>Spielfeld</SmallButton>
      {from !== 'graveyard' && <SmallButton onClick={() => move(card, 'graveyard')}>Friedhof</SmallButton>}
      {from !== 'exile' && <SmallButton onClick={() => move(card, 'exile')}>Exil</SmallButton>}
      {card.commander && <SmallButton onClick={() => move(card, 'command')}>Commandzone</SmallButton>}
    </>
  )

  if (!board) return null
  const topOfGrave = board.graveyard[board.graveyard.length - 1]
  const topOfExile = board.exile[board.exile.length - 1]

  return (
    <section
      className="flex flex-col overflow-hidden"
      style={{ background: 'var(--color-surface)', border: `${isActive ? 2 : 1}px solid ${isActive ? 'var(--gold)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)' }}
      aria-label={label}
    >
      <BoardHeader seat={seat} seats={seats} player={player} isMe isMonarch={isMonarch} online dispatch={dispatch} onDetails={onDetails} />

      <div className="p-2">
        <Battlefield
          cards={board.battlefield}
          dropzone={zone('battlefield')}
          onCardPointerDown={onCardPointerDown}
          onCardContextMenu={onCardContextMenu}
          onHover={onHover}
          highlight={Boolean(drag)}
          maxHeight="38vh"
          emptyText="Dein Spielfeld – Karten von der Hand hierher ziehen"
        />
      </div>

      {/* Piles and hand in one row (stacked on narrow screens), so the whole board fits on one screen */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 px-3 pb-3">
        <div className="flex items-end gap-3 flex-shrink-0">
          <div data-dropzone={zone('command')} className="flex flex-col items-center gap-1">
            <div className="flex gap-1 items-end" style={{ minHeight: PILE_CARD_W * 1.4 }}>
              {board.command.length
                ? board.command.map(card => <TableCard key={card.iid} card={card} width={PILE_CARD_W} interactive onPointerDown={(e) => onCardPointerDown(e, card, 'command')} onContextMenu={(e) => onCardContextMenu(e, card, 'command')} onHover={onHover} />)
                : <div style={{ width: PILE_CARD_W, height: PILE_CARD_W * 1.4, border: '1px dashed var(--color-border)', borderRadius: 4 }} />}
            </div>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Commandzone</span>
          </div>

          <div data-dropzone={zone('library')} className="flex flex-col items-center gap-1">
            <button type="button" onClick={libraryMenu} title="Bibliothek: ziehen, ansehen, durchsuchen, mischen …">
              <CardBack width={PILE_CARD_W} count={board.library.length} label={`Bibliothek, ${board.library.length} Karten`} />
            </button>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Bibliothek ▾</span>
          </div>

          <div data-dropzone={zone('graveyard')} className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => setViewer('graveyard')} title="Friedhof ansehen">
              {topOfGrave
                ? <TableCard card={topOfGrave} width={PILE_CARD_W} onHover={onHover} />
                : <div style={{ width: PILE_CARD_W, height: PILE_CARD_W * 1.4, border: '1px dashed var(--color-border)', borderRadius: 4 }} />}
            </button>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>Friedhof {board.graveyard.length}</span>
          </div>

          <div data-dropzone={zone('exile')} className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => setViewer('exile')} title="Exil ansehen">
              {topOfExile
                ? <TableCard card={topOfExile} width={PILE_CARD_W} onHover={onHover} />
                : <div style={{ width: PILE_CARD_W, height: PILE_CARD_W * 1.4, border: '1px dashed var(--color-border)', borderRadius: 4 }} />}
            </button>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>Exil {board.exile.length}</span>
          </div>

          <div className="flex flex-col gap-2 self-center">
            {turnControls && (
              <button type="button" onClick={turnControls.onAdvance} className="btn-primary text-sm px-3 min-h-[44px] whitespace-nowrap">{turnControls.label}</button>
            )}
            <button type="button" onClick={() => act({ type: 'draw', count: 1 })} disabled={!board.library.length} className={turnControls ? 'btn-secondary text-sm px-3 min-h-[40px] whitespace-nowrap' : 'btn-primary text-sm px-3 min-h-[44px] whitespace-nowrap'}>Karte ziehen</button>
            <button type="button" onClick={() => act({ type: 'untapAll' })} className="btn-secondary text-sm px-3 min-h-[40px] whitespace-nowrap">Alles enttappen</button>
            <button type="button" onClick={() => setPickingToken(true)} className="btn-secondary text-sm px-3 min-h-[40px] whitespace-nowrap">Spielmarke</button>
            {turnControls?.onPass && (
              <button type="button" onClick={turnControls.onPass} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }} title="Der Nächste in der Zugreihenfolge ist dran">Zug abgeben</button>
            )}
          </div>
        </div>

        {/* Hand — only on this screen */}
        <div className="flex-1 min-w-0">
          {phase === 'setup' && (
            <div className="flex flex-wrap items-center gap-2 mb-2 px-3 py-2" style={{ border: '1px solid var(--gold)', borderRadius: 'var(--radius-sm)', background: 'rgba(205,178,126,0.07)' }}>
              <span className="text-sm font-semibold text-fg">Starthand{board.mulligans ? ` · ${board.mulligans}. Mulligan` : ''}</span>
              {player?.kept ? (
                <>
                  <span className="text-sm" style={{ color: 'var(--g)' }}>✓ behalten</span>
                  <button type="button" onClick={() => dispatch('keep', { target: seat.playerId, value: false })} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>doch nicht</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => dispatch('keep', { target: seat.playerId, value: true })} className="btn-primary text-sm px-4 min-h-[40px]">Behalten</button>
                  <button type="button" onClick={() => act({ type: 'mulligan' })} className="btn-secondary text-sm px-4 min-h-[40px]">Mulligan</button>
                </>
              )}
              <span className="text-xs basis-full leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                Im Commander ist der erste Mulligan frei. Ab dem zweiten legst du nach dem Behalten je Mulligan eine Karte unter die Bibliothek (Karte lange drücken → „Unter die Bibliothek“).
              </span>
            </div>
          )}
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {label ? `Hand von ${label}` : 'Deine Hand'} ({board.hand.length}) – nur hier sichtbar
          </div>
          <div
            data-dropzone={zone('hand')}
            className="flex gap-2 overflow-x-auto pb-1 items-start"
            style={{ minHeight: HAND_CARD_W * 1.4 + 6, background: drag ? 'rgba(205,178,126,0.06)' : 'transparent', borderRadius: 'var(--radius-sm)' }}
          >
            {board.hand.length === 0 && <p className="text-sm py-6" style={{ color: 'var(--color-text-muted)' }}>Keine Karten auf der Hand.</p>}
            {board.hand.map(card => (
              <TableCard
                key={card.iid}
                card={card}
                width={HAND_CARD_W}
                interactive
                dim={drag?.card.iid === card.iid}
                onPointerDown={(e) => onCardPointerDown(e, card, 'hand')}
                onContextMenu={(e) => onCardContextMenu(e, card, 'hand')}
                onHover={onHover}
              />
            ))}
          </div>
        </div>
      </div>

      {/* The card following the pointer while dragging */}
      {drag && (
        <div className="fixed z-[125] pointer-events-none" style={{ left: drag.x, top: drag.y, opacity: 0.9 }}>
          <TableCard card={{ ...drag.card, tapped: false }} width={drag.from === 'battlefield' && drag.card.tapped ? drag.h : drag.w} />
        </div>
      )}

      <CardMenu menu={menu} onClose={() => setMenu(null)} />
      <NumberPrompt prompt={prompt} onClose={() => setPrompt(null)} />
      {pickingToken && (
        <TokenPicker
          onClose={() => setPickingToken(false)}
          onCreate={(template, count) => act({ type: 'token', tokens: [{ name: template.name, image: template.image, pt: template.pt }], count })}
        />
      )}
      {countersFor && (
        <CounterEditor
          card={board.battlefield.find(card => card.iid === countersFor)}
          onChange={(key, delta) => act({ type: 'counter', iid: countersFor, key, delta })}
          onClose={() => setCountersFor(null)}
        />
      )}

      {(viewer === 'graveyard' || viewer === 'exile') && (
        <ZoneViewer
          title={viewer === 'graveyard' ? 'Dein Friedhof' : 'Dein Exil'}
          cards={[...board[viewer]].reverse()}
          actions={pileActions(viewer)}
          onClose={() => setViewer(null)}
          onHover={onHover}
        />
      )}
      {viewer === 'search' && (
        <ZoneViewer
          title="Bibliothek durchsuchen"
          hint="Alphabetisch sortiert – die Reihenfolge der Bibliothek bleibt geheim. Danach mischen."
          cards={[...board.library].sort((a, b) => a.name.localeCompare(b.name))}
          actions={pileActions('search')}
          onClose={() => setViewer(null)}
          onHover={onHover}
          footer={<button type="button" onClick={() => { act({ type: 'shuffle' }); setViewer(null) }} className="btn-primary text-sm px-5 min-h-[40px]">Mischen &amp; schließen</button>}
        />
      )}
      {viewer?.top && (
        <TopCardsViewer
          cards={board.library.slice(0, viewer.top)}
          onHover={onHover}
          onClose={() => setViewer(null)}
          onDone={(result) => { act({ type: 'arrangeTop', ...result }); setViewer(null) }}
        />
      )}
    </section>
  )
}
