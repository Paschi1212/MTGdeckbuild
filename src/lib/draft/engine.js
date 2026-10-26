import { MODES, ROUNDS, autoPick } from './packs'

// The draft itself, run by the host's browser: who holds which booster, who picked what.
// Plain functions on a plain object, so it can be stored, reloaded and tested.
//
//   state = { mode, seats: [playerId…], names, round, packs: { pid: [3 boosters] },
//             queues: { pid: [booster…] }, pools: { pid: [cards] }, picksInPack: { pid: n },
//             deadlines: { pid: ts }, timer: bool, phase: 'drafting' | 'building' }
//
// Boosters go left in rounds 1 and 3, right in round 2. Each player holds a queue: the booster
// in front is the one to pick from, the next ones wait (when a neighbour is faster).

export function startDraft({ mode, seats, names, packs, timer }) {
  return openRound({
    mode,
    seats: [...seats],
    names,
    round: -1,
    packs,
    queues: {},
    pools: Object.fromEntries(seats.map(pid => [pid, []])),
    picksInPack: {},
    deadlines: {},
    timer: Boolean(timer),
    phase: 'drafting'
  })
}

// Seconds for a pick: plenty for the first, less as the booster empties.
export function secondsForPick(mode, pickIndex) {
  return mode === 'commander' ? Math.max(20, 80 - pickIndex * 6) : Math.max(15, 60 - pickIndex * 4)
}

function withDeadline(state, pid, now) {
  if (!state.timer || !state.queues[pid]?.length) {
    const { [pid]: _, ...rest } = state.deadlines
    return { ...state, deadlines: rest }
  }
  return { ...state, deadlines: { ...state.deadlines, [pid]: now + secondsForPick(state.mode, state.picksInPack[pid] || 0) * 1000 } }
}

function openRound(state, now = Date.now()) {
  const round = state.round + 1
  if (round >= ROUNDS) return { ...state, round: ROUNDS - 1, queues: {}, deadlines: {}, phase: 'building' }
  let next = {
    ...state,
    round,
    queues: Object.fromEntries(state.seats.map(pid => [pid, [state.packs[pid][round]]])),
    picksInPack: Object.fromEntries(state.seats.map(pid => [pid, 0])),
    deadlines: {}
  }
  for (const pid of state.seats) next = withDeadline(next, pid, now)
  return next
}

export const direction = (round) => (round === 1 ? -1 : 1)

export function neighbour(state, pid) {
  const index = state.seats.indexOf(pid)
  const n = state.seats.length
  return state.seats[(index + direction(state.round) + n) % n]
}

/** A player takes cards (`uids`) from the booster in front of them. Returns the new state or null. */
export function pick(state, pid, packId, uids, now = Date.now()) {
  if (state.phase !== 'drafting') return null
  const queue = state.queues[pid] || []
  const pack = queue[0]
  if (!pack || pack.id !== packId) return null
  const want = Math.min(MODES[state.mode].picksPerTurn, pack.cards.length)
  const chosen = [...new Set(uids)].filter(id => pack.cards.some(card => card.uid === id))
  if (chosen.length !== want) return null

  const taken = pack.cards.filter(card => chosen.includes(card.uid))
  const rest = { ...pack, cards: pack.cards.filter(card => !chosen.includes(card.uid)) }
  const to = neighbour(state, pid)
  const queues = { ...state.queues, [pid]: queue.slice(1) }
  if (rest.cards.length) queues[to] = [...(to === pid ? queues[pid] : queues[to] || []), rest]
  let next = {
    ...state,
    queues,
    pools: { ...state.pools, [pid]: [...state.pools[pid], ...taken] },
    picksInPack: { ...state.picksInPack, [pid]: (state.picksInPack[pid] || 0) + 1 }
  }
  next = withDeadline(next, pid, now)
  // The neighbour's front booster only changes when their queue was empty before.
  if (to !== pid && (state.queues[to] || []).length === 0) next = withDeadline(next, to, now)

  // Every booster of this round taken apart: open the next ones.
  if (Object.values(next.queues).every(q => q.length === 0)) next = openRound(next, now)
  return next
}

/** Timer: whoever is past their deadline gets the automatic pick. Returns the new state (or the same). */
export function expire(state, now = Date.now()) {
  if (!state.timer || state.phase !== 'drafting') return state
  let next = state
  for (const [pid, deadline] of Object.entries(state.deadlines)) {
    if (deadline > now) continue
    const pack = next.queues[pid]?.[0]
    if (!pack) continue
    const count = Math.min(MODES[next.mode].picksPerTurn, pack.cards.length)
    next = pick(next, pid, pack.id, autoPick(pack, count, next.mode), now) || next
  }
  return next
}

/** What one player needs to see: their booster, their pool, how the others are doing. */
export function viewFor(state, pid) {
  return {
    phase: state.phase,
    mode: state.mode,
    round: state.round,
    direction: direction(state.round),
    pack: state.queues[pid]?.[0] || null,
    waiting: Math.max(0, (state.queues[pid]?.length || 0) - 1),
    pool: state.pools[pid] || [],
    deadline: state.deadlines[pid] || null,
    pickNumber: (state.picksInPack[pid] || 0) + 1,
    table: state.seats.map(seat => ({ playerId: seat, name: state.names[seat], holding: state.queues[seat]?.length || 0, picked: state.pools[seat]?.length || 0 }))
  }
}
