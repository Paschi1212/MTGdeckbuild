import { useState, useRef, useEffect } from 'react'

function shuffle(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Quantities in `cards` are stacks (e.g. "4x Forest") — the library needs one entry per
// physical copy to shuffle/draw correctly, each with its own id so React can key duplicate
// card names (two Forests in hand at once) without collisions.
function buildLibrary(cards) {
  const library = []
  let id = 0
  for (const card of cards) {
    for (let i = 0; i < (card.count || 1); i++) {
      library.push({ id: id++, name: card.name, image: card.image, tapped: false })
    }
  }
  return library
}

const CARD_W = 110
const CARD_IMG_H = 154 // 110 * 7/5 — the card image itself
const CARD_H = 172 // image + the name label strip below it
// A tapped card lies sideways: its frame turns landscape (154 × 110) so the whole card stays
// visible — rotating only the picture inside the upright frame cut off both ends.
const cardWidth = (card) => (card.tapped ? CARD_IMG_H : CARD_W)

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// On the battlefield, clicking a card taps/untaps it (the actual in-game action you do most
// often) — moving between zones (and around the battlefield itself) is drag-and-drop, with a
// small action button as a touch-friendly fallback where dragging is awkward.
function MiniCard({ card, onDragStart, style, extraActions }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onClick={extraActions?.onToggleTap ? () => extraActions.onToggleTap(card) : undefined}
      className="relative rounded-lg overflow-hidden bg-black/30 flex-shrink-0"
      style={{ width: cardWidth(card), cursor: extraActions?.onToggleTap ? 'pointer' : 'grab', ...style }}
      title={card.tapped ? `${card.name} (getappt)` : card.name}
    >
      <div
        className="relative overflow-hidden"
        style={{ width: cardWidth(card), height: card.tapped ? CARD_W : CARD_IMG_H }}
      >
        <div
          className="absolute left-1/2 top-1/2 bg-black/40"
          style={{
            width: CARD_W,
            height: CARD_IMG_H,
            transform: `translate(-50%, -50%) rotate(${card.tapped ? 90 : 0}deg)`,
            transition: 'transform 0.15s ease'
          }}
        >
          {card.image && <img src={card.image} alt={card.name} className="w-full h-full object-cover rounded-lg" loading="lazy" draggable={false} />}
        </div>
      </div>
      <div className="text-[10px] text-cmd-muted text-center py-0.5 truncate px-1">{card.name}</div>
      {extraActions?.buttons?.map((btn) => (
        <button
          key={btn.label}
          onClick={(e) => { e.stopPropagation(); btn.onClick(card) }}
          className="absolute w-5 h-5 rounded-full text-xs flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', top: 2, ...btn.position }}
          title={btn.title}
        >
          {btn.label}
        </button>
      ))}
    </div>
  )
}

