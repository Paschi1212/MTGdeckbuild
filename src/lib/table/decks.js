import { loadCollection, getCardsForBinder } from '../collection'
import { loadDraftDecks } from '../draftDecks'
import { getCommanderOverride } from '../commanderOverrides'
import { firstName } from './players'

// The decks a player can bring to the table: their own ManaBox decks and drafts, plus decks
// friends lent them (deck-shares function). Each comes as
//   { key, source: 'manabox' | 'draft' | 'borrowed', label, commander, cards, ownerName? }

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
    const response = await fetch('/.netlify/functions/deck-shares', { credentials: 'include' })
    if (!response.ok) return []
    const data = await response.json()
    return (data.decks || []).map(deck => ({
      key: `borrowed:${deck.shareId}`,
      source: 'borrowed',
      label: deck.deckName,
      ownerName: firstName(deck.ownerName),
      commander: deck.commander,
      cards: deck.cards
    }))
  } catch {
    return []
  }
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
