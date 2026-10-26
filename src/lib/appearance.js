// Look of the site, chosen under Einstellungen — kept per device (a convenience, not data).
// The style goes on <html> as data-style="tavern" | "modern" (none = Standard); the table look
// as data-table="wood" | "felt" on the game table itself (TableRoomPage), so the previews on
// the settings page can show each look side by side. src/themes.css reads both.
// Light/dark stays its own switch (data-theme, src/hooks/useTheme.js).

const STYLE_KEY = 'mtg_style'
const TABLE_KEY = 'mtg_table_look'
const EVENT = 'mtg-appearance'

export const STYLES = [
  { id: 'standard', label: 'Standard', hint: 'Ruhig und neutral – die Karten sind der Inhalt.' },
  { id: 'tavern', label: 'Kartenstube', hint: 'Pergament, Leder und Gold, Schrift wie auf Kartentiteln, Symbole in der Navigation.' },
  { id: 'modern', label: 'Modern', hint: 'Klar und luftig: runde Ecken, weiche Schatten, blaue Akzente.' }
]

export const TABLE_LOOKS = [
  { id: 'standard', label: 'Standard', hint: 'Spielbereiche als ruhige Flächen.' },
  { id: 'wood', label: 'Holztisch', hint: 'Nussbaum-Tisch, jeder Spieler mit eigener Filzmatte.' },
  { id: 'felt', label: 'Grüner Filz', hint: 'Klassischer Kartentisch mit Filzbespannung.' }
]

// Webfonts only for the style that uses them — Standard loads none.
const FONTS = {
  tavern: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&display=swap',
  modern: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap'
}

const read = (key, allowed) => {
  try {
    const value = localStorage.getItem(key)
    return allowed.some(option => option.id === value) ? value : 'standard'
  } catch {
    return 'standard'
  }
}

export const getStyle = () => read(STYLE_KEY, STYLES)
export const getTableLook = () => read(TABLE_KEY, TABLE_LOOKS)

function loadFont(style) {
  const href = FONTS[style]
  if (!href || document.querySelector(`link[data-style-font="${style}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.styleFont = style
  document.head.appendChild(link)
}

/** Puts the saved style on <html>; called once before the app renders (no flash). */
export function applyAppearance() {
  const root = document.documentElement
  const style = getStyle()
  if (style === 'standard') root.removeAttribute('data-style')
  else { root.setAttribute('data-style', style); loadFont(style) }
}

/** Both styles' fonts — for the previews on the settings page. */
export function preloadStyleFonts() {
  Object.keys(FONTS).forEach(loadFont)
}

function save(key, value) {
  try { localStorage.setItem(key, value) } catch { /* storage blocked: applies for this visit */ }
  applyAppearance()
  window.dispatchEvent(new Event(EVENT))
}

export const setStyle = (style) => save(STYLE_KEY, style)
export const setTableLook = (look) => save(TABLE_KEY, look)

export function subscribeAppearance(listener) {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
