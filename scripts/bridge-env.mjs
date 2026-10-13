// Imported FIRST by the Claude bridge: where it lives and its settings must be known before
// the AI functions load (they read some settings at import time).
//   In the repo:          <repo>/scripts/claude-bridge.mjs → root = <repo>
//   Download (bundled):   <folder>/mtg-claude-bridge.mjs   → root = <folder>
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const here = path.dirname(fileURLToPath(import.meta.url))
export const bundled = Boolean(process.env.MTG_BRIDGE_BUNDLE)
export const root = bundled ? here : path.resolve(here, '..')

dotenv.config({ path: path.join(root, '.env') })
process.env.AI_PROVIDER = 'claude'
// Gemini is never called here (Claude answers); without a key its SDK only prints a confusing
// warning at start.
process.env.GEMINI_API_KEY ||= 'not-used-in-claude-mode'
