// Friends'/other people's collections — each its own named, fully separate entry, never
// merged into the user's own collection (localStorage key 'mtg_collection') or its totals.
// The only thing these feed into is a "your friend already owns this" badge on cards the
// user still needs to buy — nothing else reads from them.
const STORAGE_KEY = 'mtg_secondary_collections'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function loadSecondaryCollections() {
  return loadAll()
}

/** `summary` is a parseCollectionCsv() result — same shape as the user's own collection. */
export function addSecondaryCollection(label, summary) {
  const all = loadAll()
  const entry = {
    id: `friend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    ...summary
  }
  all.push(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  return entry
}

export function removeSecondaryCollection(id) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadAll().filter(c => c.id !== id)))
}

/**
 * For a given card name, which secondary collections own at least one copy — used purely to
 * badge "Zukaufkarten" (cards the user still needs to buy) that happen to already be in a
 * friend's collection. Never used to feed AI suggestions or change ownership totals.
 */
export function getSecondaryAvailability(cardName) {
  const all = loadAll()
  const hits = []
  for (const col of all) {
    const quantity = (col.cards || [])
      .filter(c => c.name === cardName)
      .reduce((sum, c) => sum + c.quantity, 0)
    if (quantity > 0) hits.push({ label: col.label, quantity })
  }
  return hits
}
