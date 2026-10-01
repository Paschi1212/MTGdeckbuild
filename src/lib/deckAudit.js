import { scheduleCloudPush } from './cloudSync'

// Persists the last full analysis result (strategy, cardsToCut/Add/Buy) per deck — separate
// from deckPreferences.js, which holds what the user has explicitly taught the tool
// (strategyOverride, powerLevel). This is just a cache of the last computed result, so it
// survives a page reload/revisit instead of silently disappearing until "Analysieren" is
// clicked again, right up until a fresh analysis overwrites it.
const STORAGE_KEY = 'mtg_deck_audits'

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getSavedAudit(deckName) {
  if (!deckName) return null
  return loadAll()[deckName] || null
}

export function setSavedAudit(deckName, audit) {
  if (!deckName) return
  const all = loadAll()
  all[deckName] = audit
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  scheduleCloudPush()
}
