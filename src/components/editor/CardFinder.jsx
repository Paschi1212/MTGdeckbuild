import { useEffect, useMemo, useState } from 'react'
import ManaCost from '../ManaCost'

// EDHREC lists per card type, in the order a deck is usually built.
const EDHREC_GROUPS = [
  { id: 'highSynergyCards', label: 'Synergie' },
  { id: 'topCards', label: 'Top-Karten' },
  { id: 'creatures', label: 'Kreaturen' },
  { id: 'instants', label: 'Spontanzauber' },
  { id: 'sorceries', label: 'Hexereien' },
  { id: 'artifacts', label: 'Artefakte' },
  { id: 'enchantments', label: 'Verzauberungen' },
  { id: 'planeswalkers', label: 'Planeswalker' },
  { id: 'lands', label: 'Länder' }
]

const chipStyle = (on) => ({
  background: on ? 'var(--color-accent)' : 'var(--color-bg)',
  color: on ? 'var(--color-bg)' : 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)'
})

function AddRow({ name, detail, owned, onAdd, onZoom }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <button type="button" onClick={onZoom} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm" style={{ color: 'var(--color-text)' }}>{name}</span>
        {detail && <span className="block text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{detail}</span>}
      </button>
      {owned && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--g)' }}>vorhanden</span>}
      <button
        type="button"
        onClick={onAdd}
        aria-label={`${name} ins Deck`}
        className="text-xs font-semibold px-2.5 py-1"
        style={{ color: '#fff', border: '1px solid var(--g)', background: 'var(--g)', borderRadius: 'var(--radius-sm)' }}
      >
        +
      </button>
    </li>
  )
}

/**
 * "Karten finden" in the editor, for building a deck by hand: what EDHREC decks with this
 * commander play, and a Scryfall search (type, rules text, anything Scryfall understands)
 * limited to the commander's color identity.
 */
