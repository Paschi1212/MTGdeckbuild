// Card images, prices and types for many cards at once (whole collections: 2000+ cards).
//
// 1. Browser cache first (IndexedDB, 3 days): a collection opened before shows its images
//    immediately and costs Scryfall nothing.
// 2. The rest from the server in small chunks, one after another — no single request has to
//    beat Netlify's 30 s limit, images appear while loading, and the server's paced Scryfall
//    queue isn't flooded.
// 3. Whatever didn't come back (Scryfall rate limit) is reported as missing so the page can
//    retry later, instead of silently showing cards without images.

const DB_NAME = 'mtg-card-cache'
const STORE = 'cards'
const TTL_MS = 3 * 24 * 60 * 60 * 1000
const ID_CHUNK = 300 // 4 Scryfall batches per request
const NAME_CHUNK = 150 // 2 batches + a few fuzzy lookups

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null) // private mode / storage blocked: everything still works, just uncached
    }
  })
  return dbPromise
}

async function readCache(keys) {
  const db = await openDb()
  const hits = new Map()
  if (!db || keys.length === 0) return hits
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const now = Date.now()
    for (const key of keys) {
      const request = store.get(key)
      request.onsuccess = () => {
        const value = request.result
        if (value && now - value.t < TTL_MS) hits.set(key, value.d)
      }
    }
    tx.oncomplete = () => resolve(hits)
    tx.onerror = () => resolve(hits)
  })
}

async function writeCache(entries) {
  const db = await openDb()
  if (!db || entries.length === 0) return
  await new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const t = Date.now()
    for (const [key, data] of entries) store.put({ t, d: data }, key)
    tx.oncomplete = resolve
    tx.onerror = resolve
  })
}

const idKey = (id) => `id:${id}`
const nameKey = (name) => `name:${name.toLowerCase()}`

// The by-name lookup also returns rules text — not needed for display, and it's most of the
// size, so it isn't cached.
function slim(entry) {
  const { oracleText, ...rest } = entry || {}
  return rest
}

async function postChunk(body) {
  try {
    const response = await fetch('/.netlify/functions/get-card-price', { method: 'POST', body: JSON.stringify(body) })
    return response.ok ? await response.json() : {}
  } catch {
    return {}
  }
}

/**
 * onUpdate({ byId, byName }) fires with everything known so far — first from the cache, then
 * after every chunk. Resolves with what's still missing: { ids, names }.
 */
export async function loadCardData({ ids = [], names = [], onUpdate, isCancelled = () => false }) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  const uniqueNames = [...new Set(names.filter(Boolean))]
  const byId = {}
  const byName = {}

  const cached = await readCache([...uniqueIds.map(idKey), ...uniqueNames.map(nameKey)])
  for (const id of uniqueIds) if (cached.has(idKey(id))) byId[id] = cached.get(idKey(id))
  for (const name of uniqueNames) if (cached.has(nameKey(name))) byName[name] = cached.get(nameKey(name))
  if (isCancelled()) return { ids: [], names: [] }
  onUpdate({ byId: { ...byId }, byName: { ...byName } })

  const missingIds = uniqueIds.filter(id => !byId[id])
  const missingNames = uniqueNames.filter(name => !byName[name])
  const stillMissing = { ids: [], names: [] }

  for (let i = 0; i < missingIds.length; i += ID_CHUNK) {
    const chunk = missingIds.slice(i, i + ID_CHUNK)
    const data = await postChunk({ ids: chunk })
    if (isCancelled()) return stillMissing
    const fresh = []
    for (const id of chunk) {
      if (data[id]) {
        byId[id] = data[id]
        fresh.push([idKey(id), data[id]])
      } else {
        stillMissing.ids.push(id)
      }
    }
    await writeCache(fresh)
    onUpdate({ byId: { ...byId }, byName: { ...byName } })
  }

  for (let i = 0; i < missingNames.length; i += NAME_CHUNK) {
    const chunk = missingNames.slice(i, i + NAME_CHUNK)
    const data = await postChunk({ names: chunk })
    if (isCancelled()) return stillMissing
    const fresh = []
    for (const name of chunk) {
      if (data[name]) {
        byName[name] = slim(data[name])
        fresh.push([nameKey(name), byName[name]])
      } else {
        stillMissing.names.push(name)
      }
    }
    await writeCache(fresh)
    onUpdate({ byId: { ...byId }, byName: { ...byName } })
  }

  return stillMissing
}
