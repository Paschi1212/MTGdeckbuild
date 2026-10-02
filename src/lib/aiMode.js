import { scheduleCloudPush } from './cloudSync'

// "Claude-Modus": when the Claude bridge (`npm run claude-bridge`) runs on the user's PC, the
// AI requests (audit, chat, analysis, commander ideas) go there and are answered by Claude
// instead of Netlify's Gemini functions. Switching it on, the model and how to reach the
// bridge are per device (plain localStorage, never cloud-synced) — a friend's browser has no
// bridge.
//
// Two ways to reach it, chosen per device on /claude-modus:
//   local  – the bridge runs on this computer (http://127.0.0.1:8787)
//   remote – tablet/phone: the PC's bridge through Tailscale (https://<pc>.<tailnet>.ts.net).
//            The PC reports that address itself; it is the one cloud-synced value here, so the
//            tablet knows it without typing.
//
// The bridge is only ever contacted after the feature was switched on for this device — a
// request from a public site to a local address makes Chrome ask for a local-network
// permission, which friends using the site should never see.

export const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8787'
const ENABLED_KEY = 'mtg_claude_feature'
const MODE_KEY = 'mtg_ai_mode'
const MODEL_KEY = 'mtg_claude_model'
const TARGET_KEY = 'mtg_bridge_target'
const REMOTE_KEY = 'mtg_bridge_remote' // cloud-synced: { url, updatedAt }
const PENDING_KEY = 'mtg_pending_ai_jobs'

// Family aliases — the bridge's CLI resolves each to the newest model of that family.
export const CLAUDE_MODELS = [
  { id: 'opus', label: 'Opus', description: 'Am gründlichsten — die besten Analysen, braucht am längsten und am meisten von deinem Abo-Kontingent.' },
  { id: 'sonnet', label: 'Sonnet', description: 'Sehr stark und spürbar schneller — der Alltags-Kompromiss.' },
  { id: 'haiku', label: 'Haiku', description: 'Am schnellsten und sparsamsten — für einfache Fragen, bei kniffligen Deck-Analysen deutlich schwächer.' }
]

let bridge = { checked: false, reachable: false, ready: false, checking: false, model: null, error: null, remote: null }
const listeners = new Set()

function read(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private mode) — the feature simply stays off for this visit.
  }
}

function notify() {
  for (const listener of listeners) listener()
}

export function subscribeAiMode(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isClaudeFeatureEnabled() {
  return read(ENABLED_KEY) === '1'
}

export function setClaudeFeatureEnabled(enabled) {
  write(ENABLED_KEY, enabled ? '1' : null)
  if (!enabled) write(MODE_KEY, null)
  notify()
}

export function getPreferredMode() {
  return read(MODE_KEY) === 'claude' ? 'claude' : 'gemini'
}

export function setPreferredMode(mode) {
  write(MODE_KEY, mode === 'claude' ? 'claude' : null)
  notify()
}

export function getClaudeModel() {
  const saved = read(MODEL_KEY)
  return CLAUDE_MODELS.some(m => m.id === saved) ? saved : 'opus'
}

export function setClaudeModel(id) {
  write(MODEL_KEY, CLAUDE_MODELS.some(m => m.id === id) ? id : null)
  notify()
}

export function getClaudeModelLabel() {
  return CLAUDE_MODELS.find(m => m.id === getClaudeModel())?.label || 'Claude'
}

// The bridge reports the exact model that answered ("claude-opus-5-5") — shown as "Opus 5.5".
export function formatModelId(id) {
  const match = /claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id || '')
  if (!match) return id || ''
  const family = match[1][0].toUpperCase() + match[1].slice(1)
  return `${family} ${match[2]}${match[3] ? `.${match[3]}` : ''}`
}

// ── Where the bridge is ────────────────────────────────────────────────────────────────

export function getBridgeTarget() {
  return read(TARGET_KEY) === 'remote' ? 'remote' : 'local'
}

export function setBridgeTarget(target) {
  write(TARGET_KEY, target === 'remote' ? 'remote' : null)
  bridge = { checked: false, reachable: false, ready: false, checking: false, model: null, error: null, remote: null }
  notify()
  checkBridge()
}

/** The Tailscale address last reported by the PC: { url, updatedAt } or null. */
export function getRemoteBridge() {
  try {
    const saved = JSON.parse(read(REMOTE_KEY) || 'null')
    return saved?.url ? saved : null
  } catch {
    return null
  }
}

export function setRemoteBridgeUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '')
  write(REMOTE_KEY, clean ? JSON.stringify({ url: clean, updatedAt: new Date().toISOString() }) : null)
  scheduleCloudPush()
  notify()
}

export function getBridgeUrl() {
  return getBridgeTarget() === 'remote' ? getRemoteBridge()?.url || null : LOCAL_BRIDGE_URL
}

export function getBridgeStatus() {
  return bridge
}

// What actually answers right now: Claude only when chosen AND the bridge is up and logged in.
export function isClaudeActive() {
  return isClaudeFeatureEnabled() && getPreferredMode() === 'claude' && bridge.ready
}

