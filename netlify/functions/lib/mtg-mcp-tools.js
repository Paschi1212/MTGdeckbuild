/**
 * Tools behind the MTG MCP connector (netlify/functions/mcp.js). Everything here is PUBLIC
 * data — Scryfall (exact card text, legality, prices) and EDHREC (what real decks play) — so
 * the connector needs no login and never touches anyone's collection or decks.
 *
 * The point of these tools is grounding: a model answering MTG questions from memory gets
 * card text, colors and synergies wrong (the audit bugs this app went through), so every
 * fact a deck decision rests on should come out of one of these calls instead.
 * Results are compact JSON on purpose — they land in a model's context window.
 */

import scryfall from './scryfall-api.cjs'
import edhrec from './edhrec-api.cjs'
import { parseDeckListText } from '../../../src/lib/deckListImport.js'

const { SCRYFALL_BASE, SCRYFALL_HEADERS, fetchWithRetry, isScryfallBlocked } = scryfall

const EDHREC_BASE = 'https://json.edhrec.com/pages'
const EDHREC_HEADERS = SCRYFALL_HEADERS
const CACHE_MS = 24 * 60 * 60 * 1000
const SCRYFALL_COLLECTION_LIMIT = 75

const cardCache = new Map() // lowercase requested name -> compact card
const edhrecCache = new Map() // page path -> raw EDHREC JSON

// ---------------------------------------------------------------------------
// Small helpers

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null)
const lower = (s) => String(s || '').trim().toLowerCase()
const frontFace = (name) => String(name || '').split(' // ')[0]

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// EDHREC slugs: "Isshin, Two Heavens as One" -> "isshin-two-heavens-as-one",
// "Lim-Dûl the Necromancer" -> "lim-dul-the-necromancer". Partner pairs ("A + B") are
// joined alphabetically, the way EDHREC names its partner pages.
function toSlug(name) {
  const single = (n) => frontFace(n)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const parts = String(name).split(/\s+\+\s+/).map(single).filter(Boolean)
  return parts.length > 1 ? parts.sort().join('-') : parts[0] || ''
}

