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

// The commander's color identity under the commander field: mana symbols plus the name of the
// combination — which colors the 99 may use.
export default function CommanderColors({ name }) {
  const [card, setCard] = useState(null)
  const [state, setState] = useState('idle')

  useEffect(() => {
    const trimmed = String(name || '').trim()
    if (!trimmed) { setCard(null); setState('idle'); return undefined }
    let cancelled = false
    setState('loading')
    // Typing in the field: wait for a pause before asking Scryfall.
    const timer = setTimeout(() => {
      loadCommanderCard(trimmed).then(result => {
        if (cancelled) return
        setCard(result)
        setState(result ? 'ready' : 'unknown')
      })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [name])

  if (state === 'idle') return null
  if (state === 'loading') return <p className="text-xs text-cmd-muted mt-2">Farben werden geladen …</p>
  if (state === 'unknown') return <p className="text-xs text-cmd-muted mt-2">Farben unbekannt – Kartenname prüfen.</p>

  const colors = ORDER.filter(color => card.colorIdentity.includes(color))
  const label = colors.length === 0
    ? 'Farblos'
    : colors.length === 1 ? `Mono-${COLOR_NAMES[colors[0]]}` : `${COMBO_NAMES[colors.join('')] || ''} · ${colors.map(c => COLOR_NAMES[c]).join(', ')}`

  return (
    <div className="flex items-center gap-2 mt-2 text-sm" aria-label={`Farbidentität: ${label}`}>
      {colors.length > 0 ? <ManaCost cost={colors.map(c => `{${c}}`).join('')} size={18} /> : <ManaCost cost="{C}" size={18} />}
      <span className="text-fg-2">{label}</span>
    </div>
  )
}
