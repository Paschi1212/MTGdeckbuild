/**
 * GET/POST /.netlify/functions/sync-data
 * Cross-device sync for everything this app used to only keep in browser localStorage
 * (collection, decks, drafts, preferences...) — keyed by the authenticated user's email via
 * Netlify Blobs, so logging in on a different device actually sees the same data instead of
 * a blank slate. GET returns the user's stored snapshot (or {} if none yet); POST replaces it
 * with whatever the client currently has locally.
 */

import { getStore } from '@netlify/blobs'
import { parseSessionCookie } from './lib/session.js'

// Only these keys are ever written to or read from the store — an arbitrary client payload
// can never persist a key outside this allowlist.
const SYNCED_KEYS = [
  'mtg_collection',
  'mtg_secondary_collections',
  'mtg_draft_decks',
  'mtg_deck_preferences',
  'mtg_deck_audits',
  'mtg_commander_overrides'
]

export const handler = async (event) => {
  const session = parseSessionCookie(event.headers.cookie)
  if (!session?.email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) }
  }

  const store = getStore('user-data')
  const key = session.email.toLowerCase()

  try {
    if (event.httpMethod === 'GET') {
      const data = (await store.get(key, { type: 'json' })) || {}
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(data)
      }
    }

    if (event.httpMethod === 'POST') {
      let body
      try {
        body = JSON.parse(event.body || '{}')
      } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
      }

      const toStore = {}
      for (const k of SYNCED_KEYS) {
        if (k in body) toStore[k] = body[k]
      }
      await store.setJSON(key, toStore)

      return { statusCode: 200, body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  } catch (error) {
    console.error('[API] Error syncing data:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to sync data', message: error.message })
    }
  }
}
