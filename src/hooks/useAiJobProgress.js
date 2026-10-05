import { useEffect, useState } from 'react'
import { subscribeAiJobProgress } from '../lib/aiMode'

/**
 * What Claude is doing in the job under `key` right now — { label, toolCalls, attempt } or null
 * (no job, Gemini, or the bridge hasn't reported yet).
 */
export function useAiJobProgress(key) {
  const [progress, setProgress] = useState(null)
  useEffect(() => (key ? subscribeAiJobProgress(key, setProgress) : undefined), [key])
  return progress
}

/** "prüft Kartentexte bei Scryfall · 3 Abfragen" — plus a note when a hung run was restarted. */
export function describeAiProgress(progress) {
  if (!progress?.label) return null
  const parts = [progress.label]
  if (progress.toolCalls) parts.push(`${progress.toolCalls} ${progress.toolCalls === 1 ? 'Abfrage' : 'Abfragen'}`)
  if (progress.attempt > 1) parts.push('2. Versuch – der erste hing')
  return parts.join(' · ')
}
