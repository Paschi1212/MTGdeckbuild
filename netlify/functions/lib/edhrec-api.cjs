/**
 * EDHREC API Wrapper
 * Fetches commander data from json.edhrec.com with caching
 */

// EDHREC's old /api/commanders/<slug> path no longer exists (confirmed via curl — it 404s
// through a CloudFront/S3 403, nothing to do with headers/bot-blocking as first assumed).
// Their current static JSON export lives at /pages/commanders/<slug>.json instead, with a
// materially different shape (flat counts at the top level; the real card lists live under
// container.json_dict.cardlists[], grouped by "tag" e.g. topcards/highsynergycards/creatures).
const EDHREC_BASE = 'https://json.edhrec.com/pages'
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

const EDHREC_HEADERS = {
  'User-Agent': 'MTGCommanderDeckBuilder/1.0 (+https://github.com/Paschi1212/MTGdeckbuild)',
  'Accept': 'application/json'
}

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
    const response = await fetch(`${EDHREC_BASE}/commanders/${slug}.json`, { headers: EDHREC_HEADERS })

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

// getCardSynergies/getTopCommandersByMeta below are not called anywhere in this app
// currently (verified via grep) and their URL paths are unverified against EDHREC's
// current /pages/*.json structure — fix these properly before wiring them up to anything.

/**
 * Get card synergy data from EDHREC
 */
async function getCardSynergies(cardName) {
  const slug = cardName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  try {
    const response = await fetch(`${EDHREC_BASE}/cards/${slug}`, { headers: EDHREC_HEADERS })

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
    const response = await fetch(`${EDHREC_BASE}/commanders`, { headers: EDHREC_HEADERS })

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
 * Pulls one category's cards out of container.json_dict.cardlists (the real card data —
 * the flat top-level fields like `creature`/`instant` are just counts, not lists) by its
 * tag (e.g. "topcards", "highsynergycards", "creatures").
 */
function getCardlistCards(commanderData, tag) {
  const list = commanderData?.container?.json_dict?.cardlists?.find(cl => cl.tag === tag)
  return (list?.cardviews || [])
    .map(card => ({
      name: card.name,
      synergy: card.synergy || 0,
      count: card.num_decks || 0
    }))
    .filter(card => card.name)
}

/**
 * Extract card recommendations from commander data. "High Synergy Cards" (cards played
 * disproportionately often with THIS commander specifically, vs the general meta) is the
 * closest signal EDHREC's public data has to "combo pieces" — there's no dedicated combo
 * list here, that would need a different data source (e.g. Commander Spellbook).
 */
function extractRecommendations(commanderData) {
  if (!commanderData) {
    return {
      creatures: [], instants: [], sorceries: [], artifacts: [], enchantments: [],
      lands: [], planeswalkers: [], topCards: [], highSynergyCards: [], gameChangers: [],
      allCards: []
    }
  }

  const creatures = getCardlistCards(commanderData, 'creatures')
  const instants = getCardlistCards(commanderData, 'instants')
  const sorceries = getCardlistCards(commanderData, 'sorceries')
  const artifacts = [...getCardlistCards(commanderData, 'manaartifacts'), ...getCardlistCards(commanderData, 'utilityartifacts')]
  const enchantments = getCardlistCards(commanderData, 'enchantments')
  const planeswalkers = getCardlistCards(commanderData, 'planeswalkers')
  const lands = [...getCardlistCards(commanderData, 'lands'), ...getCardlistCards(commanderData, 'utilitylands')]
  const topCards = getCardlistCards(commanderData, 'topcards')
  // EDHREC renamed this list from "highsynergycards" to "highliftcards" (same cards, now with
  // an extra `lift` score) — reading only the old tag left this signal silently empty. Read
  // both so a rename back (or an older cached page) still works.
  const highSynergyCards = [
    ...getCardlistCards(commanderData, 'highliftcards'),
    ...getCardlistCards(commanderData, 'highsynergycards')
  ]
  const gameChangers = getCardlistCards(commanderData, 'gamechangers')

  // Dedup by name across categories, most-relevant-signal-first (game changers and high
  // synergy cards are far more useful to surface than a generic creature list).
  const seen = new Set()
  const allCards = []
  for (const card of [...gameChangers, ...highSynergyCards, ...topCards, ...creatures, ...instants, ...sorceries, ...artifacts, ...enchantments, ...planeswalkers]) {
    if (seen.has(card.name)) continue
    seen.add(card.name)
    allCards.push(card)
  }

  return { creatures, instants, sorceries, artifacts, enchantments, lands, planeswalkers, topCards, highSynergyCards, gameChangers, allCards }
}

/**
 * "similar" is EDHREC's synergy-commander list on the new endpoint — a flat array of
 * names, no per-entry score.
 */
function extractSynergyCommanders(commanderData) {
  if (!commanderData?.similar?.length) return []
  return commanderData.similar.slice(0, 10).map(name => ({ name }))
}

/**
 * Real, community-derived archetype tags for THIS specific commander (e.g. for Korvold:
 * Treasure, Sacrifice, Aristocrats, Tokens, Combo, Lands Matter, Voltron...), each with how
 * many real decks on EDHREC carry that tag. Lives at panels.taglinks on the commander JSON —
 * a genuinely different, much richer signal than a fixed generic playstyle dropdown, and
 * specific to the commander actually chosen rather than a one-size-fits-all list.
 */
function extractThemes(commanderData, limit = 12) {
  const taglinks = commanderData?.panels?.taglinks
  if (!Array.isArray(taglinks)) return []
  return [...taglinks]
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, limit)
    .map(t => ({ name: t.value, slug: t.slug, count: t.count || 0 }))
}

