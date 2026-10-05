/**
 * Decks at the game table belong to everyone you have sat at a table with — unless you locked
 * them. This keeps the part of each player's synced data that friends may play: their decks
 * (minus the locked ones) and whom they have met at a table. One small entry per player
 * (store "deck-lenders", key = playerId), rebuilt on every sync — so a lobby reads a few
 * entries instead of everyone's whole collection, and a borrowed deck is always current.
 *
 * Never in an entry: the rest of the collection, prices, analyses. The owner's email is kept
 * to find the entry's account again but never sent to other players.
 */

import { getStore } from '@netlify/blobs'
import { playerIdFor } from './player-id.js'

export const LENDERS_STORE = 'deck-lenders'

const text = (value, max) => String(value ?? '').trim().slice(0, max)
const asCard = (card, count) => ({ name: text(card.name, 200), count: count || 1, scryfallId: card.scryfallId || '' })

export function buildLenderEntry(email, name, data) {
  const locks = new Set(Array.isArray(data?.mtg_deck_locks) ? data.mtg_deck_locks.map(String) : [])
  const commanders = data?.mtg_commander_overrides || {}

  const manabox = new Map()
  for (const card of data?.mtg_collection?.cards || []) {
    if (card?.binderType !== 'deck' || !card.binderName || !card.name) continue
    if (!manabox.has(card.binderName)) manabox.set(card.binderName, [])
    manabox.get(card.binderName).push(asCard(card, card.quantity))
  }

  const decks = []
  for (const [deckName, cards] of manabox) {
    const id = `manabox:${deckName}`
    if (locks.has(id)) continue
    decks.push({ id, source: 'manabox', label: deckName, commander: text(commanders[deckName], 200), cards })
  }
  for (const draft of Array.isArray(data?.mtg_draft_decks) ? data.mtg_draft_decks : []) {
    const id = `draft:${draft?.id}`
    if (!draft?.id || locks.has(id) || !draft.cards?.length) continue
    decks.push({
      id,
      source: 'draft',
      label: text(draft.name || draft.commander || 'Entwurf', 200),
      commander: text(draft.commander, 200),
      cards: draft.cards.filter(card => card?.name).map(card => asCard(card, card.count))
    })
  }

  return {
    ownerId: playerIdFor(email),
    ownerEmail: email,
    ownerName: text(name, 60),
    known: (Array.isArray(data?.mtg_known_players) ? data.mtg_known_players : [])
      .map(player => String(player?.playerId || ''))
      .filter(id => /^[0-9a-f]{20}$/.test(id)),
    decks,
    updatedAt: new Date().toISOString()
  }
}

export async function saveLenderEntry(email, name, data) {
  const entry = buildLenderEntry(email, name, data)
  await getStore(LENDERS_STORE).setJSON(entry.ownerId, entry)
  return entry
}