// Hand / Friedhof / Exil stay simple flex-wrap lists — only the battlefield itself needs free
// positioning, these are just "piles" where exact placement doesn't matter.
function ListZone({ title, cards, onDrop, onDragStartCard, buttons, emptyText, isOver, onDragOver, onDragLeave }) {
  return (
    <div
      className="mb-4 flex-shrink-0 rounded-xl p-2 transition"
      style={isOver ? { backgroundColor: 'rgba(79,168,245,0.08)', border: '1px dashed var(--u)' } : { border: '1px dashed transparent' }}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(e) }}
    >
      <div className="text-xs text-cmd-muted uppercase tracking-wide mb-1">{title} ({cards.length})</div>
      {cards.length === 0 ? (
        <p className="text-sm text-cmd-muted py-2">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cards.map(card => (
            <MiniCard key={card.id} card={card} onDragStart={onDragStartCard} extraActions={{ buttons }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlaytestModal({ cards, commanderCard, onClose }) {
  const [library, setLibrary] = useState([])
  const [zones, setZones] = useState({ hand: [], battlefield: [], graveyard: [], exile: [] })
  const [mulligans, setMulligans] = useState(0)
  const [dragOverZone, setDragOverZone] = useState(null)
  const battlefieldRef = useRef(null)

  const dealOpeningHand = (newLibrary) => {
    const lib = [...newLibrary]
    const newHand = lib.splice(0, 7)
    setLibrary(lib)
    setZones({ hand: newHand, battlefield: [], graveyard: [], exile: [] })
  }

  const handleNewGame = () => {
    const fresh = shuffle(buildLibrary(cards))
    setMulligans(0)
    dealOpeningHand(fresh)
  }

  // Deal the opening hand immediately on open instead of showing an empty hand until the
  // user clicks "Neu mischen" once.
  useEffect(() => {
    handleNewGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMulligan = () => {
    const fresh = shuffle(buildLibrary(cards))
    setMulligans(m => m + 1)
    dealOpeningHand(fresh)
  }

  const handleDrawOne = () => {
    if (library.length === 0) return
    const [drawn, ...rest] = library
    setLibrary(rest)
    setZones(prev => ({ ...prev, hand: [...prev.hand, drawn] }))
  }

  // `position` ({x, y}) only applies when entering/moving within the battlefield — every
  // other zone is still just a pile, placement doesn't matter there.
  const moveCard = (card, fromZone, toZone, position) => {
    if (fromZone === toZone && toZone !== 'battlefield') return
    setZones(prev => {
      const next = { ...prev, [fromZone]: prev[fromZone].filter(c => c.id !== card.id) }
      if (toZone === 'battlefield') {
        // Repositioning on the battlefield keeps its tapped state; actually entering the
        // battlefield from anywhere else always starts untapped.
        const tapped = fromZone === 'battlefield' ? card.tapped : false
        const fallbackIndex = prev.battlefield.length
        const x = position?.x ?? card.x ?? clamp(20 + (fallbackIndex % 6) * 24, 0, 2000)
        const y = position?.y ?? card.y ?? clamp(20 + (fallbackIndex % 6) * 24, 0, 2000)
        // Build on next.battlefield, not prev.battlefield: when the card is being moved WITHIN
        // the battlefield, next already has it removed — appending to prev's list kept the old
        // copy too, so every reposition cloned the card. (Appended last = drawn on top.)
        next.battlefield = [...next.battlefield, { ...card, tapped, x, y }]
      } else {
        // A card never stays "tapped" or keeps a battlefield position once it leaves play.
        const { x, y, ...rest } = card
        next[toZone] = [...next[toZone], { ...rest, tapped: false }]
      }
      return next
    })
  }

  const handleToggleTap = (card) => {
    setZones(prev => ({
      ...prev,
      battlefield: prev.battlefield.map(c => (c.id === card.id ? { ...c, tapped: !c.tapped } : c))
    }))
  }

  const handleDragStart = (e, card, zone) => {
    // Capture where on the card the user actually grabbed it, so dropping lands the card
    // under the cursor instead of snapping its top-left corner there.
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: card.id, zone, offsetX, offsetY }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const readDragPayload = (e) => {
    try {
      return JSON.parse(e.dataTransfer.getData('text/plain'))
    } catch {
      return null
    }
  }

  const findCard = (id) => {
    for (const zoneCards of Object.values(zones)) {
      const found = zoneCards.find(c => c.id === id)
      if (found) return found
    }
    return null
  }

  const handleListDrop = (e, targetZone) => {
    setDragOverZone(null)
    const payload = readDragPayload(e)
    if (!payload) return
    const card = findCard(payload.id)
    if (card) moveCard(card, payload.zone, targetZone)
  }

  const handleBattlefieldDrop = (e) => {
    setDragOverZone(null)
    const payload = readDragPayload(e)
    if (!payload || !battlefieldRef.current) return
    const card = findCard(payload.id)
    if (!card) return

    const rect = battlefieldRef.current.getBoundingClientRect()
    const x = clamp(e.clientX - rect.left - payload.offsetX, 0, Math.max(0, rect.width - cardWidth(card)))
    const y = clamp(e.clientY - rect.top - payload.offsetY, 0, Math.max(0, rect.height - CARD_H))
    moveCard(card, payload.zone, 'battlefield', { x, y })
  }

  const playToBattlefield = { label: '▶', title: 'Ausspielen', position: { right: 2 }, onClick: (card) => moveCard(card, 'hand', 'battlefield') }
  const sendToHand = { label: '◀', title: 'Zurück auf die Hand', position: { right: 2 }, onClick: (card) => moveCard(card, 'battlefield', 'hand') }
  const sendToGraveyard = { label: '💀', title: 'Auf den Friedhof', position: { right: 26 }, onClick: (card) => moveCard(card, 'battlefield', 'graveyard') }
  const sendToExile = { label: '🚫', title: 'Ins Exil', position: { right: 50 }, onClick: (card) => moveCard(card, 'battlefield', 'exile') }
  const returnFromGraveyard = { label: '◀', title: 'Zurück auf die Hand', position: { right: 2 }, onClick: (card) => moveCard(card, 'graveyard', 'hand') }
  const returnFromExile = { label: '◀', title: 'Zurück auf die Hand', position: { right: 2 }, onClick: (card) => moveCard(card, 'exile', 'hand') }

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(8,8,10,0.96)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">🎲 Live Tester</h2>
        <button onClick={onClose} className="btn-secondary text-sm px-4 py-1.5">✕ Schließen</button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
        <button onClick={handleNewGame} className="btn-primary text-sm">🔀 Neu mischen</button>
        <button onClick={handleMulligan} className="btn-secondary text-sm">
          ↩️ Mulligan{mulligans > 0 ? ` (${mulligans})` : ''}
        </button>
        <button onClick={handleDrawOne} disabled={library.length === 0} className="btn-secondary text-sm">
          + Karte ziehen
        </button>
        <span className="text-sm text-cmd-muted self-center ml-2">Bibliothek: {library.length} Karten</span>
      </div>

      {commanderCard && (
        <div className="mb-4 flex-shrink-0">
          <div className="text-xs text-cmd-muted uppercase tracking-wide mb-1">Commander</div>
          <div className="rounded-lg overflow-hidden bg-black/30" style={{ width: CARD_W }}>
            <div className="aspect-[5/7] w-full bg-black/40">
              {commanderCard.image && <img src={commanderCard.image} alt={commanderCard.name} className="w-full h-full object-cover" loading="lazy" />}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-cmd-muted mb-2 flex-shrink-0">
        Auf das Spielfeld ziehen zum Ausspielen und dort frei verschieben · anklicken zum Tappen/Untappen ·
        💀/🚫/◀ schicken eine Karte auf den Friedhof, ins Exil oder zurück auf die Hand.
      </p>

      <ListZone
        title="Hand"
        cards={zones.hand}
        emptyText="Keine Karten auf der Hand."
        onDragStartCard={(e, card) => handleDragStart(e, card, 'hand')}
        buttons={[playToBattlefield]}
        isOver={dragOverZone === 'hand'}
        onDragOver={() => setDragOverZone('hand')}
        onDragLeave={() => setDragOverZone(null)}
        onDrop={(e) => handleListDrop(e, 'hand')}
      />

      <div
        ref={battlefieldRef}
        onDragOver={(e) => { e.preventDefault(); setDragOverZone('battlefield') }}
        onDragLeave={() => setDragOverZone(null)}
        onDrop={(e) => { e.preventDefault(); handleBattlefieldDrop(e) }}
        className="relative mb-4 rounded-xl flex-shrink-0 overflow-auto"
        style={{
          height: '48vh',
          minHeight: 320,
          backgroundColor: dragOverZone === 'battlefield' ? 'rgba(79,168,245,0.08)' : 'rgba(255,255,255,0.03)',
          border: dragOverZone === 'battlefield' ? '1px dashed var(--u)' : '1px solid var(--border)'
        }}
      >
        <div className="absolute top-2 left-2 text-xs text-cmd-muted uppercase tracking-wide pointer-events-none">
          🎴 Spielfeld ({zones.battlefield.length})
        </div>
        {zones.battlefield.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-cmd-muted text-center px-4">
            Noch nichts ausgespielt — Karte von der Hand hierher ziehen und frei platzieren.
          </p>
        )}
        {zones.battlefield.map(card => (
          <MiniCard
            key={card.id}
            card={card}
            onDragStart={(e, c) => handleDragStart(e, c, 'battlefield')}
            style={{ position: 'absolute', left: card.x, top: card.y }}
            extraActions={{ onToggleTap: handleToggleTap, buttons: [sendToHand, sendToGraveyard, sendToExile] }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ListZone
          title="💀 Friedhof"
          cards={zones.graveyard}
          emptyText="Noch leer."
          onDragStartCard={(e, card) => handleDragStart(e, card, 'graveyard')}
          buttons={[returnFromGraveyard]}
          isOver={dragOverZone === 'graveyard'}
          onDragOver={() => setDragOverZone('graveyard')}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={(e) => handleListDrop(e, 'graveyard')}
        />

        <ListZone
          title="🚫 Exil"
          cards={zones.exile}
          emptyText="Noch leer."
          onDragStartCard={(e, card) => handleDragStart(e, card, 'exile')}
          buttons={[returnFromExile]}
          isOver={dragOverZone === 'exile'}
          onDragOver={() => setDragOverZone('exile')}
          onDragLeave={() => setDragOverZone(null)}
          onDrop={(e) => handleListDrop(e, 'exile')}
        />
      </div>
    </div>
  )
}
