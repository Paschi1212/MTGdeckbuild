import { clearSessionCookie } from './lib/session.js'

export const handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': clearSessionCookie()
    },
    body: JSON.stringify({ ok: true })
  }
}