const TYPE_PRIORITY = ['Creature', 'Planeswalker', 'Battle', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']

// "Artifact Creature" counts as a creature, an MDFC "Sorcery // Land" as a sorcery — the
// front face decides, the same way deck-building sites group cards.
function primaryType(typeLine) {
  const front = frontFace(typeLine)
  return TYPE_PRIORITY.find(t => front.includes(t)) || 'Other'
}

// Scryfall lists color identity alphabetically ("GRU"); players read it in WUBRG order.
const wubrg = (letters) => 'WUBRG'.split('').filter(l => letters.includes(l)).join('')

function identitySubset(cardIdentity, allowed) {
  if (cardIdentity === 'C') return true
  return [...cardIdentity].every(letter => allowed.has(letter))
}

// ---------------------------------------------------------------------------
// Scryfall

function cardText(card) {
  const faces = card.card_faces || []
  if (card.oracle_text == null && faces.length) {
    return faces
      .map(f => `[${f.name}] ${f.mana_cost ? f.mana_cost + ' ' : ''}${f.type_line || ''}: ${f.oracle_text || ''}`)
      .join('\n')
  }
  return card.oracle_text || ''
}

function compactCard(card) {
  const faces = card.card_faces || []
  const ci = card.color_identity || []
  const eur = card.prices?.eur ?? card.prices?.eur_foil
  const usd = card.prices?.usd ?? card.prices?.usd_foil
  const result = {
    name: card.name,
    manaCost: card.mana_cost ?? faces.map(f => f.mana_cost).filter(Boolean).join(' // '),
    cmc: card.cmc ?? 0,
    typeLine: card.type_line || faces.map(f => f.type_line).join(' // '),
    oracleText: cardText(card),
    colorIdentity: ci.length ? wubrg(ci) : 'C',
    commanderLegality: card.legalities?.commander || 'unknown',
    gameChanger: card.game_changer === true,
    edhrecRank: card.edhrec_rank ?? null,
    priceEur: eur != null ? parseFloat(eur) : null,
    priceUsd: usd != null ? parseFloat(usd) : null,
    image: card.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null,
    scryfallUrl: card.scryfall_uri
  }
  const power = card.power ?? faces[0]?.power
  const toughness = card.toughness ?? faces[0]?.toughness
  if (power != null) result.powerToughness = `${power}/${toughness}`
  const loyalty = card.loyalty ?? faces[0]?.loyalty
  if (loyalty != null) result.loyalty = loyalty
  return result
}

async function scryfallFuzzy(name) {
  const response = await fetchWithRetry(
    `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`,
    { headers: SCRYFALL_HEADERS }
  )
  return response.ok ? response.json() : null
}

/**
 * Exact card data for many names at once: Scryfall's batch endpoint first (75 per request),
 * then a fuzzy lookup for whatever it could not match (typos, a DFC's front-face name).
 * Returns a Map keyed by the REQUESTED name (lowercased) plus the names nothing matched.
 */
async function fetchCards(names) {
  const requested = new Map()
  for (const raw of names) {
    const name = String(raw || '').trim()
    if (name) requested.set(name.toLowerCase(), name)
  }

  const found = new Map()
  const toFetch = []
  for (const [key, name] of requested) {
    const hit = cardCache.get(key)
    if (hit && Date.now() - hit.t < CACHE_MS) found.set(key, hit.card)
    else toFetch.push(name)
  }

  // Unmatched names get a (capped) fuzzy lookup; names from a batch that FAILED (rate limit)
  // are reported as not found rather than re-asked one by one into a Scryfall lockout.
  const misses = []
  const failed = []
  for (let i = 0; i < toFetch.length; i += SCRYFALL_COLLECTION_LIMIT) {
    const batch = toFetch.slice(i, i + SCRYFALL_COLLECTION_LIMIT)
    if (isScryfallBlocked()) {
      failed.push(...batch)
      continue
    }
    const response = await fetchWithRetry(`${SCRYFALL_BASE}/cards/collection`, {
      method: 'POST',
      headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map(name => ({ name })) })
    })
    if (!response.ok) {
      failed.push(...batch)
      continue
    }
    const data = await response.json()
    const byName = new Map()
    for (const card of data.data || []) {
      byName.set(card.name.toLowerCase(), card)
      for (const face of card.card_faces || []) byName.set(face.name.toLowerCase(), card)
    }
    for (const name of batch) {
      const card = byName.get(name.toLowerCase())
      if (!card) {
        misses.push(name)
        continue
      }
      const compact = compactCard(card)
      found.set(name.toLowerCase(), compact)
      cardCache.set(name.toLowerCase(), { t: Date.now(), card: compact })
    }
  }

  const notFound = [...failed]
  for (const [i, name] of misses.entries()) {
    if (i >= 15 || isScryfallBlocked()) {
      notFound.push(name)
      continue
    }
    const card = await scryfallFuzzy(name)
    if (!card) {
      notFound.push(name)
      continue
    }
    const compact = compactCard(card)
    found.set(name.toLowerCase(), compact)
    cardCache.set(name.toLowerCase(), { t: Date.now(), card: compact })
  }

  return { found, notFound }
}

// ---------------------------------------------------------------------------
// EDHREC

async function fetchEdhrecPage(path, redirectsLeft = 1) {
  const hit = edhrecCache.get(path)
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.data

  const response = await fetch(`${EDHREC_BASE}/${path}.json`, { headers: EDHREC_HEADERS })
  // EDHREC's static export answers a missing page with 403 (S3) or 404.
  if (response.status === 403 || response.status === 404) return null
  if (!response.ok) throw new Error(`EDHREC antwortet mit HTTP ${response.status}`)

  const data = await response.json()
  if (data?.redirect && redirectsLeft > 0) {
    return fetchEdhrecPage(String(data.redirect).replace(/^\/+/, ''), redirectsLeft - 1)
  }
  edhrecCache.set(path, { t: Date.now(), data })
  return data
}

// A name typed loosely ("magus lucea") has no EDHREC page under its own slug — resolve the
// real card name through Scryfall's fuzzy search once and try again.
async function loadEdhrecByName(kind, name, suffix = '') {
  let slug = toSlug(name)
  let data = slug ? await fetchEdhrecPage(`${kind}/${slug}${suffix}`) : null
  if (!data && !String(name).includes(' + ')) {
    const card = await scryfallFuzzy(name)
    const resolved = card ? toSlug(card.name) : null
    if (resolved && resolved !== slug) {
      slug = resolved
      data = await fetchEdhrecPage(`${kind}/${slug}${suffix}`)
    }
  }
  return { slug, data }
}

