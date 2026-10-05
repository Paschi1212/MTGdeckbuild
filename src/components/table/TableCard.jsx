import { useLayoutEffect, useRef, useState } from 'react'
import { BF_W, BF_H, CARD_W } from '../../lib/table/board'

// A card on the table at any size. Tapped cards lie sideways in a landscape frame, so the whole
// card stays visible (rotating only the picture would cut off both ends).
export function TableCard({ card, width, interactive = false, onPointerDown, onContextMenu, onHover, style, dim = false }) {
  const height = Math.round(width * 7 / 5)
  const frameW = card.tapped ? height : width
  const frameH = card.tapped ? width : height
  const radius = Math.max(3, width * 0.05)
  return (
    <div
      className="relative select-none flex-shrink-0"
      style={{
        width: frameW,
        height: frameH,
        touchAction: interactive ? 'none' : 'auto',
        cursor: interactive ? 'grab' : onHover ? 'zoom-in' : 'default',
        opacity: dim ? 0.35 : 1,
        ...style
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover?.(card, e) }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') onHover?.(card, e) }}
      onPointerLeave={() => onHover?.(null)}
      title={card.tapped ? `${card.name} (getappt)` : card.name}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width, height, transform: `translate(-50%, -50%) rotate(${card.tapped ? 90 : 0}deg)`, transition: 'transform 0.15s ease' }}
      >
        {card.image ? (
          <img src={card.image} alt={card.name} draggable={false} className="w-full h-full object-cover block" style={{ borderRadius: radius, boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }} />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-center leading-tight p-1"
            style={{ background: '#2a2d33', color: '#e8eaed', fontSize: Math.max(8, width * 0.11), borderRadius: radius, border: '1px solid #3a3e45' }}
          >
            {card.name}
          </div>
        )}
      </div>
      {card.commander && (
        <span
          className="absolute -top-1 -right-1 rounded-full flex items-center justify-center"
          style={{ width: Math.max(14, width * 0.2), height: Math.max(14, width * 0.2), background: 'var(--gold)', color: '#1d1f24', fontSize: Math.max(8, width * 0.12), fontWeight: 700 }}
          title="Commander"
        >
          C
        </span>
      )}
    </div>
  )
}

/** The back of a card — for the library pile and face-down hand counts. */
export function CardBack({ width, count, label }) {
  const height = Math.round(width * 7 / 5)
  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{
        width, height,
        borderRadius: Math.max(3, width * 0.05),
        background: 'repeating-linear-gradient(45deg, #2b2418 0 6px, #241e14 6px 12px)',
        border: '2px solid #4a3b22',
        color: '#d8b978'
      }}
      aria-label={label}
    >
      {count != null && <span className="text-sm font-bold tabular-nums" style={{ textShadow: '0 1px 2px #000' }}>{count}</span>}
    </div>
  )
}

/**
 * A battlefield drawn from virtual coordinates at whatever width it gets. `dropzone` marks it
 * as a target for dragged cards (own board only); `onCardPointerDown` makes cards interactive.
 */
export function Battlefield({ cards, dropzone, onCardPointerDown, onCardContextMenu, onHover, emptyText, highlight, maxHeight = '40vh' }) {
  const outer = useRef(null)
  const probe = useRef(null)
  const [size, setSize] = useState({ width: 0, maxHeight: 0 })
  useLayoutEffect(() => {
    if (!outer.current) return undefined
    const measure = () => setSize({ width: outer.current.clientWidth, maxHeight: probe.current?.clientHeight || Infinity })
    const observer = new ResizeObserver(measure)
    observer.observe(outer.current)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  // As wide as the column allows — but never taller than `maxHeight`, so the whole table
  // (all boards plus your hand) fits on one screen.
  const scale = Math.min(size.width / BF_W, size.maxHeight / BF_H)
  return (
    <div ref={outer} className="relative w-full flex justify-center">
      <div ref={probe} aria-hidden="true" className="absolute left-0 top-0 w-0 pointer-events-none" style={{ height: maxHeight }} />
    <div
      data-dropzone={dropzone}
      className="relative overflow-hidden"
      style={{
        width: BF_W * scale || '100%',
        height: BF_H * scale || 200,
        background: highlight ? 'rgba(205,178,126,0.08)' : 'rgba(255,255,255,0.025)',
        border: `1px ${highlight ? 'dashed' : 'solid'} ${highlight ? 'var(--gold)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)'
      }}
    >
      {cards.length === 0 && emptyText && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-center px-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }}>{emptyText}</p>
      )}
      {scale > 0 && cards.map(card => (
        <TableCard
          key={card.iid}
          card={card}
          width={CARD_W * scale}
          interactive={Boolean(onCardPointerDown)}
          onPointerDown={onCardPointerDown ? (e) => onCardPointerDown(e, card, 'battlefield') : undefined}
          onContextMenu={onCardContextMenu ? (e) => onCardContextMenu(e, card, 'battlefield') : undefined}
          onHover={onHover}
          style={{ position: 'absolute', left: card.x * scale, top: card.y * scale }}
        />
      ))}
    </div>
    </div>
  )
}

/** Big picture of a card next to the mouse — the table cards are small, the text matters. */
export function HoverPreview({ preview }) {
  if (!preview?.card?.image) return null
  const width = 250
  const height = 350
  const left = preview.x + 24 + width > window.innerWidth ? preview.x - 24 - width : preview.x + 24
  const top = Math.min(Math.max(preview.y - height / 2, 8), window.innerHeight - height - 8)
  return (
    <img
      src={preview.card.image}
      alt=""
      className="fixed z-[120] pointer-events-none"
      style={{ left, top, width, borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.6)', transform: preview.card.tapped ? 'none' : 'none' }}
    />
  )
}
