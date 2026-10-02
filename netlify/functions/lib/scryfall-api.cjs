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

// Scryfall rate-limits hard: an HTTP 429 comes with a 60 s lockout ("try again after 60
// seconds … failure to act will result in a network block"). Measured live: the batch
// endpoint /cards/collection already refused 7 of 27 requests at ~4/s, well below the
// documented 10/s — so every Scryfall call goes through one paced queue, and after a 429
// this function instance stops calling Scryfall until the lockout is over instead of
// retrying into it (which is exactly what the old quick 300/600 ms retries did).
const MIN_GAP_MS = { collection: 550, other: 120 }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
let nextSlotAt = 0
let blockedUntil = 0

function rateLimitedResponse() {
  return new Response(JSON.stringify({ object: 'error', code: 'rate_limited', details: 'Scryfall-Sperre aktiv' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  })
}

function isScryfallBlocked() {
  return Date.now() < blockedUntil
}

async function fetchWithRetry(url, options = {}) {
  if (isScryfallBlocked()) return rateLimitedResponse()

  const kind = String(url).includes('/cards/collection') ? 'collection' : 'other'
  const now = Date.now()
  const wait = Math.max(0, nextSlotAt - now)
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_GAP_MS[kind]
  if (wait) await sleep(wait)

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, options)
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 60
      blockedUntil = Date.now() + retryAfter * 1000
      console.warn(`[Scryfall] rate-limited — pausing all Scryfall calls for ${retryAfter}s`)
      return response
    }
    // One retry for a genuine server hiccup; everything else is the caller's answer.
    if (response.status < 500 || attempt === 1) return response
    await sleep(800)
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
    colorIdentity: (data.color_identity ?? []).join(' '),
    oracleText: data.oracle_text ?? data.card_faces?.[0]?.oracle_text ?? '',
    manaCost: data.mana_cost ?? data.card_faces?.[0]?.mana_cost ?? ''
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

    const response = await fetchWithRetry(url, { headers: SCRYFALL_HEADERS })

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
const MAX_FUZZY_FALLBACKS = 15 // single lookups per call for names the batch couldn't match

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

  // Names the batch endpoint answered but couldn't match get one fuzzy lookup each — capped,
  // since each is its own paced request. A batch that FAILED (rate limit, outage) is left
  // missing instead: re-asking 75 single names right into a lockout is what gets an IP blocked.
  const fuzzyCandidates = []

  for (let i = 0; i < namesToFetch.length; i += SCRYFALL_COLLECTION_LIMIT) {
    if (isScryfallBlocked()) break
    const batch = namesToFetch.slice(i, i + SCRYFALL_COLLECTION_LIMIT)

    try {
      const response = await fetchWithRetry(`${SCRYFALL_BASE}/cards/collection`, {
        method: 'POST',
        headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(name => ({ name })) })
      })

      if (response.ok) {
        const data = await response.json()
        // Double-faced cards are listed as "Front // Back" — match the front-face name too.
        const byLowerName = new Map()
        for (const card of data.data) {
          byLowerName.set(card.name.toLowerCase(), card)
          for (const face of card.card_faces || []) {
            if (!byLowerName.has(face.name.toLowerCase())) byLowerName.set(face.name.toLowerCase(), card)
          }
        }

        for (const name of batch) {
          const card = byLowerName.get(name.toLowerCase())
          if (!card) {
            fuzzyCandidates.push(name)
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
            oracleText: card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? '',
            // The printed cost, not just CMC — CMC counts X as 0, so an {X}{X}{U}{U} card shows
            // up as "CMC 2" and the model concluded it "has no X in its mana cost".
            manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? ''
          }
          result[name] = entry
          cache.set(`name:${name.toLowerCase()}`, { data: entry, timestamp: Date.now() })
        }
      }
    } catch (error) {
      console.error('[Scryfall] Error fetching batch by name:', error)
    }
  }

  for (const name of fuzzyCandidates.slice(0, MAX_FUZZY_FALLBACKS)) {
    if (isScryfallBlocked()) break
    const price = await getCardPrice(name)
    if (price) {
      result[name] = price
      cache.set(`name:${name.toLowerCase()}`, { data: price, timestamp: Date.now() })
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
    if (isScryfallBlocked()) break
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
            cmc: card.cmc ?? 0,
            // Shown as mana pips in the deck editor; a DFC/split card lists each face's cost.
            manaCost: card.mana_cost ?? (card.card_faces || []).map(f => f.mana_cost).filter(Boolean).join(' // ')
          }
          result[card.id] = entry
          cache.set(`id:${card.id}`, { data: entry, timestamp: Date.now() })
        }
      }
    } catch (error) {
      console.error('[Scryfall] Error fetching batch by id:', error)
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

/**
 * Card names for an arbitrary Scryfall search, first result page (up to 175), most-played
 * first (EDHREC order). Returns [] on zero matches (Scryfall 404s those) or any error.
 */
async function searchCardNames(query) {
  const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`
  try {
    const response = await fetchWithRetry(url, { headers: SCRYFALL_HEADERS })
    if (!response.ok) return []
    const data = await response.json()
    return (data.data || []).map(card => card.name)
  } catch (error) {
    console.error('[Scryfall] Error searching card names:', error)
    return []
  }
}

module.exports = {
  SCRYFALL_BASE,
  SCRYFALL_HEADERS,
  fetchWithRetry,
  isScryfallBlocked,
  getCardData,
  getCardPrice,
  searchAlternativeCards,
  getBulkPrices,
  getCardsByIds,
  getBudgetAlternatives,
  searchCommanders,
  searchCardNames
}
