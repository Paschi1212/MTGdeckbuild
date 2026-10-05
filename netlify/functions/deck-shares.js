/**
 * Friends' decks for the game table.
 *
 *   GET → every deck of the players who have sat at a table with me, except the ones their
 *         owner locked — as they are right now (lib/deck-lenders.js keeps them current).
 *
 * Decks are free by default; locking happens in the owner's synced data (mtg_deck_locks).
 * Only deck lists leave an account — never the rest of the collection, prices or analyses.
 */

import { connectLambda, getStore } from '@netlify/blobs'
import { parseSessionCookie } from './lib/session.js'
import { playerIdFor } from './lib/player-id.js'
import { LENDERS_STORE, saveLenderEntry } from './lib/deck-lenders.js'

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload)
})

export const handler = async (event) => {
  connectLambda(event)

  const session = parseSessionCookie(event.headers.cookie)
  if (!session?.email) return json(401, { error: 'Not authenticated' })
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' })
  const me = { email: session.email.toLowerCase(), playerId: playerIdFor(session.email), name: session.name || '' }

  try {
    const lenders = getStore(LENDERS_STORE)
    // Players who haven't synced since decks became shareable have no entry yet: build it
    // from their stored data on their first visit to a table, so friends see their decks.
    if (!(await lenders.getMetadata(me.playerId))) {
      const mine = await getStore('user-data').get(me.email, { type: 'json' })
      if (mine) await saveLenderEntry(me.email, me.name, mine)
    }

    const { blobs } = await lenders.list()
    const entries = await Promise.all(blobs
      .filter(blob => blob.key !== me.playerId)
      .map(blob => lenders.get(blob.key, { type: 'json' }).catch(() => null)))

    const decks = []
    for (const entry of entries) {
      if (!entry?.known?.includes(me.playerId)) continue
      for (const deck of entry.decks || []) {
        decks.push({
          ownerId: entry.ownerId,
          ownerName: entry.ownerName,
          deckId: deck.id,
          source: deck.source,
          label: deck.label,
          commander: deck.commander,
          cards: deck.cards
        })
      }
    }
    return json(200, { decks })
  } catch (error) {
    console.error('[API] deck-shares:', error)
    return json(500, { error: 'Decks der Mitspieler nicht verfügbar', message: error.message })
  }
}
