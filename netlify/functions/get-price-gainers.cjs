/**
 * POST /.netlify/functions/get-price-gainers
 * Scans the user's collection for cards whose current Scryfall market price has risen
 * meaningfully above what was paid for them (ManaBox's "Purchase price" column).
 */

const { getBulkPrices } = require('./lib/scryfall-api.cjs')

const MIN_GAIN_EUR = 2
const MAX_RESULTS = 50

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
    }

    const { cards } = JSON.parse(event.body || '{}')
    if (!Array.isArray(cards) || cards.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'cards array required' }) }
    }

    console.log(`[API] Scanning ${cards.length} unique cards for price gainers`)

    const prices = await getBulkPrices(cards.map(c => c.name))

    const gainers = cards
      .map(c => {
        const current = prices[c.name]?.eur
        // No current price match, or no purchase price on file (ManaBox leaves it 0 when
        // unset) — nothing meaningful to compare, skip rather than report a fake €0 -> X gain.
        if (current == null || current <= 0 || !c.purchasePrice) return null
        const gain = current - c.purchasePrice
        if (gain <= MIN_GAIN_EUR) return null
        return {
          name: c.name,
          quantity: c.quantity || 1,
          purchasePrice: c.purchasePrice,
          currentPrice: current,
          gain: Math.round(gain * 100) / 100,
          image: prices[c.name]?.image
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, MAX_RESULTS)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gainers, scanned: cards.length })
    }
  } catch (error) {
    console.error('[API] Error scanning price gainers:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to scan price gainers', message: error.message })
    }
  }
}
