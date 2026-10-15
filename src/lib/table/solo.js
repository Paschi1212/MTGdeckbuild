import { randomId } from './realtime'
import { saveGameRecord } from './game'
import { loadCommanderCard } from './decks'

// "Live Tester": the game table with one seat — your deck alone, everything the table can do
// (phases, opening hand & mulligan, tokens, counters, piles). Local only, like the practice table.
export async function createSoloTable({ label, commander, cards }) {
  const card = await loadCommanderCard(commander)
  const playerId = `solo${randomId(8)}` // long enough for the board's card ids
  const count = cards.reduce((sum, c) => sum + (c.count || 1), 0)
  const seat = {
    playerId,
    name: label,
    deck: {
      label,
      source: 'solo',
      commander: card?.name || commander || '',
      commanderImage: card?.image || null,
      colorIdentity: card?.colorIdentity || [],
      count
    }
  }
  const gameId = `probe-${randomId(8)}`
  saveGameRecord(gameId, {
    practice: true,
    solo: true,
    seats: [seat],
    startedAt: Date.now(),
    events: [],
    decks: { [playerId]: { label, commander: card?.name || commander || '', cards } }
  })
  return gameId
}

/**
 * Opens the Live Tester in a new tab, so the deck being edited stays open (unsaved changes
 * included). The tab is opened right away — browsers only allow that directly on a click.
 */
export function openSoloTable({ label, commander, cards }) {
  const tab = window.open('', '_blank')
  return createSoloTable({ label, commander, cards }).then(gameId => {
    const url = `/spieltisch/${gameId}`
    if (tab) tab.location.href = url
    else window.location.href = url
  })
}
