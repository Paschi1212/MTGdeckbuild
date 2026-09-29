/**
 * POST /.netlify/functions/analyze-deck
 * Analyzes a deck using Gemini AI
 */

const { analyzeDeck } = require('./lib/gemini-api.cjs')
const { getCommanderData, extractRecommendations, extractSynergyCommanders } = require('./lib/edhrec-api.cjs')

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, strategy, collection, budget } = JSON.parse(event.body)

    if (!commander || !strategy || !collection) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    console.log(`[API] Analyzing deck for ${commander}`)

    // Fetch EDHREC data — same shape chatAssistant()'s build_full_deck path uses
    // (highSynergyCards/topCards/synergyCommanders), since analyzeDeck() now shares its
    // actual generation logic with that flow.
    let edhecData = null
    try {
      const rawData = await getCommanderData(commander)
      edhecData = extractRecommendations(rawData)
      edhecData.synergyCommanders = extractSynergyCommanders(rawData)
    } catch (error) {
      console.warn('[API] Could not fetch EDHREC data:', error.message)
    }

    // Analyze with Claude
    const analysis = await analyzeDeck({
      commander,
      strategy,
      collection,
      edhecData,
      budget
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        commander,
        summary: analysis.summary,
        cards: analysis.cards,
        parseError: analysis.parseError || false,
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
