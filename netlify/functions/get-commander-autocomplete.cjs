/**
 * GET /.netlify/functions/get-commander-autocomplete?q=<query>
 * Real commander-name search across ALL of Magic — backs the "Direkte Suche" input on the
 * commander-selection page, which previously only ever suggested names already in the
 * user's own collection.
 */

const { searchCommanders } = require('./lib/scryfall-api.cjs')

exports.handler = async (event) => {
  try {
    const { q } = event.queryStringParameters || {}

    if (!q || q.trim().length < 2) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [] })
      }
    }

    const names = await searchCommanders(q.trim())

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ names })
    }
  } catch (error) {
    console.error('[API] Error searching commanders:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to search commanders', message: error.message })
    }
  }
}
