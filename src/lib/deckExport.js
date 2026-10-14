// Deck exports from the editor. Each row: { name, count, scryfallId, typeLine, manaCost, cmc,
// price, status, board } — board is 'Commander' or 'Deck'.
//
// - ManaBox CSV: comma-separated with ManaBox's own column names ("Quantity", "Name",
//   "Scryfall ID"), so the edited deck can be imported into ManaBox and come back as a real
//   deck with the next collection upload. Extra columns are informational.
// - Excel CSV: semicolon-separated, decimal comma and a BOM — what a German Excel opens
//   correctly by double-click (a comma CSV lands in a single column there).
// - Text decklist: "1 Sol Ring" lines with Commander/Deck sections — the format Moxfield,
//   Archidekt and this app's own draft import all read.

function csvField(value, separator) {
  const text = value == null ? '' : String(value)
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvLine(values, separator) {
  return values.map(value => csvField(value, separator)).join(separator)
}

export function buildManaBoxCsv(rows) {
  const header = ['Quantity', 'Name', 'Scryfall ID', 'Board', 'Type', 'Mana cost', 'Mana value', 'Price (EUR)']
  const lines = rows.map(r => [
    r.count, r.name, r.scryfallId || '', r.board, r.typeLine || '', r.manaCost || '', r.cmc ?? '',
    r.price > 0 ? r.price.toFixed(2) : ''
  ])
  return [header, ...lines].map(values => csvLine(values, ',')).join('\r\n') + '\r\n'
}

export function buildExcelCsv(rows) {
  const euro = (value) => (value > 0 ? value.toFixed(2).replace('.', ',') : '')
  const header = ['Anzahl', 'Name', 'Bereich', 'Typ', 'Manakosten', 'Manawert', 'Preis pro Karte (€)', 'Preis gesamt (€)', 'Status']
  const lines = rows.map(r => [
    r.count, r.name, r.board, r.typeLine || '', r.manaCost || '', r.cmc ?? '',
    euro(r.price), euro(r.price * r.count), r.status || ''
  ])
  return '﻿' + [header, ...lines].map(values => csvLine(values, ';')).join('\r\n') + '\r\n'
}

export function buildDecklistText(rows) {
  const commander = rows.filter(r => r.board === 'Commander')
  const deck = rows.filter(r => r.board !== 'Commander')
  const section = (title, list) => (list.length ? [title, ...list.map(r => `${r.count} ${r.name}`), ''] : [])
  return [...section('Commander', commander), ...section('Deck', deck)].join('\n')
}

// ── PDF: card names only (e.g. to work through on Cardmarket) ─────────────────────────────
// A small text-only PDF written by hand — A4, two columns, Helvetica — so no PDF library is
// needed. Text uses the PDF's WinAnsi encoding (covers Æ, é, ö …); anything else becomes "?".
const WIN_ANSI_EXTRA = { '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, '€': 0x80 }
function pdfText(value) {
  let out = ''
  for (const ch of String(value)) {
    const code = ch.codePointAt(0)
    const byte = code < 128 || (code >= 160 && code <= 255) ? code : WIN_ANSI_EXTRA[ch] ?? 63
    const c = String.fromCharCode(byte)
    out += c === '\\' || c === '(' || c === ')' ? `\\${c}` : c
  }
  return out
}

/** lines: strings (one card each). Returns the PDF as bytes. */
export function buildNamesPdf(title, subtitle, lines) {
  const W = 595, H = 842, MARGIN = 48, SIZE = 10, LEAD = 13.5 // two columns × 51 lines: a whole deck on one page
  const top = H - MARGIN - 44
  const perColumn = Math.floor((top - MARGIN) / LEAD)
  const columnX = [MARGIN, W / 2 + 10]
  const pages = []
  for (let i = 0; i < Math.max(1, lines.length); i += perColumn * 2) pages.push(lines.slice(i, i + perColumn * 2))

  const contents = pages.map((pageLines, pageIndex) => {
    const ops = []
    if (pageIndex === 0) {
      ops.push(`BT /F2 15 Tf ${MARGIN} ${H - MARGIN - 10} Td (${pdfText(title)}) Tj ET`)
      ops.push(`BT /F1 9 Tf ${MARGIN} ${H - MARGIN - 26} Td (${pdfText(subtitle)}) Tj ET`)
    } else {
      ops.push(`BT /F1 9 Tf ${MARGIN} ${H - MARGIN - 10} Td (${pdfText(`${title} – Seite ${pageIndex + 1}`)}) Tj ET`)
    }
    pageLines.forEach((line, index) => {
      const column = Math.floor(index / perColumn)
      const y = top - (index % perColumn) * LEAD
      ops.push(`BT /F1 ${SIZE} Tf ${columnX[column]} ${y} Td (${pdfText(line)}) Tj ET`)
    })
    return ops.join('\n')
  })

  // Objects: 1 catalog, 2 pages, 3/4 fonts, then per page: content + page object.
  const objects = []
  const pageIds = pages.map((_, i) => 6 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  objects[5] = `<< /Producer (MTG Commander Deck Builder) /Title (${pdfText(title)}) >>`
  // Per page: the page object (even id from 6) and its content stream right after it.
  const body = []
  let id = 6
  const pageObjects = []
  for (const content of contents) {
    const pageId = id
    const contentId = id + 1
    pageObjects.push([pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`])
    pageObjects.push([contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`])
    id += 2
  }
  for (const objectId of [1, 2, 3, 4, 5]) body.push([objectId, objects[objectId]])
  body.push(...pageObjects)
  body.sort((a, b) => a[0] - b[0])

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = []
  for (const [objectId, text] of body) {
    offsets[objectId] = pdf.length
    pdf += `${objectId} 0 obj\n${text}\nendobj\n`
  }
  const xref = pdf.length
  const count = body.length + 1
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let objectId = 1; objectId < count; objectId++) pdf += `${String(offsets[objectId]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character above is one byte (pdfText already reduced text to single bytes).
  return Uint8Array.from(pdf, ch => ch.charCodeAt(0))
}

export function downloadBytes(filename, bytes, mimeType) {
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFileBase(title) {
  const slug = String(title || 'deck')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'deck'}-${new Date().toISOString().slice(0, 10)}`
}
