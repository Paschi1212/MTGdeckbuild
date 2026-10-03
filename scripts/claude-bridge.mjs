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
 *
 * Tablet & phone: if Tailscale runs on this PC, the bridge also publishes itself inside the
 * user's private tailnet (scripts/tailscale-remote.mjs) — the server itself still only
 * listens on 127.0.0.1. AI calls run as jobs (POST /jobs/<function>, GET /jobs/<id>) so a
 * long analysis survives a locked tablet screen.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import { readBrain, appendDeckLog, vaultPath, vaultAvailable } from './obsidian-brain.mjs'
import { setupRemote } from './tailscale-remote.mjs'

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

// Tablet & phone access through Tailscale (scripts/tailscale-remote.mjs). Re-checked on a
// status request while not ready (at most every 30s), so starting Tailscale after the bridge
// needs no restart.
let remote = { state: 'checking' }
let remoteCheck = null
let lastRemoteCheckAt = 0
const REMOTE_RETRY_MS = 30000
function ensureRemote() {
  if (remoteCheck || remote.state === 'ready' || Date.now() - lastRemoteCheckAt < REMOTE_RETRY_MS) return remoteCheck
  lastRemoteCheckAt = Date.now()
  remoteCheck = setupRemote(PORT)
    .then(result => {
      const changed = result.state !== remote.state
      remote = result
      if (changed) {
        if (result.state === 'ready') console.log(`📱 Tablet & Handy: erreichbar über Tailscale unter ${result.url}`)
        else console.log(`📱 Tablet & Handy: ${result.hint}${result.link ? `\n   ${result.link}` : ''}`)
      }
      return result
    })
    .catch(error => { remote = { state: 'error', hint: error.message } })
    .finally(() => { remoteCheck = null })
  return remoteCheck
}

// AI calls as jobs: the page starts one (POST /jobs/<function>) and asks for the result
// (GET /jobs/<id>) — so an analysis keeps running here even if the tablet locks its screen or
// the browser drops the connection, and the page picks the result up when it comes back.
const jobs = new Map()
const JOB_TTL_MS = 60 * 60 * 1000
setInterval(() => {
  for (const [id, job] of jobs) {
    if (job.finishedAt && Date.now() - job.finishedAt > JOB_TTL_MS) jobs.delete(id)
  }
}, 5 * 60 * 1000).unref()

function corsHeaders(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  // Through `tailscale serve`, Tailscale names the person behind each request. Only the
  // account this PC is logged in with may use the bridge (relevant once a device or the
  // tailnet is ever shared with someone else).
  const tailscaleLogin = req.headers['tailscale-user-login']
  if (tailscaleLogin && remote.owner && String(tailscaleLogin).toLowerCase() !== remote.owner.toLowerCase()) {
    return send(res, 403, { error: 'Nur für das eigene Tailscale-Konto' }, origin)
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    return res.end()
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    if (!status.ready && !status.checking && Date.now() - lastSelfTestAt > SELF_TEST_RETRY_MS) selfTest()
    ensureRemote()
    const runningJobs = [...jobs.values()].filter(job => !job.finishedAt).length
    return send(res, 200, {
      ok: true, provider: 'claude', model: MODEL, models: MODELS, ...status, activeRequests, runningJobs,
      brain: await vaultAvailable(),
      remote: { state: remote.state, url: remote.url || null, hint: remote.hint || null, link: remote.link || null }
    }, origin)
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

  // ── AI jobs ──────────────────────────────────────────────────────────────────────────
  const jobResult = url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/)
  if (req.method === 'DELETE' && jobResult) {
    const job = jobs.get(jobResult[1])
    if (job && !job.finishedAt) {
      job.controller.abort()
      console.log(`[${time()}] ✋ Auftrag abgebrochen (durch eine neuere Anfrage ersetzt)`)
    }
    return send(res, 200, { ok: true }, origin)
  }
  if (req.method === 'GET' && jobResult) {
    const job = jobs.get(jobResult[1])
    if (!job) return send(res, 404, { error: 'Auftrag unbekannt', message: 'Die Brücke wurde inzwischen neu gestartet.' }, origin)
    const seconds = Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000)
    return send(res, 200, job.finishedAt
      ? { state: 'done', seconds, statusCode: job.statusCode, body: job.body, model: job.answeredBy }
      : { state: 'running', seconds, model: job.model }, origin)
  }

  const jobStart = url.pathname.match(/^\/jobs\/([a-z-]+)$/)
  const direct = url.pathname.match(/^\/\.netlify\/functions\/([a-z-]+)$/)
  const name = (jobStart || direct)?.[1]
  if (!name || !AI_FUNCTIONS.includes(name)) {
    return send(res, 404, { error: 'Unbekannter Endpunkt' }, origin)
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Nur POST' }, origin)
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return send(res, 415, { error: 'Content-Type application/json erforderlich' }, origin)
  }
  if (!status.ready) {
    return send(res, 503, { error: 'Claude-Brücke nicht bereit', message: status.error || 'Selbsttest läuft noch' }, origin)
  }

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    return send(res, 413, { error: error.message }, origin)
  }
  const requestedModel = String(req.headers['x-claude-model'] || '').toLowerCase()
  const model = MODELS.includes(requestedModel) ? requestedModel : MODEL
  const controller = new AbortController()
  const run = runFunction(name, body, model, req.headers, `/.netlify/functions/${name}`, url.searchParams, controller.signal)

  if (jobStart) {
    const id = randomUUID()
    const job = { model, startedAt: Date.now(), finishedAt: null, controller }
    jobs.set(id, job)
    run.then(result => Object.assign(job, result, { finishedAt: Date.now() }))
    return send(res, 202, { id }, origin)
  }

  // Direct call (pages loaded before jobs existed): answer on the same connection.
  const result = await run
  send(res, result.statusCode, result.body, origin, { 'X-AI-Provider': 'claude', 'X-AI-Model': result.answeredBy })
})

// Runs one of the app's Netlify AI functions with Claude. Never throws.
async function runFunction(name, body, model, headers, functionPath, searchParams, signal) {
  const claudeRequest = { model, modelsUsed: new Set(), signal }
  const startedAt = Date.now()
  activeRequests++
  console.log(`[${time()}] → ${name} (${model}) …`)
  try {
    const event = {
      httpMethod: 'POST',
      path: functionPath,
      headers,
      queryStringParameters: Object.fromEntries(searchParams),
      body,
      isBase64Encoded: false
    }
    const result = await withClaudeRequest(claudeRequest, () => getHandler(name)(event))
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    const answeredBy = [...claudeRequest.modelsUsed].join(', ') || model
    console.log(`[${time()}] ← ${name} ${result.statusCode} nach ${seconds}s (${answeredBy})`)
    return { statusCode: result.statusCode || 200, body: result.body ?? '', answeredBy }
  } catch (error) {
    console.error(`[${time()}] ✗ ${name}:`, error.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Claude-Brücke: Fehler', message: error.message }), answeredBy: model }
  } finally {
    activeRequests--
  }
}

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
  ensureRemote()
})
