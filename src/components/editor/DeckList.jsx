import { useState } from 'react'
import ManaCost from '../ManaCost'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const PREVIEW_WIDTH = 230
const PREVIEW_HEIGHT = 320

// Three ways to look at the same deck (switch in the editor toolbar):
//   list   – dense decklist rows, the default for editing
//   images – the cards themselves, for a visual check of the deck
//   table  – every detail in columns (full type line), nothing truncated
export const DECK_VIEWS = [
  { id: 'list', label: 'Liste' },
  { id: 'images', label: 'Bilder' },
  { id: 'table', label: 'Tabelle' }
]

function ownershipOf(card) {
  if (!(card.missingCount > 0)) return null
  const friends = card.friendAvailability || []
  return friends.length
    ? { text: `bei ${friends.map(h => h.label).join(', ')}`, symbol: '📦', color: 'var(--u)' }
    : { text: 'Zukauf', symbol: '🛒', color: 'var(--r)' }
}

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

function CountControls({ card, onUpdateCount, onRemove }) {
  return (
    <>
      <IconButton label={`${card.name}: eine Kopie weniger`} onClick={() => (card.count > 1 ? onUpdateCount(card.index, card.count - 1) : onRemove(card.index))}>−</IconButton>
      <IconButton label={`${card.name}: eine Kopie mehr`} onClick={() => onUpdateCount(card.index, card.count + 1)}>+</IconButton>
      <IconButton label={`${card.name} entfernen`} onClick={() => onRemove(card.index)} danger>✕</IconButton>
    </>
  )
}

function dragPropsFor(enabled, card, onDragStart, onDragEnd) {
  return enabled
    ? { draggable: true, onDragStart: (e) => onDragStart(e, card.index), onDragEnd, style: { cursor: 'grab' } }
    : {}
}

// ---------------------------------------------------------------- Liste

