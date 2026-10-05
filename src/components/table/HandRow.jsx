import { useLayoutEffect, useRef, useState } from 'react'
import { TableCard } from './TableCard'

const CARD_W = 96
const GAP = 8
const MIN_STEP = 26 // at least this much of every card stays visible when they overlap

// Your hand, always whole on screen: side by side while they fit, otherwise fanned out
// overlapping (like holding them) — the card under the mouse comes to the front.
export default function HandRow({ cards, dropzone, highlight, draggingId, onCardPointerDown, onCardContextMenu, onHover }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  const [front, setFront] = useState(null)
  useLayoutEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    observer.observe(ref.current)
    setWidth(ref.current.clientWidth)
    return () => observer.disconnect()
  }, [])

  const n = cards.length
  // Side by side if it fits; otherwise each card steps over by what the width allows.
  const sideBySide = n * CARD_W + (n - 1) * GAP <= width
  const step = sideBySide || n < 2 ? CARD_W + GAP : Math.max(MIN_STEP, (width - CARD_W) / (n - 1))
  // Very many cards on a narrow screen: shrink them a little rather than lose any.
  const cardW = !sideBySide && n > 1 && MIN_STEP * (n - 1) + CARD_W > width ? Math.max(64, width - MIN_STEP * (n - 1)) : CARD_W

  return (
    <div
      ref={ref}
      data-dropzone={dropzone}
      className="relative"
      style={{ height: Math.round(cardW * 1.4) + 6, background: highlight ? 'rgba(205,178,126,0.06)' : 'transparent', borderRadius: 'var(--radius-sm)' }}
      onPointerLeave={() => setFront(null)}
    >
      {n === 0 && <p className="text-sm py-6" style={{ color: 'var(--color-text-muted)' }}>Keine Karten auf der Hand.</p>}
      {width > 0 && cards.map((card, index) => (
        <div
          key={card.iid}
          className="absolute top-0"
          style={{ left: index * step, zIndex: front === card.iid ? 50 : index, transition: 'left 0.15s ease' }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setFront(card.iid) }}
        >
          <TableCard
            card={card}
            width={cardW}
            interactive
            dim={draggingId === card.iid}
            onPointerDown={(e) => onCardPointerDown(e, card, 'hand')}
            onContextMenu={(e) => onCardContextMenu(e, card, 'hand')}
            onHover={onHover}
          />
        </div>
      ))}
    </div>
  )
}
