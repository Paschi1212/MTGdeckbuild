// Boosters from a set's cards (see netlify/functions/draft-data.js for the card shape).
//
//   normal    — 15 cards, like a draft booster: 1 rare or mythic (about 1 in 8 is mythic),
//               3 uncommons, 10 commons, 1 basic land (no special sheets or foils)
//   commander — 20 cards like Commander Legends: 2 legendary creatures (from the set, or
//               from all of Magic when the set has too few), 1 rare/mythic, 3 uncommons, 14 commons

export const MODES = {
  normal: { label: 'Draft', packSize: 15, picksPerTurn: 1, minDeck: 40, life: 20 },
  commander: { label: 'Commander-Draft', packSize: 20, picksPerTurn: 2, minDeck: 60, life: 40 }
}
export const ROUNDS = 3

let uidCounter = 0
const uid = () => `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

function randomInt(max) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % max
}

// `count` different cards from `list` (fewer if the list is shorter), avoiding names in `taken`.
function draw(list, count, taken) {
  const pool = list.filter(card => !taken.has(card.n))
  const picked = []
  while (picked.length < count && pool.length) {
    const card = pool.splice(randomInt(pool.length), 1)[0]
    taken.add(card.n)
    picked.push(card)
  }
  return picked
}

const MIN_SET_LEGENDS = 8

/**
 * One booster. `setCards`: the set's cards, `legends`: legendary creatures of all Magic
 * (commander mode, used when the set has fewer than 8).
 */
export function makePack(setCards, mode, legends = []) {
  const playable = setCards.filter(card => !card.basic)
  const byRarity = (r) => playable.filter(card => card.r === r)
  const commons = byRarity('c')
  const uncommons = byRarity('u')
  const rares = byRarity('r')
  const mythics = byRarity('m')
  const taken = new Set()
  const cards = []

  if (mode === 'commander') {
    const setLegends = playable.filter(card => card.leg)
    cards.push(...draw(setLegends.length >= MIN_SET_LEGENDS ? setLegends : [...setLegends, ...legends], 2, taken))
  }
  const rareSlot = mythics.length && randomInt(8) === 0 ? mythics : rares.length ? rares : mythics
  cards.push(...draw(rareSlot.length ? rareSlot : uncommons, 1, taken))
  cards.push(...draw(uncommons.length ? uncommons : commons, 3, taken))
  const size = MODES[mode].packSize
  const basics = setCards.filter(card => card.basic)
  const commonCount = size - cards.length - (mode === 'normal' && basics.length ? 1 : 0)
  cards.push(...draw(commons.length ? commons : playable, commonCount, taken))
  if (mode === 'normal' && basics.length) cards.push(...draw(basics, 1, new Set()))
  // Small or odd sets: fill up from anything left so every pack has its full size.
  if (cards.length < size) cards.push(...draw(playable, size - cards.length, taken))

  return { id: uid(), cards: cards.map(card => ({ ...card, uid: uid() })) }
}

/** Every player's three boosters: { [playerId]: [pack, pack, pack] }. `setsByRound`: [code ×3]. */
export function makeAllPacks(playerIds, setsByRound, cardsBySet, mode, legends) {
  return Object.fromEntries(playerIds.map(playerId => [
    playerId,
    setsByRound.map(code => makePack(cardsBySet[code] || [], mode, legends))
  ]))
}

const RARITY_ORDER = { m: 0, r: 1, u: 2, c: 3 }
export const byRarity = (a, b) => (RARITY_ORDER[a.r] ?? 4) - (RARITY_ORDER[b.r] ?? 4)

// What the timer (or a player who left) takes: in a commander draft a legend first, otherwise
// the rarest cards — a simple, predictable choice the others can live with.
export function autoPick(pack, count, mode) {
  return [...pack.cards]
    .sort((a, b) => (mode === 'commander' ? (b.leg - a.leg) : 0) || byRarity(a, b))
    .slice(0, count)
    .map(card => card.uid)
}

// Pool order: colors W U B R G, then multicolored, colorless, lands — by mana value inside.
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G']
export function sortPool(cards) {
  const colorKey = (card) => {
    const ci = String(card.ci || '')
    if (!ci) return /Land/.test(card.t) ? 7 : 6
    if (ci.length > 1) return 5
    return COLOR_ORDER.indexOf(ci)
  }
  return [...cards].sort((a, b) => colorKey(a) - colorKey(b) || (a.cmc || 0) - (b.cmc || 0) || a.n.localeCompare(b.n))
}