function ListRow({ card, cutReason, onUpdateCount, onRemove, onZoom, onPreview, dragEnabled, onDragStart, onDragEnd }) {
  const isCut = Boolean(cutReason)
  const ownership = ownershipOf(card)
  const drag = dragPropsFor(dragEnabled, card, onDragStart, onDragEnd)

  return (
    <li
      {...drag}
      className="group relative flex items-center gap-2 pl-2 pr-1 py-1 min-h-8 text-sm"
      style={{
        ...drag.style,
        borderLeft: `2px solid ${isCut ? 'var(--r)' : 'transparent'}`,
        background: isCut ? 'rgba(193,56,50,0.08)' : undefined
      }}
      title={isCut ? `Streichkandidat: ${cutReason}` : undefined}
    >
      <span className="w-5 text-right tabular-nums flex-shrink-0" style={{ color: card.count > 1 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
        {card.count}
      </span>
      {/* Wraps instead of truncating — the full card name is always readable. */}
      <button
        type="button"
        onClick={() => onZoom(card)}
        onMouseEnter={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => onPreview(null)}
        className="flex-1 min-w-0 text-left leading-snug break-words"
        style={{ color: 'var(--color-text)' }}
      >
        {card.name}
      </button>
      {ownership && (
        <span className="text-[11px] whitespace-nowrap flex-shrink-0" style={{ color: ownership.color }} title={ownership.text}>
          <span className="hidden sm:inline">{ownership.text}</span>
          <span className="sm:hidden" aria-label={ownership.text}>{ownership.symbol}</span>
        </span>
      )}
      <span className="flex-shrink-0"><ManaCost cost={card.manaCost} size={15} /></span>
      <span className="hidden sm:inline-block w-14 text-right tabular-nums text-xs flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        {card.price > 0 ? `€${(card.count * card.price).toFixed(2)}` : ''}
      </span>
      {/* With a mouse the controls float over the row's right end on hover, so they don't
          take width from the name; on touch screens they sit inline and stay visible. */}
      <span
        className="flex items-center flex-shrink-0 [@media(hover:hover)]:absolute [@media(hover:hover)]:right-0 [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:-translate-y-1/2 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        style={{ background: 'var(--color-bg)', boxShadow: '-12px 0 12px -4px var(--color-bg)', borderRadius: 'var(--radius-sm)' }}
      >
        <CountControls card={card} onUpdateCount={onUpdateCount} onRemove={onRemove} />
      </span>
    </li>
  )
}

// ---------------------------------------------------------------- Bilder

function ImageTile({ card, cutReason, onUpdateCount, onRemove, onZoom, dragEnabled, onDragStart, onDragEnd }) {
  const isCut = Boolean(cutReason)
  const ownership = ownershipOf(card)
  const drag = dragPropsFor(dragEnabled, card, onDragStart, onDragEnd)

  return (
    <figure {...drag} className="group m-0" title={isCut ? `Streichkandidat: ${cutReason}` : card.name}>
      <div className="relative">
      <button
        type="button"
        onClick={() => onZoom(card)}
        className="relative block w-full overflow-hidden"
        style={{
          aspectRatio: '488 / 680',
          borderRadius: '4.75% / 3.5%',
          background: 'var(--color-surface)',
          outline: isCut ? '3px solid var(--r)' : '1px solid var(--color-border)',
          outlineOffset: isCut ? 1 : 0
        }}
        aria-label={`${card.name} vergrößern`}
      >
        {card.image
          ? <img src={card.image} alt="" loading="lazy" className="w-full h-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center p-2 text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>{card.name}</span>}
        {card.count > 1 && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-xs font-bold tabular-nums" style={{ background: 'rgba(0,0,0,0.78)', color: '#fff', borderRadius: 3 }}>
            ×{card.count}
          </span>
        )}
        {isCut && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--r)', color: '#fff', borderRadius: 3 }}>
            Streichen?
          </span>
        )}
      </button>
      {/* Over the lower part of the card: on hover with a mouse, always on touch screens. */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center px-1 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)' }}
      >
        <CountControls card={card} onUpdateCount={onUpdateCount} onRemove={onRemove} />
      </div>
      </div>
      <figcaption className="mt-1 flex items-start justify-between gap-1 text-xs leading-snug">
        <span className="min-w-0 break-words" style={{ color: 'var(--color-text)' }}>{card.name}</span>
        {card.price > 0 && <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>€{(card.count * card.price).toFixed(2)}</span>}
      </figcaption>
      {ownership && <div className="text-[11px]" style={{ color: ownership.color }}>{ownership.text}</div>}
    </figure>
  )
}

// ---------------------------------------------------------------- Tabelle

