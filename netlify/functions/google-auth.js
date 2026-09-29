import { OAuth2Client } from 'google-auth-library'
import { createSessionCookie } from './lib/session.js'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly'
]

function client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export const handler = async (event) => {
  const { code, state } = event.queryStringParameters || {}
  const oauth2Client = client()

  // Step 2: Google redirected back with an authorization code
  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code)
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID
      })
      const { email, name } = ticket.getPayload()

      const cookie = createSessionCookie({
        email,
        name,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiry: tokens.expiry_date
      })

      // `state` carries the frontend origin (see below) — in this local dev
      // setup, the functions server (port 9000) and the Vite app (a
      // different port) are separate origins, so a plain "/" would resolve
      // against the functions server instead of the actual app.
      return {
        statusCode: 302,
        headers: {
          Location: state ? `${state}/` : '/',
          'Set-Cookie': cookie
        },
        body: ''
      }
    } catch (error) {
      console.error('[Auth] Error exchanging code:', error)

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Authentication failed',
          message: error.message,
          details: error.response?.data || null
        })
      }
    }
  }

  // Step 1: start the login flow
  const referer = event.headers.referer || event.headers.Referer
  const returnOrigin = referer ? new URL(referer).origin : undefined

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    ...(returnOrigin ? { state: returnOrigin } : {})
  })

  return {
    statusCode: 302,
    headers: {
      Location: authUrl
    },
    body: ''
  }
}
