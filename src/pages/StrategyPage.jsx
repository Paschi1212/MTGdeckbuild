import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CardSearch from '../components/editor/CardSearch'
import { useCommanderColors, ColorPips, colorIdentityLabel } from '../components/CommanderColors'
import { loadCommanderCard } from '../lib/table/decks'
import { loadCollection, getAvailableQuantities } from '../lib/collection'

const POWER_LEVELS = [
  ['Casual', 'Thema und Spaß vor Effizienz'],
  ['Semi-Casual', 'fokussiert, aber fair'],
  ['Semi-Competitive', 'stark, Tutoren und Combos erlaubt'],
  ['Competitive', 'cEDH-nah, maximale Effizienz']
]
const BUDGETS = [[null, 'Kein Limit'], [50, '50 €'], [100, '100 €'], [250, '250 €'], [500, '500 €']]
const MAX_THEMES = 2

const chipStyle = (on) => ({
  background: on ? 'var(--color-accent)' : 'var(--color-surface)',
  color: on ? 'var(--color-bg)' : 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)'
})

function Section({ number, title, hint, children }) {
  return (
    <section className="card mb-5">
      <h2 className="text-lg font-bold mb-1">
        <span className="tabular-nums mr-2" style={{ color: 'var(--color-text-muted)' }}>{number}</span>{title}
      </h2>
      {hint && <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{hint}</p>}
      {children}
    </section>
  )
}

function CardChips({ names, tone, onRemove }) {
  if (!names.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5 mt-3">
      {names.map(name => (
        <li key={name} className="inline-flex items-center gap-1.5 text-sm pl-2.5 pr-1 py-1" style={{ border: `1px solid ${tone}`, borderRadius: 'var(--radius-sm)' }}>
          <span style={{ color: 'var(--color-text)' }}>{name}</span>
          <button type="button" onClick={() => onRemove(name)} aria-label={`${name} entfernen`} className="px-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </li>
      ))}
    </ul>
  )
}