const LIST_LABELS = {
  highliftcards: 'highSynergy',
  highsynergycards: 'highSynergy',
  topcards: 'topCards',
  gamechangers: 'gameChangers',
  newcards: 'newCards',
  creatures: 'creatures',
  instants: 'instants',
  sorceries: 'sorceries',
  manaartifacts: 'manaArtifacts',
  utilityartifacts: 'utilityArtifacts',
  enchantments: 'enchantments',
  planeswalkers: 'planeswalkers',
  battles: 'battles',
  utilitylands: 'utilityLands',
  lands: 'lands'
}

function edhrecCardEntry(cv) {
  return {
    name: cv.name,
    inclusion: pct(cv.num_decks, cv.potential_decks),
    synergy: cv.synergy != null ? Math.round(cv.synergy * 100) : null,
    decks: cv.num_decks ?? null
  }
}

function edhrecCardlists(data) {
  return data?.container?.json_dict?.cardlists || []
}

function resolveThemeSlug(theme, taglinks = []) {
  const wanted = lower(theme)
  const match = taglinks.find(t => lower(t.value) === wanted || lower(t.slug) === wanted)
  return match ? match.slug : toSlug(theme)
}

// ---------------------------------------------------------------------------
// Tool implementations

async function cardLookup({ names }) {
  const list = (Array.isArray(names) ? names : String(names || '').split(/\r?\n|;/))
    .map(n => String(n).trim())
    .filter(Boolean)
    .slice(0, 150)
  if (!list.length) throw new Error('Keine Kartennamen angegeben.')

  const { found, notFound } = await fetchCards(list)
  const cards = []
  const seen = new Set()
  for (const name of list) {
    const card = found.get(name.toLowerCase())
    if (card && !seen.has(card.name)) {
      seen.add(card.name)
      cards.push(card)
    }
  }
  return { cards, notFound }
}

async function scryfallSearch({ query, order = 'edhrec', limit = 25, commanderLegal = true }) {
  let q = String(query || '').trim()
  if (!q) throw new Error('Leere Suchanfrage.')
  if (commanderLegal !== false && !/\b(legal|f|format|banned|restricted):/i.test(q)) q += ' legal:commander'

  const allowedOrders = ['edhrec', 'name', 'cmc', 'usd', 'eur', 'released', 'rarity', 'power', 'toughness']
  const sortOrder = allowedOrders.includes(order) ? order : 'edhrec'
  const max = clampInt(limit, 25, 1, 100)

  const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(q)}&order=${sortOrder}&unique=cards`
  const response = await fetchWithRetry(url, { headers: SCRYFALL_HEADERS })
  if (response.status === 404) return { query: q, totalCards: 0, cards: [] }
  if (!response.ok) {
    const details = await response.json().catch(() => null)
    throw new Error(`Scryfall lehnt die Suche ab: ${details?.details || `HTTP ${response.status}`}`)
  }

  const data = await response.json()
  const cards = (data.data || []).slice(0, max).map(card => {
    const c = compactCard(card)
    return {
      name: c.name,
      manaCost: c.manaCost,
      typeLine: c.typeLine,
      oracleText: c.oracleText.length > 600 ? c.oracleText.slice(0, 600) + ' …' : c.oracleText,
      colorIdentity: c.colorIdentity,
      gameChanger: c.gameChanger,
      edhrecRank: c.edhrecRank,
      priceEur: c.priceEur,
      priceUsd: c.priceUsd
    }
  })
  return { query: q, totalCards: data.total_cards ?? cards.length, returned: cards.length, cards }
}

async function edhrecCommander({ commander, theme, budget, perCategory = 15, categories }) {
  const name = String(commander || '').trim()
  if (!name) throw new Error('Kein Commander angegeben.')

  const base = await loadEdhrecByName('commanders', name)
  if (!base.data) {
    throw new Error(`Keine EDHREC-Seite für "${name}" gefunden. Ist die Karte als Commander spielbar? Partner-Paare als "A + B" angeben.`)
  }

  const taglinks = base.data.panels?.taglinks || []
  const themeSlug = theme ? resolveThemeSlug(theme, taglinks) : null
  const budgetSlug = ['budget', 'expensive'].includes(lower(budget)) ? lower(budget) : null

  let data = base.data
  let variantPath = ''
  if (themeSlug || budgetSlug) {
    variantPath = `${themeSlug ? '/' + themeSlug : ''}${budgetSlug ? '/' + budgetSlug : ''}`
    data = await fetchEdhrecPage(`commanders/${base.slug}${variantPath}`)
    if (!data) {
      throw new Error(`EDHREC hat für "${name}" keine Seite für Thema/Budget "${variantPath.slice(1)}". Verfügbare Themen: ${taglinks.slice(0, 15).map(t => t.slug).join(', ')}`)
    }
  }

  const wanted = Array.isArray(categories) && categories.length ? new Set(categories) : null
  const per = clampInt(perCategory, 15, 1, 50)
  const cardLists = {}
  for (const list of edhrecCardlists(data)) {
    const label = LIST_LABELS[list.tag]
    if (!label || (wanted && !wanted.has(label))) continue
    const entries = (list.cardviews || []).filter(cv => cv.name).map(edhrecCardEntry)
    cardLists[label] = [...(cardLists[label] || []), ...entries].slice(0, per)
  }

  const card = data.container?.json_dict?.card || {}
  return {
    commander: card.name || name,
    edhrecUrl: `https://edhrec.com/commanders/${base.slug}${variantPath}`,
    theme: themeSlug,
    budget: budgetSlug,
    decks: card.num_decks ?? null,
    rank: card.rank ?? null,
    colorIdentity: wubrg(card.color_identity || []) || 'C',
    averageDeck: {
      creature: data.creature, instant: data.instant, sorcery: data.sorcery, artifact: data.artifact,
      enchantment: data.enchantment, planeswalker: data.planeswalker, battle: data.battle,
      land: data.land, basic: data.basic, nonbasic: data.nonbasic
    },
    manaCurve: data.panels?.mana_curve || null,
    themes: [...taglinks]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 20)
      .map(t => ({ name: t.value, slug: t.slug, decks: t.count || 0 })),
    similarCommanders: data.similar || [],
    brackets: data.bracket_counts || null,
    combos: (data.panels?.combocounts || [])
      .map(c => c.value)
      .filter(v => v && !/see more/i.test(v))
      .slice(0, 10),
    cardLists,
    notes: 'inclusion = % der Decks dieses Commanders, die die Karte spielen; synergy = wie viel häufiger als in anderen Decks derselben Farben (Prozentpunkte).'
  }
}

