/**
 * GET /.netlify/functions/get-card-price?card=Lightning%20Bolt
 * Returns card price from Scryfall
 */

const { getCardPrice, getBulkPrices } = require('./lib/scryfall-api')

exports.handler = async (event) => {
  try {
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

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600'
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
