import crypto from 'node:crypto'

/**
 * A player's id at the game table: stable per account, but not the e-mail address — other
 * players see it in lobbies and deck shares, so it must not reveal who someone is beyond the
 * display name. Derived with the server's session secret, so nobody can compute it from an
 * address either.
 */
export function playerIdFor(email) {
  return crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(`player:${String(email || '').trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 20)
}