async function edhrecCard({ card, limit = 15 }) {
  const name = String(card || '').trim()
  if (!name) throw new Error('Kein Kartenname angegeben.')

  const { slug, data } = await loadEdhrecByName('cards', name)
  if (!data) throw new Error(`Keine EDHREC-Seite für die Karte "${name}" gefunden.`)

  const max = clampInt(limit, 15, 1, 50)
  const lists = edhrecCardlists(data)
  const byTag = (tag) => lists.find(l => l.tag === tag)?.cardviews || []
  const commanderEntry = (cv) => ({ name: cv.name, decks: cv.num_decks ?? null, inclusion: pct(cv.num_decks, cv.potential_decks) })
  const info = data.container?.json_dict?.card || {}

  return {
    card: info.name || name,
    edhrecUrl: `https://edhrec.com/cards/${slug}`,
    decks: info.num_decks ?? null,
    inclusionOfEligibleDecks: pct(info.num_decks, info.potential_decks),
    salt: info.salt != null ? Math.round(info.salt * 100) / 100 : null,
    topCommanders: byTag('topcommanders').slice(0, max).map(commanderEntry),
    newCommanders: byTag('newcommanders').slice(0, 5).map(commanderEntry),
    oftenPlayedWith: [...byTag('highliftcards'), ...byTag('highsynergycards'), ...byTag('topcards')]
      .filter(cv => cv.name)
      .slice(0, max)
      .map(cv => cv.name)
  }
}

async function edhrecThemes({ search }) {
  const themes = await edhrec.getAllThemes()
  const q = lower(search)
  const filtered = q ? themes.filter(t => lower(t.name).includes(q) || t.slug.includes(q)) : themes
  return {
    total: filtered.length,
    themes: [...filtered]
      .sort((a, b) => b.numDecks - a.numDecks)
      .slice(0, q ? 100 : 200)
      .map(t => ({ name: t.name, slug: t.slug, decks: t.numDecks }))
  }
}

