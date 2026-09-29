/**
 * GET /.netlify/functions/get-card-price?card=Lightning%20Bolt
 * Returns card price from Scryfall
 */

const { getCardPrice, getBulkPrices, getCardsByIds } = require('./lib/scryfall-api.cjs')

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST') {
      const { ids, names } = JSON.parse(event.body || '{}')

      if (Array.isArray(names) && names.length > 0) {
        // By-name bulk lookup as a POST body instead of a GET ?cards=a,b,c query string —
        // a comma-joined query string silently corrupts any card name that itself contains
        // a comma (e.g. "Chainer, Dementia Master" splits into two wrong fragments), and a
        // full ~99-card deck list can also just be long enough to risk URL-length limits.
        const prices = await getBulkPrices(names)

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          body: JSON.stringify(prices)
        }
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'ids or names array required in POST body' })
        }
      }

      const cardsById = await getCardsByIds(ids)

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          // The response depends entirely on the POST body (which ids were requested),
          // but HTTP/browser caches key on URL — never let this be cached, or a later
          // request with a different id list (e.g. a different deck) gets served this
          // response instead.
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify(cardsById)
      }
    }

    const { card, cards } = event.queryStringParameters || {}

    if (card) {
      // Single card
      const price = await getCardPrice(card)

      if (!price) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Card not found' })
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
        },
        body: JSON.stringify(price)
      }
    }

    if (cards) {
      // Bulk prices
      const cardList = cards.split(',').map(c => c.trim())
      const prices = await getBulkPrices(cardList)
      const hasResults = Object.keys(prices).length > 0

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          // Don't let the browser cache an empty/partial result for an hour if the
          // Scryfall lookup hiccuped (rate limit, transient network error)
          'Cache-Control': hasResults ? 'public, max-age=3600' : 'no-store'
        },
        body: JSON.stringify(prices)
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'card or cards parameter required' })
    }
  } catch (error) {
    console.error('[API] Error:', error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch card price',
        message: error.message
      })
    }
  }
}
