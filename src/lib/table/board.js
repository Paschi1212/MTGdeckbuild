import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCardData } from '../cardData'

// A player's cards at the table, like the Live Tester:
//   private (never leaves this browser): library order, hand
//   public (sent to everyone as a snapshot of this player's board): battlefield with positions
//   and tapped state, graveyard, exile, command zone — plus how many cards are in hand/library.
// Each player is the only one who changes their own cards (as at a real table), so boards never
// conflict: the newest snapshot of a player is simply that player's board.
// One browser usually runs one board; on the practice table it runs all of them.

// Battlefield coordinates are virtual (BF_W × BF_H), so every screen draws the same layout,
// just scaled — a card at the right edge on your screen is at the right edge everywhere.
export const BF_W = 1000
export const BF_H = 500
export const CARD_W = 70
export const CARD_H = 98

const BOARDS_PREFIX = 'mtg_table_boards:'
export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command']
export const ZONE_LABEL = {
  library: 'Bibliothek', hand: 'Hand', battlefield: 'Spielfeld', graveyard: 'Friedhof', exile: 'Exil', command: 'Commandzone'
}

function shuffle(cards) {
  const result = [...cards]
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const sameName = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()

/** A fresh game: commander in the command zone, the rest shuffled, seven drawn. */
export function createBoard(deck, idPrefix) {
  let n = 0
  const instances = []
  let commanderPlaced = false
  for (const card of deck?.cards || []) {
    for (let i = 0; i < (card.count || 1); i++) {
      const isCommander = !commanderPlaced && sameName(card.name, deck.commander)
      if (isCommander) commanderPlaced = true
      instances.push({ iid: `${idPrefix}-${n++}`, name: card.name, scryfallId: card.scryfallId || '', image: null, commander: isCommander })
    }
  }
  // A commander that isn't in the list itself (drafts keep it apart) still gets its card.
  if (!commanderPlaced && deck?.commander) {
    instances.push({ iid: `${idPrefix}-${n++}`, name: deck.commander, scryfallId: '', image: null, commander: true })
  }
  const library = shuffle(instances.filter(card => !card.commander))
  return {
    library: library.slice(7),
    hand: library.slice(0, 7),
    battlefield: [],
    graveyard: [],
    exile: [],
    command: instances.filter(card => card.commander),
    mulligans: 0
  }
}

const publicCard = ({ iid, name, image, tapped, x, y, commander }) => ({ iid, name, image, tapped: Boolean(tapped), x, y, commander: Boolean(commander) })

export function publicSnapshot(board) {
  return {
    battlefield: board.battlefield.map(publicCard),
    graveyard: board.graveyard.map(publicCard),
    exile: board.exile.map(publicCard),
    command: board.command.map(publicCard),
    hand: board.hand.length,
    library: board.library.length
  }
}

// Next free spot on the battlefield for a card played without dragging it somewhere.
function freeSpot(battlefield) {
  for (let y = 20; y <= BF_H - CARD_H; y += CARD_H + 20) {
    for (let x = 20; x <= BF_W - CARD_W; x += CARD_W + 14) {
      if (!battlefield.some(card => Math.abs(card.x - x) < CARD_W * 0.6 && Math.abs(card.y - y) < CARD_H * 0.6)) return { x, y }
    }
  }
  return { x: 20 + (battlefield.length % 10) * 8, y: 20 + (battlefield.length % 10) * 8 }
}

export const clampPos = (x, y, tapped) => ({
  x: Math.round(Math.max(0, Math.min(BF_W - (tapped ? CARD_H : CARD_W), x))),
  y: Math.round(Math.max(0, Math.min(BF_H - (tapped ? CARD_W : CARD_H), y)))
})

export function findCard(board, iid) {
  for (const zone of ZONES) {
    const card = board[zone].find(c => c.iid === iid)
    if (card) return { zone, card }
  }
  return null
}

/**
 * One action on a board → { board, note, castCommander }. `note`: the line for the table's
 * log (cards from hidden zones stay hidden where it matters), null if nothing to tell.
 */
export function applyAction(board, action) {
  switch (action.type) {
    case 'move': {
      const found = findCard(board, action.iid)
      if (!found) return { board, note: null }
      const { zone: from, card } = found
      const { to, at } = action
      if (from === to && to !== 'battlefield') return { board, note: null }
      const next = { ...board, [from]: board[from].filter(c => c.iid !== action.iid) }
      if (to === 'battlefield') {
        const tapped = from === 'battlefield' ? card.tapped : false
        const spot = at && typeof at === 'object' ? at : (from === 'battlefield' ? { x: card.x, y: card.y } : freeSpot(next.battlefield))
        next.battlefield = [...next.battlefield, { ...card, tapped, ...clampPos(spot.x, spot.y, tapped) }] // last = on top
      } else {
        const { x, y, tapped, ...rest } = card
        next[to] = to === 'library' ? (at === 'bottom' ? [...next[to], rest] : [rest, ...next[to]]) : [...next[to], rest]
      }
      const name = card.name
      let note = null
      if (from === to) note = null
      else if (to === 'battlefield') note = from === 'command' ? `wirkt den Commander ${name}` : from === 'hand' ? `spielt ${name}` : `bringt ${name} aus ${ZONE_LABEL[from]} aufs Spielfeld`
      else if (to === 'graveyard') note = `legt ${name} ${from === 'library' ? 'aus der Bibliothek ' : from === 'hand' ? 'von der Hand ' : ''}auf den Friedhof`
      else if (to === 'exile') note = `schickt ${name} ${from === 'library' ? 'aus der Bibliothek ' : from === 'hand' ? 'von der Hand ' : ''}ins Exil`
      else if (to === 'hand') note = from === 'library' ? 'nimmt eine Karte aus der Bibliothek auf die Hand' : `nimmt ${name} auf die Hand`
      else if (to === 'library') note = `legt ${from === 'hand' ? 'eine Karte' : name} ${at === 'bottom' ? 'unter' : 'oben auf'} die Bibliothek`
      else if (to === 'command') note = `bringt ${name} zurück in die Commandzone`
      return { board: next, note, castCommander: from === 'command' && to === 'battlefield' }
    }
    case 'tap':
      return {
        board: { ...board, battlefield: board.battlefield.map(c => (c.iid === action.iid ? { ...c, tapped: !c.tapped, ...clampPos(c.x, c.y, !c.tapped) } : c)) },
        note: null
      }
    case 'position':
      return {
        board: { ...board, battlefield: [...board.battlefield.filter(c => c.iid !== action.iid), ...board.battlefield.filter(c => c.iid === action.iid).map(c => ({ ...c, ...clampPos(action.x, action.y, c.tapped) }))] },
        note: null
      }
    case 'untapAll':
      return { board: { ...board, battlefield: board.battlefield.map(c => ({ ...c, tapped: false })) }, note: 'enttappt alles' }
    case 'draw': {
      const drawn = board.library.slice(0, action.count || 1)
      if (!drawn.length) return { board, note: null }
      return { board: { ...board, library: board.library.slice(drawn.length), hand: [...board.hand, ...drawn] }, note: drawn.length === 1 ? 'zieht eine Karte' : `zieht ${drawn.length} Karten` }
    }
    case 'shuffle':
      return { board: { ...board, library: shuffle(board.library) }, note: 'mischt die Bibliothek' }
    case 'mulligan': {
      const library = shuffle([...board.library, ...board.hand])
      const count = (board.mulligans || 0) + 1
      return { board: { ...board, library: library.slice(7), hand: library.slice(0, 7), mulligans: count }, note: `nimmt einen Mulligan (${count}.)` }
    }
    case 'mill': {
      const milled = board.library.slice(0, action.count || 1)
      if (!milled.length) return { board, note: null }
      return { board: { ...board, library: board.library.slice(milled.length), graveyard: [...board.graveyard, ...milled] }, note: `fräst ${milled.length}: ${milled.map(c => c.name).join(', ')}` }
    }
    case 'arrangeTop': {
      // After looking at the top cards: `keep` (in this order) back on top, `bottom` below, `grave` to the graveyard.
      const { keep, bottom, grave } = action
      const touched = new Set([...keep, ...bottom, ...grave].map(c => c.iid))
      const rest = board.library.filter(c => !touched.has(c.iid))
      const total = keep.length + bottom.length + grave.length
      return {
        board: { ...board, library: [...keep, ...rest, ...bottom], graveyard: [...board.graveyard, ...grave] },
        note: `schaut sich die obersten ${total} Karten an${bottom.length ? ` (${bottom.length} nach unten)` : ''}${grave.length ? `, ${grave.map(c => c.name).join(', ')} auf den Friedhof` : ''}`
      }
    }
    default:
      return { board, note: null }
  }
}

function loadBoards(gameId) {
  try { return JSON.parse(localStorage.getItem(BOARDS_PREFIX + gameId) || 'null') } catch { return null }
}

function saveBoards(gameId, boards) {
  try { localStorage.setItem(BOARDS_PREFIX + gameId, JSON.stringify(boards)) } catch {}
}

/**
 * The boards this browser runs: `controlled` = [{ playerId, deck }] (one seat online, all seats
 * on the practice table). `publish(owner, snapshot)` sends a board's public part to the table,
 * `onAction(owner, result)` gets each applied action's note/commander cast for the log.
 */
export function useOwnBoards(gameId, controlled, { publish, onAction }) {
  const [boards, setBoards] = useState(() => {
    const saved = loadBoards(gameId) || {}
    for (const seat of controlled) {
      if (!saved[seat.playerId] && seat.deck) saved[seat.playerId] = createBoard(seat.deck, seat.playerId.slice(0, 6))
    }
    return saved
  })
  const boardsRef = useRef(boards)
  const timers = useRef({})

  const commit = useCallback((owner, board) => {
    const next = { ...boardsRef.current, [owner]: board }
    boardsRef.current = next
    setBoards(next)
    saveBoards(gameId, next)
    clearTimeout(timers.current[owner])
    timers.current[owner] = setTimeout(() => publish(owner, publicSnapshot(board)), 60)
  }, [gameId, publish])

  // Publish every board once (others may have missed the last state) and on request.
  const republish = useCallback(() => {
    for (const [owner, board] of Object.entries(boardsRef.current)) publish(owner, publicSnapshot(board))
  }, [publish])
  useEffect(() => { republish() }, [republish])

  // Card images: from the browser cache or Scryfall, filled into every copy on every board.
  useEffect(() => {
    const all = Object.values(boardsRef.current).flatMap(board => ZONES.flatMap(zone => board[zone]))
    if (all.every(card => card.image)) return undefined
    let cancelled = false
    loadCardData({
      ids: all.map(card => card.scryfallId).filter(Boolean),
      names: all.filter(card => !card.scryfallId).map(card => card.name),
      isCancelled: () => cancelled,
      onUpdate: ({ byId, byName }) => {
        for (const [owner, board] of Object.entries(boardsRef.current)) {
          let changed = false
          const fill = (card) => {
            if (card.image) return card
            const image = (card.scryfallId && byId[card.scryfallId]?.image) || byName[card.name]?.image
            if (!image) return card
            changed = true
            return { ...card, image }
          }
          const next = Object.fromEntries(ZONES.map(zone => [zone, board[zone].map(fill)]))
          if (changed) commit(owner, { ...board, ...next })
        }
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])

  const act = useCallback((owner, action) => {
    const board = boardsRef.current[owner]
    if (!board) return
    const result = applyAction(board, action)
    if (result.board !== board) commit(owner, result.board)
    if (result.note || result.castCommander) onAction(owner, result)
  }, [commit, onAction])

  return { boards, act, republish }
}