// EDHREC's per-color pages (tags/<theme>/<color>) — verified live for every name below.
const COLOR_PAGES = {
  W: 'mono-white', U: 'mono-blue', B: 'mono-black', R: 'mono-red', G: 'mono-green', C: 'colorless',
  WU: 'azorius', UB: 'dimir', BR: 'rakdos', RG: 'gruul', WG: 'selesnya',
  WB: 'orzhov', UR: 'izzet', BG: 'golgari', WR: 'boros', UG: 'simic',
  WUB: 'esper', UBR: 'grixis', BRG: 'jund', WRG: 'naya', WUG: 'bant',
  WBG: 'abzan', WUR: 'jeskai', UBG: 'sultai', WBR: 'mardu', URG: 'temur',
  WUBR: 'yore-tiller', UBRG: 'glint-eye', WBRG: 'dune-brood', WURG: 'ink-treader', WUBG: 'witch-maw',
  WUBRG: 'five-color'
}

function colorPageFor(colors) {
  const letters = String(colors || '').toUpperCase().replace(/[^WUBRGC]/g, '')
  if (!letters) return null
  if (letters.replace(/C/g, '') === '') return { key: 'C', page: COLOR_PAGES.C }
  const key = 'WUBRG'.split('').filter(l => letters.includes(l)).join('')
  return { key, page: COLOR_PAGES[key] }
}

async function edhrecThemeCommanders({ theme, colors, limit = 40 }) {
  const raw = String(theme || '').trim()
  if (!raw) throw new Error('Kein Thema angegeben.')

  const allThemes = await edhrec.getAllThemes().catch(() => [])
  const match = allThemes.find(t => lower(t.name) === lower(raw) || t.slug === lower(raw))
  const slug = match ? match.slug : toSlug(raw)

  // With colors, EDHREC's own page for exactly that color identity — its top commanders are
  // ranked among decks of those colors, far more than filtering the overall top list yields.
  const color = colorPageFor(colors)
  const pagePath = color ? `${slug}/${color.page}` : slug

  let commanders
  try {
    commanders = await edhrec.getTagCommanders(pagePath)
  } catch {
    throw new Error(`EDHREC hat keine Seite für Thema "${raw}"${color ? ` in ${color.page}` : ''} (Slug "${pagePath}"). Mit edhrec_themes nach dem richtigen Namen suchen.`)
  }

  const max = clampInt(limit, 40, 1, 100)
  const result = commanders.map(c => ({ name: c.name, decks: c.numDecks }))
  return {
    theme: match?.name || raw,
    slug,
    colors: color ? `${color.key} (${color.page}, exakte Farbidentität)` : 'alle',
    edhrecUrl: `https://edhrec.com/tags/${pagePath}`,
    total: result.length,
    commanders: result.slice(0, max)
  }
}

