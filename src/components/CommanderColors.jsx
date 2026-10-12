import { useEffect, useState } from 'react'
import ManaCost from './ManaCost'
import { loadCommanderCard } from '../lib/table/decks'

const ORDER = ['W', 'U', 'B', 'R', 'G']
const COLOR_NAMES = { W: 'Weiß', U: 'Blau', B: 'Schwarz', R: 'Rot', G: 'Grün' }
// The names players use for color combinations (guilds, shards, wedges, Nephilim/4-color).
const COMBO_NAMES = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya',
  WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya',
  WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
  UBRG: 'ohne Weiß (Glint-Eye)', WBRG: 'ohne Blau (Dune-Brood)', WURG: 'ohne Schwarz (Ink-Treader)',
  WUBG: 'ohne Rot (Witch-Maw)', WUBR: 'ohne Grün (Yore-Tiller)', WUBRG: 'alle fünf Farben'
}

// Color identities already looked up, kept across visits — the deck list shows a dozen
// commanders at once and shouldn't ask Scryfall for all of them every time.
const CACHE_KEY = 'mtg_commander_colors'
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} } }
function remember(name, colors) {
  try {
    const cache = readCache()
    cache[name.toLowerCase()] = colors
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full: it is only a cache.
  }
}

/** The color identity of a commander ('W','U',…) — cached, null if the name is unknown. */
export function useCommanderColors(name, { delay = 0 } = {}) {
  const trimmed = String(name || '').trim()
  const cached = trimmed ? readCache()[trimmed.toLowerCase()] : undefined
  const [state, setState] = useState(() => (cached ? { colors: cached, status: 'ready' } : { colors: null, status: trimmed ? 'loading' : 'idle' }))

  useEffect(() => {
    if (!trimmed) { setState({ colors: null, status: 'idle' }); return undefined }
    const known = readCache()[trimmed.toLowerCase()]
    if (known) { setState({ colors: known, status: 'ready' }); return undefined }
    let cancelled = false
    setState({ colors: null, status: 'loading' })
    const timer = setTimeout(() => {
      loadCommanderCard(trimmed).then(card => {
        if (cancelled) return
        if (!card) { setState({ colors: null, status: 'unknown' }); return }
        const colors = ORDER.filter(color => card.colorIdentity.includes(color))
        remember(trimmed, colors)
        setState({ colors, status: 'ready' })
      })
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [trimmed, delay])

  return state
}

export function colorIdentityLabel(colors) {
  if (!colors.length) return 'Farblos'
  if (colors.length === 1) return `Mono-${COLOR_NAMES[colors[0]]}`
  return `${COMBO_NAMES[colors.join('')] || ''} · ${colors.map(c => COLOR_NAMES[c]).join(', ')}`
}

export function ColorPips({ colors, size = 18 }) {
  return colors.length > 0 ? <ManaCost cost={colors.map(c => `{${c}}`).join('')} size={size} /> : <ManaCost cost="{C}" size={size} />
}

// The commander's color identity under the commander field: mana symbols plus the name of the
// combination — which colors the 99 may use. `compact`: for deck lists — symbols and the
// combination's short name only, nothing while loading.
export default function CommanderColors({ name, compact = false }) {
  // Typing in the field: wait for a pause before asking Scryfall.
  const { colors, status } = useCommanderColors(name, { delay: compact ? 0 : 400 })

  if (compact) {
    if (status !== 'ready') return null
    const label = colorIdentityLabel(colors)
    return (
      <span className="inline-flex items-center gap-1.5" aria-label={`Farbidentität: ${label}`} title={label}>
        <ColorPips colors={colors} size={15} />
        <span className="text-xs text-cmd-muted">{label.split(' · ')[0]}</span>
      </span>
    )
  }

  if (status === 'idle') return null
  if (status === 'loading') return <p className="text-xs text-cmd-muted mt-2">Farben werden geladen …</p>
  if (status === 'unknown') return <p className="text-xs text-cmd-muted mt-2">Farben unbekannt – Kartenname prüfen.</p>

  const label = colorIdentityLabel(colors)
  return (
    <div className="flex items-center gap-2 mt-2 text-sm" aria-label={`Farbidentität: ${label}`}>
      <ColorPips colors={colors} />
      <span className="text-fg-2">{label}</span>
    </div>
  )
}
