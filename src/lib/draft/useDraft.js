import { useCallback, useEffect, useRef, useState } from 'react'
import { joinChannel } from '../table/realtime'
import { startDraft, pick as applyPick, expire, viewFor, botMove } from './engine'
import { makeAllPacks, MODES, BOT_NAMES } from './packs'

// A draft lives on the live channel "draft:<id>". The host's browser runs it (lib/draft/engine.js)
// and keeps it in localStorage, so a reload continues where it was. Everyone else sends picks and
// gets back only their own booster and pool ("view") plus how far the others are ("table").

const STATE_KEY = 'mtg_draft_state:' // host: the whole draft
const VIEW_KEY = 'mtg_draft_view:' // everyone: the last own view (for deck building after a reload)

const load = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }

async function fetchJson(url) {
  const response = await fetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.error || `Fehler ${response.status}`)
  return data
}

/** Cards of the chosen sets (and, for a commander draft, the legends fallback). */
export async function loadDraftCards(sets, mode) {
  const unique = [...new Set(sets)]
  const cardsBySet = {}
  for (const code of unique) cardsBySet[code] = (await fetchJson(`/.netlify/functions/draft-data?set=${encodeURIComponent(code)}`)).cards
  const legends = mode === 'commander' ? (await fetchJson('/.netlify/functions/draft-data?legends=1')).cards : []
  return { cardsBySet, legends }
}

export function useDraft(draftId, me, { isHost }) {
  const [view, setView] = useState(() => load(VIEW_KEY + draftId))
  const [table, setTable] = useState(() => load(VIEW_KEY + draftId)?.table || [])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('connecting')
  const [toTable, setToTable] = useState(null) // the host sent everyone to the game table
  const channelRef = useRef(null)
  const stateRef = useRef(isHost ? load(STATE_KEY + draftId) : null)
  const sentRef = useRef({}) // host: last view sent per player (only changes go out)
  const mineRef = useRef({ ready: false, deck: null })

  const showMine = useCallback((nextView) => {
    setView(nextView)
    setTable(nextView.table)
    save(VIEW_KEY + draftId, nextView)
  }, [draftId])

  // Host: after every change, store the draft and send each player what changed for them.
  const publish = useCallback((state, { force = false } = {}) => {
    stateRef.current = state
    save(STATE_KEY + draftId, state)
    for (const pid of state.seats) {
      const { table: summary, ...own } = viewFor(state, pid)
      const text = JSON.stringify(own)
      if (pid === me.playerId) { showMine({ ...own, table: summary }); continue }
      if (!force && sentRef.current[pid] === text) continue
      sentRef.current[pid] = text
      channelRef.current?.send('view', { to: pid, view: own })
    }
    const summary = viewFor(state, state.seats[0]).table
    setTable(summary)
    channelRef.current?.send('table', { table: summary })
  }, [draftId, me.playerId, showMine])

  useEffect(() => {
    const channel = joinChannel(`draft:${draftId}`, {
      playerId: me.playerId,
      presence: { playerId: me.playerId, name: me.name, ...mineRef.current },
      onPresence: setMembers,
      onStatus: (next) => {
        setStatus(next)
        // (Re)connected: ask the host for the current booster.
        if (next === 'SUBSCRIBED' && !isHost) channelRef.current?.send('hello', { from: me.playerId })
        if (next === 'SUBSCRIBED' && isHost && stateRef.current) publish(stateRef.current, { force: true })
      },
      onBroadcast: {
        view: ({ to, view: own }) => {
          if (to !== me.playerId) return
          setView(prev => {
            const next = { ...own, table: prev?.table || [] }
            save(VIEW_KEY + draftId, next)
            return next
          })
        },
        table: ({ table: summary }) => {
          setTable(summary)
          setView(prev => (prev ? { ...prev, table: summary } : prev))
        },
        hello: ({ from }) => {
          if (!isHost || !stateRef.current || !stateRef.current.seats.includes(from)) return
          delete sentRef.current[from]
          publish(stateRef.current)
        },
        pick: ({ from, packId, uids }) => {
          if (!isHost || !stateRef.current) return
          const next = applyPick(stateRef.current, from, packId, uids)
          if (next) publish(next)
        },
        'to-table': (payload) => setToTable(payload)
      }
    })
    channelRef.current = channel
    return () => channel.leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, me.playerId, isHost])

  // Host: the pick timer, and the bots — each takes a moment per booster, like a person would.
  const botReadyAt = useRef({})
  useEffect(() => {
    if (!isHost) return undefined
    const timer = setInterval(() => {
      const state = stateRef.current
      if (!state || state.phase !== 'drafting') return
      let next = state.timer ? expire(state) : state
      const now = Date.now()
      for (const bot of next.bots || []) {
        const pack = next.queues[bot]?.[0]
        if (!pack) continue
        const ready = botReadyAt.current[bot]
        if (!ready || ready.packId !== pack.id) {
          botReadyAt.current[bot] = { packId: pack.id, at: now + 700 + Math.random() * 1300 }
          continue
        }
        if (now < ready.at) continue
        next = botMove(next, bot, now) || next
      }
      if (next !== state) publish(next)
    }, 400)
    return () => clearInterval(timer)
  }, [isHost, publish])

  /** Host: opens the boosters for these players and starts. */
  // Free seats up to settings.botsTo are filled with bots, seated at random between the players.
  const begin = useCallback(async ({ seats, names, settings }) => {
    const { cardsBySet, legends } = await loadDraftCards(settings.sets, settings.mode)
    const botCount = Math.max(0, Math.min(8, settings.botsTo || 0) - seats.length)
    const bots = BOT_NAMES.slice(0, botCount).map((name, index) => ({ id: `bot${index + 1}-${Math.random().toString(36).slice(2, 7)}`, name: `${name} (Bot)` }))
    const allSeats = [...seats, ...bots.map(bot => bot.id)]
      .map(id => ({ id, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(entry => entry.id)
    const allNames = { ...names, ...Object.fromEntries(bots.map(bot => [bot.id, bot.name])) }
    const packs = makeAllPacks(allSeats, settings.sets, cardsBySet, settings.mode, legends)
    publish(startDraft({ mode: settings.mode, seats: allSeats, names: allNames, packs, timer: settings.timer, bots: bots.map(bot => bot.id) }), { force: true })
  }, [publish])

  const pickCards = useCallback((packId, uids) => {
    if (isHost) {
      const next = applyPick(stateRef.current, me.playerId, packId, uids)
      if (next) publish(next)
      return
    }
    // Shown right away; the host's next view confirms it (or puts the booster back).
    setView(prev => (prev?.pack?.id === packId
      ? { ...prev, pool: [...prev.pool, ...prev.pack.cards.filter(card => uids.includes(card.uid))], pack: null, waiting: Math.max(0, prev.waiting - 1) }
      : prev))
    channelRef.current?.send('pick', { from: me.playerId, packId, uids })
  }, [isHost, me.playerId, publish])

  /** Deck building: tell the others you're ready (with your deck's face for the table). */
  const announce = useCallback((patch) => {
    mineRef.current = { ...mineRef.current, ...patch }
    channelRef.current?.track({ playerId: me.playerId, name: me.name, ...mineRef.current })
  }, [me.playerId, me.name])

  /** Host: everyone to the game table. */
  const sendToTable = useCallback((payload) => {
    channelRef.current?.send('to-table', payload)
    setToTable(payload)
  }, [])

  const hostState = stateRef.current
  return { view, table, members, status, begin, pickCards, announce, sendToTable, toTable, started: Boolean(view || hostState), modeInfo: view ? MODES[view.mode] : null }
}
