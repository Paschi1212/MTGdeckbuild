import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { joinChannel, randomId } from './realtime'

// A running game at the table, kitchen-table style: nobody enforces rules, everybody can
// change everybody's numbers. The state is a list of small events ("Tom: life −5") that every
// browser keeps and folds the same way — changes are deltas, so two players tapping at the
// same moment never overwrite each other. A browser that reloads or joins late asks the
// others for their events and merges them in.

export const STARTING_LIFE = 40
export const COMMANDER_DAMAGE_LETHAL = 21
export const PLAYER_COUNTERS = [
  { key: 'poison', label: 'Gift', lethal: 10 },
  { key: 'energy', label: 'Energie' },
  { key: 'experience', label: 'Erfahrung' },
  { key: 'rad', label: 'Rad' }
]

const GAME_PREFIX = 'mtg_table_game:'
const KEEP_GAMES = 5
const SYNC_CHUNK = 200

// ── Local copy (per device): survives a reload in the middle of a game ────────────────────

export function loadGameRecord(gameId) {
  try { return JSON.parse(localStorage.getItem(GAME_PREFIX + gameId) || 'null') } catch { return null }
}

export function saveGameRecord(gameId, record) {
  try {
    localStorage.setItem(GAME_PREFIX + gameId, JSON.stringify({ ...record, savedAt: Date.now() }))
    // Only the last few games are kept.
    const games = Object.keys(localStorage)
      .filter(key => key.startsWith(GAME_PREFIX))
      .map(key => ({ key, savedAt: JSON.parse(localStorage.getItem(key) || '{}').savedAt || 0 }))
      .sort((a, b) => b.savedAt - a.savedAt)
    for (const old of games.slice(KEEP_GAMES)) localStorage.removeItem(old.key)
  } catch {
    // Storage full — the game goes on, a reload would just ask the others again.
  }
}

// ── Folding events into the table state ───────────────────────────────────────────────────

const byTime = (a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1)

/** Table state + a log with the value after each change. */
export function foldGame(seats, events) {
  const players = Object.fromEntries((seats || []).map(seat => [seat.playerId, {
    life: STARTING_LIFE, counters: {}, commanderDamage: {}, tax: 0, out: false
  }]))
  let monarch = null
  let turn = { seat: 0, round: 1 }
  const log = []

  for (const event of [...events].sort(byTime)) {
    const player = players[event.target]
    const entry = { ...event }
    switch (event.type) {
      case 'life':
        if (!player) continue
        player.life += event.delta
        entry.after = player.life
        break
      case 'counter':
        if (!player) continue
        player.counters[event.key] = Math.max(0, (player.counters[event.key] || 0) + event.delta)
        entry.after = player.counters[event.key]
        break
      case 'cmd':
        // Commander damage is damage: it also costs life, as at the table.
        if (!player || !players[event.source]) continue
        player.commanderDamage[event.source] = Math.max(0, (player.commanderDamage[event.source] || 0) + event.delta)
        player.life -= event.delta
        entry.after = player.commanderDamage[event.source]
        entry.lifeAfter = player.life
        break
      case 'tax':
        if (!player) continue
        player.tax = Math.max(0, player.tax + event.delta)
        entry.after = player.tax
        break
      case 'out':
        if (!player) continue
        player.out = Boolean(event.value)
        break
      case 'monarch':
        monarch = event.target || null
        break
      case 'turn':
        turn = { seat: event.seat, round: event.round }
        break
      case 'note':
        // What a player did with their cards ("spielt Sol Ring") — log only.
        break
      default:
        continue // unknown types (newer version) are skipped, never fatal
    }
    log.push(entry)
  }
  return { players, monarch, turn, log }
}

/** Who is dead by the numbers (the table still decides — this only marks it). */
export function lethalReason(player) {
  if (!player) return null
  if (player.life <= 0) return 'Leben 0'
  if ((player.counters.poison || 0) >= 10) return '10 Gift'
  if (Object.values(player.commanderDamage).some(damage => damage >= COMMANDER_DAMAGE_LETHAL)) return '21 Commander-Schaden'
  return null
}

// ── Live game hook ────────────────────────────────────────────────────────────────────────

