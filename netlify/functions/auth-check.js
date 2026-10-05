import { parseSessionCookie } from './lib/session.js'
import { playerIdFor } from './lib/player-id.js'

export const handler = async (event) => {
  const session = parseSessionCookie(event.headers.cookie)

  if (!session) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not authenticated' })
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      user: {
        email: session.email,
        name: session.name,
        // Identity at the game table (lobbies, deck shares) — see lib/player-id.js.
        playerId: playerIdFor(session.email)
      }
    })
  }
}
