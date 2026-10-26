/**
 * POST /.netlify/functions/chat-assistant
 * Conversational deck-building help, aware of the currently open deck.
 */

const { chatAssistant } = require('./lib/gemini-api.cjs')

const POWER_LEVELS = ['Casual', 'Semi-Casual', 'Semi-Competitive', 'Competitive']
const names = (list, max) => (Array.isArray(list) ? list : [])
  .map(name => String(name || '').trim().slice(0, 150)).filter(Boolean).slice(0, max)

// The deck questionnaire, trimmed to what the build can use.
function cleanBuildSpec(spec) {
  if (!spec || typeof spec !== 'object') return null
  const budget = Number(spec.budget)
  return {
    idea: String(spec.idea || '').trim().slice(0, 3000),
    mustInclude: names(spec.mustInclude, 40),
    exclude: names(spec.exclude, 80),
    themes: (Array.isArray(spec.themes) ? spec.themes : [])
      .map(t => ({ slug: String(t?.slug || '').slice(0, 60), name: String(t?.name || '').slice(0, 60) }))
      .filter(t => t.slug && t.name)
      .slice(0, 2),
    powerLevel: POWER_LEVELS.includes(spec.powerLevel) ? spec.powerLevel : '',
    budget: Number.isFinite(budget) && budget > 0 ? Math.min(budget, 100000) : null
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, cards, message, history, enableActions, contextNote, collectionSampleNames, bulkBuild, buildSpec } = JSON.parse(event.body || '{}')

    if (!message || !message.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'message required' })
      }
    }

    console.log('[API] Chat assistant message for', commander || '(no commander)')

    const result = await chatAssistant({
      commander,
      cards,
      message: message.trim(),
      history,
      enableActions,
      contextNote,
      collectionSampleNames,
      bulkBuild,
      buildSpec: cleanBuildSpec(buildSpec)
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ reply: result.reply, actions: result.actions, usage: result.usage })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get chat reply',
        message: error.message
      })
    }
  }
}
