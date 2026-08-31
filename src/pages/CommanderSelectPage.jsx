import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CommanderSelectPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('method') // method | questionnaire | search
  const [preferences, setPreferences] = useState({
    colors: [],
    playStyle: '',
    budget: 500,
    powerLevel: 'Semi-Casual'
  })
  const [suggestions, setSuggestions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommander, setSelectedCommander] = useState(null)

  const colors = [
    { id: 'W', name: 'Weiß', hex: '#FFFACD' },
    { id: 'U', name: 'Blau', hex: '#A2D5FF' },
    { id: 'B', name: 'Schwarz', hex: '#8B7355' },
    { id: 'R', name: 'Rot', hex: '#FF9999' },
    { id: 'G', name: 'Grün', hex: '#90EE90' }
  ]

  const playStyles = [
    'Aggro - Schnelle Siege',
    'Midrange - Balance',
    'Control - Gegner bremsen',
    'Combo - Infinite Synergien',
    'Ramp - Big Mana',
    'Tokens - Viele Creatures',
    'Reanimation - Friedhof nutzen'
  ]

  const toggleColor = (colorId) => {
    setPreferences(prev => ({
      ...prev,
      colors: prev.colors.includes(colorId)
        ? prev.colors.filter(c => c !== colorId)
        : [...prev.colors, colorId]
    }))
  }

  const handleSuggestCommanders = async () => {
    setLoading(true)
    try {
      const response = await fetch('/.netlify/functions/suggest-commanders', {
        method: 'POST',
        body: JSON.stringify({
          colors: preferences.colors,
          playStyle: preferences.playStyle,
          budget: preferences.budget,
          powerLevel: preferences.powerLevel
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions)
        setStep('results')
      } else {
        alert('Fehler beim Abrufen von Vorschlägen')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Fehler: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCommander = (commander) => {
    setSelectedCommander(commander)
    // Save to session/context and navigate to strategy
    sessionStorage.setItem('selectedCommander', commander)
    navigate('/strategy', { state: { commander } })
  }

  // Step 1: Choose method
  if (step === 'method') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>🧙 Commander Auswählen</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setStep('questionnaire')}
            className="card-hover"
          >
            <h3 className="text-xl font-bold mb-2 text-mtg-blue">❓ Guided Auswahl</h3>
            <p className="text-gray-400">
              Beantworte ein paar Fragen und wir empfehlen dir Commander
            </p>
          </button>

          <button
            onClick={() => setStep('search')}
            className="card-hover"
          >
            <h3 className="text-xl font-bold mb-2 text-mtg-green">🔍 Direkte Suche</h3>
            <p className="text-gray-400">
              Du kennst bereits einen Commander, den du spielen möchtest?
            </p>
          </button>

          <button
            onClick={() => navigate('/upload')}
            className="card-hover md:col-span-2"
          >
            <h3 className="text-xl font-bold mb-2 text-mtg-red">↩️ Zurück</h3>
            <p className="text-gray-400">
              Zuerst Sammlung hochladen oder bearbeiten
            </p>
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Questionnaire
  if (step === 'questionnaire') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>🧙 Commander Fragebogen</h1>

        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Lieblings-Farben</h2>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {colors.map(color => (
              <button
                key={color.id}
                onClick={() => toggleColor(color.id)}
                className={`p-4 rounded-lg font-bold transition ${
                  preferences.colors.includes(color.id)
                    ? 'ring-2 ring-mtg-gold'
                    : 'border border-gray-700'
                }`}
                style={{
                  backgroundColor: preferences.colors.includes(color.id)
                    ? color.hex
                    : 'transparent',
                  color: preferences.colors.includes(color.id) ? '#000' : '#fff'
                }}
              >
                {color.id}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-400">
            {preferences.colors.length === 0 ? 'Wähle min. 1 Farbe' : `${preferences.colors.length} Farbe(n) gewählt`}
          </p>
        </div>

        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Spielstil</h2>
          <select
            value={preferences.playStyle}
            onChange={(e) => setPreferences(prev => ({ ...prev, playStyle: e.target.value }))}
            className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700"
          >
            <option value="">Wähle einen Spielstil</option>
            {playStyles.map(style => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </div>

        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Budget</h2>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="50"
              max="1000"
              value={preferences.budget}
              onChange={(e) => setPreferences(prev => ({ ...prev, budget: parseInt(e.target.value) }))}
              className="flex-1"
            />
            <span className="text-lg font-bold">€{preferences.budget}</span>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Deck-Budget insgesamt
          </p>
        </div>

        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Power Level</h2>
          <div className="grid grid-cols-2 gap-3">
            {['Casual', 'Semi-Casual', 'Semi-Competitive', 'Competitive'].map(level => (
              <button
                key={level}
                onClick={() => setPreferences(prev => ({ ...prev, powerLevel: level }))}
                className={`p-3 rounded-lg transition ${
                  preferences.powerLevel === level
                    ? 'bg-mtg-blue text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep('method')}
            className="btn-secondary flex-1"
          >
            ← Zurück
          </button>
          <button
            onClick={handleSuggestCommanders}
            disabled={preferences.colors.length === 0 || !preferences.playStyle || loading}
            className="btn-primary flex-1"
          >
            {loading ? 'Lädt...' : 'Empfehlungen Abrufen →'}
          </button>
        </div>
      </div>
    )
  }

  // Step 3: Results
  if (step === 'results' && suggestions) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>🎯 Commander Empfehlungen</h1>

        <div className="card mb-8">
          <p className="text-gray-300 whitespace-pre-wrap">
            {suggestions}
          </p>
        </div>

        <div className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Oder gib einen Commander direkt ein:</h2>
          <input
            type="text"
            placeholder="z.B. Magus Lucea Kane"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSelectCommander(e.target.value)
              }
            }}
            className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700"
          />
          <p className="text-sm text-gray-400 mt-2">
            Enter zum Bestätigen
          </p>
        </div>

        <button
          onClick={() => setStep('questionnaire')}
          className="btn-secondary w-full"
        >
          ← Neue Suche
        </button>
      </div>
    )
  }

  // Step 4: Search
  if (step === 'search') {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>🔍 Commander Direkteingabe</h1>

        <div className="card mb-6">
          <input
            type="text"
            placeholder="z.B. Magus Lucea Kane, Marisi Goat, etc."
            id="commander-input"
            className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 text-lg mb-4"
          />
          <button
            onClick={() => {
              const input = document.getElementById('commander-input')
              if (input.value) {
                handleSelectCommander(input.value)
              }
            }}
            className="btn-primary w-full"
          >
            Wählen →
          </button>
        </div>

        <button
          onClick={() => setStep('method')}
          className="btn-secondary w-full"
        >
          ← Zurück
        </button>
      </div>
    )
  }
}
