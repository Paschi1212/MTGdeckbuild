import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCardData } from '../../lib/cardData'
import { locationsFromIndex, formatCardLocations } from '../../lib/collection'
import ManaCost from '../ManaCost'

const TYPES = [
  ['Creature', 'Kreatur'], ['Instant', 'Spontanzauber'], ['Sorcery', 'Hexerei'], ['Artifact', 'Artefakt'],
  ['Enchantment', 'Verzauberung'], ['Planeswalker', 'Planeswalker'], ['Land', 'Land'], ['Battle', 'Schlacht']
]
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
const CMC_STEPS = ['0', '1', '2', '3', '4', '5', '6', '7+']
const RARITIES = [['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['mythic', 'Mythic']]
const SORTS = [['name', 'Name'], ['cmc', 'Manawert'], ['price', 'Preis (hoch zuerst)']]
const PAGE = 60

const fieldStyle = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }
const chipStyle = (on) => ({
  background: on ? 'var(--color-accent)' : 'var(--color-bg)',
  color: on ? 'var(--color-bg)' : 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)'
})

function Group({ label, children }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</legend>
      {children}
    </fieldset>
  )
}

/**
 * The player's own collection, searchable while building: name, rules text, type line, colors,
 * mana value, rarity, binder — one card per name, with how many copies are free and where
 * they lie. "+" puts the card into the deck.
 */
