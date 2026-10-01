import { useState, useEffect, useRef } from 'react'

// Unlike CommanderAutocompleteInput (filters a LOCAL list — the user's own collection,
// correct for "which of my cards is the commander"), this searches ALL of Magic via
// get-commander-autocomplete, for "I want to discover/pick any commander, not just one I
// already own". Debounced (300ms) since every keystroke would otherwise fire a request.
export default function CommanderSearchInput({ value, onChange, onSubmit, placeholder, className }) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState([])
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const q = value.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.length < 2) {
      setMatches([])
      return
    }

    const thisRequestId = ++requestIdRef.current
    debounceRef.current = setTimeout(() => {
      fetch(`/.netlify/functions/get-commander-autocomplete?q=${encodeURIComponent(q)}`)
        .then(res => (res.ok ? res.json() : { names: [] }))
        .then(data => {
          // Ignore a stale response that resolved after a newer keystroke's request.
          if (thisRequestId === requestIdRef.current) setMatches(data.names || [])
        })
        .catch(() => {})
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [value])

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
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden max-h-56 overflow-y-auto"
          style={{ backgroundColor: '#171129', border: '1px solid var(--border)' }}
        >
          {matches.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={() => { onChange(name); setOpen(false) }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
