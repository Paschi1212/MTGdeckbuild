/**
 * GET/POST /.netlify/functions/sync-data
 * Cross-device sync for everything this app used to only keep in browser localStorage
 * (collection, decks, drafts, preferences...) — keyed by the authenticated user's email via
 * Netlify Blobs, so logging in on a different device actually sees the same data instead of
 * a blank slate. GET returns the user's stored snapshot (or {} if none yet); POST replaces it
 * with whatever the client currently has locally.
 *
 * Two devices: every stored snapshot carries a revision number (blob metadata, returned as
 * __rev/__device/__updatedAt). A push names the revision it was based on (__baseRev); if
 * another device has saved since, it is refused with 409 instead of silently overwriting
 * that device's changes — the page then asks which version to keep (__force overrides).
 * GET ?meta=1 returns only the revision info (cheap "did anything change?" check).
 */

import { connectLambda, getStore } from '@netlify/blobs'
import { parseSessionCookie } from './lib/session.js'

// Only these keys are ever written to or read from the store — an arbitrary client payload
// can never persist a key outside this allowlist.
const SYNCED_KEYS = [
  'mtg_collection',
  'mtg_secondary_collections',
  'mtg_draft_decks',
  'mtg_deck_preferences',
  'mtg_deck_audits',
  'mtg_commander_overrides',
  'mtg_brain_outbox',
  'mtg_bridge_remote'
]

export const handler = async (event) => {
  // This handler uses the classic `exports.handler = async (event) => {}` (Lambda-
  // compatible) signature, not Netlify's newer V2 function format — Blobs' environment
  // context (siteID/token) is only auto-populated for V2 functions. In Lambda compatibility
  // mode it must be wired up manually via connectLambda(event), called before any getStore()
  // — skipping this is exactly what caused a live 502 (an uncaught error inside getStore()
  // itself, outside the try/catch below, instead of a clean JSON error response).
  connectLambda(event)

  const session = parseSessionCookie(event.headers.cookie)
  if (!session?.email) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not authenticated' }) }
  }

  try {
    const store = getStore('user-data')
    const key = session.email.toLowerCase()

    const revisionInfo = (metadata) => ({
      __rev: Number(metadata?.rev) || 0,
      __device: metadata?.device || null,
      __updatedAt: metadata?.updatedAt || null
    })
    const json = (statusCode, payload) => ({
      statusCode,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(payload)
    })

    if (event.httpMethod === 'GET') {
      if (event.queryStringParameters?.meta === '1') {
        const current = await store.getMetadata(key)
        return json(200, revisionInfo(current?.metadata))
      }
      const entry = await store.getWithMetadata(key, { type: 'json' })
      return json(200, { ...(entry?.data || {}), ...revisionInfo(entry?.metadata) })
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
      const current = await store.getMetadata(key)
      const currentRev = Number(current?.metadata?.rev) || 0
      // Pages loaded before revisions existed send no __baseRev — they still save as before.
      if (typeof body.__baseRev === 'number' && body.__baseRev < currentRev && body.__force !== true) {
        return json(409, { error: 'conflict', ...revisionInfo(current?.metadata) })
      }
      const metadata = {
        rev: currentRev + 1,
        device: String(body.__device || '').slice(0, 40),
        updatedAt: new Date().toISOString()
      }
      // Conditional write: if another push landed between the check above and now, refuse.
      const result = await store.setJSON(key, toStore, {
        metadata,
        ...(current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })
      })
      if (result?.modified === false) {
        const latest = await store.getMetadata(key)
        return json(409, { error: 'conflict', ...revisionInfo(latest?.metadata) })
      }

      return json(200, { ok: true, __rev: metadata.rev })
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
