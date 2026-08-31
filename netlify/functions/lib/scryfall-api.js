/**
 * Scryfall API Wrapper
 * Fetches card prices and metadata
 */

const SCRYFALL_BASE = 'https://api.scryfall.com'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

const cache = new Map()

/**
 * Get card data including price
 */
async function getCardData(cardName) {
  // Check cache
  if (cache.has(cardName)) {
    const cached = cache.get(cardName)
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data
    }
  }

  try {
    const response = await fetch(
      `${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(cardName)}`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    // Cache the result
    cache.set(cardName, {
      data,
      timestamp: Date.now()
    })

    return data
  } catch (error) {
    console.error(`[Scryfall] Error fetching ${cardName}:`, error)
    return null
  }
}

/**
 * Get card price in EUR
 */
async function getCardPrice(cardName) {
  const data = await getCardData(cardName)

  if (!data) {
    return null
  }

  return {
    name: data.name,
    usd: parseFloat(data.prices?.usd || 0),
    eur: parseFloat(data.prices?.eur || 0),
    tix: parseFloat(data.prices?.tix || 0),
    image: data.image_uris?.normal
  }
}

/**
 * Search for alternative cards
 */
async function searchAlternativeCards(query, type = null) {
  try {
    let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}`

    if (type) {
      url += `%20type:${type}`
    }

    url += '&unique=cards&order=edhrec'

    const response = await fetch(url)

    if (!response.ok) {
      return []
    }

    const data = await response.json()

    return data.data
      .slice(0, 5)
      .map(card => ({
        name: card.name,
        type: card.type_line,
        eur: parseFloat(card.prices?.eur || 0),
        usd: parseFloat(card.prices?.usd || 0),
        image: card.image_uris?.normal
      }))
  } catch (error) {
    console.error('[Scryfall] Error searching:', error)
    return []
  }
}

/**
 * Get bulk prices for multiple cards (more efficient)
 */
async function getBulkPrices(cardNames) {
  const prices = {}

  // Fetch sequentially with small delay to avoid rate limiting
  for (const name of cardNames) {
    const price = await getCardPrice(name)
    if (price) {
      prices[name] = price
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return prices
}

/**
 * Get suggested budget alternatives for a card
 */
async function getBudgetAlternatives(cardName, maxPrice = 10) {
  try {
    const original = await getCardData(cardName)

    if (!original) {
      return []
    }

    // Extract type for search
    const types = original.type_line
      .split('—')[0]
      .trim()
      .split(' ')
      .filter(t => t !== 'Legendary')

    // Search for similar cards
    const alternatives = await searchAlternativeCards(
      types.join(' '),
      types[0]
    )

    return alternatives.filter(
      card =>
        card.name !== cardName &&
        card.eur <= maxPrice &&
        card.eur > 0
    )
  } catch (error) {
    console.error('[Scryfall] Error finding alternatives:', error)
    return []
  }
}

module.exports = {
  getCardData,
  getCardPrice,
  searchAlternativeCards,
  getBulkPrices,
  getBudgetAlternatives
}
