import { scheduleCloudPush } from './cloudSync'

// Per-deck settings the user has taught the tool — a confirmed/corrected strategy read,
// a chosen power level — separate from commanderOverrides.js since these are a distinct
// concern (deck-audit context, not "which card is the commander").
const STORAGE_KEY = 'mtg_deck_preferences'

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getDeckPreferences(deckName) {
  if (!deckName) return {}
  return loadAll()[deckName] || {}
}

export function setDeckPreferences(deckName, patch) {
  if (!deckName) return
  const all = loadAll()
  all[deckName] = { ...(all[deckName] || {}), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  scheduleCloudPush()
}
