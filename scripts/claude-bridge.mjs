/**
 * Claude-Modus bridge — `npm run claude-bridge`
 *
 * A tiny local server (127.0.0.1 only) that runs this app's own AI functions (audit-deck,
 * chat-assistant, analyze-deck, suggest-commanders) with AI_PROVIDER=claude, so they answer
 * with Claude through the Claude Code CLI login on THIS computer instead of Gemini on Netlify.
 * The website (online or local dev) detects it and offers the "Claude-Modus" switch.
 *
 * Same request/response format as the Netlify functions, same code — only the model call
 * differs (see netlify/functions/lib/claude-cli.cjs). No time limit, unlike Netlify's 30s.
 * Only pages from the app's own origins may call it (checked on every request), and Claude
 * only gets the read-only MTG tools.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { readBrain, appendDeckLog, vaultPath, vaultAvailable } from './obsidian-brain.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Everything the bridge window shows also goes to claude-bridge.log (fresh on every start,
// gitignored) — so a start that fails or a window that was closed can still be diagnosed.
const LOG_FILE = path.join(root, 'claude-bridge.log')
try { fs.writeFileSync(LOG_FILE, `Start ${new Date().toLocaleString('de-DE')} · Node ${process.version}\n`) } catch {}
for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console)
  console[level] = (...args) => {
    original(...args)
    try { fs.appendFileSync(LOG_FILE, args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ') + '\n') } catch {}
  }
}
process.on('uncaughtException', error => {
  console.error('❌ Unerwarteter Fehler — bitte diese Meldung weitergeben:', error)
  process.exit(1)
})

dotenv.config({ path: path.join(root, '.env') })
process.env.AI_PROVIDER = 'claude'

const require = createRequire(import.meta.url)
const { runClaudeCli, withClaudeRequest } = require(path.join(root, 'netlify/functions/lib/claude-cli.cjs'))

const PORT = Number(process.env.CLAUDE_BRIDGE_PORT || 8787)
// The website sends the model picked on /claude-modus (X-Claude-Model); anything else falls
// back to this default. Aliases — the CLI resolves each to the newest model of that family.
const MODELS = ['opus', 'sonnet', 'haiku']
const MODEL = MODELS.includes(process.env.CLAUDE_MODEL) ? process.env.CLAUDE_MODEL : 'opus'
const AI_FUNCTIONS = ['audit-deck', 'chat-assistant', 'analyze-deck', 'suggest-commanders']
const ALLOWED_ORIGINS = new Set([
  'https://mtgepicdeckbuilder.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
])
const MAX_BODY_BYTES = 20 * 1024 * 1024

// Filled by the self-test: is the CLI there and logged in? Re-run on a status check while
// not ready (at most every 15s), so logging in later needs no bridge restart.
const status = { ready: false, checking: true, error: null }
const SELF_TEST_RETRY_MS = 15000
let lastSelfTestAt = 0
let activeRequests = 0

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Claude-Model',
    'Access-Control-Expose-Headers': 'X-AI-Provider, X-AI-Model',
    // Chrome's local-network protection: a public site calling 127.0.0.1 needs this on the
    // preflight (plus the one-time permission prompt in the browser).
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  }
}

function send(res, statusCode, body, origin, extraHeaders = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', ...corsHeaders(origin), ...extraHeaders })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Anfrage zu groß'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const handlers = new Map()
function getHandler(name) {
  if (!handlers.has(name)) {
    handlers.set(name, require(path.join(root, 'netlify/functions', `${name}.cjs`)).handler)
  }
  return handlers.get(name)
}

const time = () => new Date().toLocaleTimeString('de-DE')

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  // A browser always sends Origin on these cross-origin calls; anything from a page that is
  // not this app is refused before it can spend Claude usage.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { error: 'Origin nicht erlaubt' }, origin)
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    return res.end()
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    if (!status.ready && !status.checking && Date.now() - lastSelfTestAt > SELF_TEST_RETRY_MS) selfTest()
    return send(res, 200, { ok: true, provider: 'claude', model: MODEL, models: MODELS, ...status, activeRequests, brain: await vaultAvailable() }, origin)
  }

  // ── Obsidian brain (scripts/obsidian-brain.mjs) ──────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/brain') {
    try {
      const brain = await readBrain({ deck: url.searchParams.get('deck') || '', commander: url.searchParams.get('commander') || '' })
      return send(res, 200, brain, origin)
    } catch (error) {
      return send(res, 500, { error: 'Obsidian lesen fehlgeschlagen', message: error.message }, origin)
    }
  }

  if (req.method === 'POST' && url.pathname === '/brain/log') {
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return send(res, 415, { error: 'Content-Type application/json erforderlich' }, origin)
    }
    try {
      const { deck, commander, title, lines } = JSON.parse(await readBody(req))
      const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
      const entryLines = (Array.isArray(lines) ? lines : []).map(line => text(line, 600)).filter(Boolean).slice(0, 40)
      if (!entryLines.length || (!deck && !commander)) return send(res, 400, { error: 'deck/commander und lines erforderlich' }, origin)
      const file = await appendDeckLog({ deck: text(deck, 120), commander: text(commander, 120), title: text(title, 120) || 'Eintrag', lines: entryLines })
      console.log(`[${time()}] 🧠 Logbuch → ${file}`)
      return send(res, 200, { ok: true, file }, origin)
    } catch (error) {
      console.error(`[${time()}] 🧠 Logbuch fehlgeschlagen:`, error.message)
      return send(res, 500, { error: 'Obsidian schreiben fehlgeschlagen', message: error.message }, origin)
    }
  }

  const match = url.pathname.match(/^\/\.netlify\/functions\/([a-z-]+)$/)
  if (!match || !AI_FUNCTIONS.includes(match[1])) {
    return send(res, 404, { error: 'Unbekannter Endpunkt' }, origin)
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST' }, origin)
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return send(res, 415, { error: 'Content-Type application/json erforderlich' }, origin)
  }
  if (!status.ready) {
    return send(res, 503, { error: 'Claude-Brücke nicht bereit', message: status.error || 'Selbsttest läuft noch' }, origin)
  }

  const name = match[1]
  const requestedModel = String(req.headers['x-claude-model'] || '').toLowerCase()
  const claudeRequest = { model: MODELS.includes(requestedModel) ? requestedModel : MODEL, modelsUsed: new Set() }
  const startedAt = Date.now()
  activeRequests++
  console.log(`[${time()}] → ${name} (${claudeRequest.model}) …`)
  try {
    const body = await readBody(req)
    const event = {
      httpMethod: 'POST',
      path: url.pathname,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body,
      isBase64Encoded: false
    }
    const result = await withClaudeRequest(claudeRequest, () => getHandler(name)(event))
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    const answeredBy = [...claudeRequest.modelsUsed].join(', ') || claudeRequest.model
    console.log(`[${time()}] ← ${name} ${result.statusCode} nach ${seconds}s (${answeredBy})`)
    send(res, result.statusCode || 200, result.body ?? '', origin, { 'X-AI-Provider': 'claude', 'X-AI-Model': answeredBy })
  } catch (error) {
    console.error(`[${time()}] ✗ ${name}:`, error.message)
    send(res, 500, { error: 'Claude-Brücke: Fehler', message: error.message }, origin)
  } finally {
    activeRequests--
  }
})

async function selfTest() {
  status.checking = true
  lastSelfTestAt = Date.now()
  try {
    await runClaudeCli({ prompt: 'Antworte nur mit: OK', model: 'haiku' })
    status.ready = true
    status.error = null
    console.log('✅ Claude-CLI angemeldet — Claude-Modus bereit.')
    console.log(`   Website öffnen, oben auf den KI-Schalter klicken. Modell wählst du auf /claude-modus (Standard: ${MODEL}).`)
  } catch (error) {
    status.ready = false
    status.error = error.message
    console.error(`❌ Selbsttest fehlgeschlagen: ${error.message}`)
  } finally {
    status.checking = false
  }
}

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} ist belegt — läuft die Brücke schon in einem anderen Fenster?`)
    process.exit(1)
  }
  throw error
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🧠 Claude-Brücke läuft auf http://127.0.0.1:${PORT} — prüfe Claude-Login …`)
  console.log('   (Fenster offen lassen; beenden mit Strg+C)')
  vaultAvailable().then(ok => console.log(ok ? `🧠 Obsidian-Gehirn: ${vaultPath()}` : `⚠️ Obsidian-Tresor nicht gefunden (${vaultPath()}) – Analysen laufen ohne Gehirn.`))
  selfTest()
})