function TableView({ groups, cutReasonMap, onUpdateCount, onRemove, onZoom, onPreview }) {
  const head = 'px-2 py-2 text-left text-[11px] font-semibold whitespace-nowrap'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            <th className={`${head} text-right`}>Anz.</th>
            <th className={head}>Karte</th>
            <th className={`${head} hidden md:table-cell`}>Typ</th>
            <th className={head}>Kosten</th>
            <th className={`${head} text-right`}>Preis</th>
            <th className={head}>Status</th>
            <th className={head}><span className="sr-only">Aktionen</span></th>
          </tr>
        </thead>
        {groups.map(group => (
          <tbody key={group.key}>
            <tr>
              <th colSpan={7} className="px-2 pt-4 pb-1 text-left text-sm font-semibold" style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)' }}>
                {group.label} <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{group.cards.reduce((sum, c) => sum + c.count, 0)}</span>
              </th>
            </tr>
            {group.cards.map(card => {
              const cutReason = cutReasonMap.get(card.name)
              const ownership = ownershipOf(card)
              return (
                <tr
                  key={card.index}
                  style={{ borderBottom: '1px solid var(--color-border)', background: cutReason ? 'rgba(193,56,50,0.08)' : undefined }}
                >
                  <td className="px-2 py-1.5 text-right tabular-nums align-top" style={{ color: 'var(--color-text)' }}>{card.count}</td>
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onZoom(card)}
                      onMouseEnter={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => onPreview({ card, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => onPreview(null)}
                      className="text-left leading-snug"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {card.name}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-xs leading-snug align-top hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>{card.typeLine || '–'}</td>
                  <td className="px-2 py-1.5 align-top"><ManaCost cost={card.manaCost} size={15} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-xs align-top whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                    {card.price > 0 ? `€${(card.count * card.price).toFixed(2)}` : '–'}
                  </td>
                  <td className="px-2 py-1.5 text-xs leading-snug align-top">
                    {cutReason && <div style={{ color: 'var(--r)' }} title={cutReason}>Streichkandidat</div>}
                    {ownership && <div style={{ color: ownership.color }}>{ownership.text}</div>}
                    {card.location && <div style={{ color: 'var(--color-text-secondary)' }} title="Ablageort in deiner Sammlung">📍 {card.location}</div>}
                  </td>
                  <td className="px-1 py-1 align-top">
                    <div className="flex items-center justify-end">
                      <CountControls card={card} onUpdateCount={onUpdateCount} onRemove={onRemove} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Deckliste

/**
 * The deck itself, grouped (type / color / mana value). In the list view the blocks flow
 * into as many columns as fit — the land block sits next to the creatures instead of
 * three screens further down. Type groups accept dragged cards to re-file them.
 */
export default function DeckList({
  view = 'list', groups, groupBy, cutReasonMap, onUpdateCount, onRemove, onZoom,
  isDragging, dragOverGroup, onDragStart, onDragEnd, onDragOverGroup, onDropOnGroup
}) {
  const canHover = useMediaQuery('(hover: hover)')
  const [preview, setPreview] = useState(null)
  const showPreview = canHover ? setPreview : () => {}
  const dragEnabled = groupBy === 'type'

  if (view === 'table') {
    return (
      <>
        <TableView groups={groups} cutReasonMap={cutReasonMap} onUpdateCount={onUpdateCount} onRemove={onRemove} onZoom={onZoom} onPreview={showPreview} />
        {canHover && <HoverPreview preview={preview} />}
      </>
    )
  }

  const isImages = view === 'images'

  return (
    <>
      <div className={isImages ? '' : 'columns-1 md:columns-2 2xl:columns-3 gap-8'}>
        {groups.map(group => {
          const total = group.cards.reduce((sum, c) => sum + c.count, 0)
          const isDropTarget = dragEnabled && dragOverGroup === group.key
          return (
            <section
              key={group.key}
              className={isImages ? 'mb-8' : 'break-inside-avoid mb-6'}
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
                className="flex items-baseline justify-between pb-1 mb-2 text-sm font-semibold"
                style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                {group.label}
                <span className="tabular-nums font-normal" style={{ color: 'var(--color-text-muted)' }}>{total}</span>
              </h3>

              {isImages ? (
                <div className="grid gap-x-3 gap-y-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
                  {group.cards.map(card => (
                    <ImageTile
                      key={card.index}
                      card={card}
                      cutReason={cutReasonMap.get(card.name)}
                      onUpdateCount={onUpdateCount}
                      onRemove={onRemove}
                      onZoom={onZoom}
                      dragEnabled={dragEnabled}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </div>
              ) : (
                <ul>
                  {group.cards.map(card => (
                    <ListRow
                      key={card.index}
                      card={card}
                      cutReason={cutReasonMap.get(card.name)}
                      onUpdateCount={onUpdateCount}
                      onRemove={onRemove}
                      onZoom={onZoom}
                      onPreview={showPreview}
                      dragEnabled={dragEnabled}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                </ul>
              )}

              {group.cards.length === 0 && isDragging && (
                <p className="text-xs italic py-2 text-center" style={{ color: 'var(--color-text-muted)' }}>Hierher ziehen</p>
              )}
            </section>
          )
        })}
      </div>
      {canHover && !isImages && <HoverPreview preview={preview} />}
    </>
  )
}
