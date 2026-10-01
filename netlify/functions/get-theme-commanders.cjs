/**
 * GET /.netlify/functions/get-theme-commanders?theme=aristocrats
 * Returns real commanders for an EDHREC theme/tag slug, ranked by actual deck count on
 * EDHREC — the grounded alternative to an AI-guessed commander suggestion.
 */

const { getTagCommanders } = require('./lib/edhrec-api.cjs')
const { getBulkPrices } = require('./lib/scryfall-api.cjs')

exports.handler = async (event) => {
  try {
    const { theme } = event.queryStringParameters || {}

    if (!theme) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'theme parameter required' })
      }
    }

    console.log(`[API] Fetching EDHREC commanders for theme: ${theme}`)

    const tagCommanders = await getTagCommanders(theme)

    // Same enrichment every other commander list in this app gets (CardTile needs a real
    // image to render anything other than a blank box) — EDHREC's tag data itself has no
    // image, only name/slug/deck count.
    const prices = await getBulkPrices(tagCommanders.map(c => c.name))
    const commanders = tagCommanders.map(c => ({
      ...c,
      image: prices[c.name]?.image,
      colors: prices[c.name]?.colorIdentity
    }))

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify({ theme, commanders })
    }
  } catch (error) {
    console.error('[API] Error fetching theme commanders:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch theme commanders',
        message: error.message
      })
    }
  }
}