// Conservative text patterns for the classic deck-building roles. They are an ESTIMATE to
// point at — the output says so, and the card texts (includeCardText) let the caller verify.
const ROLE_PATTERNS = {
  ramp: /\badd \{|\badds? (one|two|three) mana|search your library for (a|an|up to \w+|two) (basic )?(land|forest|island|swamp|mountain|plains)|put (a|up to \w+|two) (basic )?land cards? [^.]*onto the battlefield|create (a|two|three|x) treasure/i,
  cardDraw: /\bdraws? (a|one|two|three|four|five|x|that many|cards)\b|draw cards equal/i,
  interaction: /\b(destroy|exile) target\b|deals? (\d+|x) damage to (any target|target creature|target planeswalker)|return target (nonland )?permanent to its owner's hand|counter target|target (creature|player) sacrifices/i,
  boardWipe: /\b(destroy|exile) all\b|each (creature|other creature) gets -|deals? (\d+|x) damage to each creature|return all (nonland )?(permanents|creatures)/i,
  tutor: /search your library (and\/or graveyard )?for (?!(a|an|up to \w+|two) (basic )?(land|forest|island|swamp|mountain|plains))/i
}

async function deckCheck({ decklist, commander, includeCardText = false }) {
  const parsed = parseDeckListText(String(decklist || ''))
  const commanderInput = String(commander || parsed.commander || '').trim()
  if (!commanderInput) {
    throw new Error('Kein Commander gefunden — "commander" angeben oder in der Liste markieren (*CMDR* oder Abschnitt "Commander").')
  }
  if (!parsed.cards.length) throw new Error('Die Deckliste enthält keine Karten.')

  const commanderNames = commanderInput.split(/\s+\+\s+/).map(s => s.trim()).filter(Boolean)
  const commanderKeys = new Set(commanderNames.map(lower))
  // Many exports list the commander a second time inside the 99 — count it once.
  const entries = parsed.cards.filter(c => !commanderKeys.has(lower(c.name)))

  const { found, notFound } = await fetchCards([...commanderNames, ...entries.map(c => c.name)])
  const commanderCards = commanderNames.map(n => found.get(lower(n)))
  if (commanderCards.some(c => !c)) {
    throw new Error(`Commander "${commanderInput}" nicht auf Scryfall gefunden.`)
  }

  const identity = new Set(commanderCards.flatMap(c => (c.colorIdentity === 'C' ? [] : [...c.colorIdentity])))
  const rows = entries
    .map(e => ({ count: e.count, card: found.get(lower(e.name)) }))
    .filter(r => r.card)

  const totalCards = entries.reduce((sum, e) => sum + e.count, 0) + commanderNames.length

  const typeCounts = {}
  const curve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, '7+': 0 }
  let spellCount = 0
  let spellCmcSum = 0
  let mdfcLandCount = 0
  let totalEur = 0
  let totalUsd = 0
  const unpriced = []
  const roles = Object.fromEntries(Object.keys(ROLE_PATTERNS).map(k => [k, []]))

  for (const { count, card } of rows) {
    const type = primaryType(card.typeLine)
    typeCounts[type] = (typeCounts[type] || 0) + count
    if (type !== 'Land') {
      const bucket = Math.min(Math.floor(card.cmc), 7)
      curve[bucket === 7 ? '7+' : bucket] += count
      spellCount += count
      spellCmcSum += card.cmc * count
      if (/Land/.test(card.typeLine.split(' // ')[1] || '')) mdfcLandCount += count
      for (const [role, re] of Object.entries(ROLE_PATTERNS)) {
        if (re.test(card.oracleText)) roles[role].push(card.name)
      }
    }
    if (card.priceEur != null) totalEur += card.priceEur * count
    if (card.priceUsd != null) totalUsd += card.priceUsd * count
    if (card.priceEur == null && card.priceUsd == null && !card.typeLine.includes('Basic')) unpriced.push(card.name)
  }

  const isBasic = (card) => card.typeLine.includes('Basic')
  const allowsMultiples = (card) => /any number of cards named|a deck can have up to/i.test(card.oracleText)

  const problems = {
    colorIdentityViolations: rows
      .filter(r => !identitySubset(r.card.colorIdentity, identity))
      .map(r => `${r.card.name} (${r.card.colorIdentity})`),
    notCommanderLegal: [...commanderCards.map(c => ({ count: 1, card: c })), ...rows]
      .filter(r => r.card.commanderLegality !== 'legal')
      .map(r => `${r.card.name}: ${r.card.commanderLegality}`),
    singletonViolations: rows
      .filter(r => r.count > 1 && !isBasic(r.card) && !allowsMultiples(r.card))
      .map(r => `${r.count}x ${r.card.name}`),
    unknownCards: notFound
  }

  const result = {
    commander: commanderCards.map(c => c.name).join(' + '),
    colorIdentity: wubrg([...identity]) || 'C',
    totalCards,
    expectedCards: 100,
    problems,
    typeCounts,
    landCount: typeCounts.Land || 0,
    mdfcLandCount,
    manaCurveNonland: curve,
    averageCmcNonland: spellCount ? Math.round((spellCmcSum / spellCount) * 100) / 100 : 0,
    gameChangers: [...commanderCards, ...rows.map(r => r.card)].filter(c => c.gameChanger).map(c => c.name),
    estimatedRoles: {
      note: 'Schätzung per Textmuster — vor Entscheidungen am Kartentext prüfen.',
      ...Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { count: v.length, cards: v }]))
    },
    price: {
      totalEur: Math.round(totalEur * 100) / 100,
      totalUsd: Math.round(totalUsd * 100) / 100,
      unpriced
    }
  }

  // EDHREC comparison: which picks real decks of this commander share, which they don't,
  // and what they play that this list doesn't.
  const { slug, data } = await loadEdhrecByName('commanders', commanderInput).catch(() => ({ data: null }))
  if (data) {
    const stats = new Map()
    const highSynergy = []
    for (const list of edhrecCardlists(data)) {
      for (const cv of list.cardviews || []) {
        if (!cv.name) continue
        const entry = { ...edhrecCardEntry(cv), list: LIST_LABELS[list.tag] || list.tag }
        for (const key of [lower(cv.name), lower(frontFace(cv.name))]) {
          if (!stats.has(key)) stats.set(key, entry)
        }
        if (list.tag === 'highliftcards' || list.tag === 'highsynergycards') highSynergy.push(entry)
      }
    }

    const inDeck = new Set()
    for (const card of [...commanderCards, ...rows.map(r => r.card)]) {
      inDeck.add(lower(card.name))
      inDeck.add(lower(frontFace(card.name)))
    }

    const deckStats = rows
      .filter(r => !isBasic(r.card))
      .map(r => ({ name: r.card.name, stat: stats.get(lower(r.card.name)) || stats.get(lower(frontFace(r.card.name))) }))

    const seenMissing = new Set()
    const missingPopular = []
    for (const entry of [...stats.values()].sort((a, b) => (b.inclusion || 0) - (a.inclusion || 0))) {
      if (inDeck.has(lower(entry.name)) || seenMissing.has(entry.name) || (entry.inclusion || 0) < 30) continue
      seenMissing.add(entry.name)
      missingPopular.push(entry)
      if (missingPopular.length >= 25) break
    }

    result.edhrec = {
      edhrecUrl: `https://edhrec.com/commanders/${slug}`,
      decks: data.container?.json_dict?.card?.num_decks ?? null,
      averageDeck: {
        creature: data.creature, instant: data.instant, sorcery: data.sorcery, artifact: data.artifact,
        enchantment: data.enchantment, planeswalker: data.planeswalker, land: data.land
      },
      deckCardsOnEdhrecLists: deckStats.filter(d => d.stat).length,
      deckCardsNotOnEdhrecLists: deckStats.filter(d => !d.stat).map(d => d.name),
      lowInclusionPicks: deckStats
        .filter(d => d.stat && (d.stat.inclusion ?? 100) < 5)
        .map(d => `${d.name} (${d.stat.inclusion}%)`),
      missingPopular,
      missingHighSynergy: highSynergy
        .filter(e => !inDeck.has(lower(e.name)))
        .sort((a, b) => (b.synergy || 0) - (a.synergy || 0))
        .slice(0, 15),
      note: 'EDHREC zeigt pro Kategorie nur die Top-Karten — "nicht gelistet" heißt seltener gespielt, nicht schlecht. Eigene Synergien des Decks zählen mehr als Beliebtheit.'
    }
  } else {
    result.edhrec = null
  }

  if (includeCardText) {
    result.cards = rows.map(({ count, card }) => ({
      count,
      name: card.name,
      manaCost: card.manaCost,
      typeLine: card.typeLine,
      oracleText: card.oracleText,
      ...(card.powerToughness ? { powerToughness: card.powerToughness } : {})
    }))
    result.commanderText = commanderCards.map(c => ({ name: c.name, manaCost: c.manaCost, typeLine: c.typeLine, oracleText: c.oracleText }))
  }

  return result
}

