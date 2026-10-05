import { useEffect, useRef, useState } from 'react'

// The turn order as a list to rearrange: ↑/↓ per player, or the whole direction reversed.
export function OrderList({ order, nameOf, onChange, statusOf }) {
  const move = (index, delta) => {
    const next = [...order]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <ol className="space-y-1">
      {order.map((playerId, index) => (
        <li key={playerId} className="flex items-center gap-2 text-sm">
          <span className="w-5 text-right tabular-nums font-semibold" style={{ color: 'var(--color-text-muted)' }}>{index + 1}.</span>
          <span className="flex-1 min-w-0 truncate text-fg">{nameOf(playerId)}</span>
          {statusOf && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>{statusOf(playerId)}</span>}
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn-secondary w-9 min-h-[34px] text-sm" aria-label={`${nameOf(playerId)} früher`} title="früher">↑</button>
          <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} className="btn-secondary w-9 min-h-[34px] text-sm" aria-label={`${nameOf(playerId)} später`} title="später">↓</button>
        </li>
      ))}
    </ol>
  )
}

/**
 * During the game: a small ⇅ next to the round — for the rare cards that change the turn
 * order (reverse it, extra turns in between …). Deliberately quiet.
 */
export function TurnOrderButton({ order, nameOf, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(order)
  const ref = useRef(null)
  useEffect(() => { if (open) setDraft(order) }, [open, order])
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const changed = draft.join() !== order.join()
  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="ml-1 px-1 text-xs leading-none"
        style={{ color: 'var(--color-text-muted)' }}
        title="Zugreihenfolge ändern"
        aria-label="Zugreihenfolge ändern"
        aria-expanded={open}
      >
        ⇅
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-40 w-72 p-3 space-y-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Zugreihenfolge</div>
          <OrderList order={draft} nameOf={nameOf} onChange={setDraft} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDraft(prev => [...prev].reverse())} className="btn-secondary text-xs px-3 min-h-[36px]">Richtung umkehren</button>
            <button type="button" onClick={() => { onSave(draft); setOpen(false) }} disabled={!changed} className="btn-primary text-xs px-3 min-h-[36px]">Übernehmen</button>
          </div>
        </div>
      )}
    </span>
  )
}
