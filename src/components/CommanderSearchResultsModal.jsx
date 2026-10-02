// "Folgefenster" for a commander search — a grid with real card images, so picking between
// several versions of the same character (e.g. multiple commander-eligible Vraska
// planeswalkers) doesn't come down to guessing from bare names alone.
export default function CommanderSearchResultsModal({ query, results, onSelect, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-3xl w-full max-h-[85vh] flex flex-col"
        style={{ backgroundColor: 'var(--surface-solid)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-lg font-bold text-fg">
            Suchtreffer für "{query}" ({results.length})
          </h2>
          <button onClick={onClose} className="text-cmd-muted hover:text-fg text-lg leading-none">✕</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-cmd-muted text-sm text-center py-8">Keine Commander gefunden.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {results.map(card => (
                <button
                  key={card.name}
                  onClick={() => onSelect(card.name)}
                  className="text-left rounded-xl overflow-hidden transition hover:-translate-y-1"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="aspect-[5/7] w-full bg-black/30">
                    {card.image && (
                      <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="text-xs text-fg font-medium p-2 truncate" title={card.name}>
                    {card.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
