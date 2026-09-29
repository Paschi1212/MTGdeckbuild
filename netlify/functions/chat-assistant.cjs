/**
 * POST /.netlify/functions/chat-assistant
 * Conversational deck-building help, aware of the currently open deck.
 */

const { chatAssistant } = require('./lib/gemini-api.cjs')

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      }
    }

    const { commander, cards, message, history, enableActions, contextNote, collectionSampleNames, bulkBuild } = JSON.parse(event.body || '{}')

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
      bulkBuild
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
