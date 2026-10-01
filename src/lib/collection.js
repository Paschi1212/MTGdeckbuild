import Papa from 'papaparse'

const STORAGE_KEY = 'mtg_collection'

/**
 * Parses a ManaBox collection export CSV into a summary object.
 * Columns: Binder Name, Binder Type (deck|binder), Name, Set code, Set name,
 * Collector number, Foil, Rarity, Quantity, ManaBox ID, Scryfall ID,
 * Purchase price, Misprint, Altered, Condition, Language,
 * Purchase price currency, Added
 */
export function parseCollectionCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: (results) => {
        const rows = results.data

        if (!rows.length || !('Name' in rows[0])) {
          reject(new Error('Keine gültige ManaBox-CSV erkannt (Spalte "Name" fehlt)'))
          return
        }

        let totalCards = 0
        let totalValue = 0
        let unsortedCount = 0
        const uniqueCardNames = new Set()
        const deckOrder = []
        const deckCounts = new Map()
        const deckValues = new Map()
        const cards = []

        for (const row of rows) {
          const quantity = Number(row['Quantity']) || 0
          const price = Number(row['Purchase price']) || 0
          const binderName = row['Binder Name']
          const binderType = row['Binder Type']

          totalCards += quantity
          totalValue += price * quantity

          if (row['Name']) {
            uniqueCardNames.add(row['Name'])
            cards.push({
              name: row['Name'],
              quantity,
              setCode: row['Set code'] || '',
              setName: row['Set name'] || '',
              foil: row['Foil'] || '',
              rarity: row['Rarity'] || '',
              scryfallId: row['Scryfall ID'] || '',
              purchasePrice: price,
              binderName,
              binderType
            })
          }

          if (binderType === 'deck') {
            if (!deckCounts.has(binderName)) {
              deckCounts.set(binderName, 0)
              deckValues.set(binderName, 0)
              deckOrder.push(binderName)
            }
            deckCounts.set(binderName, deckCounts.get(binderName) + quantity)
            deckValues.set(binderName, deckValues.get(binderName) + price * quantity)
          } else {
            unsortedCount += quantity
          }
        }

        resolve({
          uploadedAt: new Date().toISOString(),
          totalCards,
          totalValue: Math.round(totalValue * 100) / 100,
          uniqueCardNames: [...uniqueCardNames].sort(),
          decks: deckOrder.map(name => ({
            name,
            cardCount: deckCounts.get(name),
            totalValue: Math.round(deckValues.get(name) * 100) / 100
          })),
          unsortedCount,
          cards
        })
      },
      error: (error) => reject(error)
    })
  })
}

export function saveCollection(summary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(summary))
}

export function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

export function getCardsForBinder(collection, binderName) {
  if (!collection?.cards) return []
  return collection.cards.filter(c => c.binderName === binderName && c.binderType === 'deck')
}

export function getUnsortedCards(collection) {
  if (!collection?.cards) return []
  return collection.cards.filter(c => c.binderType !== 'deck')
}

/**
 * Per-card-name owned/committed/available breakdown across the whole collection. A card
 * already built into one of the user's real ManaBox decks (binderType 'deck') is
 * "committed" — that physical copy can't also go into a different deck being built or
 * edited. `excludeBinderName` lets a deck's OWN cards not count against themselves (e.g.
 * when editing "Wrexial Mill", Wrexial Mill's own copies aren't "used up" by another deck).
 */
export function getAvailableQuantities(collection, excludeBinderName = null) {
  const map = new Map()
  if (!collection?.cards) return map

  for (const card of collection.cards) {
    const entry = map.get(card.name) || { total: 0, committed: 0 }
    entry.total += card.quantity
    if (card.binderType === 'deck' && card.binderName !== excludeBinderName) {
      entry.committed += card.quantity
    }
    map.set(card.name, entry)
  }

  for (const entry of map.values()) {
    entry.available = Math.max(entry.total - entry.committed, 0)
  }

  return map
}

/** Card names with at least one copy not already committed to another deck. */
export function getAvailableCardNames(collection, excludeBinderName = null) {
  const quantities = getAvailableQuantities(collection, excludeBinderName)
  return [...quantities.entries()].filter(([, v]) => v.available > 0).map(([name]) => name)
}

/**
 * One entry per unique card name with a purchase price on file (ManaBox leaves it 0 if never
 * set), total quantity owned across all binders/decks. Used for the price-gainer scan — a
 * single representative purchase price per name, not weighted across rows bought at
 * different times, which is a reasonable simplification for "did this generally go up".
 */
export function getPricedCardNames(collection) {
  if (!collection?.cards) return []
  const byName = new Map()
  for (const card of collection.cards) {
    if (!card.purchasePrice) continue
    const entry = byName.get(card.name)
    if (entry) {
      entry.quantity += card.quantity
    } else {
      byName.set(card.name, { name: card.name, purchasePrice: card.purchasePrice, quantity: card.quantity })
    }
  }
  return [...byName.values()]
}
