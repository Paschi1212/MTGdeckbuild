import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_OWNED = 6
const MAX_OTHER = 8

// One search box for both sources: free copies from the user's collection first (nothing to
// buy), then any other Magic card by name via Scryfall's autocomplete (to buy). Prices come
// from Scryfall automatically, so there's no manual price entry anymore.
export default function CardSearch({ collection, availableQuantities, existingNames, commanderName, onAddOwned, onAddByName }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [otherNames, setOtherNames] = useState([])
  const requestRef = useRef(null)

  const q = query.trim().toLowerCase()

  const owned = useMemo(() => {
    if (q.length < 2 || !collection?.cards) return []
    const seen = new Set()
    const results = []
    for (const row of collection.cards) {
      if (row.name === commanderName || existingNames.has(row.name) || seen.has(row.name)) continue
      if (!row.name.toLowerCase().includes(q)) continue
      if (!availableQuantities.get(row.name)?.available) continue
      seen.add(row.name)
      results.push(row)
      if (results.length >= MAX_OWNED) break
    }
    return results
  }, [q, collection, commanderName, existingNames, availableQuantities])

  useEffect(() => {
    requestRef.current?.abort()
    if (q.length < 2) {
      setOtherNames([])
      return
    }
    const controller = new AbortController()
    requestRef.current = controller
    const timer = setTimeout(() => {
      fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(res => (res.ok ? res.json() : { data: [] }))
        .then(data => setOtherNames(data.data || []))
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])

  const ownedNames = new Set(owned.map(r => r.name))
  const others = otherNames
    .filter(name => name !== commanderName && !existingNames.has(name) && !ownedNames.has(name))
    .slice(0, MAX_OTHER)

  const reset = () => {
    setQuery('')
    setOtherNames([])
  }
  const addOwned = (row) => { onAddOwned(row); reset() }
  const addOther = (name) => { onAddByName(name); reset() }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter') {
      if (owned[0]) addOwned(owned[0])
      else if (others[0]) addOther(others[0])
    }
  }

  const showList = open && q.length >= 2 && (owned.length > 0 || others.length > 0)

  return (
    <div className="relative flex-1 min-w-[220px]">
      <input
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Karte hinzufügen …"
        aria-label="Karte suchen und hinzufügen"
        className="w-full px-3 py-2 text-sm"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}
      />
      {showList && (
        <div
          className="absolute z-40 left-0 right-0 mt-1 max-h-80 overflow-y-auto text-sm"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-sm)' }}
        >
          {owned.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Aus deiner Sammlung</div>
              {owned.map(row => (
                <button
                  key={row.scryfallId || row.name}
                  type="button"
                  onMouseDown={() => addOwned(row)}
                  className="w-full flex justify-between gap-3 px-3 py-1.5 text-left hover:bg-[color:var(--color-accent-light)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span className="truncate">{row.name}</span>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--g)' }}>vorhanden</span>
                </button>
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Weitere Karten</div>
              {others.map(name => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={() => addOther(name)}
                  className="w-full flex justify-between gap-3 px-3 py-1.5 text-left hover:bg-[color:var(--color-accent-light)]"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span className="truncate">{name}</span>
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>Zukauf</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
