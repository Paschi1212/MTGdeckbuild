/**
 * Signed, HttpOnly cookie-based session (no database in this app)
 */

import jwt from 'jsonwebtoken'
import { stringifySetCookie, parseCookie } from 'cookie'

const COOKIE_NAME = 'mtg_session'
const SESSION_TTL = '30d'

function isHostedEnvironment() {
  // `netlify functions:serve` / `netlify dev` set NETLIFY_DEV=true locally;
  // it's unset on an actual Netlify deploy (production, deploy previews, branch deploys).
  return process.env.NETLIFY_DEV !== 'true'
}

export function createSessionCookie(payload) {
  const token = jwt.sign(payload, process.env.SESSION_SECRET, { expiresIn: SESSION_TTL })

  return stringifySetCookie({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isHostedEnvironment(),
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  })
}

export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null

  const cookies = parseCookie(cookieHeader)
  const token = cookies[COOKIE_NAME]

  if (!token) return null

  try {
    return jwt.verify(token, process.env.SESSION_SECRET)
  } catch (error) {
    return null
  }
}

export function clearSessionCookie() {
  return stringifySetCookie({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isHostedEnvironment(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })
}
