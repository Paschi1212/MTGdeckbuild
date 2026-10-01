/**
 * Scryfall API Wrapper
 * Fetches card prices and metadata
 */

const SCRYFALL_BASE = 'https://api.scryfall.com'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// Scryfall rejects requests with a generic/default User-Agent (HTTP 400 "generic_user_agent")
const SCRYFALL_HEADERS = {
  'User-Agent': 'MTGCommanderDeckBuilder/1.0 (+https://github.com/Paschi1212/MTGdeckbuild)',
  'Accept': 'application/json'
}

const cache = new Map()

// A transient Scryfall hiccup (429 rate-limit, a 5xx blip) used to just permanently drop
// those names from the batch with no retry — they'd fall through to the per-card fuzzy
// fallback, which could ALSO fail under the same transient condition, leaving a card with no
// image/price/type for the rest of that request even though nothing was actually wrong with
// the card or its name. One short retry (mirrors generateContentWithRetry's pattern for
// Gemini) costs almost nothing when Scryfall is healthy and recovers the common case where
// it briefly isn't.
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options)
    if (response.ok || attempt === retries) return response
    if (response.status !== 429 && response.status < 500) return response // not transient — don't retry a real 4xx
    const delayMs = 300 * (attempt + 1)
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
}

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
    // "fuzzy" instead of "exact" — card names we look up this way often come from an LLM
    // (deck proposals, chat, suggestions) and are rarely byte-perfect (capitalization,
    // apostrophes, punctuation), which "exact" 404s on far more often than it should.
    const response = await fetchWithRetry(
      `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
      { headers: SCRYFALL_HEADERS }
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
    image: data.image_uris?.normal ?? data.card_faces?.[0]?.image_uris?.normal,
    typeLine: data.type_line,
    cmc: data.cmc ?? 0,
    colorIdentity: (data.color_identity ?? []).join(' ')
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

    const response = await fetch(url, { headers: SCRYFALL_HEADERS })

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
        image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal
      }))
  } catch (error) {
    console.error('[Scryfall] Error searching:', error)
    return []
  }
}

const SCRYFALL_COLLECTION_LIMIT = 75 // Scryfall's documented max identifiers per /cards/collection request

/**
 * Get bulk prices/images for multiple cards by name, using Scryfall's batch collection
 * endpoint (~75 cards per request, name-based identifiers do a case-insensitive exact
 * match) instead of one sequential fuzzy request per card. For a full ~99-card deck list
 * the old sequential approach took 20-40+ seconds — long enough to blow past the 30s
 * function timeout and leave every card without an image. Names the batch endpoint can't
 * match (typos, unusual DFC formatting) fall back to the slower single fuzzy lookup, so
 * correctness for edge cases isn't lost — just no longer paid for on every single card.
 */
async function getBulkPrices(cardNames) {
  const uniqueNames = [...new Set(cardNames.filter(Boolean))]
  const result = {}
  const namesToFetch = []

  for (const name of uniqueNames) {
    const cacheKey = `name:${name.toLowerCase()}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      result[name] = cached.data
    } else {
      namesToFetch.push(name)
    }
  }

  for (let i = 0; i < namesToFetch.length; i += SCRYFALL_COLLECTION_LIMIT) {
    const batch = namesToFetch.slice(i, i + SCRYFALL_COLLECTION_LIMIT)
    const notFoundInBatch = []

    try {
      const response = await fetchWithRetry(`${SCRYFALL_BASE}/cards/collection`, {
        method: 'POST',
        headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(name => ({ name })) })
      })

      if (response.ok) {
        const data = await response.json()
        const byLowerName = new Map(data.data.map(card => [card.name.toLowerCase(), card]))

        for (const name of batch) {
          const card = byLowerName.get(name.toLowerCase())
          if (!card) {
            notFoundInBatch.push(name)
            continue
          }

          const entry = {
            name: card.name,
            usd: parseFloat(card.prices?.usd || 0),
            eur: parseFloat(card.prices?.eur || 0),
            tix: parseFloat(card.prices?.tix || 0),
            image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
            typeLine: card.type_line,
            cmc: card.cmc ?? 0,
            // Not the same as `colors` (a card's own mana cost) — color_identity also covers
            // colors referenced in rules text (hybrid/Phyrexian symbols, color indicators) and
            // is the field Commander's "must match the commander's color identity" rule
            // actually uses. Needed to verify deck legality deterministically.
            colorIdentity: (card.color_identity ?? []).join(' '),
            oracleText: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? ''
          }
          result[name] = entry
          cache.set(`name:${name.toLowerCase()}`, { data: entry, timestamp: Date.now() })
        }
      } else {
        notFoundInBatch.push(...batch)
      }
    } catch (error) {
      console.error('[Scryfall] Error fetching batch by name:', error)
      notFoundInBatch.push(...batch)
    }

    // Fuzzy fallback only for the handful the exact-match batch missed, not the whole list.
    for (const name of notFoundInBatch) {
      const price = await getCardPrice(name)
      if (price) {
        result[name] = price
        cache.set(`name:${name.toLowerCase()}`, { data: price, timestamp: Date.now() })
      }
    }

    if (i + SCRYFALL_COLLECTION_LIMIT < namesToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  return result
}

