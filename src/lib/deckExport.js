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
