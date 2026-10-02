import { useEffect, useRef, useState } from 'react'

const OPTIONS = [
  { id: 'manabox', label: 'CSV für ManaBox', hint: 'Zum Import in ManaBox – so wird der Entwurf ein echtes Deck' },
  { id: 'excel', label: 'CSV für Excel', hint: 'Mit Typ, Manakosten, Preis und Status, öffnet direkt in Excel' },
  { id: 'text', label: 'Deckliste (.txt)', hint: 'Für Moxfield, Archidekt und andere Deckbuilder' }
]

// "Exportieren" button with a small menu of formats (see lib/deckExport.js).
export default function ExportMenu({ onExport, disabled }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-sm px-3 py-1.5 whitespace-nowrap"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}
      >
        Exportieren ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-72"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-sm)' }}
        >
          {OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => { onExport(option.id); setOpen(false) }}
              className="block w-full text-left px-3 py-2 [@media(pointer:coarse)]:py-3 hover:bg-[color:var(--color-accent-light)]"
            >
              <span className="block text-sm font-medium" style={{ color: 'var(--color-text)' }}>{option.label}</span>
              <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>{option.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
