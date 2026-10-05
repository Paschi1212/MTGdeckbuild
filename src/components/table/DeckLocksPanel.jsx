import { setDeckLocked, useDeckLocks } from '../../lib/deckLocks'

// All your decks at a glance on the table page: free for your fellow players unless locked.
// Collapsed by default — the count says enough until you want to lock one.
export default function DeckLocksPanel({ decks }) {
  const locks = useDeckLocks()
  if (!decks.length) return null
  const lockedCount = decks.filter(deck => locks.has(deck.key)).length

  return (
    <details className="card group">
      <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3 min-h-[40px]">
        <span className="text-lg font-bold">Deine Decks für Mitspieler</span>
        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {decks.length - lockedCount} frei{lockedCount ? ` · ${lockedCount} gesperrt` : ''}
          <span className="ml-1 inline-block transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </span>
      </summary>
      <p className="text-sm leading-relaxed mt-2 mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        Wer schon mit dir an einem Tisch war, kann deine Decks spielen. Gesperrte behältst du für dich.
      </p>
      <ul className="max-h-72 overflow-y-auto -mx-1">
        {decks.map(deck => {
          const locked = locks.has(deck.key)
          return (
            <li key={deck.key} className="flex items-center gap-2 px-1 py-1">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium block truncate" style={{ color: locked ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                  {deck.label}{deck.source === 'draft' ? ' (Entwurf)' : ''}
                </span>
                {deck.commander && <span className="block text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{deck.commander}</span>}
              </span>
              <button
                type="button"
                onClick={() => setDeckLocked(deck.key, !locked)}
                aria-pressed={locked}
                className="text-xs font-semibold px-3 min-h-[36px] [@media(pointer:coarse)]:min-h-[40px] flex-shrink-0"
                style={{
                  background: locked ? 'var(--color-surface)' : 'transparent',
                  color: locked ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)'
                }}
                title={locked ? 'Wieder für Mitspieler freigeben' : 'Für Mitspieler sperren'}
              >
                {locked ? 'Gesperrt' : 'Frei'}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
