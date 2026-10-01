// Parses common plain-text decklist exports (Moxfield, Archidekt, EDHREC, MTGGoldfish, or a
// hand-typed list) into {commander, cards}. Formats vary a lot in the wild — this covers the
// conventions that actually show up across sites rather than any one exact export shape:
// "1 Sol Ring" / "4x Island" / bare "Sol Ring", trailing set/collector info in parens or
// brackets, a "*CMDR*"/"*Commander*" marker or a "Commander" section header, "//"/"#"
// comments, and a Sideboard/Maybeboard section (skipped — not part of the 99).
const SECTION_HEADER_RE = /^(commander|deck|mainboard|maindeck|companion|sideboard|maybeboard)s?:?\s*$/i
const LINE_QTY_RE = /^(\d+)\s*x?\s+(.+)$/i
const TRAILING_SET_RE = /\s*[([][A-Za-z0-9]{2,6}[)\]]\s*[\w-]*\s*$/
const CMDR_MARKER_RE = /\s*\*?\b(cmdr|commander)\b\*?\s*$/i
// Any other trailing "*word*" marker some exports append (*F*, *Foil*, *Etched*, ...) — the
// commander marker above is checked and stripped first, so this only ever catches the rest.
const TRAILING_STAR_MARKER_RE = /\s*\*[A-Za-z]+\*\s*$/

export function parseDeckListText(text) {
  const lines = (text || '').split(/\r?\n/)
  const cards = []
  let commander = null
  let currentSection = 'deck'

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('//') || line.startsWith('#')) continue

    const header = line.match(SECTION_HEADER_RE)
    if (header) {
      currentSection = header[1].toLowerCase()
      continue
    }
    if (currentSection === 'sideboard' || currentSection === 'maybeboard') continue

    let body = line
    let isCommanderLine = currentSection === 'commander'
    if (CMDR_MARKER_RE.test(body)) {
      isCommanderLine = true
      body = body.replace(CMDR_MARKER_RE, '').trim()
    }

    let quantity = 1
    let name = body
    const qtyMatch = body.match(LINE_QTY_RE)
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1
      name = qtyMatch[2]
    }
    name = name.replace(TRAILING_SET_RE, '').replace(TRAILING_STAR_MARKER_RE, '').trim()
    if (!name) continue

    if (isCommanderLine && !commander) {
      commander = name
      continue
    }

    const existing = cards.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (existing) existing.count += quantity
    else cards.push({ name, count: quantity })
  }

  return { commander, cards }
}
