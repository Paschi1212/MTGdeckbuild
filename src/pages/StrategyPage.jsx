import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function StrategyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const commander = location.state?.commander || sessionStorage.getItem('selectedCommander')

  const [strategy, setStrategy] = useState({
    primaryWinCon: '',
    keyMechanics: [],
    playStyle: '',
    budget: 500,
    combos: [],
    synergies: [],
    notes: ''
  })

  const [loading, setLoading] = useState(false)

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

  const handleNext = async () => {
    if (!strategy.primaryWinCon || strategy.keyMechanics.length === 0) {
      alert('Bitte fülle alle Pflichtfelder aus')
      return
    }

    // Save strategy and navigate to analyze
    sessionStorage.setItem('strategy', JSON.stringify(strategy))
    navigate('/analyze', { state: { commander, strategy } })
  }

  if (!commander) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-400 mb-4">Kein Commander ausgewählt</p>
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
          className="w-full text-white rounded-xl p-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
        >
          <option value="">Wähle eine Win Condition</option>
          {winConditions.map(wc => (
            <option key={wc} value={wc}>{wc}</option>
          ))}
        </select>
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
                  : 'text-cmd-muted hover:text-white bg-[color:var(--surface)] border border-[color:var(--border)]'
              }`}
              style={strategy.keyMechanics.includes(mechanic) ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
            >
              {mechanic}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-400 mt-3">
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
                  : 'text-cmd-muted hover:text-white bg-[color:var(--surface)] border border-[color:var(--border)]'
              }`}
              style={strategy.playStyle === style ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' } : undefined}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">💰 Budget pro Karte (max.)</h2>
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
        <p className="text-sm text-gray-400 mt-2">
          Gilt pro Einzelkarte (nicht fürs ganze Deck) — Basisländer ausgenommen. Anders als das "Deck-Budget insgesamt" vom vorherigen Schritt.
        </p>
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">🔄 Bekannte Combos</h2>
        <div className="mb-3">
          <input
            id="combo-input"
            type="text"
            placeholder="z.B. Card A + Card B = Effect"
            className="w-full text-white rounded-xl p-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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
                  className="text-red-400 hover:text-red-300"
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
          className="w-full text-white rounded-xl p-3 h-20 resize-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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
          disabled={loading}
          className="btn-primary flex-1"
        >
          {loading ? 'Analysiert...' : 'Deck Analysieren →'}
        </button>
      </div>
    </div>
  )
}