/**
 * Get card data for many cards at once by Scryfall ID (exact printing, no name
 * ambiguity) using Scryfall's batch collection endpoint — far faster than
 * getBulkPrices for large collections since it's ~75 cards per request
 * instead of one request per card.
 */
async function getCardsByIds(scryfallIds) {
  const uniqueIds = [...new Set(scryfallIds.filter(Boolean))]
  const result = {}
  const idsToFetch = []

  for (const id of uniqueIds) {
    const cacheKey = `id:${id}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      result[id] = cached.data
    } else {
      idsToFetch.push(id)
    }
  }

  for (let i = 0; i < idsToFetch.length; i += SCRYFALL_COLLECTION_LIMIT) {
    const batch = idsToFetch.slice(i, i + SCRYFALL_COLLECTION_LIMIT)

    try {
      const response = await fetchWithRetry(`${SCRYFALL_BASE}/cards/collection`, {
        method: 'POST',
        headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(id => ({ id })) })
      })

      if (response.ok) {
        const data = await response.json()
        for (const card of data.data) {
          const entry = {
            name: card.name,
            image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
            eur: parseFloat(card.prices?.eur || 0),
            usd: parseFloat(card.prices?.usd || 0),
            colors: (card.colors ?? card.card_faces?.[0]?.colors ?? []).join(' '),
            typeLine: card.type_line,
            cmc: card.cmc ?? 0
          }
          result[card.id] = entry
          cache.set(`id:${card.id}`, { data: entry, timestamp: Date.now() })
        }
      }
    } catch (error) {
      console.error('[Scryfall] Error fetching batch by id:', error)
    }

    if (i + SCRYFALL_COLLECTION_LIMIT < idsToFetch.length) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  return result
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

/**
 * Live commander-name search across ALL of Magic, not just the user's own collection —
 * backs the "Direkte Suche" autocomplete on the commander-selection page. Scryfall's
 * `is:commander` filter correctly covers every way a card can legally be a commander
 * (legendary creatures, planeswalkers with "can be your commander" text, backgrounds, ...),
 * not just "legendary creature", and `order=edhrec` surfaces well-known commanders first.
 * Returns images too — a name-only list doesn't help tell apart several versions of the same
 * character (e.g. multiple commander-eligible Vraska planeswalkers).
 */
async function searchCommanders(query) {
  const q = `is:commander ${query}`
  const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`

  const response = await fetchWithRetry(url, { headers: SCRYFALL_HEADERS })
  if (!response.ok) return [] // Scryfall 404s a search with zero matches — not a real error

  const data = await response.json()
  return (data.data || []).slice(0, 24).map(card => ({
    name: card.name,
    image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal,
    colors: (card.color_identity ?? []).join(' ')
  }))
}

module.exports = {
  getCardData,
  getCardPrice,
  searchAlternativeCards,
  getBulkPrices,
  getCardsByIds,
  getBudgetAlternatives,
  searchCommanders
}
