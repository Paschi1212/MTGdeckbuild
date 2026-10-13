/**
 * Builds the Claude bridge as a download for every player with their own Claude subscription:
 * dist/downloads/mtg-claude-bridge.zip — one bundled file (no repo, no npm install) plus
 * starters for Windows/macOS/Linux and a short guide. Runs after `vite build` (npm run build).
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist', 'downloads')
const FOLDER = 'mtg-claude-bridge'

const bundle = await build({
  entryPoints: [path.join(root, 'scripts', 'claude-bridge.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  write: false,
  define: { 'process.env.MTG_BRIDGE_BUNDLE': '"1"' },
  // Bundled CommonJS code still calls require() for Node's own modules.
  banner: { js: "import { createRequire as __bridgeRequire } from 'node:module'; const require = __bridgeRequire(import.meta.url);" },
  logLevel: 'warning'
})

const files = {
  'mtg-claude-bridge.mjs': bundle.outputFiles[0].contents,
  'Claude-Bridge-starten.cmd': [
    '@echo off',
    'rem Startet die Claude-Bruecke fuer die MTG-Deckbuilder-Website. Fenster offen lassen.',
    'title Claude-Bridge - MTG Deck Builder',
    'cd /d "%~dp0"',
    'where node >nul 2>nul || (echo Node.js fehlt - bitte von https://nodejs.org installieren ^(LTS^). & pause & exit /b 1)',
    'where claude >nul 2>nul || (echo Claude Code fehlt - Anleitung in LIESMICH.txt. & pause & exit /b 1)',
    'node mtg-claude-bridge.mjs',
    'echo.',
    'echo Die Bruecke wurde beendet. Details stehen in claude-bridge.log in diesem Ordner.',
    'pause',
    ''
  ].join('\r\n'),
  'claude-bridge-starten.command': [
    '#!/bin/sh',
    '# macOS: Doppelklick startet die Claude-Bruecke. Fenster offen lassen.',
    'cd "$(dirname "$0")"',
    'command -v node >/dev/null || { echo "Node.js fehlt - bitte von https://nodejs.org installieren (LTS)."; read x; exit 1; }',
    'command -v claude >/dev/null || { echo "Claude Code fehlt - Anleitung in LIESMICH.txt."; read x; exit 1; }',
    'node mtg-claude-bridge.mjs',
    ''
  ].join('\n'),
  'LIESMICH.txt': [
    'Claude-Brücke für den MTG Commander Deck Builder',
    '===============================================',
    '',
    'Damit beantwortet Claude (dein eigenes Claude-Abo) die KI-Anfragen der Website:',
    'Deck-Analyse, Kaufvorschläge, KI-Assistent, "Neue Karten prüfen" – ohne Zeitlimit.',
    '',
    'Einmalig einrichten',
    '1. Node.js (LTS) installieren: https://nodejs.org',
    '2. Claude Code installieren: https://claude.com/claude-code',
    '3. Ein Terminal öffnen, "claude" eingeben und dich mit deinem Claude-Konto anmelden',
    '   (Pro oder Max). Danach das Terminal schließen.',
    '',
    'Jedes Mal',
    '1. Windows: Doppelklick auf "Claude-Bridge-starten.cmd"',
    '   macOS:   Doppelklick auf "claude-bridge-starten.command"',
    '            (beim ersten Mal: Rechtsklick → Öffnen; ggf. vorher im Terminal',
    '             chmod +x claude-bridge-starten.command)',
    '   Linux:   im Terminal in diesem Ordner: node mtg-claude-bridge.mjs',
    '2. Das Fenster offen lassen, solange du Claude nutzen willst.',
    '3. Auf der Website oben auf den KI-Schalter klicken bzw. unter /claude-modus einschalten.',
    '',
    'Gut zu wissen',
    '- Die Brücke läuft nur auf deinem Rechner (127.0.0.1) und nimmt nur Anfragen der',
    '  Deck-Builder-Website an. Claude bekommt nur die Karten-Werkzeuge (Scryfall/EDHREC).',
    '- Die Anfragen laufen über dein Claude-Abo und zählen gegen dessen Limits.',
    '- Tablet & Handy: Ist Tailscale auf dem PC installiert, ist die Brücke auch von deinen',
    '  eigenen Geräten im Tailnet erreichbar (Details auf /claude-modus).',
    '- Probleme? In claude-bridge.log in diesem Ordner steht, was passiert ist.',
    ''
  ].join('\r\n')
}

// A plain ZIP (stored, no compression needed for a download this size) — no extra package.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const deflated = zlib.deflateRawSync(data, { level: 9 })
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const unixMode = name.endsWith('.command') ? 0o100755 : 0o100644
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36)
    central.writeUInt32LE((unixMode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, deflated)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + deflated.length
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

fs.mkdirSync(outDir, { recursive: true })
const archive = zip(Object.entries(files).map(([name, content]) => [`${FOLDER}/${name}`, content]))
fs.writeFileSync(path.join(outDir, `${FOLDER}.zip`), archive)
console.log(`Claude-Brücke als Download: dist/downloads/${FOLDER}.zip (${Math.round(archive.length / 1024)} KB)`)
