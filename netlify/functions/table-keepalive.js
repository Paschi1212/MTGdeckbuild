/**
 * Daily keep-alive for the game table's live connection.
 *
 * The table runs its live channels on the Supabase project "Treachery" (Free plan), which
 * Supabase pauses after a week without database activity — the table itself only uses live
 * channels, which don't count. One tiny read a day keeps it awake for game nights.
 * Read-only, on a table that is public anyway; nothing of Rise1's data is touched.
 */

const SUPABASE_URL = 'https://kncaptjyxgcolhmdgjcy.supabase.co'
// Publishable key — meant to ship in apps (see src/lib/table/supabase.js), not a secret.
const SUPABASE_KEY = 'sb_publishable_eg_SZBbH21quzoyTaYH61A_wykQQ-lI'

export default async () => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/identity_catalog?select=identity_uid&limit=1`, {
      headers: { apikey: SUPABASE_KEY }
    })
    console.log(`[table-keepalive] Supabase ${response.status}`)
  } catch (error) {
    console.error('[table-keepalive] failed:', error.message)
  }
}

export const config = { schedule: '@daily' }
