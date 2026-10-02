import { useState, useEffect, useRef } from 'react'
import CommanderSearchResultsModal from './CommanderSearchResultsModal'

// Unlike CommanderAutocompleteInput (filters a LOCAL list — the user's own collection,
// correct for "which of my cards is the commander"), this searches ALL of Magic via
// get-commander-autocomplete, for "I want to discover/pick any commander, not just one I
// already own". Debounced (300ms) since every keystroke would otherwise fire a request.
export default function CommanderSearchInput({ value, onChange, onSubmit, placeholder, className }) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState([]) // [{name, image, colors}]
  const [showResultsModal, setShowResultsModal] = useState(false)
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
        .then(res => (res.ok ? res.json() : { commanders: [] }))
        .then(data => {
          // Ignore a stale response that resolved after a newer keystroke's request.
          if (thisRequestId === requestIdRef.current) setMatches(data.commanders || [])
        })
        .catch(() => {})
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [value])

  const handlePick = (name) => {
    onChange(name)
    setOpen(false)
    setShowResultsModal(false)
  }

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
          {matches.map(card => (
            <button
              key={card.name}
              type="button"
              onMouseDown={() => handlePick(card.name)}
              className="block w-full text-left px-3 py-2 text-sm text-fg hover:bg-[color:var(--color-accent-light)]"
            >
              {card.name}
            </button>
          ))}
          {/* "Folgefenster" with real card images — a bare name list doesn't help tell apart
              several versions of the same character (e.g. multiple Vraska planeswalkers). */}
          <button
            type="button"
            onMouseDown={() => setShowResultsModal(true)}
            className="block w-full text-left px-3 py-2 text-xs font-semibold"
            style={{ color: 'var(--u)', borderTop: '1px solid var(--border)' }}
          >
            🖼️ Alle {matches.length} Treffer mit Bildern anzeigen
          </button>
        </div>
      )}

      {showResultsModal && (
        <CommanderSearchResultsModal
          query={value}
          results={matches}
          onSelect={(name) => { handlePick(name); onSubmit?.(name) }}
          onClose={() => setShowResultsModal(false)}
        />
      )}
    </div>
  )
}
