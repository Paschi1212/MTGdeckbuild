/**
 * POST /.netlify/functions/suggest-commanders
 * Suggests commanders based on user preferences
 */

const { suggestCommanders } = require('./lib/gemini-api.cjs')

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const preferences = JSON.parse(event.body)

    if (!Array.isArray(preferences.colors) || (!preferences.colors.length && !String(preferences.idea || preferences.playStyle || '').trim())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    console.log('[API] Suggesting commanders for:', preferences)

    const suggestions = await suggestCommanders(preferences)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intro: suggestions.intro,
        suggestions: suggestions.suggestions,
        parseError: suggestions.parseError || false,
        usage: suggestions.usage
      })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to suggest commanders',
        message: error.message
      })
    }
  }
}
