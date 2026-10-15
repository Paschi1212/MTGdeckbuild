import { useEffect } from 'react'
import { counterLabel } from '../../lib/table/board'

// One card big enough to read every word — from the card menu ("Groß anzeigen") or a right-click
// on someone else's card. Click anywhere or Esc closes it.
export default function CardLightbox({ card, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counters = Object.entries(card.counters || {}).filter(([, value]) => value)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-3 p-4 cursor-zoom-out"
      style={{ background: 'rgba(8,8,10,0.88)' }}
      onClick={onClose}
      onContextMenu={(event) => { event.preventDefault(); onClose() }}
    >
      {card.image ? (
        <img
          src={card.image.replace('/normal/', '/large/')}
          alt={card.name}
          className="block max-w-[92vw] w-auto"
          style={{ height: 'min(80vh, 700px)', borderRadius: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
        />
      ) : (
        <div className="flex items-center justify-center text-center px-6" style={{ width: 'min(80vw, 360px)', aspectRatio: '5 / 7', background: '#1d1f24', color: '#fff', borderRadius: 18 }}>
          <span className="text-lg font-semibold">{card.name}</span>
        </div>
      )}
      <div className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.85)' }}>
        <span className="font-semibold">{card.name}</span>
        {card.token && ' · Spielmarke'}
        {card.tapped && ' · getappt'}
        {counters.length > 0 && <> · {counters.map(([key, value]) => `${value}× ${counterLabel(key)}`).join(', ')}</>}
        <span className="block text-xs mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Klicken oder Esc zum Schließen</span>
      </div>
    </div>
  )
}
