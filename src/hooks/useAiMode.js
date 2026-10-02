import { useEffect, useState } from 'react'
import {
  subscribeAiMode, isClaudeFeatureEnabled, getPreferredMode, getBridgeStatus, isClaudeActive, getClaudeModel,
  getBridgeTarget, getRemoteBridge
} from '../lib/aiMode'

function snapshot() {
  return {
    enabled: isClaudeFeatureEnabled(),
    preferred: getPreferredMode(),
    model: getClaudeModel(),
    bridge: getBridgeStatus(),
    claudeActive: isClaudeActive(),
    target: getBridgeTarget(),
    remoteBridge: getRemoteBridge()
  }
}

// Re-renders whenever the Claude-Modus state changes (switch flipped, bridge found/lost).
export function useAiMode() {
  const [state, setState] = useState(snapshot)
  useEffect(() => subscribeAiMode(() => setState(snapshot())), [])
  return state
}
