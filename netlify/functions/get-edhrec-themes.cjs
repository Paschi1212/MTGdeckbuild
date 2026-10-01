/**
 * GET /.netlify/functions/get-edhrec-themes
 * Returns EDHREC's full site-wide theme/tag list (Tokens, Aristocrats, Voltron, ...), each
 * with how many real decks carry it — independent of any specific commander. Rarely
 * changes, so cached aggressively both server-side (edhrec-api.cjs, 7 days) and here.
 */

const { getAllThemes } = require('./lib/edhrec-api.cjs')

exports.handler = async () => {
  try {
    const themes = await getAllThemes()

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      },
      body: JSON.stringify({ themes })
    }
  } catch (error) {
    console.error('[API] Error fetching EDHREC themes:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch EDHREC themes',
        message: error.message
      })
    }
  }
}
