import { scheduleCloudPush } from '../cloudSync'

// Players met at the table (from lobbies) — the list to pick from when lending a deck.
// Cloud-synced, so it is the same on PC and tablet.
const KNOWN_KEY = 'mtg_known_players'

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Spieler'
}

export function loadKnownPlayers() {
  try { return JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]') } catch { return [] }
}

/** Adds/refreshes players seen together in a lobby (only writes when something changed). */
export function rememberPlayers(players, myPlayerId) {
  const known = loadKnownPlayers()
  let changed = false
  for (const player of players) {
    if (!player?.playerId || player.playerId === myPlayerId) continue
    const existing = known.find(k => k.playerId === player.playerId)
    if (!existing) {
      known.push({ playerId: player.playerId, name: player.name })
      changed = true
    } else if (player.name && existing.name !== player.name) {
      existing.name = player.name
      changed = true
    }
  }
  if (!changed) return
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(known))
    scheduleCloudPush()
  } catch {
    // Storage full — the list is a convenience only.
  }
}
