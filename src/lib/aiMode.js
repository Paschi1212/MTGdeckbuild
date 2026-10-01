// "Claude-Modus": when the local bridge (`npm run claude-bridge`) runs on THIS computer, the
// AI requests (audit, chat, analysis, commander ideas) go there and are answered by Claude
// instead of Netlify's Gemini functions. Everything here is per device on purpose (plain
// localStorage, never cloud-synced): a phone or a friend's browser has no bridge.
//
// The bridge is only ever contacted after the feature was switched on for this device on the
// /claude-modus page — a localhost request from a public site makes Chrome ask for a
// local-network permission, which friends using the site should never see.

const BRIDGE_URL = 'http://127.0.0.1:8787'
const ENABLED_KEY = 'mtg_claude_feature'
const MODE_KEY = 'mtg_ai_mode'

let bridge = { checked: false, reachable: false, ready: false, checking: false, model: null, error: null }
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

export function getBridgeStatus() {
  return bridge
}

// What actually answers right now: Claude only when chosen AND the bridge is up and logged in.
export function isClaudeActive() {
  return isClaudeFeatureEnabled() && getPreferredMode() === 'claude' && bridge.ready
}

export async function checkBridge() {
  if (!isClaudeFeatureEnabled()) return bridge
  bridge = { ...bridge, checking: true }
  notify()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await fetch(`${BRIDGE_URL}/health`, { signal: controller.signal })
    clearTimeout(timer)
    const data = await response.json()
    bridge = {
      checked: true,
      reachable: true,
      // While the bridge's own login self-test is still running, ask again shortly.
      ready: Boolean(data.ready),
      checking: false,
      model: data.model || null,
      error: data.checking ? 'Selbsttest läuft noch …' : data.error || null
    }
    if (data.checking) setTimeout(checkBridge, 3000)
  } catch {
    bridge = { checked: true, reachable: false, ready: false, checking: false, model: null, error: null }
  }
  notify()
  return bridge
}

// Drop-in replacement for fetch() on the AI endpoints ('/.netlify/functions/<name>').
export async function aiFetch(path, options) {
  if (isClaudeActive()) {
    // The bridge only accepts JSON-typed requests (that forces the browser's CORS preflight,
    // so no other website can fire requests at it) — the app's calls send JSON bodies but
    // don't always label them.
    const headers = { 'Content-Type': 'application/json', ...(options?.headers || {}) }
    try {
      return await fetch(`${BRIDGE_URL}${path}`, { ...options, headers })
    } catch {
      await checkBridge()
      throw new Error('Die Claude-Brücke antwortet nicht mehr — läuft "npm run claude-bridge" noch? Sonst oben auf Gemini umschalten.')
    }
  }
  return fetch(path, options)
}
