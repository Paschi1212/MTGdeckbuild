import { scheduleCloudPush } from './cloudSync'
import { deleteSavedAudit } from './deckAudit'
import { getDeckPreferences, setDeckPreferences } from './deckPreferences'

const STORAGE_KEY = 'mtg_draft_decks'

// Key for a draft's saved analysis + strategy correction (deckAudit.js / deckPreferences.js),
// prefixed so it can never collide with a real ManaBox deck that has the same name.
export function draftStorageKey(id) {
  return `draft:${id}`
}

export function loadDraftDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const drafts = raw ? JSON.parse(raw) : []
    return [...drafts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  } catch (error) {
    return []
  }
}

function persist(drafts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
  scheduleCloudPush()
}

export function getDraftDeck(id) {
  if (!id) return null
  return loadDraftDecks().find(d => d.id === id) || null
}

/**
 * Creates a new draft, or updates an existing one in place when `id` matches one already
 * saved — re-saving a draft you're already editing overwrites it instead of piling up
 * duplicates.
 */
// The plan the player wrote in the deck questionnaire becomes the draft's binding game plan
// (like a correction made by hand) — later analyses build on it instead of guessing anew.
function rememberPlayerPlan(draft, playerPlan, powerLevel) {
  if (!playerPlan) return
  const key = draftStorageKey(draft.id)
  if (getDeckPreferences(key).strategyByPlayer) return
  setDeckPreferences(key, { strategyOverride: playerPlan, strategyCommander: draft.commander, strategyByPlayer: true, ...(powerLevel ? { powerLevel } : {}) })
}

export function saveDraftDeck({ id, name, commander, cards, strategyNote, playerPlan, powerLevel }) {
  const drafts = loadDraftDecks()
  const now = new Date().toISOString()
  const existingIndex = id ? drafts.findIndex(d => d.id === id) : -1

  if (existingIndex !== -1) {
    const updated = { ...drafts[existingIndex], name, commander, cards, strategyNote, updatedAt: now }
    drafts[existingIndex] = updated
    persist(drafts)
    rememberPlayerPlan(updated, playerPlan, powerLevel)
    return updated
  }

  const created = {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    commander,
    cards,
    strategyNote,
    createdAt: now,
    updatedAt: now
  }
  drafts.push(created)
  persist(drafts)
  rememberPlayerPlan(created, playerPlan, powerLevel)
  return created
}

export function deleteDraftDeck(id) {
  persist(loadDraftDecks().filter(d => d.id !== id))
  deleteSavedAudit(draftStorageKey(id))
}