export default function CardFinder({ commanderName, identity, existingNames, isOwned, onAdd, onZoom }) {
  const [mode, setMode] = useState('edhrec')
  const [edhrec, setEdhrec] = useState(null) // null = loading, false = failed
  const [group, setGroup] = useState('highSynergyCards')
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState({ status: 'idle', cards: [], total: 0 })

  useEffect(() => {
    if (!commanderName) return undefined
    let cancelled = false
    setEdhrec(null)
    fetch(`/.netlify/functions/get-commander-data?commander=${encodeURIComponent(commanderName)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setEdhrec(data?.recommendations ? data : false) })
      .catch(() => { if (!cancelled) setEdhrec(false) })
    return () => { cancelled = true }
  }, [commanderName])

  const edhrecCards = useMemo(() => {
    const list = edhrec?.recommendations?.[group] || []
    const seen = new Set()
    return list.filter(card => {
      if (seen.has(card.name) || existingNames.has(card.name) || card.name === commanderName) return false
      seen.add(card.name)
      return !ownedOnly || isOwned(card.name)
    })
  }, [edhrec, group, existingNames, commanderName, ownedOnly, isOwned])

  // id<= keeps every result legal under this commander; "c" = colorless only.
  const identityFilter = identity ? `id<=${identity.join('').toLowerCase() || 'c'}` : ''

  const runSearch = (event) => {
    event?.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearch({ status: 'loading', cards: [], total: 0 })
    const full = `${q} ${identityFilter} legal:commander`.trim()
    fetch(`https://api.scryfall.com/cards/search?order=edhrec&q=${encodeURIComponent(full)}`)
      .then(async res => {
        if (res.status === 404) return { data: [], total_cards: 0 }
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.details || `Scryfall antwortet mit ${res.status}`)
        return res.json()
      })
      .then(data => setSearch({
        status: 'done',
        total: data.total_cards || 0,
        cards: (data.data || []).map(card => ({
          name: card.name,
          manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? '',
          typeLine: card.type_line || '',
          image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
          eur: card.prices?.eur ? Number(card.prices.eur) : null
        }))
      }))
      .catch(err => setSearch({ status: 'error', cards: [], total: 0, message: err.message }))
  }

  const searchCards = search.cards.filter(card => !existingNames.has(card.name) && card.name !== commanderName && (!ownedOnly || isOwned(card.name)))
  // Without an image of its own (EDHREC lists), Scryfall's image redirect by exact name.
  const zoomByName = (name, image) => onZoom({ name, image: image || `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}` })

  if (!commanderName) {
    return <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>Wähle zuerst einen Commander – dann zeigt dir das Panel passende Karten.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[['edhrec', 'Beliebt bei EDHREC'], ['search', 'Scryfall-Suche']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} className="flex-1 text-xs font-semibold px-2 py-1.5" style={chipStyle(mode === id)}>
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
        Nur Karten, die ich frei habe
      </label>

      {mode === 'edhrec' ? (
        <>
          <div className="flex flex-wrap gap-1">
            {EDHREC_GROUPS.map(g => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className="text-[11px] px-2 py-1" style={chipStyle(group === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          {edhrec === null && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Lade EDHREC-Daten …</p>}
          {edhrec === false && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Für diesen Commander hat EDHREC keine Daten – nutze die Scryfall-Suche.</p>}
          {edhrec && (
            edhrecCards.length ? (
              <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {edhrecCards.slice(0, 60).map(card => (
                  <AddRow
                    key={card.name}
                    name={card.name}
                    detail={[
                      edhrec.deckCount && card.count ? `in ${Math.round((card.count / edhrec.deckCount) * 100)} % der Decks` : null,
                      card.synergy ? `Synergie ${card.synergy > 0 ? '+' : ''}${Math.round(card.synergy * 100)} %` : null
                    ].filter(Boolean).join(' · ')}
                    owned={isOwned(card.name)}
                    onAdd={() => onAdd(card.name)}
                    onZoom={() => zoomByName(card.name, null)}
                  />
                ))}
              </ul>
            ) : <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nichts mehr offen in dieser Liste.</p>
          )}
        </>
      ) : (
        <>
          <form onSubmit={runSearch} className="flex gap-1.5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. t:dragon, o:draw, ramp"
              aria-label="Scryfall-Suche"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}
            />
            <button type="submit" className="btn-secondary text-xs px-3">Suchen</button>
          </form>
          <p className="text-[11px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            Scryfall-Syntax: <code>t:</code> Typ, <code>o:</code> Kartentext, <code>mv&lt;=2</code> Manawert. Nur Karten in der Farbidentität des Commanders, sortiert nach Beliebtheit.
          </p>
          {search.status === 'loading' && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Suche …</p>}
          {search.status === 'error' && <p className="text-xs" style={{ color: 'var(--r)' }}>{search.message}</p>}
          {search.status === 'done' && (
            searchCards.length ? (
              <>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {search.total} Treffer{search.total > search.cards.length ? `, die ${search.cards.length} beliebtesten` : ''}
                </p>
                <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {searchCards.map(card => (
                    <li key={card.name} className="flex items-center gap-2 py-1.5">
                      <button type="button" onClick={() => zoomByName(card.name, card.image)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text)' }}>
                          <span className="truncate">{card.name}</span>
                          {card.manaCost && <ManaCost cost={card.manaCost.split(' // ')[0]} size={12} />}
                        </span>
                        <span className="block text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {card.typeLine}{card.eur ? ` · €${card.eur.toFixed(2)}` : ''}
                        </span>
                      </button>
                      {isOwned(card.name) && <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--g)' }}>vorhanden</span>}
                      <button
                        type="button"
                        onClick={() => onAdd(card.name)}
                        aria-label={`${card.name} ins Deck`}
                        className="text-xs font-semibold px-2.5 py-1"
                        style={{ color: '#fff', border: '1px solid var(--g)', background: 'var(--g)', borderRadius: 'var(--radius-sm)' }}
                      >
                        +
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Keine Treffer{ownedOnly ? ' in deiner Sammlung' : ''}.</p>
          )}
        </>
      )}
    </div>
  )
}
