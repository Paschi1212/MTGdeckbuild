/**
 * POST /.netlify/functions/audit-deck
 * Audits an existing, already-built deck using Gemini AI
 */

const { auditDeck } = require('./lib/gemini-api.cjs')
const { getCommanderData, extractRecommendations } = require('./lib/edhrec-api.cjs')

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, deckName, deckCards, collectionSampleNames, budget } = JSON.parse(event.body)

    if (!commander || !Array.isArray(deckCards) || deckCards.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    console.log(`[API] Auditing deck "${deckName}" for ${commander}`)

    // Best-effort — a broken/rate-limited EDHREC fetch shouldn't block the audit, it just
    // loses the community-data grounding for cardsToAdd (falls back to Gemini's own
    // unaided suggestions, same as before this fix).
    let edhecData = null
    try {
      const rawData = await getCommanderData(commander)
      edhecData = extractRecommendations(rawData)
    } catch (error) {
      console.warn('[API] Could not fetch EDHREC data for audit:', error.message)
    }

    const audit = await auditDeck({ commander, deckCards, collectionSampleNames, budget, edhecData })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        commander,
        deckName,
        summary: audit.summary,
        cardsToAdd: audit.cardsToAdd,
        cardsToCut: audit.cardsToCut,
        parseError: audit.parseError || false,
        usage: audit.usage
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
