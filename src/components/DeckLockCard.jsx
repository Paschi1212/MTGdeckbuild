import { manaboxDeckId, setDeckLocked, useDeckLocks } from '../lib/deckLocks'

// "Am Spieltisch": decks are free for everyone you've sat at a table with — this card says so
// and lets you keep one to yourself.
export default function DeckLockCard({ deckName }) {
  const locks = useDeckLocks()
  const id = manaboxDeckId(deckName)
  const locked = locks.has(id)

  return (
    <div className="card mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="text-base font-bold mb-1">
          Am Spieltisch: {locked ? 'gesperrt' : 'frei für Mitspieler'}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {locked
            ? 'Nur du kannst dieses Deck am Spieltisch spielen.'
            : 'Alle, mit denen du schon an einem Tisch warst, können dieses Deck spielen – immer in seinem aktuellen Stand. Sie sehen nur die Deckliste, nicht deine Sammlung.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDeckLocked(id, !locked)}
        className="btn-secondary text-sm px-4 min-h-[40px] flex-shrink-0"
      >
        {locked ? 'Wieder freigeben' : 'Deck sperren'}
      </button>
    </div>
  )
}
