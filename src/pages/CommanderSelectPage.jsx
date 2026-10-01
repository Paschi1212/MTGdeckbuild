import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'
import ChatBuilderPage from './ChatBuilderPage'
import AnalyzePage from './AnalyzePage'
import CommanderSearchInput from '../components/CommanderSearchInput'

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
  const location = useLocation()
  // The questionnaire (StrategyPage) funnels its answers into the chat builder instead of a
  // separate results page — arriving with that handoff state should land straight on the
  // chat tab with the commander and a ready-to-send first message, not back on "Finden".
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'find')
  const chatHandoff = location.state?.activeTab === 'chat'
    ? { commander: location.state?.chatCommander, autoMessage: location.state?.chatAutoMessage }
    : null
  const [step, setStep] = useState('method') // method | questionnaire | search | results | theme | themeResults
  const [preferences, setPreferences] = useState({
    colors: [],
    playStyle: '',
    budget: 500,
    powerLevel: 'Semi-Casual'
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCommander, setSelectedCommander] = useState(null)
  const [searchCommanderInput, setSearchCommanderInput] = useState('')
  const [directCommanderInput, setDirectCommanderInput] = useState('')

  // EDHREC's full site-wide theme list (Tokens, Aristocrats, Voltron, ...) — loaded once,
  // lazily, the first time the user actually opens the theme browser rather than on every
  // page load. Real community deck counts instead of an AI-guessed suggestion.
  const [themes, setThemes] = useState([])
  const [themesLoading, setThemesLoading] = useState(false)
  const [themeFilter, setThemeFilter] = useState('')
  // Multi-select, not single-click-and-navigate — the point is pooling ideas from several
  // themes at once (e.g. Aristocrats + Sacrifice), not picking one theme in isolation.
  const [selectedThemeSlugs, setSelectedThemeSlugs] = useState([])
  const [themeCommanders, setThemeCommanders] = useState(null) // null = not fetched yet
  const [themeCommandersLoading, setThemeCommandersLoading] = useState(false)

  useEffect(() => {
    if (step !== 'theme' || themes.length > 0 || themesLoading) return
    setThemesLoading(true)
    fetch('/.netlify/functions/get-edhrec-themes')
      .then(res => (res.ok ? res.json() : { themes: [] }))
      .then(data => setThemes(data.themes || []))
      .catch(() => {})
      .finally(() => setThemesLoading(false))
  }, [step, themes.length, themesLoading])

  const filteredThemes = useMemo(() => {
    const q = themeFilter.trim().toLowerCase()
    if (!q) return themes
    return themes.filter(t => t.name.toLowerCase().includes(q))
  }, [themes, themeFilter])

  const toggleThemeSelection = (theme) => {
    setThemeCommanders(null) // selection changed — stale results, force a fresh fetch
    setSelectedThemeSlugs(prev =>
      prev.includes(theme.slug) ? prev.filter(s => s !== theme.slug) : [...prev, theme.slug]
    )
  }

  // Fetches every selected theme's commander list in parallel and merges them into one
  // deduplicated list, ranked by HOW MANY of the selected themes a commander matches first
  // (a commander that shows up for both "Aristocrats" and "Sacrifice" is a real cross-theme
  // signal, not just popular in one bucket) and total deck count as the tiebreaker.
  const handleShowThemeCommanders = async () => {
    if (selectedThemeSlugs.length === 0) return
    setStep('themeResults')
    setThemeCommandersLoading(true)
    setThemeCommanders(null)

    try {
      const results = await Promise.all(
        selectedThemeSlugs.map(slug =>
          fetch(`/.netlify/functions/get-theme-commanders?theme=${encodeURIComponent(slug)}`)
            .then(res => (res.ok ? res.json() : { commanders: [] }))
            .then(data => ({ slug, commanders: data.commanders || [] }))
            .catch(() => ({ slug, commanders: [] }))
        )
      )

      const byName = new Map()
      for (const { slug, commanders } of results) {
        const themeName = themes.find(t => t.slug === slug)?.name || slug
        for (const c of commanders) {
          const existing = byName.get(c.name)
          if (existing) {
            existing.themeNames.push(themeName)
            existing.numDecks = Math.max(existing.numDecks, c.numDecks)
          } else {
            byName.set(c.name, { name: c.name, numDecks: c.numDecks, themeNames: [themeName] })
          }
        }
      }

      const merged = [...byName.values()].sort((a, b) =>
        b.themeNames.length - a.themeNames.length || b.numDecks - a.numDecks
      )
      setThemeCommanders(merged)
    } finally {
      setThemeCommandersLoading(false)
    }
  }

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
              onClick={() => setStep('theme')}
              className="card-hover md:col-span-2"
            >
              <h3 className="text-xl font-bold mb-2 text-mtg-gold">🏷️ Nach Thema suchen</h3>
              <p className="text-gray-400">
                Durchsuche echte EDHREC-Themen (Aristocrats, Voltron, Tokens, ...) und finde die dort beliebtesten Commander dafür — auf Basis echter Deck-Zahlen, nicht KI-geraten.
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
            <CommanderSearchInput
              value={directCommanderInput}
              onChange={setDirectCommanderInput}
              onSubmit={handleSelectCommander}
              placeholder="z.B. Magus Lucea Kane"
              className="w-full text-white rounded-xl p-3"
            />
            <p className="text-sm text-gray-400 mt-2">
              Enter zum Bestätigen — Vorschläge über alle Commander, nicht nur deine Sammlung
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
            <CommanderSearchInput
              value={searchCommanderInput}
              onChange={setSearchCommanderInput}
              onSubmit={handleSelectCommander}
              placeholder="z.B. Magus Lucea Kane, Marisi Goat, etc."
              className="w-full text-white rounded-xl p-3 text-lg mb-4"
            />
            <button
              onClick={() => {
                if (searchCommanderInput) {
                  handleSelectCommander(searchCommanderInput)
                }
              }}
              className="btn-primary w-full"
            >
              Wählen →
            </button>
            <p className="text-sm text-gray-400 mt-2">
              Vorschläge über alle Commander beim Tippen, nicht nur deine Sammlung
            </p>
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

    // Step 5: Browse EDHREC themes (multi-select — pool ideas from several at once)
    if (step === 'theme') {
      return (
        <div className="max-w-3xl mx-auto">
          <div className="card mb-6">
            <h2 className="text-xl font-bold mb-1">🏷️ Nach Thema suchen</h2>
            <p className="text-cmd-muted text-sm mb-4">
              Wähle ein oder mehrere Themen — ein Commander, der in mehreren davon beliebt ist, deckt mehrere deiner Ideen gleichzeitig ab.
            </p>
            <input
              type="text"
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              placeholder="Thema filtern… z.B. Voltron, Tokens, Reanimator"
              className="w-full text-white rounded-xl p-3 mb-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
              autoFocus
            />

            {themesLoading ? (
              <p className="text-cmd-muted text-sm py-6 text-center">Lade EDHREC-Themen…</p>
            ) : filteredThemes.length === 0 ? (
              <p className="text-cmd-muted text-sm py-6 text-center">Kein Thema gefunden.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredThemes.map(theme => {
                  const selected = selectedThemeSlugs.includes(theme.slug)
                  return (
                    <button
                      key={theme.slug}
                      onClick={() => toggleThemeSelection(theme)}
                      className="px-3 py-2 rounded-xl text-sm text-left transition hover:brightness-125"
                      style={selected
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
                        : { backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                      <span className="font-medium">{selected ? '✓ ' : ''}{theme.name}</span>
                      <span className={selected ? 'text-xs ml-2 opacity-70' : 'text-cmd-muted text-xs ml-2'}>
                        {theme.numDecks.toLocaleString('de-DE')} Decks
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('method')}
              className="btn-secondary flex-1"
            >
              ← Zurück
            </button>
            <button
              onClick={handleShowThemeCommanders}
              disabled={selectedThemeSlugs.length === 0}
              className="btn-primary flex-1"
            >
              Commander anzeigen {selectedThemeSlugs.length > 0 ? `(${selectedThemeSlugs.length} Thema/Themen)` : ''}
            </button>
          </div>

          <ChatWidget contextNote={contextNote} />
        </div>
      )
    }

    // Step 6: Merged, deduplicated commander list across all selected themes
    if (step === 'themeResults') {
      return (
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-1">🏷️ {selectedThemeSlugs.length} Thema/Themen ausgewählt</h2>
          <p className="text-cmd-muted mb-6">
            Echte EDHREC-Commander für deine gewählten Themen — Treffer in mehreren Themen stehen oben.
          </p>

          {themeCommandersLoading ? (
            <p className="text-cmd-muted text-sm py-10 text-center">Lade Commander…</p>
          ) : !themeCommanders?.length ? (
            <p className="text-cmd-muted text-sm py-10 text-center">Keine Commander-Daten gefunden.</p>
          ) : (
            <div className="space-y-2 mb-8 max-h-[480px] overflow-y-auto pr-1">
              {themeCommanders.map(c => (
                <button
                  key={c.name}
                  onClick={() => handleSelectCommander(c.name)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left transition hover:brightness-125"
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{c.name}</div>
                    <div className="text-xs text-cmd-muted truncate">{c.themeNames.join(' · ')}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-cmd-muted">{c.numDecks.toLocaleString('de-DE')} Decks</div>
                    {c.themeNames.length > 1 && (
                      <div className="text-xs font-semibold" style={{ color: 'var(--g)' }}>
                        {c.themeNames.length}x Treffer
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setStep('theme')}
            className="btn-secondary w-full"
          >
            ← Andere Themen
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
              ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-bg)' }
              : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'find' && renderFindTab()}
      {activeTab === 'chat' && (
        <ChatBuilderPage initialCommander={chatHandoff?.commander} initialMessage={chatHandoff?.autoMessage} />
      )}
      {activeTab === 'analyze' && <AnalyzePage />}
    </div>
  )
}
