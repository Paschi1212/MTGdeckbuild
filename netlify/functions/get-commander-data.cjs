/**
 * GET /.netlify/functions/get-commander-data?commander=Magus%20Lucea%20Kane
 * Returns EDHREC data for a commander
 */

const { getCommanderData, extractRecommendations, extractSynergyCommanders, extractThemes } = require('./lib/edhrec-api.cjs')

exports.handler = async (event) => {
  try {
    const { commander } = event.queryStringParameters || {}

    if (!commander) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'commander parameter required' })
      }
    }

    console.log(`[API] Fetching EDHREC data for: ${commander}`)

    const data = await getCommanderData(commander)

    const recommendations = extractRecommendations(data)
    const synergies = extractSynergyCommanders(data)
    const themes = extractThemes(data)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify({
        commander,
        salt: data.salt || 0,
        deckCount: data.deckCount || 0,
        recommendations,
        synergyCommanders: synergies,
        themes
      })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch commander data',
        message: error.message
      })
    }
  }
}
