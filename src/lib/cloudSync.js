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
  'mtg_commander_overrides',
  // Obsidian-brain logbook entries written while no bridge was reachable (e.g. on the phone)
  'mtg_brain_outbox',
  // The PC bridge's Tailscale address, so a tablet can reach it without typing (aiMode.js)
  'mtg_bridge_remote'
]

// Two devices (PC + tablet): the server numbers every saved snapshot. This device remembers
// the number its data is based on (per device, not synced) and sends it with each push — if
// another device saved in between, the server refuses instead of overwriting, and the page
// asks which version to keep (SyncBanner). A focus check also notices changes from another
// device before anything is edited here.
const REV_KEY = 'mtg_sync_rev'

let syncState = { stale: null, conflict: null } // each: { device, updatedAt } or null
const syncListeners = new Set()

export function subscribeSync(listener) {
  syncListeners.add(listener)
  return () => syncListeners.delete(listener)
}

export function getSyncState() {
  return syncState
}

function setSyncState(next) {
  syncState = { ...syncState, ...next }
  for (const listener of syncListeners) listener()
}

function localRev() {
  try { return Number(localStorage.getItem(REV_KEY)) || 0 } catch { return 0 }
}

function setLocalRev(rev) {
  try { localStorage.setItem(REV_KEY, String(rev)) } catch {}
}

/** "iPad", "Windows-PC", … — shown on the other device ("auf deinem iPad geändert"). */
export function deviceLabel() {
  const ua = navigator.userAgent || ''
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet'
  if (/Windows/.test(ua)) return 'Windows-PC'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'anderes Gerät'
}

/**
 * Pulls the server snapshot and writes it into localStorage, overwriting whatever was there.
 * Called once per login (App.jsx, before any page can read localStorage) — a fresh device/
 * browser has nothing to lose, and an existing device's local copy is expected to already
 * match the last thing IT pushed, so this is safe as a blanket overwrite rather than a merge.
 */
export async function pullFromCloud() {
  try {
    const res = await fetch('/.netlify/functions/sync-data', { credentials: 'include' })
    if (!res.ok) return { ok: false }
    const data = await res.json()
    let found = 0
    for (const key of SYNCED_KEYS) {
      if (data[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(data[key]))
        found++
      }
    }
    if (typeof data.__rev === 'number') setLocalRev(data.__rev)
    setSyncState({ stale: null, conflict: null })
    // empty: the server has nothing yet for this account (first device ever).
    return { ok: true, empty: found === 0 }
  } catch {
    return { ok: false }
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

async function pushNow({ force = false } = {}) {
  try {
    const res = await fetch('/.netlify/functions/sync-data', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ ...readAllSyncedData(), __baseRev: localRev(), __device: deviceLabel(), ...(force ? { __force: true } : {}) })
    })
    const info = await res.json().catch(() => ({}))
    if (res.status === 409) {
      setSyncState({ conflict: { device: info.__device, updatedAt: info.__updatedAt }, stale: null })
      return false
    }
    if (res.ok) {
      if (typeof info.__rev === 'number') setLocalRev(info.__rev)
      setSyncState({ stale: null, conflict: null })
      return true
    }
  } catch {
    // Offline — the data stays in localStorage and goes along with the next push.
  }
  return false
}

/**
 * Debounced push of the FULL current localStorage snapshot (all synced keys) to the server.
 * Called at the end of every local save/delete across collection.js, draftDecks.js,
 * deckPreferences.js, deckAudit.js, commanderOverrides.js, secondaryCollections.js — a single
 * shared debounce timer, so several saves in quick succession (e.g. uploading a collection
 * right after setting a commander override) collapse into one push instead of several.
 * While a conflict is open nothing is pushed — the banner asks first.
 */
export function scheduleCloudPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    if (!syncState.conflict) pushNow()
  }, 1000)
}

let lastRemoteCheck = 0

/** Has another device saved since this one loaded? (on focus — throttled, cheap meta call) */
export async function checkForRemoteChanges() {
  if (Date.now() - lastRemoteCheck < 10000 || syncState.conflict) return
  lastRemoteCheck = Date.now()
  try {
    const res = await fetch('/.netlify/functions/sync-data?meta=1', { credentials: 'include', cache: 'no-store' })
    if (!res.ok) return
    const info = await res.json()
    if (typeof info.__rev !== 'number' || info.__rev <= localRev()) return
    const change = { device: info.__device, updatedAt: info.__updatedAt }
    // Unsaved changes waiting here as well → that is already a conflict.
    setSyncState(pushTimer ? { conflict: change } : { stale: change })
  } catch {
    // Offline — check again next time.
  }
}

/** Take the other device's version: load it and reload the page (local unsaved edits are dropped). */
export async function reloadFromCloud() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  await pullFromCloud()
  window.location.reload()
}

/** Keep this device's version: save it over whatever the other device stored. */
export function keepLocalVersion() {
  return pushNow({ force: true })
}
