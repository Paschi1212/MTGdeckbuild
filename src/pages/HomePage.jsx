import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadCollection, getPricedCardNames } from '../lib/collection'
import { loadDraftDecks } from '../lib/draftDecks'
import CardTile from '../components/CardTile'

function LogoIcon({ size = 56 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ color: 'var(--color-accent)' }}>
      <path d="M 60 15 L 85 30 L 85 60 C 85 80 60 105 60 105 C 60 105 35 80 35 60 L 35 30 Z" fill="currentColor" />
      <g transform="translate(60, 55)">
        <polygon points="0,-20 -12,-20 -8,0 -12,20 0,20" fill="var(--color-bg)" />
        <polygon points="0,-20 12,-20 8,0 12,20 0,20" fill="var(--color-bg)" />
      </g>
    </svg>
  )
}

function LoginGate({ onLogin }) {
  const handleGoogleLogin = () => {
    window.location.href = '/.netlify/functions/google-auth?action=login'
  }

  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '60vh' }}>
      <LogoIcon />
      <h1 style={{ marginTop: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>MTG Deck Builder</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
        Melde dich an, um auf deine Sammlung und Decks zuzugreifen.
      </p>
      <button onClick={handleGoogleLogin} className="btn-primary inline-flex items-center gap-2">
        <span>🔐</span> Mit Google anmelden
      </button>
    </div>
  )
}

const QUICK_LINKS = [
  { to: '/upload', icon: '📥', label: 'Sammlung hochladen' },
  { to: '/collection', icon: '🗂️', label: 'Meine Sammlung' },
  { to: '/decks', icon: '🃏', label: 'Meine Decks' },
  { to: '/select-commander', icon: '🧙', label: 'Deck bauen' }
]

function Dashboard() {
  const navigate = useNavigate()
  const [collection] = useState(loadCollection)
  const [drafts] = useState(loadDraftDecks)

  const [gainers, setGainers] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)

  const runGainerScan = async () => {
    const pricedCards = getPricedCardNames(collection)
    if (pricedCards.length === 0) {
      setScanError('Keine Kaufpreise in deiner Sammlung hinterlegt — ManaBox exportiert die nur, wenn du sie selbst eingetragen hast.')
      return
    }
    setScanning(true)
    setScanError(null)
    try {
      const response = await fetch('/.netlify/functions/get-price-gainers', {
        method: 'POST',
        body: JSON.stringify({ cards: pricedCards })
      })
      if (response.ok) {
        const data = await response.json()
        setGainers(data.gainers)
      } else {
        setScanError('Scan fehlgeschlagen — versuch es gleich nochmal.')
      }
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanning(false)
    }
  }

  if (!collection) {
    return (
      <div className="card text-center py-10">
        <p className="text-cmd-muted mb-4">Noch keine Sammlung hochgeladen.</p>
        <button onClick={() => navigate('/upload')} className="btn-primary">Zum Upload</button>
      </div>
    )
  }

  const deckCount = collection.decks?.length || 0

  return (
    <div>
      <h1 className="mb-1">Übersicht</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
        Zuletzt aktualisiert: {new Date(collection.uploadedAt).toLocaleDateString('de-DE')}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" style={{ gap: 'var(--spacing-md)' }}>
        <div className="card">
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Karten</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--color-accent)' }}>{collection.totalCards}</div>
        </div>
        <div className="card">
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sammlungswert</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--color-accent)' }}>€{collection.totalValue.toFixed(0)}</div>
        </div>
        <div className="card">
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Decks</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--color-accent)' }}>{deckCount}</div>
        </div>
        <div className="card">
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Entwürfe</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--color-accent)' }}>{drafts.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" style={{ gap: 'var(--spacing-md)' }}>
        {QUICK_LINKS.map(link => (
          <button
            key={link.to}
            onClick={() => navigate(link.to)}
            className="card-hover text-left"
          >
            <div className="text-2xl mb-1">{link.icon}</div>
            <div className="font-semibold">{link.label}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-lg font-bold mb-0">📈 Preisgewinner</h2>
          <button onClick={runGainerScan} disabled={scanning} className="btn-secondary text-sm">
            {scanning ? 'Scanne…' : gainers ? '🔄 Neu scannen' : '🔍 Scan starten'}
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Vergleicht aktuelle Scryfall-Marktpreise mit deinen ManaBox-Kaufpreisen — nur Karten über €2 aktuellem Wert, die im Preis gestiegen sind.
        </p>

        {scanError && <p className="text-sm mb-3" style={{ color: 'var(--r)' }}>{scanError}</p>}

        {scanning && <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Scanne deine Sammlung — bei vielen Karten kann das etwas dauern…</p>}

        {gainers && !scanning && (
          gainers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Keine Karte hat um mehr als €2 zugelegt.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {gainers.map(card => (
                <div key={card.name}>
                  <CardTile card={{ name: card.name, image: card.image, eur: card.currentPrice }} />
                  <div className="text-xs text-center mt-1">
                    <span style={{ color: 'var(--g)' }}>+€{card.gain.toFixed(2)}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}> (€{card.purchasePrice.toFixed(2)} → €{card.currentPrice.toFixed(2)})</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default function HomePage({ user, onLogin }) {
  return user ? <Dashboard /> : <LoginGate onLogin={onLogin} />
}
