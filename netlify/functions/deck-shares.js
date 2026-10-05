/**
 * Lending decks for the game table.
 *
 *   GET                 → decks other players shared with me, resolved live from their data
 *   GET ?mine=1         → my own shares (to manage them)
 *   POST {deckName, players: [{playerId, name}]}  → share one of my ManaBox decks with these players
 *                         (an empty list ends the share)
 *
 * Only the deck list leaves the owner's account — never the rest of the collection, prices
 * or analyses. A borrower always gets the deck as it is right now: the share only names the
 * deck, the cards are read from the owner's synced data at the moment of borrowing.
 */

import { connectLambda, getStore } from '@netlify/blobs'
import { parseSessionCookie } from './lib/session.js'
import { playerIdFor } from './lib/player-id.js'

const INDEX_KEY = 'index'
const MAX_PLAYERS_PER_SHARE = 30

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload)
})

const text = (value, max) => String(value ?? '').trim().slice(0, max)

// The deck as it is in the owner's collection right now (null if it no longer exists).
function resolveDeck(ownerData, deckName) {
  const cards = (ownerData?.mtg_collection?.cards || [])
    .filter(card => card.binderType === 'deck' && card.binderName === deckName)
    .map(card => ({ name: card.name, count: card.quantity || 1, scryfallId: card.scryfallId || '' }))
  if (!cards.length) return null
  const commander = ownerData?.mtg_commander_overrides?.[deckName] || ''
  return { commander, cards }
}

export const handler = async (event) => {
  connectLambda(event)

  const session = parseSessionCookie(event.headers.cookie)
  if (!session?.email) return json(401, { error: 'Not authenticated' })
  const me = { email: session.email.toLowerCase(), playerId: playerIdFor(session.email), name: session.name || '' }

  try {
    const shares = getStore('deck-shares')
    const userData = getStore('user-data')
    const index = (await shares.get(INDEX_KEY, { type: 'json' })) || { entries: [] }

    if (event.httpMethod === 'GET') {
      if (event.queryStringParameters?.mine === '1') {
        const mine = index.entries
          .filter(entry => entry.ownerId === me.playerId)
          .map(({ ownerEmail, ...entry }) => entry)
        return json(200, { shares: mine })
      }

      const forMe = index.entries.filter(entry => entry.ownerId !== me.playerId && entry.players.some(p => p.playerId === me.playerId))
      const owners = new Map()
      const decks = []
      for (const entry of forMe) {
        if (!owners.has(entry.ownerEmail)) owners.set(entry.ownerEmail, await userData.get(entry.ownerEmail, { type: 'json' }))
        const deck = resolveDeck(owners.get(entry.ownerEmail), entry.deckName)
        if (!deck) continue
        decks.push({ shareId: entry.shareId, ownerId: entry.ownerId, ownerName: entry.ownerName, deckName: entry.deckName, ...deck })
      }
      return json(200, { decks })
    }

    if (event.httpMethod === 'POST') {
      let body
      try { body = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid JSON body' }) }
      const deckName = text(body.deckName, 200)
      if (!deckName) return json(400, { error: 'deckName fehlt' })
      const players = (Array.isArray(body.players) ? body.players : [])
        .filter(p => p && /^[0-9a-f]{20}$/.test(String(p.playerId)) && p.playerId !== me.playerId)
        .slice(0, MAX_PLAYERS_PER_SHARE)
        .map(p => ({ playerId: p.playerId, name: text(p.name, 60) }))

      const shareId = `${me.playerId}:${deckName}`
      const others = index.entries.filter(entry => entry.shareId !== shareId)
      const entries = players.length
        ? [...others, { shareId, ownerId: me.playerId, ownerEmail: me.email, ownerName: text(me.name, 60), deckName, players, updatedAt: new Date().toISOString() }]
        : others
      await shares.setJSON(INDEX_KEY, { entries })
      return json(200, { ok: true, shared: players.length })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (error) {
    console.error('[API] deck-shares:', error)
    return json(500, { error: 'Deck-Freigaben nicht verfügbar', message: error.message })
  }
}
