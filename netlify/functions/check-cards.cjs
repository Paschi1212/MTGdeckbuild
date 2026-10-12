/**
 * POST /.netlify/functions/check-cards
 * New cards (a booster display, a trade, a set from the collection) checked against all of
 * the player's decks: which card improves which deck, and what it would replace.
 *   { cards: [{ name, count }], decks: [{ name, commander, cards: [names], strategy }], preferences }
 */

const { checkCardsAgainstDecks } = require('./lib/gemini-api.cjs')

const MAX_CARDS = 400
const MAX_DECKS = 30

const text = (value, max) => String(value ?? '').trim().slice(0, max)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }
  try {
    const body = JSON.parse(event.body || '{}')
    const cards = (Array.isArray(body.cards) ? body.cards : [])
      .map(card => ({ name: text(card?.name ?? card, 150), count: Math.max(1, Number(card?.count) || 1) }))
      .filter(card => card.name)
      .slice(0, MAX_CARDS)
    const decks = (Array.isArray(body.decks) ? body.decks : [])
      .map(deck => ({
        name: text(deck?.name, 120),
        commander: text(deck?.commander, 200),
        strategy: text(deck?.strategy, 1200),
        cards: (Array.isArray(deck?.cards) ? deck.cards : []).map(name => text(name, 150)).filter(Boolean).slice(0, 150)
      }))
      .filter(deck => deck.name && deck.commander)
      .slice(0, MAX_DECKS)

    if (!cards.length || !decks.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Karten und mindestens ein Deck mit Commander nötig' }) }
    }

    const result = await checkCardsAgainstDecks({ cards, decks, preferences: text(body.preferences, 3000) })
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }
  } catch (error) {
    console.error('[API] check-cards:', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Prüfung fehlgeschlagen', message: error.message }) }
  }
}
