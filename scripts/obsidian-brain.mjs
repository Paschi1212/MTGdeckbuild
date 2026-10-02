/**
 * The "brain": an Obsidian vault of plain Markdown notes (default ~/Obsidian/MTG Deckbuilder,
 * override with OBSIDIAN_VAULT in .env). The Claude bridge reads it before analyses and
 * appends to a deck's logbook afterwards — straight on the files, so Obsidian doesn't need to
 * be running or have any plugin; it picks up changes by itself.
 *
 *   Vorlieben.md          rules for every deck   (## Regeln, ## Spielstil)
 *   Decks/<Deck>.md        one note per deck     (## Kernkarten, ## Strategie, ## Notizen, ## Logbuch)
 *
 * A deck note is found by file name (= the deck's name in the app) or by `commander:` in its
 * front matter. Text is only ever appended, never rewritten.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Read on use, not at import: the bridge loads .env (OBSIDIAN_VAULT) after its imports.
export const vaultPath = () => process.env.OBSIDIAN_VAULT || path.join(os.homedir(), 'Obsidian', 'MTG Deckbuilder')
const decksDir = () => path.join(vaultPath(), 'Decks')
const preferencesFile = () => path.join(vaultPath(), 'Vorlieben.md')

const norm = (value) => String(value || '').split('//')[0].trim().toLowerCase()
const safeFileName = (name) => String(name).replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)

async function exists(file) {
  try { await fs.access(file); return true } catch { return false }
}

export async function vaultAvailable() {
  return exists(vaultPath())
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const fields = {}
  if (!match) return fields
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line)
    if (pair) fields[pair[1].toLowerCase()] = pair[2].trim()
  }
  return fields
}

// "## Heading" → its body, keyed by lowercase heading.
function sections(text) {
  const result = {}
  const parts = text.split(/^##\s+/m).slice(1)
  for (const part of parts) {
    const [heading, ...body] = part.split(/\r?\n/)
    result[heading.trim().toLowerCase()] = body.join('\n').trim()
  }
  return result
}

const plain = (text) => String(text || '')
  .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1') // [[Link]] → Link
  .replace(/[*_`]/g, '')
  .trim()

// "- Kartenname — Grund" (dash with spaces around it as separator — never ":", which is part
// of names like "Circle of Protection: Red") → { name, reason }
function parseCoreCards(body) {
  return (body || '').split(/\r?\n/)
    .map(line => /^\s*[-*]\s+(.+)$/.exec(line)?.[1])
    .filter(Boolean)
    .map(item => {
      const [name, ...reason] = plain(item).split(/\s+[—–-]\s+/)
      return { name: name.trim(), reason: reason.join(' – ').trim() }
    })
    .filter(card => card.name)
}

// Placeholder lines like "*(hier ergänzen …)*" carry no information.
const withoutPlaceholders = (body) => (body || '').split(/\r?\n/).filter(line => !/^\s*[-*]?\s*\*\(.*\)\*\s*$/.test(line)).join('\n').trim()

async function findDeckNote(deck, commander) {
  if (!(await exists(decksDir()))) return null
  if (deck) {
    const direct = path.join(decksDir(), `${safeFileName(deck)}.md`)
    if (await exists(direct)) return direct
  }
  const files = (await fs.readdir(decksDir())).filter(f => f.toLowerCase().endsWith('.md'))
  for (const file of files) {
    const fields = frontMatter(await fs.readFile(path.join(decksDir(), file), 'utf8'))
    if ((deck && norm(fields.deck) === norm(deck)) || (commander && norm(fields.commander) === norm(commander))) {
      return path.join(decksDir(), file)
    }
  }
  return null
}

export async function readBrain({ deck, commander }) {
  if (!(await vaultAvailable())) return { vault: false }

  let preferences = ''
  if (await exists(preferencesFile())) {
    const s = sections(await fs.readFile(preferencesFile(), 'utf8'))
    preferences = [withoutPlaceholders(s['regeln']), withoutPlaceholders(s['spielstil'])].filter(Boolean).join('\n')
  }

  const file = await findDeckNote(deck, commander)
  let deckNote = null
  if (file) {
    const s = sections(await fs.readFile(file, 'utf8'))
    deckNote = {
      file: path.relative(vaultPath(), file),
      coreCards: parseCoreCards(s['kernkarten']),
      strategy: plain(withoutPlaceholders(s['strategie'])),
      notes: plain(withoutPlaceholders(s['notizen']))
    }
  }
  return { vault: true, preferences: plain(preferences), deckNote }
}

function newDeckNote(deck, commander) {
  return `---\ndeck: ${deck || ''}\ncommander: ${commander || ''}\n---\n# ${deck || commander}\n\n## Kernkarten\n\n## Strategie\n\n## Notizen\n\n## Logbuch\n`
}

const stamp = () => new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Appends "### <time> · <title>" with bullet lines to the deck note's ## Logbuch. */
export async function appendDeckLog({ deck, commander, title, lines }) {
  if (!(await vaultAvailable())) throw new Error(`Obsidian-Tresor nicht gefunden: ${vaultPath()}`)
  await fs.mkdir(decksDir(), { recursive: true })

  let file = await findDeckNote(deck, commander)
  if (!file) {
    file = path.join(decksDir(), `${safeFileName(deck || commander || 'Unbenanntes Deck')}.md`)
    await fs.writeFile(file, newDeckNote(deck, commander), 'utf8')
  }

  const entry = `\n### ${stamp()} · ${title}\n${lines.map(line => `- ${line}`).join('\n')}\n`
  let text = await fs.readFile(file, 'utf8')
  const logHeading = /^##\s+Logbuch\s*$/m.exec(text)
  if (!logHeading) {
    text = `${text.trimEnd()}\n\n## Logbuch\n${entry}`
  } else {
    // Append at the end of the Logbuch section — before the next "## " if the user put one after it.
    const afterHeading = logHeading.index + logHeading[0].length
    const nextSection = text.slice(afterHeading).search(/^##\s+/m)
    const insertAt = nextSection === -1 ? text.length : afterHeading + nextSection
    const before = text.slice(0, insertAt).trimEnd()
    const after = text.slice(insertAt)
    text = `${before}\n${entry}${after ? `\n${after}` : ''}`
  }
  await fs.writeFile(file, text, 'utf8')
  return path.relative(vaultPath(), file)
}
