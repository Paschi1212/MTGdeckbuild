import { createClient } from '@supabase/supabase-js'

// Live channels of the game table. They run on the Supabase project "Treachery" (which Rise1
// also uses) — but only as a radio: broadcast + presence channels under the "mtgtable:"
// prefix, no tables, nothing Rise1 reads. The publishable key is meant to ship in apps; it
// opens nothing beyond what the project allows anyone.
//
// Who is who comes from this site's own login (playerId, see netlify/functions/lib/player-id.js);
// channel names carry random ids, so only people who see a lobby (or got its link) find it.
const SUPABASE_URL = 'https://kncaptjyxgcolhmdgjcy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_eg_SZBbH21quzoyTaYH61A_wykQQ-lI'

let client = null

function tableClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } }
    })
  }
  return client
}

/**
 * Joins a live channel. `presence`: what this browser announces (null = only listen).
 * Returns { send(event, payload), track(presence), leave() }.
 */
export function joinChannel(name, { playerId, presence = null, onPresence, onBroadcast, onStatus }) {
  const channel = tableClient().channel(`mtgtable:${name}`, {
    config: { presence: { key: playerId || 'anon' }, broadcast: { self: false } }
  })

  if (onPresence) {
    channel.on('presence', { event: 'sync' }, () => {
      // One entry per player (a player with two tabs counts once, newest announcement wins).
      const entries = Object.values(channel.presenceState())
        .map(metas => metas[metas.length - 1])
        .filter(Boolean)
      onPresence(entries)
    })
  }
  for (const [event, handler] of Object.entries(onBroadcast || {})) {
    channel.on('broadcast', { event }, ({ payload }) => handler(payload))
  }

  let current = presence
  channel.subscribe(async (status) => {
    onStatus?.(status)
    if (status === 'SUBSCRIBED' && current) await channel.track(current)
  })

  return {
    send: (event, payload) => channel.send({ type: 'broadcast', event, payload }),
    track: async (next) => {
      current = next
      if (channel.state === 'joined') {
        if (next) await channel.track(next)
        else await channel.untrack()
      }
    },
    leave: () => tableClient().removeChannel(channel)
  }
}

/** A short random id for lobbies — unguessable enough for a friends' game night. */
export function randomId(length = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('')
}
