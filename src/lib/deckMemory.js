import { getDeckPreferences, setDeckPreferences } from './deckPreferences'

// What earlier analyses of a deck led to — so the next analysis doesn't contradict them:
//   kept    – suggested adds the user put in the deck (never suggested as cuts again)
//   removed – suggested cuts the user took out (never suggested as adds again)
// Stored with the deck's preferences (cloud-synced), keyed like the strategy correction.

const norm = (name) => String(name || '').split('//')[0].trim().toLowerCase()
const uniqueByName = (names) => [...new Map(names.filter(Boolean).map(n => [norm(n), n])).values()]

export function getDeckMemory(key) {
  const memory = getDeckPreferences(key).deckMemory || {}
  return { kept: memory.kept || [], removed: memory.removed || [] }
}

/**
 * Folds the previous analysis into the memory before a new one runs: its adds that are now in
 * the deck become "kept", its cuts that are gone become "removed". Entries that no longer
 * apply drop out by themselves (a kept card left the deck, a removed card came back).
 */
export function updateDeckMemory(key, previousAudit, deckCards) {
  const inDeck = new Set((deckCards || []).map(c => norm(c.name)))
  const previous = getDeckMemory(key)
  const suggestedAdds = [...(previousAudit?.cardsToAdd || []), ...(previousAudit?.cardsToBuy || [])].map(c => c.name)
  const suggestedCuts = (previousAudit?.cardsToCut || []).map(c => c.name)

  const memory = {
    kept: uniqueByName([...previous.kept, ...suggestedAdds]).filter(n => inDeck.has(norm(n))),
    removed: uniqueByName([...previous.removed, ...suggestedCuts]).filter(n => !inDeck.has(norm(n)))
  }
  setDeckPreferences(key, { deckMemory: memory })
  return memory
}

export function forgetDeckMemoryEntry(key, kind, name) {
  const memory = getDeckMemory(key)
  memory[kind] = memory[kind].filter(n => norm(n) !== norm(name))
  setDeckPreferences(key, { deckMemory: memory })
  return memory
}
