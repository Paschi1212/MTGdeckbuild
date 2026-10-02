import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function StrategyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const commander = location.state?.commander || sessionStorage.getItem('selectedCommander')

  const [strategy, setStrategy] = useState({
    primaryWinCon: '',
    keyMechanics: [],
    playStyle: '',
    themes: [],
    budget: 500,
    combos: [],
    synergies: [],
    notes: ''
  })

  // Real, commander-specific archetype tags from EDHREC (e.g. for Korvold: Treasure,
  // Sacrifice, Aristocrats, Voltron...) instead of one fixed generic playstyle list for every
  // commander — best-effort, the form still works fine if this fetch fails or comes back thin.
  const [edhrecThemes, setEdhrecThemes] = useState([])
  const [themesLoading, setThemesLoading] = useState(true)

  useEffect(() => {
    if (!commander) {
      setThemesLoading(false)
      return
    }
    fetch(`/.netlify/functions/get-commander-data?commander=${encodeURIComponent(commander)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setEdhrecThemes(data?.themes || []))
      .catch(() => setEdhrecThemes([]))
      .finally(() => setThemesLoading(false))
  }, [commander])

  const winConditions = [
    'Combat Damage',
    'Infinite Combo',
    'Deck Mill',
    'Life Drain',
    'Card Draw to Victory',
    'Token Swarm',
    'Creature Beatdown'
  ]

  const mechanics = [
    'Card Draw',
    'Token Generation',
    'Creature Synergies',
    'Mana Ramp',
    'Tutors',
    'Reanimation',
    'Sacrifice Effects',
    'Board Wipes',
    'Infinite Loops',
    'Enchantment Synergies'
  ]

  const playStyles = [
    'Aggressive',
    'Balanced',
    'Control',
    'Combo',
    'Tempo'
  ]

  const toggleMechanic = (mechanic) => {
    setStrategy(prev => ({
      ...prev,
      keyMechanics: prev.keyMechanics.includes(mechanic)
        ? prev.keyMechanics.filter(m => m !== mechanic)
        : [...prev.keyMechanics, mechanic]
    }))
  }

  const toggleTheme = (theme) => {
    setStrategy(prev => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter(t => t !== theme)
        : [...prev.themes, theme]
    }))
  }

  const handleAddCombo = (e) => {
    const input = document.getElementById('combo-input')
    if (input.value.trim()) {
      setStrategy(prev => ({
        ...prev,
        combos: [...prev.combos, input.value]
      }))
      input.value = ''
    }
  }

  const handleRemoveCombo = (index) => {
    setStrategy(prev => ({
      ...prev,
      combos: prev.combos.filter((_, i) => i !== index)
    }))
  }

  // Funnels the questionnaire into the chat-driven builder instead of a separate results
  // page — same underlying build pipeline either way, but now everyone lands in one place
  // (chat + editor) rather than the form leading somewhere the chat flow doesn't.
  const buildAutoMessage = () => {
    const parts = [`Baue mir ein komplettes Deck für ${commander}.`]
    parts.push(`Primäre Win Condition: ${strategy.primaryWinCon}.`)
    if (strategy.keyMechanics.length) parts.push(`Wichtige Mechaniken: ${strategy.keyMechanics.join(', ')}.`)
    if (strategy.themes.length) parts.push(`Gewünschte Themen (EDHREC): ${strategy.themes.join(', ')}.`)
    if (strategy.playStyle) parts.push(`Spielstil: ${strategy.playStyle}.`)
    if (strategy.combos.length) parts.push(`Gewünschte Combos: ${strategy.combos.join('; ')}.`)
    if (strategy.notes.trim()) parts.push(`Weitere Notizen: ${strategy.notes.trim()}.`)
    parts.push(`Zukaufsbudget: max. ca. €${strategy.budget} für alle Karten ZUSAMMEN, die ich noch nicht besitze (Basisländer ausgenommen) — kein Limit pro Einzelkarte.`)
    return parts.join(' ')
  }

  const handleNext = () => {
    if (!strategy.primaryWinCon || strategy.keyMechanics.length === 0) {
      alert('Bitte fülle alle Pflichtfelder aus')
      return
    }

    navigate('/select-commander', {
      state: { activeTab: 'chat', chatCommander: commander, chatAutoMessage: buildAutoMessage() }
    })
  }

  if (!commander) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-[color:var(--r)] mb-4">Kein Commander ausgewählt</p>
        <button onClick={() => navigate('/select-commander')} className="btn-primary">
          ← Zurück zur Commander Auswahl
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1>⚡ Strategie für {commander}</h1>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">🎯 Primary Win Condition</h2>
        <select
          value={strategy.primaryWinCon}
          onChange={(e) => setStrategy(prev => ({ ...prev, primaryWinCon: e.target.value }))}
          className="w-full text-fg rounded-xl p-3"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
        >
          <option value="">Wähle eine Win Condition</option>
          {winConditions.map(wc => (
            <option key={wc} value={wc}>{wc}</option>
          ))}
        </select>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-1">🏷️ Themen für {commander}</h2>
        <p className="text-sm text-fg-muted mb-4">
          Echte Archetypen aus EDHREC, abgeleitet aus tausenden Decks mit genau diesem Commander — nicht nur eine generische Liste.
        </p>
        {themesLoading ? (
          <p className="text-sm text-cmd-muted">Lade Themen…</p>
        ) : edhrecThemes.length === 0 ? (
          <p className="text-sm text-cmd-muted">Keine EDHREC-Themen gefunden — nutze stattdessen Mechaniken/Spielstil unten.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {edhrecThemes.map(theme => (
              <button
                key={theme.slug}
                onClick={() => toggleTheme(theme.name)}
                className={`px-3 py-2 rounded-xl transition text-sm font-semibold ${
                  strategy.themes.includes(theme.name)
                    ? ''
                    : 'text-cmd-muted hover:text-fg bg-[color:var(--surface)] border border-[color:var(--border)]'
                }`}
                style={strategy.themes.includes(theme.name) ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
                title={`${theme.count} Decks auf EDHREC mit diesem Tag`}
              >
                {theme.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">⚙️ Wichtigste Mechaniken (wähle min. 2)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {mechanics.map(mechanic => (
            <button
              key={mechanic}
              onClick={() => toggleMechanic(mechanic)}
              className={`p-3 rounded-xl transition text-sm font-semibold ${
                strategy.keyMechanics.includes(mechanic)
                  ? ''
                  : 'text-cmd-muted hover:text-fg bg-[color:var(--surface)] border border-[color:var(--border)]'
              }`}
              style={strategy.keyMechanics.includes(mechanic) ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
            >
              {mechanic}
            </button>
          ))}
        </div>
        <p className="text-sm text-fg-muted mt-3">
          {strategy.keyMechanics.length} Mechaniken gewählt
        </p>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">🎮 Spielstil</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {playStyles.map(style => (
            <button
              key={style}
              onClick={() => setStrategy(prev => ({ ...prev, playStyle: style }))}
              className={`p-3 rounded-xl transition ${
                strategy.playStyle === style
                  ? ''
                  : 'text-cmd-muted hover:text-fg bg-[color:var(--surface)] border border-[color:var(--border)]'
              }`}
              style={strategy.playStyle === style ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">💰 Zukaufsbudget (max.)</h2>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="50"
            max="2000"
            value={strategy.budget}
            onChange={(e) => setStrategy(prev => ({ ...prev, budget: parseInt(e.target.value) }))}
            className="flex-1"
          />
          <span className="text-lg font-bold">€{strategy.budget}</span>
        </div>
        <p className="text-sm text-fg-muted mt-2">
          Gilt für ALLE Karten zusammen, die du noch nicht besitzt (Basisländer ausgenommen) — nicht pro Einzelkarte. Ergänzt das "Deck-Budget insgesamt" vom vorherigen Schritt, das nur für die Commander-Auswahl zählt.
        </p>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">🔄 Bekannte Combos</h2>
        <div className="mb-3">
          <input
            id="combo-input"
            type="text"
            placeholder="z.B. Card A + Card B = Effect"
            className="w-full text-fg rounded-xl p-3"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
          />
          <button onClick={handleAddCombo} className="btn-secondary w-full mt-2">
            + Hinzufügen
          </button>
        </div>
        {strategy.combos.length > 0 && (
          <div className="space-y-2">
            {strategy.combos.map((combo, index) => (
              <div key={index} className="flex justify-between items-center p-2 rounded-lg" style={{ backgroundColor: 'var(--surface)' }}>
                <span className="text-cmd-muted">{combo}</span>
                <button
                  onClick={() => handleRemoveCombo(index)}
                  className="text-[color:var(--r)] hover:text-[color:var(--r)]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">📝 Anmerkungen</h2>
        <textarea
          value={strategy.notes}
          onChange={(e) => setStrategy(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Zusätzliche Infos zur Strategie (optional)"
          className="w-full text-fg rounded-xl p-3 h-20 resize-none"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/select-commander')}
          className="btn-secondary flex-1"
        >
          ← Zurück
        </button>
        <button
          onClick={handleNext}
          className="btn-primary flex-1"
        >
          Weiter zum Chat-Aufbau →
        </button>
      </div>
    </div>
  )
}
