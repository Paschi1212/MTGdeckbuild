/**
 * Card data for drafts (Scryfall), cached in Netlify Blobs — a set's cards don't change, and a
 * draft of 8 must not send 8 × dozens of requests to Scryfall.
 *
 *   GET ?sets=1        → sets that can be drafted: [{ code, name, released, type, icon }]
 *   GET ?set=<code>    → the set's booster cards, compact: [{ id, n, r, img, t, ci, mc, cmc, leg, basic }]
 *   GET ?legends=1     → popular legendary creatures of all Magic (the commander draft's
 *                        fallback for sets with few legends), same shape
 */

import { connectLambda, getStore } from '@netlify/blobs'
import scryfall from './lib/scryfall-api.cjs'

const { SCRYFALL_BASE, SCRYFALL_HEADERS, fetchWithRetry } = scryfall
const DRAFTABLE = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'funny'])
const POOL_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SETS_TTL_MS = 24 * 60 * 60 * 1000

const json = (statusCode, payload, cache = 'no-store') => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  body: JSON.stringify(payload)
})

const compact = (card) => {
  const face = card.card_faces?.[0]
  const typeLine = card.type_line || ''
  return {
    id: card.id,
    n: card.name,
    r: card.rarity === 'mythic' ? 'm' : card.rarity === 'rare' ? 'r' : card.rarity === 'uncommon' ? 'u' : 'c',
    img: card.image_uris?.normal || face?.image_uris?.normal || null,
    t: typeLine,
    ci: (card.color_identity || []).join(''),
    mc: card.mana_cost ?? (card.card_faces || []).map(f => f.mana_cost).filter(Boolean).join(' // '),
    cmc: card.cmc ?? 0,
    leg: /Legendary/.test(typeLine) && /Creature/.test(typeLine),
    basic: /^Basic Land/.test(typeLine)
  }
}

// All pages of one Scryfall search (175 cards each). Stops early on an error / rate limit.
async function searchAll(query, { maxPages = 6, order = 'set' } = {}) {
  let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=${order}`
  const cards = []
  for (let page = 0; url && page < maxPages; page++) {
    const response = await fetchWithRetry(url, { headers: SCRYFALL_HEADERS })
    if (response.status === 404) break // no cards match
    if (!response.ok) throw new Error(`Scryfall ${response.status}`)
    const data = await response.json()
    cards.push(...data.data)
    url = data.has_more ? data.next_page : null
  }
  return cards
}

async function cached(store, key, ttl, load) {
  const hit = await store.get(key, { type: 'json' }).catch(() => null)
  if (hit && Date.now() - hit.at < ttl) return hit.data
  const data = await load()
  await store.setJSON(key, { at: Date.now(), data }).catch(() => {})
  return data
}

export const handler = async (event) => {
  connectLambda(event)
  const params = event.queryStringParameters || {}
  const store = getStore('draft-data')
  try {
    if (params.sets) {
      const sets = await cached(store, 'sets', SETS_TTL_MS, async () => {
        const response = await fetchWithRetry(`${SCRYFALL_BASE}/sets`, { headers: SCRYFALL_HEADERS })
        if (!response.ok) throw new Error(`Scryfall ${response.status}`)
        const data = await response.json()
        return data.data
          .filter(set => DRAFTABLE.has(set.set_type) && !set.digital && set.card_count >= 60 && set.released_at && set.released_at <= new Date().toISOString().slice(0, 10))
          .map(set => ({ code: set.code, name: set.name, released: set.released_at, type: set.set_type, icon: set.icon_svg_uri }))
      })
      return json(200, { sets }, 'public, max-age=3600')
    }

    if (params.set) {
      const code = String(params.set).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
      if (!code) return json(400, { error: 'Set fehlt' })
      const cards = await cached(store, `pool:${code}`, POOL_TTL_MS, async () => {
        // Cards that appear in its boosters; very old sets have no booster flag → all cards.
        let found = await searchAll(`e:${code} is:booster -is:digital`)
        if (!found.length) found = await searchAll(`e:${code} -is:digital`)
        return found.map(compact)
      })
      if (!cards.length) return json(404, { error: `Keine Karten für Set ${code} gefunden` })
      return json(200, { set: code, cards }, 'public, max-age=3600')
    }

    if (params.legends) {
      const cards = await cached(store, 'legends', POOL_TTL_MS, async () => {
        const found = await searchAll('t:legendary t:creature is:commander game:paper -is:digital', { maxPages: 3, order: 'edhrec' })
        return found.map(compact)
      })
      return json(200, { cards }, 'public, max-age=3600')
    }

    return json(400, { error: 'sets, set oder legends angeben' })
  } catch (error) {
    console.error('[API] draft-data:', error)
    return json(502, { error: 'Kartendaten von Scryfall nicht verfügbar', message: error.message })
  }
}
