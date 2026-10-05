import { useEffect, useRef, useState } from 'react'

// "Spielmarke erschaffen": the usual tokens one click away, every token Scryfall knows by
// search (with its real picture), or a token of your own (name + power/toughness, no picture).

const QUICK = [
  ['Treasure', 'Schatz'], ['Clue', 'Hinweis'], ['Food', 'Nahrung'], ['Blood', 'Blut'],
  ['Soldier', 'Soldat'], ['Zombie', 'Zombie'], ['Spirit', 'Geist'], ['Goblin', 'Goblin'],
  ['Saproling', 'Saproling'], ['Beast', 'Bestie'], ['Elf Warrior', 'Elf-Krieger'], ['Insect', 'Insekt']
]

const imageOf = (card) => card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null

// `exact` (quick picks): only tokens named exactly so — "Treasure", not "Dinosaur // Treasure".
async function searchTokens(term, exact = false) {
  const clean = term.replace(/"/g, '')
  const query = exact ? `t:token !"${clean}"` : `t:token name:"${clean}"`
  const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`)
  if (response.status === 404) return []
  if (!response.ok) throw new Error('Scryfall antwortet gerade nicht – gleich noch einmal versuchen.')
  const data = await response.json()
  const wanted = clean.toLowerCase()
  // Exact names first, double-faced tokens ("A // B") last.
  const rank = (card) => (card.name.toLowerCase() === wanted ? 0 : card.name.includes(' // ') ? 2 : 1)
  return (data.data || [])
    .filter(card => imageOf(card))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 40)
    .map(card => ({
      id: card.id,
      name: card.name,
      image: imageOf(card),
      pt: card.power != null ? `${card.power}/${card.toughness}` : null,
      typeLine: card.type_line,
      text: card.oracle_text || ''
    }))
}

export default function TokenPicker({ onCreate, onClose }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState(null)
  const [count, setCount] = useState(1)
  const [own, setOwn] = useState({ name: '', pt: '' })
  const requestRef = useRef(0)

  const run = async (value, exact = false) => {
    const query = value.trim()
    if (query.length < 2) return
    const request = ++requestRef.current
    setState('loading')
    setChosen(null)
    try {
      const found = await searchTokens(query, exact)
      if (request !== requestRef.current) return
      setResults(found)
      setState('idle')
    } catch (err) {
      if (request !== requestRef.current) return
      setError(err.message)
      setState('error')
    }
  }

  // Typing searches after a short pause (Scryfall asks for few, spaced requests).
  const quickTerm = useRef(null)
  useEffect(() => {
    if (term.trim().length < 2 || term === quickTerm.current) return undefined
    const timer = setTimeout(() => run(term), 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const create = (template) => { onCreate(template, count); onClose() }

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-3" style={{ background: 'rgba(8,8,10,0.85)' }} onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Spielmarke erschaffen"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="font-bold text-fg">Spielmarke erschaffen</h3>
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 min-h-[40px]">Schließen</button>
        </div>

        <div className="px-4 pt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(([english, german]) => (
              <button key={english} type="button" onClick={() => { quickTerm.current = english; setTerm(english); run(english, true) }} className="btn-secondary text-xs px-2.5 min-h-[34px]" title={english}>
                {german}
              </button>
            ))}
          </div>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Spielmarke suchen – englischer Name, z. B. Soldier, Thopter, Treasure"
            className="w-full text-fg rounded-xl p-2.5 text-sm min-h-[44px]"
            autoFocus
            aria-label="Spielmarke suchen"
          />
        </div>

        <div className="overflow-y-auto px-4 py-3 flex-1 min-h-[160px]">
          {state === 'loading' && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Suche bei Scryfall …</p>}
          {state === 'error' && <p className="text-sm" style={{ color: 'var(--r)' }}>{error}</p>}
          {state === 'idle' && term.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Keine Spielmarke mit diesem Namen gefunden. Englische Namen verwenden – oder unten eine eigene anlegen.</p>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {results.map(token => {
              const on = chosen?.id === token.id
              return (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => setChosen(token)}
                  onDoubleClick={() => create(token)}
                  className="text-left"
                  title={`${token.typeLine}${token.text ? `\n${token.text}` : ''}`}
                  aria-pressed={on}
                >
                  <img src={token.image} alt={token.name} className="w-full block" style={{ borderRadius: 6, outline: on ? '3px solid var(--gold)' : 'none', outlineOffset: 2 }} loading="lazy" />
                  <span className="block text-xs mt-1 leading-tight" style={{ color: 'var(--color-text-secondary)' }}>{token.name}{token.pt ? ` ${token.pt}` : ''}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Anzahl
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20 text-fg rounded-xl p-2 text-sm min-h-[40px] tabular-nums" />
          </label>
          <button type="button" onClick={() => chosen && create(chosen)} disabled={!chosen} className="btn-primary text-sm px-5 min-h-[44px]">
            {chosen ? `${count}× ${chosen.name} erschaffen` : 'Spielmarke wählen'}
          </button>
          <details className="basis-full">
            <summary className="cursor-pointer text-xs" style={{ color: 'var(--color-text-muted)' }}>Eigene Spielmarke ohne Bild</summary>
            <form
              className="flex flex-wrap gap-2 mt-2"
              onSubmit={(e) => { e.preventDefault(); if (own.name.trim()) create({ name: own.name.trim(), image: null, pt: own.pt.trim() || null }) }}
            >
              <input value={own.name} onChange={(e) => setOwn(prev => ({ ...prev, name: e.target.value }))} placeholder="Name, z. B. Drache" className="flex-1 min-w-[160px] text-fg rounded-xl p-2 text-sm min-h-[40px]" aria-label="Name der Spielmarke" />
              <input value={own.pt} onChange={(e) => setOwn(prev => ({ ...prev, pt: e.target.value }))} placeholder="4/4" className="w-24 text-fg rounded-xl p-2 text-sm min-h-[40px]" aria-label="Stärke/Widerstand" />
              <button type="submit" disabled={!own.name.trim()} className="btn-secondary text-sm px-4 min-h-[40px]">Erschaffen</button>
            </form>
          </details>
        </div>
      </div>
    </div>
  )
}
