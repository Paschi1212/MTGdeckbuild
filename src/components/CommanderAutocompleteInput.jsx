import { useState, useMemo } from 'react'

// A native <input list="..."> datalist looked like the simplest fix, but browsers filter
// it inconsistently (prefix-only in some, ignored entirely in others) and its popup can't
// be themed to match the app's dark UI — reports were "suggestions don't show up at all".
// A small controlled dropdown guarantees consistent, substring, case-insensitive matching.
export default function CommanderAutocompleteInput({ value, onChange, onSubmit, cardNames, placeholder, className }) {
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return cardNames.filter(name => name.toLowerCase().includes(q)).slice(0, 8)
  }, [value, cardNames])

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { setOpen(false); onSubmit?.(value) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className={className}
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden max-h-56 overflow-y-auto"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
        >
          {matches.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={() => { onChange(name); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-sm text-fg hover:bg-[color:var(--color-accent-light)]"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
