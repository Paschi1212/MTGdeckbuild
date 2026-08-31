/**
 * EDHREC API Wrapper
 * Fetches commander data from json.edhrec.com with caching
 */

const EDHREC_BASE = 'https://json.edhrec.com/api'
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

// Simple in-memory cache (in production: use Google Drive or persistent storage)
const cache = new Map()

/**
 * Normalize commander name to EDHREC slug format
 * Example: "Magus Lucea Kane" -> "magus-lucea-kane"
 */
function commanderToSlug(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/[^a-z0-9-]/g, '') // Remove special characters
}

/**
 * Get commander data from EDHREC
 */
async function getCommanderData(commanderName) {
  const slug = commanderToSlug(commanderName)

  // Check cache
  if (cache.has(slug)) {
    const cached = cache.get(slug)
    if (Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[EDHREC] Cache hit for ${commanderName}`)
      return cached.data
    }
  }

  console.log(`[EDHREC] Fetching data for ${commanderName}`)

  try {
    const response = await fetch(`${EDHREC_BASE}/commanders/${slug}`)

    if (!response.ok) {
      throw new Error(`EDHREC API error: ${response.status}`)
    }

    const data = await response.json()

    // Cache the result
    cache.set(slug, {
      data,
      timestamp: Date.now()
    })

    return data
  } catch (error) {
    console.error(`[EDHREC] Error fetching ${commanderName}:`, error)
    throw error
  }
}

/**
 * Get card synergy data from EDHREC
 */
async function getCardSynergies(cardName) {
  const slug = cardName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  try {
    const response = await fetch(`${EDHREC_BASE}/cards/${slug}`)

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error(`[EDHREC] Error fetching card ${cardName}:`, error)
    return null
  }
}

/**
 * Get top commanders by salt index
 */
async function getTopCommandersByMeta(limit = 10) {
  try {
    const response = await fetch(`${EDHREC_BASE}/commanders`)

    if (!response.ok) {
      throw new Error(`EDHREC API error: ${response.status}`)
    }

    const data = await response.json()

    return data
      .sort((a, b) => b.deckCount - a.deckCount) // Sort by deck count
      .slice(0, limit)
  } catch (error) {
    console.error('[EDHREC] Error fetching top commanders:', error)
    throw error
  }
}

/**
 * Extract card recommendations from commander data
 */
function extractRecommendations(commanderData) {
  if (!commanderData) {
    return {
      creatures: [],
      instants: [],
      sorceries: [],
      artifacts: [],
      enchantments: [],
      lands: [],
      allCards: []
    }
  }

  return {
    creatures: extractCards(commanderData.creatures),
    instants: extractCards(commanderData.instants),
    sorceries: extractCards(commanderData.sorceries),
    artifacts: extractCards(commanderData.artifacts),
    enchantments: extractCards(commanderData.enchantments),
    lands: extractCards(commanderData.lands),
    planeswalkers: extractCards(commanderData.planeswalkers),
    allCards: [
      ...extractCards(commanderData.creatures),
      ...extractCards(commanderData.instants),
      ...extractCards(commanderData.sorceries),
      ...extractCards(commanderData.artifacts),
      ...extractCards(commanderData.enchantments),
      ...extractCards(commanderData.lands),
      ...extractCards(commanderData.planeswalkers)
    ]
  }
}

/**
 * Helper to extract card array from EDHREC data
 */
function extractCards(category) {
  if (!category || !Array.isArray(category)) {
    return []
  }

  return category
    .map(card => ({
      name: card.name || card.cardName,
      count: card.deckCount || card.count,
      synergy: card.synergy || 0,
      salt: card.salt || 0
    }))
    .filter(card => card.name)
}

/**
 * Get synergy matches between commanders
 */
function extractSynergyCommanders(commanderData) {
  if (!commanderData || !commanderData.synergies) {
    return []
  }

  return commanderData.synergies
    .slice(0, 10)
    .map(cmd => ({
      name: cmd.name,
      matches: cmd.matches,
      synergy: cmd.synergy
    }))
}

module.exports = {
  getCommanderData,
  getCardSynergies,
  getTopCommandersByMeta,
  extractRecommendations,
  extractSynergyCommanders,
  commanderToSlug
}
