// Cross-device sync: everything that used to live ONLY in browser localStorage (scoped per
// device, invisible on a phone logged into the same Google account) now also round-trips
// through /.netlify/functions/sync-data, keyed server-side by the user's email. localStorage
// stays the thing every page actually reads/writes (no change needed there) — this module is
// the bridge that keeps it in sync with the server copy.
const SYNCED_KEYS = [
  'mtg_collection',
  'mtg_secondary_collections',
  'mtg_draft_decks',
  'mtg_deck_preferences',
  'mtg_deck_audits',
  'mtg_commander_overrides'
]

/**
 * Pulls the server snapshot and writes it into localStorage, overwriting whatever was there.
 * Called once per login (App.jsx, before any page can read localStorage) — a fresh device/
 * browser has nothing to lose, and an existing device's local copy is expected to already
 * match the last thing IT pushed, so this is safe as a blanket overwrite rather than a merge.
 */
export async function pullFromCloud() {
  try {
    const res = await fetch('/.netlify/functions/sync-data', { credentials: 'include' })
    if (!res.ok) return false
    const data = await res.json()
    for (const key of SYNCED_KEYS) {
      if (data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(data[key]))
      }
    }
    return true
  } catch {
    return false
  }
}

function readAllSyncedData() {
  const data = {}
  for (const key of SYNCED_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      data[key] = JSON.parse(raw)
    } catch {
      // Corrupt local value — skip it rather than push garbage to the server.
    }
  }
  return data
}

let pushTimer = null

/**
 * Debounced push of the FULL current localStorage snapshot (all synced keys) to the server.
 * Called at the end of every local save/delete across collection.js, draftDecks.js,
 * deckPreferences.js, deckAudit.js, commanderOverrides.js, secondaryCollections.js — a single
 * shared debounce timer, so several saves in quick succession (e.g. uploading a collection
 * right after setting a commander override) collapse into one push instead of several.
 */
export function scheduleCloudPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    fetch('/.netlify/functions/sync-data', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(readAllSyncedData())
    }).catch(() => {})
  }, 1000)
}
