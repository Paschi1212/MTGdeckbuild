import { loadCollection, getCardsForBinder } from '../collection'
import { loadDraftDecks } from '../draftDecks'
import { getCommanderOverride } from '../commanderOverrides'
import { firstName } from './players'

// The decks a player can bring to the table: their own ManaBox decks and drafts, plus every
// deck of the players they have sat at a table with that the owner didn't lock (deck-shares
// function). Each comes as
//   { key, source: 'manabox' | 'draft' | 'borrowed', label, commander, cards, ownerId?, ownerName? }

export function loadOwnDecks() {
  const collection = loadCollection()
  const manabox = (collection?.decks || []).map(deck => ({
    key: `manabox:${deck.name}`,
    source: 'manabox',
    label: deck.name,
    commander: getCommanderOverride(deck.name),
    cards: getCardsForBinder(collection, deck.name).map(card => ({ name: card.name, count: card.quantity || 1, scryfallId: card.scryfallId || '' }))
  }))
  const drafts = loadDraftDecks().map(draft => ({
    key: `draft:${draft.id}`,
    source: 'draft',
    label: draft.name || draft.commander || 'Entwurf',
    commander: draft.commander || '',
    cards: (draft.cards || []).map(card => ({ name: card.name, count: card.count || 1, scryfallId: card.scryfallId || '' }))
  }))
  return { hasCollection: Boolean(collection), decks: [...manabox, ...drafts] }
}

export async function fetchBorrowedDecks() {
  try {
    const response = await fetch('/.netlify/functions/deck-shares', { credentials: 'include', cache: 'no-store' })
    if (!response.ok) return []
    const data = await response.json()
    return (data.decks || []).map(deck => ({
      key: `borrowed:${deck.ownerId}:${deck.deckId}`,
      source: 'borrowed',
      label: deck.source === 'draft' ? `${deck.label} (Entwurf)` : deck.label,
      ownerId: deck.ownerId,
      ownerName: firstName(deck.ownerName),
      commander: deck.commander,
      cards: deck.cards
    }))
  } catch {
    return []
  }
}

const byLabel = (a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })

/**
 * Decks sorted for a picker, grouped by owner: yours first, then each friend's — the ones
 * sitting at this table (`presentIds`) before the others, then by name.
 * Returns [{ key, label, decks }].
 */
export function groupDecksByOwner(decks, presentIds = []) {
  const present = new Set(presentIds)
  const groups = [
    { key: 'own:manabox', label: 'Deine Decks', decks: decks.filter(deck => deck.source === 'manabox').sort(byLabel) },
    { key: 'own:draft', label: 'Deine Entwürfe', decks: decks.filter(deck => deck.source === 'draft').sort(byLabel) }
  ]
  const owners = new Map()
  for (const deck of decks.filter(d => d.source === 'borrowed')) {
    if (!owners.has(deck.ownerId)) owners.set(deck.ownerId, { key: `owner:${deck.ownerId}`, label: `Decks von ${deck.ownerName}`, name: deck.ownerName, here: present.has(deck.ownerId), decks: [] })
    owners.get(deck.ownerId).decks.push(deck)
  }
  const friends = [...owners.values()]
    .sort((a, b) => (b.here - a.here) || a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
    .map(({ key, label, decks: list }) => ({ key, label, decks: list.sort(byLabel) }))
  return [...groups, ...friends].filter(group => group.decks.length)
}

export const deckCardCount = (deck) => (deck?.cards || []).reduce((sum, card) => sum + (card.count || 1), 0)

const commanderCache = new Map()

/** Image + color identity of a commander (Scryfall via get-card-price), cached per name. */
export function loadCommanderCard(name) {
  if (!name) return Promise.resolve(null)
  if (!commanderCache.has(name)) {
    commanderCache.set(name, fetch(`/.netlify/functions/get-card-price?card=${encodeURIComponent(name)}`)
      .then(response => (response.ok ? response.json() : null))
      .then(card => card && {
        name: card.name,
        image: card.image || null,
        colorIdentity: String(card.colorIdentity || '').split(/\s+/).filter(Boolean)
      })
      .catch(() => null))
  }
  return commanderCache.get(name)
}

// Scryfall's art-only crop of a card image ("…/normal/front/…" → "…/art_crop/front/…").
export function artCrop(imageUrl) {
  return imageUrl ? imageUrl.replace('/normal/', '/art_crop/') : null
}
