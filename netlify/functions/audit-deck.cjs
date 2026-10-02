/**
 * POST /.netlify/functions/audit-deck
 * Audits an existing, already-built deck using Gemini AI — split into two independently
 * budgeted phases (each its own Netlify invocation, each its own fresh 30s window), the same
 * way the price-gainer scan is chunked into several requests instead of one big one:
 * - phase "strategy": strategy read + summary + cardsToCut (bounded output, no collection list)
 * - phase "suggestions": cardsToAdd + cardsToBuy (the uncapped, collection-sized half)
 * A single combined call used to do all of this at once and reliably exceeded 30s once the
 * collection sample was raised and the suggestion counts were uncapped.
 */

const { auditDeckStrategy, auditDeckSuggestions } = require('./lib/gemini-api.cjs')
const { getCommanderData, extractRecommendations } = require('./lib/edhrec-api.cjs')

async function fetchEdhecData(commander) {
  try {
    const rawData = await getCommanderData(commander)
    return extractRecommendations(rawData)
  } catch (error) {
    console.warn('[API] Could not fetch EDHREC data for audit:', error.message)
    return null
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, deckName, deckCards, collectionSampleNames, budget, strategyOverride, powerLevel, strategy, phase, keptCards, removedCards } = JSON.parse(event.body)
    // Deck memory from earlier analyses (see auditDeckStrategy/auditDeckSuggestions).
    const asNames = (list) => (Array.isArray(list) ? list.filter(n => typeof n === 'string' && n.trim()).slice(0, 200) : [])

    if (!commander || !Array.isArray(deckCards) || deckCards.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    if (phase === 'suggestions') {
      if (!strategy) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing strategy (required for phase "suggestions")' })
        }
      }

      console.log(`[API] Auditing deck "${deckName}" for ${commander} (phase: suggestions)`)
      const edhecData = await fetchEdhecData(commander)
      const result = await auditDeckSuggestions({ commander, deckCards, collectionSampleNames, budget, edhecData, strategy, removedCards: asNames(removedCards) })

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commander,
          deckName,
          cardsToAdd: result.cardsToAdd,
          cardsToBuy: result.cardsToBuy,
          parseError: result.parseError || false,
          usage: result.usage
        })
      }
    }

    // Default / explicit phase "strategy"
    console.log(`[API] Auditing deck "${deckName}" for ${commander} (phase: strategy)`)
    const edhecData = await fetchEdhecData(commander)
    const result = await auditDeckStrategy({ commander, deckCards, edhecData, strategyOverride, powerLevel, keptCards: asNames(keptCards) })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commander,
        deckName,
        strategy: result.strategy,
        summary: result.summary,
        cardsToCut: result.cardsToCut,
        parseError: result.parseError || false,
        usage: result.usage
      })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to audit deck',
        message: error.message
      })
    }
  }
}