/**
 * The full site-wide theme/archetype list (Tokens, Aristocrats, Voltron, Group Hug, ...),
 * independent of any commander — EDHREC's own general tag taxonomy, not the per-commander
 * taglinks extractThemes() reads. Lets the user browse/pick a THEME first ("I want to build
 * an Aristocrats deck") and get real commanders for it from actual deck data, instead of
 * only searching by a commander name they already know or an AI-guessed suggestion.
 * Verified live via curl against json.edhrec.com/pages/tags/themes.json.
 */
async function getAllThemes() {
  const cacheKey = '__all_themes__'
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('[EDHREC] Cache hit for all themes')
    return cached.data
  }

  console.log('[EDHREC] Fetching all themes')
  const response = await fetch(`${EDHREC_BASE}/tags/themes.json`, { headers: EDHREC_HEADERS })
  if (!response.ok) {
    throw new Error(`EDHREC API error: ${response.status}`)
  }

  const data = await response.json()
  const list = data?.container?.json_dict?.cardlists?.[0]?.cardviews || []
  const themes = list
    .map(t => ({ name: t.name, slug: (t.url || '').replace(/^\/tags\//, ''), numDecks: t.num_decks || 0 }))
    .filter(t => t.name && t.slug)

  cache.set(cacheKey, { data: themes, timestamp: Date.now() })
  return themes
}

/**
 * Real commanders for a given theme/tag slug (from getAllThemes(), or any of EDHREC's tag
 * slugs), ranked by how many real decks on EDHREC carry both that commander and that tag —
 * the "Top Commanders" cardlist on the tag's own page, not a per-commander detail.
 */
async function getTagCommanders(tagSlug) {
  const cacheKey = `tag:${tagSlug}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[EDHREC] Cache hit for tag ${tagSlug}`)
    return cached.data
  }

  console.log(`[EDHREC] Fetching commanders for tag ${tagSlug}`)
  const response = await fetch(`${EDHREC_BASE}/tags/${tagSlug}.json`, { headers: EDHREC_HEADERS })
  if (!response.ok) {
    throw new Error(`EDHREC API error: ${response.status}`)
  }

  const data = await response.json()
  const cardlists = data?.container?.json_dict?.cardlists || []
  const topCommanders = cardlists.find(cl => cl.tag === 'topcommanders')?.cardviews || []
  const newCommanders = cardlists.find(cl => cl.tag === 'newcommanders')?.cardviews || []

  // "Top" first (real popularity signal), then any "New" ones not already listed — a
  // genuinely new/rare commander for this theme is still worth surfacing, just after the
  // proven ones rather than instead of them.
  const seen = new Set()
  const commanders = []
  for (const c of [...topCommanders, ...newCommanders]) {
    if (!c.name || seen.has(c.name)) continue
    seen.add(c.name)
    commanders.push({ name: c.name, slug: c.slug || c.sanitized, numDecks: c.num_decks || 0 })
  }

  cache.set(cacheKey, { data: commanders, timestamp: Date.now() })
  return commanders
}

module.exports = {
  getCommanderData,
  getCardSynergies,
  getTopCommandersByMeta,
  extractRecommendations,
  extractSynergyCommanders,
  extractThemes,
  getAllThemes,
  getTagCommanders,
  commanderToSlug
}
