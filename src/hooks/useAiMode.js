import { useEffect, useState } from 'react'
import {
  subscribeAiMode, isClaudeFeatureEnabled, getPreferredMode, getBridgeStatus, isClaudeActive
} from '../lib/aiMode'

function snapshot() {
  return {
    enabled: isClaudeFeatureEnabled(),
    preferred: getPreferredMode(),
    bridge: getBridgeStatus(),
    claudeActive: isClaudeActive()
  }
}

// Re-renders whenever the Claude-Modus state changes (switch flipped, bridge found/lost).
export function useAiMode() {
  const [state, setState] = useState(snapshot)
  useEffect(() => subscribeAiMode(() => setState(snapshot())), [])
  return state
}
