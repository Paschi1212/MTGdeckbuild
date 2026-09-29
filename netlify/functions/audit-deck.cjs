/**
 * POST /.netlify/functions/audit-deck
 * Audits an existing, already-built deck using Gemini AI
 */

const { auditDeck } = require('./lib/gemini-api.cjs')

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

    const audit = await auditDeck({ commander, deckCards, collectionSampleNames, budget })

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