// ---------------------------------------------------------------------------
// Tool registry (MCP tools/list shape + the function that runs each one)

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: true }

export const TOOLS = [
  {
    name: 'card_lookup',
    title: 'Karten nachschlagen (Scryfall)',
    description: 'Exact Scryfall data for up to 150 Magic cards by name: mana cost, type line, full oracle text (all faces), color identity, Commander legality, Game Changer flag, EDHREC rank, EUR/USD price, image URL. Fuzzy-matches loose spellings. Use this before making ANY claim about what a card does.',
    inputSchema: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, description: 'Card names, e.g. ["Pridemalkin", "Formidable Speaker"].' }
      },
      required: ['names']
    },
    annotations: READ_ONLY,
    run: cardLookup
  },
  {
    name: 'scryfall_search',
    title: 'Scryfall-Suche',
    description: 'Search all Magic cards with full Scryfall syntax (e.g. "id<=gur mana:{X} -t:land", "o:\\"untap target creature\\" id<=gu", "is:commander t:dragon"). Results sorted by EDHREC popularity by default and limited to Commander-legal cards unless commanderLegal=false. Returns name, cost, type, oracle text, color identity, price.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Scryfall search query.' },
        order: { type: 'string', enum: ['edhrec', 'name', 'cmc', 'usd', 'eur', 'released', 'rarity', 'power', 'toughness'], description: 'Sort order (default edhrec = most played first).' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default 25).' },
        commanderLegal: { type: 'boolean', description: 'Append legal:commander (default true).' }
      },
      required: ['query']
    },
    annotations: READ_ONLY,
    run: scryfallSearch
  },
  {
    name: 'edhrec_commander',
    title: 'EDHREC: Commander-Daten',
    description: 'What real EDHREC decks of a commander play: card lists per category (high synergy, top cards, game changers, creatures, instants, sorceries, artifacts, enchantments, lands, ...) each with inclusion % and synergy %, the average deck composition, mana curve, the commander\'s themes (with slugs), similar commanders and known combos. Optional theme (e.g. "x-spells") and budget ("budget" | "expensive") variants. Partner pairs as "A + B".',
    inputSchema: {
      type: 'object',
      properties: {
        commander: { type: 'string', description: 'Commander name (loose spelling is fine).' },
        theme: { type: 'string', description: 'Optional theme name or slug from this commander\'s themes list.' },
        budget: { type: 'string', enum: ['budget', 'expensive'], description: 'Optional price variant.' },
        perCategory: { type: 'integer', minimum: 1, maximum: 50, description: 'Cards per list (default 15).' },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['highSynergy', 'topCards', 'gameChangers', 'newCards', 'creatures', 'instants', 'sorceries', 'manaArtifacts', 'utilityArtifacts', 'enchantments', 'planeswalkers', 'battles', 'utilityLands', 'lands'] },
          description: 'Only these lists (default: all).'
        }
      },
      required: ['commander']
    },
    annotations: READ_ONLY,
    run: edhrecCommander
  },
  {
    name: 'edhrec_card',
    title: 'EDHREC: Karten-Daten',
    description: 'How a single card is played on EDHREC: number of decks, % of eligible decks, salt score, the commanders that play it most (with inclusion %), and cards often played alongside it.',
    inputSchema: {
      type: 'object',
      properties: {
        card: { type: 'string', description: 'Card name.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Entries per list (default 15).' }
      },
      required: ['card']
    },
    annotations: READ_ONLY,
    run: edhrecCard
  },
  {
    name: 'edhrec_themes',
    title: 'EDHREC: Themen',
    description: 'EDHREC\'s site-wide deck themes/archetypes (Tokens, Aristocrats, X Spells, +1/+1 Counters, ...) with slug and deck count. Optional search filter.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional filter, e.g. "counter".' }
      }
    },
    annotations: READ_ONLY,
    run: edhrecThemes
  },
  {
    name: 'edhrec_theme_commanders',
    title: 'EDHREC: Commander zu einem Thema',
    description: 'The commanders real EDHREC decks use for a theme, most decks first. Optional colors (letters WUBRG or C, e.g. "GUR") switch to EDHREC\'s page for exactly that color identity — call it once per color combination to cover subsets (e.g. "GU", "G", "UR").',
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: 'Theme name or slug (see edhrec_themes).' },
        colors: { type: 'string', description: 'Optional exact color identity as letters WUBRG (or C for colorless), e.g. "UR".' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max commanders (default 40).' }
      },
      required: ['theme']
    },
    annotations: READ_ONLY,
    run: edhrecThemeCommanders
  },
  {
    name: 'deck_check',
    title: 'Deck-Check (Regeln + EDHREC-Vergleich)',
    description: 'Deterministic check of a full Commander decklist (plain text, one card per line like "1 Sol Ring"; Moxfield/Archidekt exports work): card count, color identity violations, banned/illegal cards, singleton violations, unknown names, type counts, land count, nonland mana curve, Game Changers, total price, estimated ramp/draw/interaction (removal + counterspells)/wipe/tutor counts, and a comparison with the commander\'s EDHREC data (popular and high-synergy cards missing, deck picks rarely or never seen on EDHREC). Set includeCardText=true to also get every card\'s exact text for a full audit.',
    inputSchema: {
      type: 'object',
      properties: {
        decklist: { type: 'string', description: 'The decklist as plain text.' },
        commander: { type: 'string', description: 'Commander name; needed if the list does not mark it. Partner pairs as "A + B".' },
        includeCardText: { type: 'boolean', description: 'Include each card\'s oracle text (default false).' }
      },
      required: ['decklist']
    },
    annotations: READ_ONLY,
    run: deckCheck
  }
]
