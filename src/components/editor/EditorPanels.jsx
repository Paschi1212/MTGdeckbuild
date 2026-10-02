import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'

const sectionTitle = 'text-xs font-semibold mb-2 flex items-baseline justify-between'
const mutedStyle = { color: 'var(--color-text-muted)' }
const textStyle = { color: 'var(--color-text)' }

function SmallButton({ children, onClick, tone = 'neutral', label }) {
  const colors = {
    neutral: { color: 'var(--color-text)', border: '1px solid var(--color-border)', background: 'var(--color-bg)' },
    add: { color: '#fff', border: '1px solid var(--g)', background: 'var(--g)' },
    remove: { color: 'var(--r)', border: '1px solid var(--r)', background: 'transparent' }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-xs font-semibold px-2.5 py-1 whitespace-nowrap"
      style={{ ...colors[tone], borderRadius: 'var(--radius-sm)' }}
    >
      {children}
    </button>
  )
}

function EmptyNote({ children }) {
  return <p className="text-sm leading-relaxed py-2" style={mutedStyle}>{children}</p>
}

// Cuts and adds from the last analysis, applied with one click each — the analysis result
// turned into actions instead of a list to transcribe by hand.
export function SuggestionsPanel({ cuts, adds, isOwned, friendsFor, onRemove, onRemoveAll, onAdd, onAddAllOwned, onZoom, emptyHint }) {
  if (cuts.length === 0 && adds.length === 0) return <EmptyNote>{emptyHint}</EmptyNote>
  const ownedAdds = adds.filter(card => isOwned(card.name))

  return (
    <div className="space-y-6">
      {cuts.length > 0 && (
        <section>
          <h4 className={sectionTitle} style={{ color: 'var(--r)' }}>
            Raus · {cuts.length}
            {cuts.length > 1 && <SmallButton tone="remove" onClick={onRemoveAll}>Alle entfernen</SmallButton>}
          </h4>
          <ul className="space-y-2">
            {cuts.map(cut => (
              <li key={cut.name} className="flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <button type="button" onClick={() => onZoom(cut.card)} className="text-sm font-medium text-left" style={textStyle}>{cut.name}</button>
                  <p className="text-xs leading-snug mt-0.5" style={mutedStyle}>{cut.reason}</p>
                </div>
                <SmallButton tone="remove" label={`${cut.name} entfernen`} onClick={() => onRemove(cut.card.index)}>Entfernen</SmallButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adds.length > 0 && (
        <section>
          <h4 className={sectionTitle} style={{ color: 'var(--g)' }}>
            Rein · {adds.length}
            {ownedAdds.length > 1 && <SmallButton tone="add" onClick={onAddAllOwned}>Alle vorhandenen hinzufügen</SmallButton>}
          </h4>
          <ul className="space-y-2">
            {adds.map(card => {
              const owned = isOwned(card.name)
              const friends = owned ? [] : friendsFor(card.name)
              return (
                <li key={card.name} className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <button type="button" onClick={() => onZoom(card)} className="text-sm font-medium text-left" style={textStyle}>{card.name}</button>
                    <div className="text-[11px] mt-0.5">
                      {owned
                        ? <span style={{ color: 'var(--g)' }}>vorhanden</span>
                        : <span style={{ color: 'var(--r)' }}>Zukauf{card.eur ? ` €${card.eur.toFixed(2)}` : ''}</span>}
                      {friends.length > 0 && <span style={{ color: 'var(--u)' }}> · bei {friends.map(f => f.label).join(', ')}</span>}
                    </div>
                    {card.reason && <p className="text-xs leading-snug mt-0.5" style={mutedStyle}>{card.reason}</p>}
                  </div>
                  <SmallButton tone="add" label={`${card.name} hinzufügen`} onClick={() => onAdd(card)}>Hinzufügen</SmallButton>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

export function ShoppingPanel({ items, total, onExport }) {
  if (items.length === 0) return <EmptyNote>Du besitzt jede Karte dieses Decks – nichts zu kaufen.</EmptyNote>
  const count = items.reduce((sum, c) => sum + c.missingCount, 0)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm" style={textStyle}>
          {count} {count === 1 ? 'Karte' : 'Karten'} · <span className="font-semibold tabular-nums">€{total.toFixed(2)}</span>
        </p>
        <SmallButton onClick={onExport}>Als .txt exportieren</SmallButton>
      </div>
      <ul className="text-sm space-y-1">
        {items.map(c => (
          <li key={c.name} className="flex justify-between gap-3">
            <span className="min-w-0 truncate" style={textStyle}>
              {c.missingCount}× {c.name}
              {c.friendAvailability?.length > 0 && (
                <span className="text-[11px]" style={{ color: 'var(--u)' }}> · bei {c.friendAvailability.map(h => h.label).join(', ')}</span>
              )}
            </span>
            <span className="tabular-nums flex-shrink-0" style={mutedStyle}>{c.price > 0 ? `€${(c.missingCount * c.price).toFixed(2)}` : '–'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const COLOR_ROWS = [
  { key: 'W', label: 'Weiß', tint: 'var(--pip-w)' },
  { key: 'U', label: 'Blau', tint: 'var(--pip-u)' },
  { key: 'B', label: 'Schwarz', tint: 'var(--pip-b)' },
  { key: 'R', label: 'Rot', tint: 'var(--pip-r)' },
  { key: 'G', label: 'Grün', tint: 'var(--pip-g)' },
  { key: 'Multicolor', label: 'Mehrfarbig', tint: 'linear-gradient(90deg, var(--pip-w), var(--pip-u), var(--pip-b), var(--pip-r), var(--pip-g))' },
  { key: 'Colorless', label: 'Farblos', tint: 'var(--pip-c)' }
]

function Figure({ label, value }) {
  return (
    <div>
      <div className="text-[11px]" style={mutedStyle}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={textStyle}>{value}</div>
    </div>
  )
}

export function StatsPanel({ manaCurve, colorCounts, typeCounts, averageCmc, landCount, deckValue, valuePerCard }) {
  const maxColor = Math.max(1, ...Object.values(colorCounts))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Figure label="Länder" value={landCount} />
        <Figure label="Ø Manawert (ohne Länder)" value={averageCmc.toFixed(2)} />
        <Figure label="Deckwert" value={`€${deckValue.toFixed(2)}`} />
        <Figure label="Ø pro Karte" value={`€${valuePerCard.toFixed(2)}`} />
      </div>

      <section>
        <h4 className={sectionTitle} style={textStyle}>Manakurve <span className="font-normal" style={mutedStyle}>ohne Länder</span></h4>
        <div style={{ width: '100%', height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={manaCurve} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="cmc" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                cursor={{ fill: 'var(--color-accent-light)' }}
                formatter={(value) => [value, 'Karten']}
                labelFormatter={(label) => `Manawert ${label}`}
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)' }}
              />
              <Bar dataKey="count" fill="var(--u)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h4 className={sectionTitle} style={textStyle}>Farben <span className="font-normal" style={mutedStyle}>Karten ohne Länder</span></h4>
        <ul className="space-y-1.5">
          {COLOR_ROWS.filter(row => colorCounts[row.key] > 0).map(row => (
            <li key={row.key} className="flex items-center gap-2 text-xs">
              <span className="w-20 flex-shrink-0" style={textStyle}>{row.label}</span>
              <span className="flex-1 h-3" style={{ background: 'var(--color-accent-light)', borderRadius: 2 }}>
                <span className="block h-full" style={{ width: `${(colorCounts[row.key] / maxColor) * 100}%`, background: row.tint, borderRadius: 2 }} />
              </span>
              <span className="w-6 text-right tabular-nums" style={mutedStyle}>{colorCounts[row.key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className={sectionTitle} style={textStyle}>Kartentypen</h4>
        <ul className="text-sm space-y-1">
          {typeCounts.map(t => (
            <li key={t.label} className="flex justify-between">
              <span style={textStyle}>{t.label}</span>
              <span className="tabular-nums" style={mutedStyle}>{t.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function StrategyPanel({ note }) {
  return <p className="text-sm leading-relaxed whitespace-pre-wrap" style={textStyle}>{note}</p>
}
