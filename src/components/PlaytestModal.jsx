import { useState, useEffect } from 'react'

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

// On the battlefield, clicking a card taps/untaps it (the actual in-game action you do most
// often) — moving between zones is drag-and-drop, with a small arrow button as a
// touch-friendly fallback where dragging is awkward.
function MiniCard({ card, onDragStart, onMove, moveLabel, onToggleTap }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onClick={onToggleTap ? () => onToggleTap(card) : undefined}
      className="relative rounded-lg overflow-hidden bg-black/30 flex-shrink-0"
      style={{ width: 110, cursor: onToggleTap ? 'pointer' : 'grab' }}
      title={card.name}
    >
      <div
        className="aspect-[5/7] w-full bg-black/40"
        style={{ transform: card.tapped ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
      >
        {card.image && <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />}
      </div>
      <div className="text-[10px] text-cmd-muted text-center py-0.5 truncate px-1">{card.name}</div>
      <button
        onClick={(e) => { e.stopPropagation(); onMove(card) }}
        className="absolute top-1 right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}
        title={moveLabel}
      >
        {moveLabel}
      </button>
    </div>
  )
}

function DropZone({ title, cards, onDrop, onDragStartCard, onMoveCard, moveLabel, onToggleTap, emptyText, isOver, onDragOver, onDragLeave }) {
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
            <MiniCard key={card.id} card={card} onDragStart={onDragStartCard} onMove={onMoveCard} moveLabel={moveLabel} onToggleTap={onToggleTap} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlaytestModal({ cards, commanderCard, onClose }) {
  const [library, setLibrary] = useState([])
  const [hand, setHand] = useState([])
  const [battlefield, setBattlefield] = useState([])
  const [mulligans, setMulligans] = useState(0)
  const [dragOverZone, setDragOverZone] = useState(null)

  const dealOpeningHand = (newLibrary) => {
    const lib = [...newLibrary]
    const newHand = lib.splice(0, 7)
    setLibrary(lib)
    setHand(newHand)
    setBattlefield([])
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
    setHand(h => [...h, drawn])
  }

  const moveCard = (card, fromZone, toZone) => {
    if (fromZone === toZone) return
    const setFrom = fromZone === 'hand' ? setHand : setBattlefield
    const setTo = toZone === 'hand' ? setHand : setBattlefield
    setFrom(prev => prev.filter(c => c.id !== card.id))
    // Untap on the way back to hand — a card never stays "tapped" once it leaves play.
    setTo(prev => [...prev, toZone === 'hand' ? { ...card, tapped: false } : card])
  }

  const handleToggleTap = (card) => {
    setBattlefield(prev => prev.map(c => (c.id === card.id ? { ...c, tapped: !c.tapped } : c)))
  }

  const handleDragStart = (e, card, zone) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: card.id, zone }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (e, targetZone) => {
    setDragOverZone(null)
    let payload
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain'))
    } catch {
      return
    }
    const source = payload.zone === 'hand' ? hand : battlefield
    const card = source.find(c => c.id === payload.id)
    if (card) moveCard(card, payload.zone, targetZone)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
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
          <div className="rounded-lg overflow-hidden bg-black/30" style={{ width: 110 }}>
            <div className="aspect-[5/7] w-full bg-black/40">
              {commanderCard.image && <img src={commanderCard.image} alt={commanderCard.name} className="w-full h-full object-cover" loading="lazy" />}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-cmd-muted mb-2 flex-shrink-0">
        Auf das Spielfeld ziehen zum Ausspielen (oder den kleinen Pfeil nutzen) · auf dem Spielfeld anklicken zum Tappen/Untappen
      </p>

      <DropZone
        title="Hand"
        cards={hand}
        emptyText="Keine Karten auf der Hand."
        onDragStartCard={(e, card) => handleDragStart(e, card, 'hand')}
        onMoveCard={(card) => moveCard(card, 'hand', 'battlefield')}
        moveLabel="▶"
        isOver={dragOverZone === 'hand'}
        onDragOver={() => setDragOverZone('hand')}
        onDragLeave={() => setDragOverZone(null)}
        onDrop={(e) => handleDrop(e, 'hand')}
      />

      <DropZone
        title="🎴 Spielfeld"
        cards={battlefield}
        emptyText="Noch nichts ausgespielt — Karte von der Hand hierher ziehen."
        onDragStartCard={(e, card) => handleDragStart(e, card, 'battlefield')}
        onMoveCard={(card) => moveCard(card, 'battlefield', 'hand')}
        moveLabel="◀"
        onToggleTap={handleToggleTap}
        isOver={dragOverZone === 'battlefield'}
        onDragOver={() => setDragOverZone('battlefield')}
        onDragLeave={() => setDragOverZone(null)}
        onDrop={(e) => handleDrop(e, 'battlefield')}
      />
    </div>
  )
}
