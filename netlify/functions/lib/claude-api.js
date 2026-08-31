/**
 * Ollama API Integration (Local)
 * Analyzes decks using local Mistral model via Ollama
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const OLLAMA_MODEL = 'mistral'

/**
 * Analyze deck and get recommendations using Ollama
 */
async function analyzeDeck(analysis) {
  const {
    commander,
    strategy,
    collection,
    edhecData,
    userFeedback,
    budget
  } = analysis

  // Build context from EDHREC data
  const edhecContext = edhecData
    ? `
EDHREC INSIGHTS (von beliebtesten ${commander} Decks):
- Top Cards: ${edhecData.allCards.slice(0, 10).map(c => c.name).join(', ')}
- Synergy-Commander: ${edhecData.synergyCommanders.slice(0, 3).map(c => c.name).join(', ')}
- Salt Index: ${edhecData.salt || 'unknown'}
`
    : ''

  // Build user feedback context
  const feedbackContext = userFeedback
    ? `
USER FEEDBACK HISTORY:
${userFeedback
  .slice(-5)
  .map(f => `- ${f.date}: ${f.action} "${f.card}" (Grund: ${f.reason})`)
  .join('\n')}

USER PREFERENCES:
- Budget pro Karte: €${budget || 'unlimited'}
- Lieblings-Archetypes: ${userFeedback.map(f => f.archetype).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
`
    : ''

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Expert.

COMMANDER: ${commander}

DECK STRATEGIE:
${strategy.primaryWinCon ? `Primary Win Condition: ${strategy.primaryWinCon}` : ''}
${strategy.keyMechanics ? `Key Mechanics: ${strategy.keyMechanics}` : ''}
${strategy.playStyle ? `Play Style: ${strategy.playStyle}` : ''}

USER'S COLLECTION:
Insgesamt ${collection.total} Karten
Decktypen: ${Object.entries(collection.byType).map(([type, count]) => `${type}: ${count}`).join(', ')}

${edhecContext}

${feedbackContext}

AUFGABE:
Analysiere das Deck und gib mir:

1. **Cards to Add** (TOP 5):
   - Kartennamen
   - Warum passt es zur Strategie?

2. **Cards to Cut** (TOP 5):
   - Kartennamen
   - Warum ist sie schwach?

3. **Budget-Alternativen** (Unter €${budget || 20})

4. **Deck Evaluation**:
   - Mana-Kurve ok?
   - Genug Card Advantage?
   - Removal vorhanden?

Bleibe bei der Strategie und schlage nur sinnvolle Alternativen vor.`

  try {
    console.log('[Ollama] Analyzing deck:', commander)

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return {
      analysis: data.response,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0
      }
    }
  } catch (error) {
    console.error('[Ollama] Error analyzing deck:', error)
    throw error
  }
}

/**
 * Generate commander suggestions based on user preferences using Ollama
 */
async function suggestCommanders(preferences) {
  const {
    colors,
    playStyle,
    budget,
    powerLevel
  } = preferences

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Experte.

USER PREFERENCES:
- Lieblings-Farben: ${colors.join(', ')}
- Spielstil: ${playStyle}
- Budget: €${budget}
- Power Level: ${powerLevel}

Empfehle die TOP 5 Commander, die:
1. In den Farben spielbar sind
2. Dem Spielstil entsprechen
3. Für Budget geeignet sind

Für jeden Commander:
- Name
- Farben
- Warum passt er?
- Schwerpunkt-Strategie
- Estimated Deck Cost`

  try {
    console.log('[Ollama] Suggesting commanders for:', playStyle)

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      throw new Error('Ollama error')
    }

    const data = await response.json()

    return {
      suggestions: data.response,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0
      }
    }
  } catch (error) {
    console.error('[Ollama] Error suggesting commanders:', error)
    throw error
  }
}

module.exports = {
  analyzeDeck,
  suggestCommanders
}
