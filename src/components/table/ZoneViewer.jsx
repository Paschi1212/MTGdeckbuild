import { useState } from 'react'
import { TableCard } from './TableCard'

// A pile opened up: graveyard, exile (anyone's, read-only for others), searching your library,
// or looking at its top cards. `actions(card)` → buttons per card; `footer` → buttons below.
export default function ZoneViewer({ title, hint, cards, actions, footer, onClose, onHover }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(8,8,10,0.85)' }} onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[85vh] flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 className="font-bold text-fg">{title} <span className="font-normal tabular-nums" style={{ color: 'var(--color-text-muted)' }}>({cards.length})</span></h3>
            {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 min-h-[40px]">Schließen</button>
        </div>
        <div className="overflow-y-auto p-4">
          {cards.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Leer.</p>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              {cards.map((card, index) => (
                <div key={card.iid} className="flex flex-col items-center gap-1.5">
                  <TableCard card={{ ...card, tapped: false }} width={130} onHover={onHover} />
                  {actions && <div className="flex flex-wrap justify-center gap-1">{actions(card, index)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function SmallButton({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} className="btn-secondary text-xs px-2 min-h-[32px]">{children}</button>
  )
}

/** Looking at the top N: keep on top (in order), send to the bottom, or to the graveyard. */
export function TopCardsViewer({ cards, onDone, onClose, onHover }) {
  const [decision, setDecision] = useState(() => Object.fromEntries(cards.map(card => [card.iid, 'keep'])))
  const [order, setOrder] = useState(cards.map(card => card.iid))
  const byId = Object.fromEntries(cards.map(card => [card.iid, card]))
  const ordered = order.map(iid => byId[iid])
  const moveUp = (index) => setOrder(prev => {
    if (index === 0) return prev
    const next = [...prev]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    return next
  })
  const label = { keep: 'oben', bottom: 'unten', grave: 'Friedhof' }
  const finish = () => onDone({
    keep: ordered.filter(card => decision[card.iid] === 'keep'),
    bottom: ordered.filter(card => decision[card.iid] === 'bottom'),
    grave: ordered.filter(card => decision[card.iid] === 'grave')
  })
  return (
    <ZoneViewer
      title="Oberste Karten der Bibliothek"
      hint="Links liegt oben. Für jede Karte wählen: oben lassen, unter die Bibliothek oder auf den Friedhof."
      cards={ordered}
      onClose={onClose}
      onHover={onHover}
      actions={(card, index) => (
        <>
          {['keep', 'bottom', 'grave'].map(choice => (
            <button
              key={choice}
              type="button"
              onClick={() => setDecision(prev => ({ ...prev, [card.iid]: choice }))}
              className="text-xs px-2 min-h-[32px]"
              aria-pressed={decision[card.iid] === choice}
              style={{
                background: decision[card.iid] === choice ? 'var(--color-accent)' : 'var(--color-surface)',
                color: decision[card.iid] === choice ? 'var(--color-bg)' : 'var(--color-text)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)'
              }}
            >
              {label[choice]}
            </button>
          ))}
          {index > 0 && <SmallButton onClick={() => moveUp(index)} title="Eine Position nach oben">↑</SmallButton>}
        </>
      )}
      footer={<button type="button" onClick={finish} className="btn-primary text-sm px-5 min-h-[40px]">Fertig</button>}
    />
  )
}