export default function CollectionBrowser({ collection, availableQuantities, locationIndex, identity, commanderName, existingNames, onAdd, onZoom, onClose }) {
  const [data, setData] = useState({ byId: {}, byName: {} })
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [typeLine, setTypeLine] = useState('')
  const [types, setTypes] = useState([])
  const [colors, setColors] = useState([])
  const [fitsCommander, setFitsCommander] = useState(true)
  const [cmc, setCmc] = useState([])
  const [rarities, setRarities] = useState([])
  const [binder, setBinder] = useState('')
  const [freeOnly, setFreeOnly] = useState(true)
  const [hideInDeck, setHideInDeck] = useState(true)
  const [sortBy, setSortBy] = useState('name')
  const [shown, setShown] = useState(PAGE)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Card details (type, mana value, rules text) — from the browser cache when the collection was
  // opened before, otherwise loaded in chunks.
  useEffect(() => {
    let cancelled = false
    const cards = collection?.cards || []
    loadCardData({
      ids: cards.map(c => c.scryfallId).filter(Boolean),
      names: cards.filter(c => !c.scryfallId).map(c => c.name),
      isCancelled: () => cancelled,
      onUpdate: (next) => { if (!cancelled) setData(next) }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [collection])

  // One entry per card name: the first printing with details, all copies counted.
  const entries = useMemo(() => {
    const byName = new Map()
    for (const row of collection?.cards || []) {
      const info = data.byId[row.scryfallId] || data.byName[row.name]
      const entry = byName.get(row.name)
      if (!entry) {
        byName.set(row.name, { row, info, binders: new Set([row.binderName]), rarity: String(row.rarity || '').toLowerCase(), price: row.purchasePrice || 0 })
      } else {
        entry.binders.add(row.binderName)
        if (!entry.info && info) { entry.info = info; entry.row = row }
        entry.price = Math.max(entry.price, row.purchasePrice || 0)
      }
    }
    return [...byName.values()]
  }, [collection, data])

  const binders = useMemo(() => [...new Set((collection?.cards || []).map(c => c.binderName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [collection])

  const results = useMemo(() => {
    const q = name.trim().toLowerCase()
    const terms = [...text.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)].map(m => m[1] || m[2])
    const line = typeLine.trim().toLowerCase()
    const list = entries.filter(({ row, info, binders: inBinders, rarity }) => {
      if (row.name === commanderName) return false
      if (hideInDeck && existingNames.has(row.name)) return false
      if (freeOnly && !(availableQuantities.get(row.name)?.available > 0)) return false
      if (q && !row.name.toLowerCase().includes(q)) return false
      if (binder && !inBinders.has(binder)) return false
      if (rarities.length && !rarities.includes(rarity)) return false
      const needsInfo = terms.length || line || types.length || colors.length || cmc.length || (fitsCommander && identity)
      if (needsInfo && !info) return false
      if (terms.length) {
        const oracle = String(info.oracleText || '').toLowerCase()
        if (!terms.every(term => oracle.includes(term))) return false
      }
      if (line && !String(info.typeLine || '').toLowerCase().includes(line)) return false
      if (types.length && !types.some(type => String(info.typeLine || '').includes(type))) return false
      const own = String(info?.colors ?? info?.colorIdentity ?? '').split(/\s+/).filter(Boolean)
      if (fitsCommander && identity && !own.every(c => identity.includes(c))) return false
      // A card with every chosen color in it ("C" = colorless).
      if (colors.length && !colors.every(c => (c === 'C' ? own.length === 0 : own.includes(c)))) return false
      if (cmc.length) {
        const value = Math.round(info.cmc || 0)
        if (!cmc.includes(value >= 7 ? '7+' : String(value))) return false
      }
      return true
    })
    const sorters = {
      name: (a, b) => a.row.name.localeCompare(b.row.name),
      cmc: (a, b) => (a.info?.cmc ?? 0) - (b.info?.cmc ?? 0) || a.row.name.localeCompare(b.row.name),
      price: (a, b) => (b.info?.eur || b.price) - (a.info?.eur || a.price) || a.row.name.localeCompare(b.row.name)
    }
    return list.sort(sorters[sortBy])
  }, [entries, name, text, typeLine, types, colors, fitsCommander, identity, cmc, rarities, binder, freeOnly, hideInDeck, existingNames, availableQuantities, commanderName, sortBy])

  useEffect(() => { setShown(PAGE) }, [results])

  const toggle = (setter) => (value) => setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  const activeFilters = [text, typeLine, binder].filter(Boolean).length + types.length + colors.length + cmc.length + rarities.length
  const reset = () => { setName(''); setText(''); setTypeLine(''); setTypes([]); setColors([]); setCmc([]); setRarities([]); setBinder('') }

  const filters = (
    <div className="space-y-4">
      <Group label="Kartentext">
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder='z. B. draw card, "each opponent"' className="w-full px-2.5 py-1.5 text-sm" style={fieldStyle} />
      </Group>
      <Group label="Kartentyp">
        <div className="flex flex-wrap gap-1">
          {TYPES.map(([value, label]) => (
            <button key={value} type="button" onClick={() => toggle(setTypes)(value)} aria-pressed={types.includes(value)} className="text-xs px-2 py-1" style={chipStyle(types.includes(value))}>{label}</button>
          ))}
        </div>
        <input type="search" value={typeLine} onChange={(e) => setTypeLine(e.target.value)} placeholder="Typzeile enthält, z. B. Vampire, Equipment" className="w-full mt-1.5 px-2.5 py-1.5 text-sm" style={fieldStyle} />
      </Group>
      <Group label="Farben">
        <div className="flex gap-1">
          {COLORS.map(color => (
            <button key={color} type="button" onClick={() => toggle(setColors)(color)} aria-pressed={colors.includes(color)} aria-label={`Farbe ${color}`} className="p-1" style={{ ...chipStyle(colors.includes(color)), background: colors.includes(color) ? 'var(--color-accent-light)' : 'var(--color-bg)', outline: colors.includes(color) ? '2px solid var(--color-accent)' : 'none' }}>
              <ManaCost cost={`{${color}}`} size={18} />
            </button>
          ))}
        </div>
        {identity && (
          <label className="flex items-center gap-2 text-xs mt-1.5 cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={fitsCommander} onChange={(e) => setFitsCommander(e.target.checked)} />
            Nur Farben des Commanders
          </label>
        )}
      </Group>
      <Group label="Manawert">
        <div className="flex flex-wrap gap-1">
          {CMC_STEPS.map(step => (
            <button key={step} type="button" onClick={() => toggle(setCmc)(step)} aria-pressed={cmc.includes(step)} className="text-xs w-8 py-1 tabular-nums" style={chipStyle(cmc.includes(step))}>{step}</button>
          ))}
        </div>
      </Group>
      <Group label="Seltenheit">
        <div className="flex flex-wrap gap-1">
          {RARITIES.map(([value, label]) => (
            <button key={value} type="button" onClick={() => toggle(setRarities)(value)} aria-pressed={rarities.includes(value)} className="text-xs px-2 py-1" style={chipStyle(rarities.includes(value))}>{label}</button>
          ))}
        </div>
      </Group>
      <Group label="Ordner">
        <select value={binder} onChange={(e) => setBinder(e.target.value)} className="w-full px-2 py-1.5 text-sm" style={fieldStyle}>
          <option value="">Alle Ordner und Decks</option>
          {binders.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Group>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
          Nur freie Exemplare (nicht in anderen Decks verbaut)
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={hideInDeck} onChange={(e) => setHideInDeck(e.target.checked)} />
          Karten im Deck ausblenden
        </label>
      </div>
      {activeFilters > 0 && <button type="button" onClick={reset} className="text-xs underline underline-offset-2" style={{ color: 'var(--color-text-secondary)' }}>Filter zurücksetzen</button>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center p-0 md:p-6" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sammlung durchsuchen"
        className="w-full max-w-6xl flex flex-col overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="m-0 text-base font-semibold whitespace-nowrap" style={{ color: 'var(--color-text)' }}>Sammlung durchsuchen</h2>
          <input
            ref={nameRef}
            type="search"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kartenname …"
            aria-label="Kartenname"
            className="flex-1 min-w-0 px-3 py-2 text-sm"
            style={fieldStyle}
          />
          <button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen} className="md:hidden btn-secondary text-xs px-3 py-2">
            Filter{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-3 py-2">Schließen</button>
        </header>

        <div className="flex-1 min-h-0 grid md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className={`${filtersOpen ? 'block' : 'hidden'} md:block overflow-y-auto p-4 max-h-[45vh] md:max-h-none`} style={{ borderRight: '1px solid var(--color-border)' }}>
            {filters}
          </aside>
          <section className="overflow-y-auto p-4 min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-xs m-0" style={{ color: 'var(--color-text-muted)' }}>
                {results.length} {results.length === 1 ? 'Karte' : 'Karten'}
                {loading ? ' · Kartendaten werden geladen – Typ-, Text- und Farbfilter werden gleich vollständig' : ''}
              </p>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Sortieren
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm px-2 py-1" style={fieldStyle}>
                  {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            {results.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Keine Karte passt zu diesen Filtern</p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {activeFilters || name.trim() || !freeOnly ? 'Lockere einen Filter oder setze sie zurück.' : 'Auch verbaute Karten zeigen: „Nur freie Exemplare“ abwählen.'}
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                  {results.slice(0, shown).map(({ row, info }) => {
                    const free = availableQuantities.get(row.name)?.available || 0
                    const inDeck = existingNames.has(row.name)
                    const where = formatCardLocations(locationsFromIndex(locationIndex, row.name))
                    return (
                      <li key={row.name} className="min-w-0">
                        <div className="relative">
                          <button type="button" onClick={() => onZoom({ name: row.name, image: info?.image || null })} className="block w-full" aria-label={`${row.name} groß anzeigen`}>
                            {info?.image
                              ? <img src={info.image} alt="" loading="lazy" className="w-full block" style={{ borderRadius: 7 }} />
                              : <span className="flex items-center justify-center text-center text-xs p-2 aspect-[5/7]" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 7, color: 'var(--color-text)' }}>{row.name}</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdd(row)}
                            disabled={inDeck}
                            aria-label={inDeck ? `${row.name} ist im Deck` : `${row.name} ins Deck`}
                            className="absolute bottom-2 right-2 text-sm font-bold w-9 h-9"
                            style={inDeck
                              ? { background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: '50%' }
                              : { background: 'var(--g)', color: '#fff', border: 'none', borderRadius: '50%', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
                          >
                            {inDeck ? '✓' : '+'}
                          </button>
                        </div>
                        <div className="mt-1 text-xs leading-snug">
                          <div className="font-semibold" style={{ color: 'var(--color-text)' }}>{row.name}</div>
                          <div style={{ color: free ? 'var(--g)' : 'var(--color-text-muted)' }}>
                            {free ? `${free} frei` : 'verbaut'}{where ? ` · ${where}` : ''}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {results.length > shown && (
                  <button type="button" onClick={() => setShown(n => n + PAGE)} className="btn-secondary w-full mt-4 text-sm">
                    Weitere {Math.min(PAGE, results.length - shown)} von {results.length - shown} anzeigen
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
