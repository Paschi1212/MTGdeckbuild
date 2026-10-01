import { useState, useEffect } from 'react'

function shuffle(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Quantities in `cards` are stacks (e.g. "4x Forest") — the library needs one entry per
// physical copy to shuffle/draw correctly, each with its own id so React can key duplicate
// card names (two Forests in hand at once) without collisions.
function buildLibrary(cards) {
  const library = []
  let id = 0
  for (const card of cards) {
    for (let i = 0; i < (card.count || 1); i++) {
      library.push({ id: id++, name: card.name, image: card.image })
    }
  }
  return library
}

function MiniCard({ card, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg overflow-hidden bg-black/30 flex-shrink-0 text-left"
      style={{ width: 110 }}
      title={card.name}
    >
      <div className="aspect-[5/7] w-full bg-black/40">
        {card.image && <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />}
      </div>
      {label && <div className="text-[10px] text-cmd-muted text-center py-0.5 truncate px-1">{card.name}</div>}
    </button>
  )
}

export default function PlaytestModal({ cards, commanderCard, onClose }) {
  const [library, setLibrary] = useState([])
  const [hand, setHand] = useState([])
  const [played, setPlayed] = useState([])
  const [mulligans, setMulligans] = useState(0)

  const dealOpeningHand = (newLibrary) => {
    const lib = [...newLibrary]
    const newHand = lib.splice(0, 7)
    setLibrary(lib)
    setHand(newHand)
    setPlayed([])
  }

  const handleNewGame = () => {
    const fresh = shuffle(buildLibrary(cards))
    setMulligans(0)
    dealOpeningHand(fresh)
  }

  // Deal the opening hand immediately on open instead of showing an empty hand until the
  // user clicks "Neu mischen" once.
  useEffect(() => {
    handleNewGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMulligan = () => {
    const fresh = shuffle(buildLibrary(cards))
    setMulligans(m => m + 1)
    dealOpeningHand(fresh)
  }

  const handleDrawOne = () => {
    if (library.length === 0) return
    const [drawn, ...rest] = library
    setLibrary(rest)
    setHand(h => [...h, drawn])
  }

  const handlePlayCard = (card) => {
    setHand(h => h.filter(c => c.id !== card.id))
    setPlayed(p => [...p, card])
  }

  const handleReturnCard = (card) => {
    setPlayed(p => p.filter(c => c.id !== card.id))
    setHand(h => [...h, card])
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">🎲 Live Tester</h2>
        <button onClick={onClose} className="btn-secondary text-sm px-4 py-1.5">✕ Schließen</button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 flex-shrink-0">
        <button onClick={handleNewGame} className="btn-primary text-sm">🔀 Neu mischen</button>
        <button onClick={handleMulligan} className="btn-secondary text-sm">
          ↩️ Mulligan{mulligans > 0 ? ` (${mulligans})` : ''}
        </button>
        <button onClick={handleDrawOne} disabled={library.length === 0} className="btn-secondary text-sm">
          + Karte ziehen
        </button>
        <span className="text-sm text-cmd-muted self-center ml-2">Bibliothek: {library.length} Karten</span>
      </div>

      {commanderCard && (
        <div className="mb-4 flex-shrink-0">
          <div className="text-xs text-cmd-muted uppercase tracking-wide mb-1">Commander</div>
          <div className="flex gap-2">
            <MiniCard card={commanderCard} />
          </div>
        </div>
      )}

      <div className="mb-4 flex-shrink-0">
        <div className="text-xs text-cmd-muted uppercase tracking-wide mb-1">
          Hand ({hand.length}) — Karte anklicken zum Ausspielen
        </div>
        {hand.length === 0 ? (
          <p className="text-sm text-cmd-muted">Keine Karten auf der Hand.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hand.map(card => (
              <MiniCard key={card.id} card={card} label onClick={() => handlePlayCard(card)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        <div className="text-xs text-cmd-muted uppercase tracking-wide mb-1">
          Ausgespielt ({played.length}) — Karte anklicken, um sie zurück auf die Hand zu nehmen
        </div>
        {played.length === 0 ? (
          <p className="text-sm text-cmd-muted">Noch nichts gespielt.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {played.map(card => (
              <MiniCard key={card.id} card={card} label onClick={() => handleReturnCard(card)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
