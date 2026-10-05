import { useEffect, useState } from 'react'
import { scheduleCloudPush } from './cloudSync'

// At the game table every deck is free for the players you have sat at a table with — except
// the ones you lock here. Ids like the table's own deck keys: "manabox:<deck name>",
// "draft:<draft id>". Cloud-synced; the server builds what friends see from it
// (netlify/functions/lib/deck-lenders.js).
const LOCKS_KEY = 'mtg_deck_locks'
const listeners = new Set()

export const manaboxDeckId = (deckName) => `manabox:${deckName}`

export function loadDeckLocks() {
  try { return new Set(JSON.parse(localStorage.getItem(LOCKS_KEY) || '[]')) } catch { return new Set() }
}

export function setDeckLocked(deckId, locked) {
  const locks = loadDeckLocks()
  if (locked) locks.add(deckId)
  else locks.delete(deckId)
  try {
    localStorage.setItem(LOCKS_KEY, JSON.stringify([...locks]))
  } catch {
    return
  }
  scheduleCloudPush()
  listeners.forEach(listener => listener(locks))
}

/** The locked deck ids, kept current across components. */
export function useDeckLocks() {
  const [locks, setLocks] = useState(loadDeckLocks)
  useEffect(() => {
    listeners.add(setLocks)
    return () => listeners.delete(setLocks)
  }, [])
  return locks
}
