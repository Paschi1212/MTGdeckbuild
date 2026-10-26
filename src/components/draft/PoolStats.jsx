import ManaCost from '../ManaCost'

const COLORS = ['W', 'U', 'B', 'R', 'G']
const CURVE = ['0–1', '2', '3', '4', '5', '6+']

// Mana symbols in a cost ("{2}{W}{U/B}") per color — what a deck actually has to pay.
export function pipCounts(cards) {
  const counts = Object.fromEntries(COLORS.map(c => [c, 0]))
  for (const card of cards) {
    for (const [, symbol] of String(card.mc || '').matchAll(/\{([^}]+)\}/g)) {
      for (const part of symbol.split('/')) if (counts[part] !== undefined) counts[part] += 1
    }
  }
  return counts
}

const isLand = (card) => /Land/.test(card.t || '')

/** The pool (or deck) at a glance: which colors it leans to, and its mana curve. */
export default function PoolStats({ cards, title = 'Farben & Kurve' }) {
  const spells = cards.filter(card => !isLand(card))
  if (!spells.length) return null
  const colorCards = Object.fromEntries(COLORS.map(c => [c, spells.filter(card => String(card.ci || '').includes(c)).length]))
  const colorless = spells.filter(card => !card.ci).length
  const maxColor = Math.max(1, ...Object.values(colorCards))
  const curve = CURVE.map((label, index) => spells.filter(card => {
    const cmc = Math.round(card.cmc || 0)
    return index === 0 ? cmc <= 1 : index === CURVE.length - 1 ? cmc >= 6 : cmc === index + 1
  }).length)
  const maxCurve = Math.max(1, ...curve)
  const creatures = spells.filter(card => /Creature/.test(card.t || '')).length

  return (
    <section aria-label={title}>
      <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>{title}</h3>
      <ul className="space-y-1 mb-3">
        {COLORS.filter(c => colorCards[c] > 0).sort((a, b) => colorCards[b] - colorCards[a]).map(color => (
          <li key={color} className="flex items-center gap-2 text-xs">
            <ManaCost cost={`{${color}}`} size={14} />
            <span className="flex-1 h-2" style={{ background: 'var(--color-bg)', borderRadius: 2 }}>
              <span className="block h-2" style={{ width: `${(colorCards[color] / maxColor) * 100}%`, background: `var(--pip-${color.toLowerCase()})`, borderRadius: 2 }} />
            </span>
            <span className="w-5 text-right tabular-nums text-fg">{colorCards[color]}</span>
          </li>
        ))}
        {colorless > 0 && (
          <li className="flex items-center gap-2 text-xs">
            <ManaCost cost="{C}" size={14} />
            <span className="flex-1" />
            <span className="w-5 text-right tabular-nums text-fg">{colorless}</span>
          </li>
        )}
      </ul>
      <div className="flex items-end gap-1 h-12" aria-label="Mana-Kurve">
        {curve.map((count, index) => (
          <div key={CURVE[index]} className="flex-1 flex flex-col items-center justify-end h-full" title={`Manawert ${CURVE[index]}: ${count}`}>
            <span className="text-[10px] tabular-nums leading-none mb-0.5" style={{ color: 'var(--color-text-muted)' }}>{count || ''}</span>
            <span className="w-full" style={{ height: `${(count / maxCurve) * 70}%`, minHeight: count ? 3 : 0, background: 'var(--color-text-secondary)', borderRadius: '2px 2px 0 0' }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-0.5">
        {CURVE.map(label => <span key={label} className="flex-1 text-center text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>)}
      </div>
      <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
        {creatures} Kreaturen · {spells.length - creatures} andere Zauber{cards.length > spells.length ? ` · ${cards.length - spells.length} Länder` : ''}
      </p>
    </section>
  )
}
