import { useNavigate } from 'react-router-dom'

const FEATURES = [
  { number: '01', title: 'Smart Analysis', text: 'Automatische Kartenerkennung und sofortige Optimierungsvorschläge basierend auf Synergien und Meta-Insights.' },
  { number: '02', title: 'EDHREC Daten', text: 'Nutze Community-Wissen aus tausenden Wettkampf-Decks, um bessere strategische Entscheidungen zu treffen.' },
  { number: '03', title: 'Preis-Intelligenz', text: 'Live-Preisdaten helfen dir, günstige Alternativen zu finden, ohne auf Power oder Konsistenz zu verzichten.' }
]

const STATS = [
  { number: '686+', label: 'Karten' },
  { number: 'EDH', label: 'Commander Fokus' },
  { number: 'Real', label: 'EDHREC Meta' },
  { number: 'Live', label: 'Scryfall Pricing' }
]

export default function HomePage({ user, onLogin }) {
  const navigate = useNavigate()

  const handleGoogleLogin = () => {
    window.location.href = '/.netlify/functions/google-auth?action=login'
  }

  return (
    <div>
      <section className="py-8 md:py-12" style={{ maxWidth: 700 }}>
        <h1>
          Baue dein <strong style={{ fontWeight: 700, color: 'var(--color-accent)' }}>perfektes Deck</strong>
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, maxWidth: 600, marginBottom: 'var(--spacing-xl)' }}>
          Importiere deine Kartensammlung und entdecke optimale Commander-Synergien —
          mit echten EDHREC-Meta-Daten, Gemini AI und Live-Preisen von Scryfall.
        </p>

        {user ? (
          <button onClick={() => navigate('/upload')} className="btn-primary">
            Zum Dashboard →
          </button>
        ) : (
          <button onClick={handleGoogleLogin} className="btn-primary inline-flex items-center gap-2">
            <span>🔐</span> Mit Google anmelden
          </button>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 my-12" style={{ gap: 'var(--spacing-lg)' }}>
        {FEATURES.map(f => (
          <div key={f.number} className="card-hover flex flex-col gap-4" style={{ gap: 'var(--spacing-md)' }}>
            <div
              className="inline-flex items-center justify-center font-bold"
              style={{
                width: 40,
                height: 40,
                fontSize: '1.3rem',
                background: 'var(--color-accent)',
                color: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              {f.number}
            </div>
            <h3>{f.title}</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-small)', lineHeight: 1.6, margin: 0 }}>
              {f.text}
            </p>
          </div>
        ))}
      </section>

      <section
        className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12"
        style={{
          gap: 'var(--spacing-lg)',
          padding: 'var(--spacing-2xl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)'
        }}
      >
        {STATS.map(stat => (
          <div key={stat.label} className="text-center flex flex-col gap-2">
            <div style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
              {stat.number}
            </div>
            <div
              style={{
                fontSize: 'var(--font-caption)',
                color: 'var(--color-text-muted)',
                fontWeight: 500,
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
