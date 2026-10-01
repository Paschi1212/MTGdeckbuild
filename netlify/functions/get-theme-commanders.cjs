/**
 * GET /.netlify/functions/get-theme-commanders?theme=aristocrats
 * Returns real commanders for an EDHREC theme/tag slug, ranked by actual deck count on
 * EDHREC — the grounded alternative to an AI-guessed commander suggestion.
 */

const { getTagCommanders } = require('./lib/edhrec-api.cjs')

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

    // Deliberately no Scryfall image enrichment here (unlike suggest-commanders.cjs) — the
    // frontend only ever needs the name/deck-count list itself, often merged across several
    // themes at once, and the enrichment step was both slow (one more network round-trip per
    // commander) and an extra failure mode with no real upside for this specific view.
    const commanders = await getTagCommanders(theme)

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
