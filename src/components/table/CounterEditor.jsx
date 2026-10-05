import { useEffect, useState } from 'react'
import { CARD_COUNTERS, counterLabel } from '../../lib/table/board'

// "Marken …" for one card on your battlefield: the usual counters with −/+, plus any other
// kind by name (e.g. "Öl", "Wissen"). Changes apply at once and everyone sees them on the card.
export default function CounterEditor({ card, onChange, onClose }) {
  const [other, setOther] = useState('')
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!card) return null

  const counters = card.counters || {}
  const custom = Object.keys(counters).filter(key => !CARD_COUNTERS.some(c => c.key === key))
  const rows = [...CARD_COUNTERS.map(c => c.key), ...custom]

  const Step = ({ label, onClick, title }) => (
    <button type="button" onClick={onClick} title={title} aria-label={title} className="btn-secondary w-10 min-h-[40px] text-base font-bold">{label}</button>
  )

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-3" style={{ background: 'rgba(8,8,10,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-sm p-4 space-y-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Marken auf ${card.name}`}
      >
        <div className="flex items-center gap-3">
          {card.image && <img src={card.image} alt="" className="w-14 flex-shrink-0" style={{ borderRadius: 4 }} />}
          <div className="min-w-0">
            <h3 className="font-bold text-fg leading-tight">Marken</h3>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>{card.name}</p>
          </div>
        </div>

        <ul className="space-y-1.5">
          {rows.map(key => (
            <li key={key} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-fg">{counterLabel(key)}</span>
              <Step label="−" onClick={() => onChange(key, -1)} title={`${counterLabel(key)}-Marke entfernen`} />
              <span className="w-8 text-center font-bold tabular-nums text-fg">{counters[key] || 0}</span>
              <Step label="+" onClick={() => onChange(key, 1)} title={`${counterLabel(key)}-Marke hinzufügen`} />
            </li>
          ))}
        </ul>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (other.trim()) { onChange(other.trim(), 1); setOther('') } }}>
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Andere Marke, z. B. Öl" maxLength={24} className="flex-1 text-fg rounded-xl p-2 text-sm min-h-[40px]" aria-label="Andere Marke" />
          <button type="submit" disabled={!other.trim()} className="btn-secondary text-sm px-3 min-h-[40px]">+1</button>
        </form>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+1/+1- und −1/−1-Marken heben sich gegenseitig auf.</p>

        <button type="button" onClick={onClose} className="btn-primary w-full min-h-[44px]">Fertig</button>
      </div>
    </div>
  )
}