export async function checkBridge() {
  if (!isClaudeFeatureEnabled()) return bridge
  const url = getBridgeUrl()
  if (!url) {
    bridge = { checked: true, reachable: false, ready: false, checking: false, model: null, remote: null, error: 'Noch keine Tailscale-Adresse – Brücke am PC starten und diese Seite dort einmal öffnen.' }
    notify()
    return bridge
  }
  bridge = { ...bridge, checking: true }
  notify()
  try {
    const controller = new AbortController()
    // Through Tailscale the way can lead over a relay — give it a bit longer.
    const timer = setTimeout(() => controller.abort(), getBridgeTarget() === 'remote' ? 6000 : 2500)
    const response = await fetch(`${url}/health`, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    const data = await response.json()
    bridge = {
      checked: true,
      reachable: true,
      // While the bridge's own login self-test is still running, ask again shortly.
      ready: Boolean(data.ready),
      checking: false,
      model: data.model || null,
      remote: data.remote || null,
      error: data.checking ? 'Selbsttest läuft noch …' : data.error || null
    }
    if (data.checking) setTimeout(checkBridge, 3000)
    // On the PC: remember the bridge's Tailscale address for the tablet (cloud-synced).
    if (getBridgeTarget() === 'local' && data.remote?.state === 'ready' && data.remote.url && data.remote.url !== getRemoteBridge()?.url) {
      setRemoteBridgeUrl(data.remote.url)
    }
  } catch {
    bridge = { checked: true, reachable: false, ready: false, checking: false, model: null, remote: null, error: null }
  }
  notify()
  return bridge
}

// ── AI requests as jobs on the bridge ──────────────────────────────────────────────────
// The bridge runs each AI call as a job; the page asks for the result every few seconds.
// So a locked tablet screen or a dropped connection costs nothing: the job keeps running on
// the PC. Calls started with a `jobKey` are also remembered here, so a page that the browser
// reloaded in the meantime can pick the result up again (resumeAiJob).

const PENDING_MAX_AGE_MS = 60 * 60 * 1000
const GIVE_UP_AFTER_MS = 10 * 60 * 1000

function loadPending() {
  try { return JSON.parse(read(PENDING_KEY) || '{}') } catch { return {} }
}

function savePending(all) {
  write(PENDING_KEY, Object.keys(all).length ? JSON.stringify(all) : null)
}

function clearPending(key) {
  if (!key) return
  const all = loadPending()
  delete all[key]
  savePending(all)
}

/** A job started under `key` that has not been picked up yet: { id, bridge, startedAt, meta }. */
export function getPendingAiJob(key) {
  const entry = key ? loadPending()[key] : null
  if (!entry || Date.now() - entry.startedAt > PENDING_MAX_AGE_MS) return null
  return entry
}

/** Waits for a remembered job again (e.g. after a reload). Null if there is none. */
export function resumeAiJob(key) {
  const entry = getPendingAiJob(key)
  return entry ? waitForJob(entry, key) : null
}

// Waits up to `ms`, but wakes up right away when the page becomes visible again.
function pause(ms) {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      resolve()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') done() }
    const timer = setTimeout(done, ms)
    document.addEventListener('visibilitychange', onVisible)
  })
}

async function waitForJob(entry, key) {
  let failingSince = null
  try {
    for (;;) {
      await pause(document.visibilityState === 'visible' ? 2000 : 5000)
      let response
      try {
        response = await fetch(`${entry.bridge}/jobs/${entry.id}`, { cache: 'no-store' })
      } catch {
        // Tablet asleep, Wi-Fi switch, PC briefly unreachable — keep trying for a while.
        failingSince ??= Date.now()
        if (Date.now() - failingSince > GIVE_UP_AFTER_MS) {
          checkBridge()
          throw new Error('Dein PC antwortet seit 10 Minuten nicht mehr – läuft die Claude-Brücke noch und ist der PC wach? Sonst oben auf Gemini umschalten.')
        }
        continue
      }
      failingSince = null
      if (response.status === 404) {
        throw new Error('Die Claude-Brücke wurde zwischendurch neu gestartet, dabei ging dieser Auftrag verloren – bitte noch einmal starten.')
      }
      const data = await response.json().catch(() => ({}))
      if (data.state === 'done') {
        return new Response(data.body ?? '', {
          status: data.statusCode || 200,
          headers: { 'Content-Type': 'application/json', 'X-AI-Provider': 'claude', 'X-AI-Model': data.model || '' }
        })
      }
    }
  } finally {
    clearPending(key)
  }
}

function bridgeGoneMessage() {
  return getBridgeTarget() === 'remote'
    ? 'Dein PC ist nicht erreichbar – Tailscale auf diesem Gerät an? PC wach und Claude-Brücke gestartet? Sonst oben auf Gemini umschalten.'
    : 'Die Claude-Brücke antwortet nicht mehr — läuft "npm run claude-bridge" noch? Sonst oben auf Gemini umschalten.'
}

/**
 * Drop-in replacement for fetch() on the AI endpoints ('/.netlify/functions/<name>').
 * `jobKey`/`jobMeta`: remember a Claude call so the page can resume it after a reload.
 */
export async function aiFetch(path, options, { jobKey, jobMeta } = {}) {
  if (!isClaudeActive()) return fetch(path, options)

  const bridgeUrl = getBridgeUrl()
  const name = path.split('/').pop()
  let started
  try {
    // The bridge only accepts JSON-typed requests (that forces the browser's CORS preflight,
    // so no other website can fire requests at it) — the app's calls send JSON bodies but
    // don't always label them.
    const request = {
      method: 'POST',
      body: options?.body,
      headers: { 'Content-Type': 'application/json', 'X-Claude-Model': getClaudeModel(), ...(options?.headers || {}) }
    }
    const response = await fetch(`${bridgeUrl}/jobs/${name}`, request)
    // A bridge started before jobs existed: answer on the same connection, as before.
    if (response.status === 404) return await fetch(`${bridgeUrl}${path}`, request)
    if (response.status !== 202) return response // e.g. bridge not ready → the caller shows the error
    started = await response.json()
  } catch {
    await checkBridge()
    throw new Error(bridgeGoneMessage())
  }

  const entry = { id: started.id, bridge: bridgeUrl, startedAt: Date.now(), meta: jobMeta ?? null }
  if (jobKey) savePending({ ...loadPending(), [jobKey]: entry })
  return waitForJob(entry, jobKey)
}