// The deck questionnaire: the player's idea in their own words, the cards that must (not) be
// in it, and the frame. Must-have and excluded cards are enforced by the build itself; the
// idea goes to it word for word and becomes the deck's binding game plan.
export default function StrategyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const commander = location.state?.commander || sessionStorage.getItem('selectedCommander')

  const [idea, setIdea] = useState('')
  const [mustInclude, setMustInclude] = useState([])
  const [exclude, setExclude] = useState([])
  const [themes, setThemes] = useState([])
  const [powerLevel, setPowerLevel] = useState('Semi-Casual')
  const [budget, setBudget] = useState(null)
  const [customBudget, setCustomBudget] = useState('')

  const [commanderCard, setCommanderCard] = useState(null)
  const { colors } = useCommanderColors(commander)
  const [collection] = useState(loadCollection)
  const availableQuantities = useMemo(() => getAvailableQuantities(collection), [collection])

  // The commander's real EDHREC data: its themes (with deck counts) and high-synergy cards.
  const [edhrec, setEdhrec] = useState(null) // null = loading, false = none
  useEffect(() => {
    if (!commander) return
    loadCommanderCard(commander).then(setCommanderCard)
    fetch(`/.netlify/functions/get-commander-data?commander=${encodeURIComponent(commander)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setEdhrec(data || false))
      .catch(() => setEdhrec(false))
  }, [commander])

  const chosen = useMemo(() => new Set([...mustInclude, ...exclude]), [mustInclude, exclude])
  const synergyCards = (edhrec?.recommendations?.highSynergyCards || []).filter(card => !chosen.has(card.name) && card.name !== commander).slice(0, 12)

  const addTo = (setter, other) => (name) => {
    other(prev => prev.filter(n => n !== name))
    setter(prev => (prev.includes(name) ? prev : [...prev, name]))
  }
  const addMust = addTo(setMustInclude, setExclude)
  const addExclude = addTo(setExclude, setMustInclude)
  const toggleTheme = (theme) => setThemes(prev => (prev.some(t => t.slug === theme.slug)
    ? prev.filter(t => t.slug !== theme.slug)
    : prev.length >= MAX_THEMES ? prev : [...prev, { slug: theme.slug, name: theme.name }]))

  const effectiveBudget = customBudget ? Math.max(0, Number(customBudget)) || null : budget

  // The plan as it is kept with the deck (binding for later analyses).
  const playerPlan = [
    idea.trim() && `Idee: ${idea.trim()}`,
    `Spielstärke: ${powerLevel}`,
    themes.length && `EDHREC-Thema: ${themes.map(t => t.name).join(' + ')}`,
    mustInclude.length && `Pflichtkarten: ${mustInclude.join(', ')}`,
    exclude.length && `Nicht ins Deck: ${exclude.join(', ')}`
  ].filter(Boolean).join('\n')

  const buildWithAi = () => {
    const message = [
      `Baue mir ein komplettes Deck für ${commander}.`,
      idea.trim() && `Meine Idee: ${idea.trim()}`,
      mustInclude.length && `Diese Karten müssen rein: ${mustInclude.join(', ')}.`,
      exclude.length && `Diese Karten nicht verwenden: ${exclude.join(', ')}.`,
      themes.length && `EDHREC-Thema: ${themes.map(t => t.name).join(' + ')}.`,
      `Spielstärke: ${powerLevel}.`,
      effectiveBudget && `Zukaufsbudget: max. ca. €${effectiveBudget} für alle Karten zusammen, die ich noch nicht besitze (Basisländer ausgenommen).`
    ].filter(Boolean).join('\n')
    navigate('/select-commander', {
      state: {
        activeTab: 'chat',
        chatCommander: commander,
        chatAutoMessage: message,
        chatBuildSpec: { idea: idea.trim(), mustInclude, exclude, themes, powerLevel, budget: effectiveBudget },
        playerPlan
      }
    })
  }

  const buildByHand = () => navigate('/edit-deck', {
    state: {
      commander,
      cards: mustInclude.map(name => ({ name, count: 1, price: 0 })),
      strategyNote: playerPlan,
      playerPlan,
      powerLevel
    }
  })

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

  const searchProps = {
    collection,
    availableQuantities,
    existingNames: chosen,
    commanderName: commanderCard?.name || commander
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="flex items-center gap-4 mb-6">
        {commanderCard?.image && <img src={commanderCard.image} alt="" className="w-16 rounded-md flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm m-0" style={{ color: 'var(--color-text-muted)' }}>Neues Deck</p>
          <h1 className="m-0 truncate">{commanderCard?.name || commander}</h1>
          {colors && (
            <p className="text-sm m-0 mt-1 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <ColorPips colors={colors} size={16} /> {colorIdentityLabel(colors)}
            </p>
          )}
        </div>
      </header>

      <Section number="1" title="Was soll das Deck tun?" hint="In deinen Worten – Plan, Lieblingskarten, was dich reizt, was du nicht willst. Das geht wörtlich an den Deckbau und wird als dein Spielplan beim Deck gespeichert.">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="z. B. Olivia soll jede Runde einen großen Vampir aus dem Friedhof zurückholen. Selbst-Mill und Discard als Motor, keine Infinite-Combos, gern viele Vampire mit Flugfähigkeit."
          rows={5}
          maxLength={3000}
          className="w-full text-fg rounded-xl p-3 text-sm leading-relaxed"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        />
      </Section>

      <Section number="2" title="Diese Karten müssen rein" hint="Kommen fest ins Deck – die KI baut den Rest um sie herum. Karten außerhalb der Farben des Commanders gehen nicht.">
        <div className="flex"><CardSearch {...searchProps} onAddOwned={(row) => addMust(row.name)} onAddByName={addMust} /></div>
        <CardChips names={mustInclude} tone="var(--g)" onRemove={(name) => setMustInclude(prev => prev.filter(n => n !== name))} />
        {synergyCards.length > 0 && (
          <div className="mt-4">
            <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Hohe Synergie mit {commanderCard?.name || commander} laut EDHREC – antippen zum Übernehmen:</p>
            <div className="flex flex-wrap gap-1.5">
              {synergyCards.map(card => (
                <button key={card.name} type="button" onClick={() => addMust(card.name)} className="text-xs px-2 py-1" style={chipStyle(false)}>
                  + {card.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section number="3" title="Diese Karten nicht" hint="Werden nie vorgeschlagen – auch nicht als günstiger Ersatz fürs Budget.">
        <div className="flex"><CardSearch {...searchProps} onAddOwned={(row) => addExclude(row.name)} onAddByName={addExclude} /></div>
        <CardChips names={exclude} tone="var(--r)" onRemove={(name) => setExclude(prev => prev.filter(n => n !== name))} />
      </Section>

      <Section number="4" title="Rahmen">
        <div className="space-y-5">
          <div>
            <span className="text-sm block mb-2" style={{ color: 'var(--color-text-secondary)' }}>Spielstärke</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {POWER_LEVELS.map(([level, hint]) => (
                <button key={level} type="button" onClick={() => setPowerLevel(level)} aria-pressed={powerLevel === level} className="text-left px-3 py-2 min-h-[44px]" style={chipStyle(powerLevel === level)}>
                  <span className="block text-sm font-semibold">{level}</span>
                  <span className="block text-[11px]" style={{ opacity: 0.75 }}>{hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-sm block mb-2" style={{ color: 'var(--color-text-secondary)' }}>Zukaufsbudget – für alle Karten zusammen, die du noch nicht hast</span>
            <div className="flex flex-wrap items-center gap-2">
              {BUDGETS.map(([value, label]) => (
                <button key={label} type="button" onClick={() => { setBudget(value); setCustomBudget('') }} aria-pressed={!customBudget && budget === value} className="text-sm px-3 min-h-[40px]" style={chipStyle(!customBudget && budget === value)}>
                  {label}
                </button>
              ))}
              <label className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                oder
                <input type="number" min="1" value={customBudget} onChange={(e) => setCustomBudget(e.target.value)} placeholder="€" aria-label="Eigenes Budget in Euro" className="w-20 text-fg rounded-lg px-2 py-1.5 text-sm" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
              </label>
            </div>
          </div>
          <div>
            <span className="text-sm block mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              EDHREC-Thema <span style={{ color: 'var(--color-text-muted)' }}>(optional, bis zu {MAX_THEMES}) – dann kommen die Karten aus genau diesen Decks</span>
            </span>
            {edhrec === null ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Lade Themen …</p>
            ) : !edhrec?.themes?.length ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Für diesen Commander hat EDHREC keine Themen.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {edhrec.themes.map(theme => {
                  const on = themes.some(t => t.slug === theme.slug)
                  return (
                    <button key={theme.slug} type="button" onClick={() => toggleTheme(theme)} aria-pressed={on} disabled={!on && themes.length >= MAX_THEMES} className="text-sm px-3 py-1.5" style={{ ...chipStyle(on), opacity: !on && themes.length >= MAX_THEMES ? 0.5 : 1 }}>
                      {theme.name} <span className="text-xs tabular-nums" style={{ opacity: 0.7 }}>{theme.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => navigate('/select-commander')} className="btn-secondary px-5 min-h-[44px]">← Zurück</button>
        <button onClick={buildByHand} className="btn-secondary flex-1 min-h-[44px]" title="Leerer Editor mit deinen Pflichtkarten – ohne KI-Aufbau">
          Selbst bauen
        </button>
        <button onClick={buildWithAi} className="btn-primary flex-1 min-h-[44px]">
          Deck bauen lassen
        </button>
      </div>
    </div>
  )
}
