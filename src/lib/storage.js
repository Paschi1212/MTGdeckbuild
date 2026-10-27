// Housekeeping for the browser storage (localStorage, ~5 MB per site, shared with the
// collection). Game tables and drafts leave big entries behind — every card of every seat, every
// booster — that used to stay forever until the storage was full and new tables couldn't be
// saved any more. Those transient entries are now pruned: the newest few are kept, and when a
// write doesn't fit, the oldest go first until it does.

const TOUCH_KEY = 'mtg_storage_touched' // { key: last write time } for the entries below

// How many of each kind to keep at least (newest first).
const TRANSIENT = [
  { prefix: 'mtg_table_game:', keep: 5 },
  { prefix: 'mtg_table_boards:', keep: 5 },
  { prefix: 'mtg_table_host:', keep: 10 },
  { prefix: 'mtg_draft_state:', keep: 3 },
  { prefix: 'mtg_draft_view:', keep: 3 },
  { prefix: 'mtg_draft_built:', keep: 3 }
]
const GAME_PREFIX = 'mtg_table_game:'
const BOARDS_PREFIX = 'mtg_table_boards:'

const isTransient = (key) => TRANSIENT.some(t => key.startsWith(t.prefix))

function readTouched() {
  try { return JSON.parse(localStorage.getItem(TOUCH_KEY) || '{}') } catch { return {} }
}

function writeTouched(map) {
  try { localStorage.setItem(TOUCH_KEY, JSON.stringify(map)) } catch { /* only an index */ }
}

// Last write time of an entry; a game record carries its own (savedAt).
function timeOf(key, touched) {
  if (touched[key]) return touched[key]
  if (key.startsWith(GAME_PREFIX)) {
    try { return JSON.parse(localStorage.getItem(key) || '{}').savedAt || 0 } catch { return 0 }
  }
  return 0
}

function transientKeys(touched) {
  return Object.keys(localStorage)
    .filter(isTransient)
    .map(key => ({ key, time: timeOf(key, touched) }))
    .sort((a, b) => a.time - b.time) // oldest first
}

function remove(keys, touched) {
  for (const key of keys) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    delete touched[key]
  }
}

/**
 * Drops what's no longer needed: boards of games that are gone, and everything beyond the
 * newest `keep` of each kind. `protect`: keys that must stay (the one being written).
 */
export function pruneStorage({ protect = [] } = {}) {
  try {
    const touched = readTouched()
    const entries = transientKeys(touched)
    const doomed = []
    for (const { prefix, keep } of TRANSIENT) {
      // Entries of unknown age (written before this housekeeping) only go when space runs out
      // (safeSetItem) — then first.
      const ofKind = entries.filter(e => e.key.startsWith(prefix) && !protect.includes(e.key) && e.time > 0)
      doomed.push(...ofKind.slice(0, Math.max(0, ofKind.length - keep)).map(e => e.key))
    }
    // A board without its game record can't be opened any more.
    for (const { key } of entries) {
      if (key.startsWith(BOARDS_PREFIX) && !protect.includes(key) && localStorage.getItem(GAME_PREFIX + key.slice(BOARDS_PREFIX.length)) === null) doomed.push(key)
    }
    for (const key of Object.keys(touched)) if (localStorage.getItem(key) === null) delete touched[key]
    remove([...new Set(doomed)], touched)
    writeTouched(touched)
  } catch {
    // Storage blocked: nothing to tidy.
  }
}

/**
 * localStorage.setItem that makes room when the storage is full: first the usual pruning,
 * then the oldest table/draft entries one by one. Returns whether the value was stored.
 */
export function safeSetItem(key, value) {
  const touched = readTouched()
  const store = () => {
    localStorage.setItem(key, value)
    if (isTransient(key)) { touched[key] = Date.now(); writeTouched(touched) }
    return true
  }
  try {
    return store()
  } catch {
    // Probably full — make room below.
  }
  try {
    pruneStorage({ protect: [key] })
    try { return store() } catch { /* still full */ }
    const fresh = readTouched()
    Object.assign(touched, fresh)
    for (const { key: old } of transientKeys(touched).filter(e => e.key !== key)) {
      remove([old], touched)
      try { return store() } catch { /* keep going */ }
    }
  } catch {
    // Storage blocked altogether.
  }
  return false
}
