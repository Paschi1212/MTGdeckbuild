/**
 * POST /.netlify/functions/analyze-deck
 * Analyzes a deck using Claude AI
 */

const { analyzeDeck } = require('./lib/claude-api')
const { getCommanderData, extractRecommendations, extractSynergyCommanders } = require('./lib/edhrec-api')

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, strategy, collection, userFeedback, budget } = JSON.parse(event.body)

    if (!commander || !strategy || !collection) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    console.log(`[API] Analyzing deck for ${commander}`)

    // Fetch EDHREC data
    let edhecData = null
    try {
      const rawData = await getCommanderData(commander)
      edhecData = {
        allCards: extractRecommendations(rawData).allCards,
        synergyCommanders: extractSynergyCommanders(rawData),
        salt: rawData.salt
      }
    } catch (error) {
      console.warn('[API] Could not fetch EDHREC data:', error.message)
    }

    // Analyze with Claude
    const analysis = await analyzeDeck({
      commander,
      strategy,
      collection,
      edhecData,
      userFeedback,
      budget
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        commander,
        analysis: analysis.analysis,
        usage: analysis.usage
      })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to analyze deck',
        message: error.message
      })
    }
  }
}
