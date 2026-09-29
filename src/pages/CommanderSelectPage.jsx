import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'
import ChatBuilderPage from './ChatBuilderPage'
import AnalyzePage from './AnalyzePage'

const HUB_TABS = [
  { id: 'find', label: '🔍 Commander finden' },
  { id: 'chat', label: '🤖 Chat-Aufbau' },
  { id: 'analyze', label: '📊 Analysieren' }
]

function buildCommanderSearchContextNote(preferences) {
  const parts = []
  if (preferences.colors.length) parts.push(`Farben: ${preferences.colors.join(', ')}`)
  if (preferences.playStyle) parts.push(`Spielstil: ${preferences.playStyle}`)
  if (preferences.budget) parts.push(`Budget: €${preferences.budget}`)
  if (preferences.powerLevel) parts.push(`Power Level: ${preferences.powerLevel}`)
  const prefsText = parts.length ? ` Bisherige Fragebogen-Auswahl: ${parts.join('; ')}.` : ''

  return `Der Nutzer sucht gerade einen passenden Commander (noch keiner gewählt).${prefsText} Hilf ihm bei der Wahl im Gespräch, schlage bei Bedarf konkrete, echte Commander-Namen mit kurzer Begründung vor — er trägt den Namen danach selbst im Formular/der Suche ein.`
}

export default function CommanderSelectPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('find')
  const [step, setStep] = useState('method') // method | questionnaire | search | results
  const [preferences, setPreferences] = useState({
    colors: [],
    playStyle: '',
    budget: 500,
    powerLevel: 'Semi-Casual'
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommander, setSelectedCommander] = useState(null)

  const contextNote = buildCommanderSearchContextNote(preferences)

  const colors = [
    { id: 'W', name: 'Weiß', hex: '#F8F6D8', textColor: '#000' },
    { id: 'U', name: 'Blau', hex: '#4FA8F5', textColor: '#000' },
    { id: 'B', name: 'Schwarz', hex: '#1A1A1A', textColor: '#fff' },
    { id: 'R', name: 'Rot', hex: '#E8524A', textColor: '#fff' },
    { id: 'G', name: 'Grün', hex: '#4ED689', textColor: '#000' },
    { id: 'C', name: 'Farblos', hex: '#C7C2D6', textColor: '#000' }
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
        setResult(data)
        setStep('results')
      } else {
        alert(await readApiError(response))
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

  function renderFindTab() {
    // Step 1: Choose method
    if (step === 'method') {
      return (
        <div className="max-w-2xl mx-auto">
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

          <ChatWidget contextNote={contextNote} />
        </div>
      )
    }

    // Step 2: Questionnaire
    if (step === 'questionnaire') {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="card mb-6">
            <h2 className="text-xl font-bold mb-4">Lieblings-Farben</h2>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {colors.map(color => (
                <button
                  key={color.id}
                  onClick={() => toggleColor(color.id)}
                  className={`p-3 rounded-lg font-bold text-xs sm:text-sm transition ${
                    preferences.colors.includes(color.id)
                      ? 'ring-2 ring-mtg-gold'
                      : 'border border-[color:var(--border)]'
                  }`}
                  style={{
                    backgroundColor: preferences.colors.includes(color.id)
                      ? color.hex
                      : 'transparent',
                    color: preferences.colors.includes(color.id) ? color.textColor : '#fff'
                  }}
                >
                  {color.name}
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
              className="w-full text-white rounded-xl p-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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
                      : 'text-cmd-muted hover:text-white bg-[color:var(--surface)] border border-[color:var(--border)]'
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

          <ChatWidget contextNote={contextNote} />
        </div>
      )
    }

    // Step 3: Results
    if (step === 'results' && result) {
      return (
        <div className="max-w-4xl mx-auto">
          {result.intro && (
            <p className="text-cmd-muted mb-6 whitespace-pre-wrap">{result.intro}</p>
          )}

          {result.suggestions?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
              {result.suggestions.map(card => (
                <div key={card.name}>
                  {/* No onClick passed here on purpose — CardTile's own click then zooms it
                      (its built-in default behavior), instead of jumping straight to select. */}
                  <CardTile card={card} />
                  <button
                    onClick={() => handleSelectCommander(card.name)}
                    className="btn-primary w-full mt-2 text-xs px-2 py-1.5"
                  >
                    Auswählen
                  </button>
                </div>
              ))}
            </div>
          )}

          {result.parseError && (
            <div className="card mb-8">
              <p className="text-cmd-muted text-sm">
                Die Antwort konnte nicht als Kartenliste erkannt werden — hier die rohe Antwort:
              </p>
              <p className="text-gray-300 whitespace-pre-wrap mt-2">{result.intro}</p>
            </div>
          )}

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
              className="w-full text-white rounded-xl p-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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

          <ChatWidget contextNote={contextNote} />
        </div>
      )
    }

    // Step 4: Search
    if (step === 'search') {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="card mb-6">
            <input
              type="text"
              placeholder="z.B. Magus Lucea Kane, Marisi Goat, etc."
              id="commander-input"
              className="w-full text-white rounded-xl p-3 text-lg mb-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
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

          <ChatWidget contextNote={contextNote} />
        </div>
      )
    }

    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1>🧙 Commander</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {HUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors"
            style={activeTab === tab.id
              ? { backgroundImage: 'linear-gradient(135deg, var(--u), var(--b))', color: '#fff' }
              : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'find' && renderFindTab()}
      {activeTab === 'chat' && <ChatBuilderPage />}
      {activeTab === 'analyze' && <AnalyzePage />}
    </div>
  )
}