/**
 * Joins the live game. `record` = { seats, startedAt, events, myDeck? } from the lobby start or
 * the local copy; null for a spectator who gets everything from the others.
 */
export function useGame(gameId, me) {
  const [record, setRecord] = useState(() => loadGameRecord(gameId))
  const [online, setOnline] = useState([])
  // Every player's public board (latest snapshot each): see lib/table/board.js.
  const [boards, setBoards] = useState({})
  const myBoardRef = useRef(null)
  const [status, setStatus] = useState('connecting')
  const recordRef = useRef(record)
  const channelRef = useRef(null)
  const saveTimer = useRef(null)

  const commit = useCallback((next) => {
    recordRef.current = next
    setRecord(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveGameRecord(gameId, next), 400)
  }, [gameId])

  // Adds events not seen yet (and the seating, if this browser had none).
  const merge = useCallback((incoming = [], seats = null, startedAt = null) => {
    const current = recordRef.current
    const known = new Set((current?.events || []).map(event => event.id))
    const fresh = incoming.filter(event => event?.id && !known.has(event.id))
    if (!fresh.length && (current || !seats)) return
    commit({
      ...(current || {}),
      seats: current?.seats || seats,
      startedAt: current?.startedAt || startedAt,
      events: [...(current?.events || []), ...fresh]
    })
  }, [commit])

  // The practice table runs entirely in this browser — no live channel.
  const practice = Boolean(record?.practice)

  useEffect(() => {
    if (practice) {
      setStatus('SUBSCRIBED')
      return () => { clearTimeout(saveTimer.current); if (recordRef.current) saveGameRecord(gameId, recordRef.current) }
    }
    const replyTo = (playerId) => {
      const current = recordRef.current
      if (!current?.seats) return
      const events = current.events || []
      for (let i = 0; i < Math.max(events.length, 1); i += SYNC_CHUNK) {
        channelRef.current?.send('sync-reply', { to: playerId, seats: current.seats, startedAt: current.startedAt, events: events.slice(i, i + SYNC_CHUNK) })
      }
    }
    const channel = joinChannel(`game:${gameId}`, {
      playerId: me.playerId,
      presence: { playerId: me.playerId, name: me.name },
      onPresence: setOnline,
      onStatus: (next) => {
        setStatus(next)
        // Back on the line (first connect or after a drop): catch up on what was missed.
        if (next === 'SUBSCRIBED') channelRef.current?.send('sync-request', { from: me.playerId })
      },
      onBroadcast: {
        evt: (event) => merge([event]),
        board: ({ owner, v, ...snapshot }) => setBoards(prev => (prev[owner]?.v >= v ? prev : { ...prev, [owner]: { v, ...snapshot } })),
        'sync-request': ({ from }) => {
          if (!from || from === me.playerId) return
          replyTo(from)
          // Boards are sent whole: the newcomer just needs everyone's latest one.
          if (myBoardRef.current) channelRef.current?.send('board', myBoardRef.current)
        },
        'sync-reply': ({ to, seats, startedAt, events }) => { if (to === me.playerId) merge(events || [], seats, startedAt) }
      }
    })
    channelRef.current = channel
    return () => {
      channel.leave()
      clearTimeout(saveTimer.current)
      if (recordRef.current) saveGameRecord(gameId, recordRef.current)
    }
  }, [gameId, me.playerId, me.name, merge, practice])

  // `fields.by` may name another seat on the practice table (one person plays all of them).
  const dispatch = useCallback((type, fields) => {
    const event = { id: randomId(12), ts: Date.now(), by: me.playerId, type, ...fields }
    merge([event])
    channelRef.current?.send('evt', event)
  }, [me.playerId, merge])

  /** Sends a board's public part (snapshot from lib/table/board.js) to the table. */
  const publishBoard = useCallback((owner, snapshot) => {
    const message = { owner, v: Date.now(), ...snapshot }
    if (owner === me.playerId) myBoardRef.current = message
    setBoards(prev => ({ ...prev, [owner]: message }))
    channelRef.current?.send('board', message)
  }, [me.playerId])

  const state = useMemo(() => foldGame(record?.seats, record?.events || []), [record])

  return { record, state, online: practice ? (record?.seats || []) : online, status, dispatch, boards, publishBoard, practice }
}
