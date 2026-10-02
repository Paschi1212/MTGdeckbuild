import { getDeckPreferences, setDeckPreferences } from './deckPreferences'
import { scheduleCloudPush } from './cloudSync'
import { BRIDGE_URL, isClaudeFeatureEnabled, getBridgeStatus } from './aiMode'

// The Obsidian brain as the website sees it. Only the Claude bridge on the user's PC can
// reach the vault, so:
//   - reading goes through the bridge and is mirrored into the deck's preferences
//     (cloud-synced) — the phone, or a PC without the bridge, uses the last mirrored state;
//   - logbook entries go into an outbox (cloud-synced too) and are written to Obsidian as
//     soon as a bridge is reachable, wherever they were created.
// The bridge is only contacted on devices where the Claude-Modus was switched on (aiMode).

const OUTBOX_KEY = 'mtg_brain_outbox'

const bridgeReachable = () => isClaudeFeatureEnabled() && getBridgeStatus().reachable

export function getBrainMirror(storageKey) {
  return getDeckPreferences(storageKey).brain || null
}

/** Freshest brain state for a deck: from the bridge if reachable (and mirrored), else the mirror. */
export async function refreshBrain(storageKey, { deck, commander }) {
  if (bridgeReachable()) {
    try {
      const params = new URLSearchParams({ deck: deck || '', commander: commander || '' })
      const response = await fetch(`${BRIDGE_URL}/brain?${params}`)
      const data = response.ok ? await response.json() : null
      if (data?.vault) {
        const mirror = {
          file: data.deckNote?.file || null,
          coreCards: data.deckNote?.coreCards || [],
          strategy: data.deckNote?.strategy || '',
          notes: data.deckNote?.notes || '',
          preferences: data.preferences || '',
          fetchedAt: new Date().toISOString()
        }
        // Only store (and cloud-push) real changes — the page re-reads the note on every visit.
        const { fetchedAt: _previousAt, ...previous } = getBrainMirror(storageKey) || {}
        const { fetchedAt: _freshAt, ...fresh } = mirror
        if (JSON.stringify(previous) !== JSON.stringify(fresh)) setDeckPreferences(storageKey, { brain: mirror })
        return mirror
      }
    } catch {
      // Bridge went away mid-call — fall back to the mirror.
    }
  }
  return getBrainMirror(storageKey)
}

/** What an analysis request carries from the brain: protected core cards + the player's notes. */
export function brainRequestFields(mirror) {
  if (!mirror) return {}
  const parts = []
  if (mirror.preferences) parts.push(`Vorlieben (gelten für alle Decks):\n${mirror.preferences}`)
  if (mirror.strategy) parts.push(`Strategie dieses Decks laut Spieler:\n${mirror.strategy}`)
  if (mirror.notes) parts.push(`Notizen des Spielers zu diesem Deck:\n${mirror.notes}`)
  return { coreCards: mirror.coreCards || [], brainNotes: parts.join('\n\n') }
}

function loadOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') } catch { return [] }
}

function saveOutbox(entries) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries))
    scheduleCloudPush()
  } catch {
    // Storage full/blocked: the entry is lost, the analysis itself is unaffected.
  }
}

// One flush at a time — two quick logToBrain calls (strategy, then suggestions) must not
// both send the first entry.
let flushChain = Promise.resolve()

/** Writes all queued logbook entries through the bridge; keeps whatever couldn't be written. */
export function flushBrainOutbox() {
  flushChain = flushChain.then(flushOnce, flushOnce)
  return flushChain
}

async function flushOnce() {
  if (!bridgeReachable()) return
  const pending = loadOutbox()
  if (!pending.length) return
  const remaining = []
  for (const entry of pending) {
    try {
      const response = await fetch(`${BRIDGE_URL}/brain/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })
      if (!response.ok) remaining.push(entry)
    } catch {
      remaining.push(entry)
    }
  }
  saveOutbox(remaining)
}

/** Queue a logbook entry for the deck's Obsidian note and try to write it right away. */
export function logToBrain({ deck, commander, title, lines }) {
  const cleanLines = (lines || []).filter(Boolean)
  if (!cleanLines.length || (!deck && !commander)) return
  saveOutbox([...loadOutbox(), { deck, commander, title, lines: cleanLines, createdAt: new Date().toISOString() }])
  flushBrainOutbox()
}
