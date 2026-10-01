import { useState } from 'react'

const COLOR_VARS = {
  W: 'var(--w)',
  U: 'var(--u)',
  B: 'var(--b)',
  R: 'var(--r)',
  G: 'var(--g)'
}

function parseColorLetters(colors) {
  if (!colors) return []
  return colors
    .toUpperCase()
    .split(/[^WUBRG]+/)
    .filter(letter => COLOR_VARS[letter])
}

export function CardZoomModal({ card, letters = [], onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-sm w-full"
        style={{ backgroundColor: 'var(--surface-solid)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-black/20">
          {card.image ? (
            <img src={card.image} alt={card.name} className="w-full h-auto" />
          ) : (
            <div className="aspect-[5/7] flex items-center justify-center text-cmd-muted">Kein Bild gefunden</div>
          )}
        </div>
        <div className="p-4">
          <div className="font-bold text-white text-lg mb-1">{card.name}</div>
          {letters.length > 0 && (
            <div className="flex gap-1 mb-2">
              {letters.map(letter => (
                <div key={letter} className="w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_VARS[letter] }} />
              ))}
            </div>
          )}
          {card.reason && <p className="text-cmd-muted text-sm leading-snug mb-2">{card.reason}</p>}
          {card.strategy && <div className="text-xs text-cmd-muted mb-2">{card.strategy}</div>}
          {(card.estimatedCost || card.eur != null) && (
            <div className="font-semibold" style={{ color: 'var(--g)' }}>
              {card.estimatedCost || `€${card.eur.toFixed(2)}`}
            </div>
          )}
          <button onClick={onClose} className="btn-secondary w-full mt-4 text-sm">Schließen</button>
        </div>
      </div>
    </div>
  )
}

export default function CardTile({ card, onClick, size = 'default' }) {
  const [zoomed, setZoomed] = useState(false)
  const letters = parseColorLetters(card.colors)
  const glowColor = letters.length > 0 ? COLOR_VARS[letters[0]] : 'var(--u)'
  const isSmall = size === 'small'
  // No custom onClick from the parent (e.g. CollectionPage's own modal) → clicking zooms the card itself.
  const handleClick = onClick || (() => setZoomed(true))

  return (
    <>
    <div
      onClick={handleClick}
      className="rounded-2xl overflow-hidden transition-transform duration-150 cursor-pointer hover:-translate-y-1"
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: isSmall ? 8 : 10,
        boxShadow: `0 16px 32px -20px ${glowColor}88`
      }}
    >
      <div
        className="relative rounded-xl overflow-hidden bg-black/20 flex items-center justify-center"
        style={{ aspectRatio: '5 / 7', marginBottom: isSmall ? 6 : 10 }}
      >
        {card.image ? (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-cmd-muted text-xs px-2 text-center">Kein Bild gefunden</span>
        )}
        {card.deckBadge && (
          <div
            className="absolute top-1 left-1 right-1 rounded-md px-1.5 py-0.5 text-center truncate"
            style={{ backgroundColor: 'rgba(14,11,26,0.85)', color: 'var(--w)', fontSize: 10, fontWeight: 600 }}
            title={`Bereits verbaut in: ${card.deckBadge}`}
          >
            🃏 {card.deckBadge}
          </div>
        )}
      </div>

      <div className={`font-semibold text-white ${isSmall ? 'text-xs' : 'text-sm'} mb-1 truncate`} title={card.name}>
        {card.name}
      </div>

      {letters.length > 0 && (
        <div className="flex gap-1 mb-1.5">
          {letters.map(letter => (
            <div key={letter} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR_VARS[letter] }} />
          ))}
        </div>
      )}

      {!isSmall && card.reason && (
        <p className="text-cmd-muted text-xs leading-snug line-clamp-3 mb-1">{card.reason}</p>
      )}

      {!isSmall && card.strategy && (
        <div className="text-[11px] text-cmd-muted mb-0.5">{card.strategy}</div>
      )}

      {(card.estimatedCost || card.eur != null) && (
        <div className={`font-semibold ${isSmall ? 'text-[11px]' : 'text-[11px]'}`} style={{ color: 'var(--g)' }}>
          {card.estimatedCost || `€${card.eur.toFixed(2)}`}
        </div>
      )}

      {/* A card to buy that happens to already be in a friend's (separately uploaded)
          collection — purely informational, never affects ownership/availability elsewhere. */}
      {card.friendAvailability?.length > 0 && (
        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--u)' }} title={`Bei: ${card.friendAvailability.map(h => h.label).join(', ')}`}>
          📦 bei {card.friendAvailability.map(h => h.label).join(', ')}
        </div>
      )}
    </div>
    {!onClick && zoomed && (
      <CardZoomModal card={card} letters={letters} onClose={() => setZoomed(false)} />
    )}
    </>
  )
}
