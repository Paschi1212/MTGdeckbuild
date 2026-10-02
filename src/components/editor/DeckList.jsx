import { useState } from 'react'
import ManaCost from '../ManaCost'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const PREVIEW_WIDTH = 230
const PREVIEW_HEIGHT = 320

// Card image next to the cursor while hovering a name — the list itself stays text-dense,
// like a decklist on paper, and the picture is there the moment you want it.
function HoverPreview({ preview }) {
  if (!preview?.card?.image) return null
  const left = preview.x + 24 + PREVIEW_WIDTH > window.innerWidth ? preview.x - 24 - PREVIEW_WIDTH : preview.x + 24
  const top = Math.min(Math.max(preview.y - PREVIEW_HEIGHT / 2, 8), window.innerHeight - PREVIEW_HEIGHT - 8)
  return (
    <img
      src={preview.card.image}
      alt=""
      className="fixed z-[80] pointer-events-none"
      style={{ left, top, width: PREVIEW_WIDTH, borderRadius: 10, boxShadow: 'var(--shadow-lg)' }}
    />
  )
}

function IconButton({ label, onClick, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-6 h-6 flex items-center justify-center text-sm leading-none"
      style={{ color: danger ? 'var(--r)' : 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)' }}
    >
      {children}
    </button>
  )
}

function DeckRow({ card, cutReason, onUpdateCount, onRemove, onZoom, onPreview, draggable, onDragStart, onDragEnd }) {
  const isCut = Boolean(cutReason)
  const ownership = card.missingCount > 0
    ? (card.friendAvailability?.length > 0 ? `bei ${card.friendAvailability.map(h => h.label).join(', ')}` : 'Zukauf')
    : null

  return (
    <li
      className="group flex items-center gap-2 pl-2 pr-1 h-8 text-sm"
      style={{
        borderLeft: `2px solid ${isCut ? 'var(--r)' : 'transparent'}`,
        background: isCut ? 'rgba(193,56,50,0.08)' : undefined,
        cursor: draggable ? 'grab' : undefined
      }}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, card.index) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      title={isCut ? `Streichkandidat: ${cutReason}` : undefined}
    >
      <span className="w-5 text-right tabular-nums flex-shrink-0" style={{ color: card.count > 1 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
        {card.count}
      </span>
      <button
        type="button"
        onClick={() => onZoom(card)}
        onMouseEnter={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => onPreview(null)}
        className="flex-1 min-w-0 text-left truncate"
        style={{ color: 'var(--color-text)' }}
      >
        {card.name}
      </button>
      {ownership && (
        <span
          className="text-[11px] whitespace-nowrap flex-shrink-0"
          style={{ color: card.friendAvailability?.length ? 'var(--u)' : 'var(--r)' }}
          title={ownership}
        >
          {/* Phones: the symbol only, so the card name keeps its room. */}
          <span className="hidden sm:inline">{ownership}</span>
          <span className="sm:hidden" aria-label={ownership}>{card.friendAvailability?.length ? '📦' : '🛒'}</span>
        </span>
      )}
      <span className="flex-shrink-0"><ManaCost cost={card.manaCost} size={15} /></span>
      <span className="hidden sm:inline-block w-14 text-right tabular-nums text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        {card.price > 0 ? `€${(card.count * card.price).toFixed(2)}` : ''}
      </span>
      {/* Hidden until hover/focus on a mouse; always there on touch screens. */}
      <span className="flex items-center flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
        <IconButton label={`${card.name}: eine Kopie weniger`} onClick={() => (card.count > 1 ? onUpdateCount(card.index, card.count - 1) : onRemove(card.index))}>−</IconButton>
        <IconButton label={`${card.name}: eine Kopie mehr`} onClick={() => onUpdateCount(card.index, card.count + 1)}>+</IconButton>
        <IconButton label={`${card.name} entfernen`} onClick={() => onRemove(card.index)} danger>✕</IconButton>
      </span>
    </li>
  )
}

/**
 * The deck itself, grouped (type / color / mana value) into blocks that flow into as many
 * columns as fit — the land block sits next to the creatures instead of three screens
 * further down. Type groups accept dragged cards to re-file them (e.g. a land creature).
 */
export default function DeckList({
  groups, groupBy, cutReasonMap, onUpdateCount, onRemove, onZoom,
  isDragging, dragOverGroup, onDragStart, onDragEnd, onDragOverGroup, onDropOnGroup
}) {
  const canHover = useMediaQuery('(hover: hover)')
  const [preview, setPreview] = useState(null)
  const dragEnabled = groupBy === 'type'

  return (
    <>
      <div className="columns-1 md:columns-2 2xl:columns-3 gap-8">
        {groups.map(group => {
          const total = group.cards.reduce((sum, c) => sum + c.count, 0)
          const isDropTarget = dragEnabled && dragOverGroup === group.key
          return (
            <section
              key={group.key}
              className="break-inside-avoid mb-6"
              style={isDropTarget ? { outline: '2px dashed var(--u)', outlineOffset: 4 } : undefined}
              onDragOver={(e) => { if (dragEnabled) { e.preventDefault(); onDragOverGroup(group.key) } }}
              onDragLeave={() => onDragOverGroup(null)}
              onDrop={(e) => {
                if (!dragEnabled) return
                e.preventDefault()
                onDropOnGroup(Number(e.dataTransfer.getData('text/plain')), group.key)
              }}
            >
              <h3
                className="flex items-baseline justify-between pb-1 mb-1 text-sm font-semibold"
                style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                {group.label}
                <span className="tabular-nums font-normal" style={{ color: 'var(--color-text-muted)' }}>{total}</span>
              </h3>
              <ul>
                {group.cards.map(card => (
                  <DeckRow
                    key={card.index}
                    card={card}
                    cutReason={cutReasonMap.get(card.name)}
                    onUpdateCount={onUpdateCount}
                    onRemove={onRemove}
                    onZoom={onZoom}
                    onPreview={canHover ? setPreview : () => {}}
                    draggable={dragEnabled}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
                {group.cards.length === 0 && isDragging && (
                  <li className="text-xs italic py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>Hierher ziehen</li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
      {canHover && <HoverPreview preview={preview} />}
    </>
  )
}
