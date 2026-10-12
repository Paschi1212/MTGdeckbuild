import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadCollection, getCardsForBinder, buildLocationIndex, locationsFromIndex, formatCardLocations } from '../lib/collection'
import { getCommanderOverride } from '../lib/commanderOverrides'
import { getDeckPreferences } from '../lib/deckPreferences'
import { getBrainMirror } from '../lib/brain'
import { aiFetch, isClaudeActive, getClaudeModelLabel, getPendingAiJob, resumeAiJob, cancelAiJob } from '../lib/aiMode'
import { readApiError } from '../lib/apiError'
import { useAiMode } from '../hooks/useAiMode'
import { useAiJobProgress, describeAiProgress } from '../hooks/useAiJobProgress'
import ManaCost from '../components/ManaCost'

const JOB_KEY = 'cardfit'
const LAST_KEY = 'mtg_card_fit_last'
const MAX_CARDS = 400

// "1x Sol Ring (2X2) 312 *F*" → "Sol Ring": the usual list formats (ManaBox, Moxfield, MTGA).
function parseList(text) {
  const names = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*\d+\s*x?\s+/i, '').replace(/\s*\([A-Z0-9]{2,6}\)\s*[\w-]*\s*$/i, '').replace(/\s*\*[A-Z]+\*\s*$/i, '').trim()
    if (line && !/^(deck|sideboard|commander)$/i.test(line)) names.push(line)
  }
  return [...new Set(names)]
}

// "2026-10-12T09:41:07.123Z" → the local calendar day "2026-10-12".
const localDay = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('sv-SE')
}
const formatDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

const loadLast = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null') } catch { return null } }

// The deck audit turned around: a pile of new cards (a booster display, a trade, a set in the
// collection) checked against every deck — which card improves which deck, and what it replaces.
export default function CardFitPage() {
  useAiMode() // re-render when the AI switch changes
  const [collection] = useState(loadCollection)
  const locationIndex = useMemo(() => buildLocationIndex(collection), [collection])

  // Every set in the collection — the one with the most cards not yet in a deck first: a freshly
  // opened display sits in a binder, not in decks.
  const sets = useMemo(() => {
    const bySet = new Map()
    for (const card of collection?.cards || []) {
      if (!card.setCode) continue
      const entry = bySet.get(card.setCode) || { code: card.setCode, name: card.setName || card.setCode, count: 0, loose: 0 }
      entry.count += card.quantity || 1
      if (card.binderType !== 'deck') entry.loose += card.quantity || 1
      bySet.set(card.setCode, entry)
    }
    return [...bySet.values()].sort((a, b) => (b.loose - a.loose) || (b.count - a.count))
  }, [collection])

  // Scan days from ManaBox's "Added" column, newest first: a display is scanned in one go.
  const scanDays = useMemo(() => {
    const byDay = new Map()
    for (const card of collection?.cards || []) {
      const day = card.added ? localDay(card.added) : ''
      if (!day) continue
      const entry = byDay.get(day) || { day, count: 0, loose: 0 }
      entry.count += card.quantity || 1
      if (card.binderType !== 'deck') entry.loose += card.quantity || 1
      byDay.set(day, entry)
    }
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))
  }, [collection])

  const decks = useMemo(() => (collection?.decks || []).map(deck => ({
    name: deck.name,
    commander: getCommanderOverride(deck.name) || '',
    cards: getCardsForBinder(collection, deck.name).map(card => card.name),
    strategy: getDeckPreferences(deck.name).strategyOverride || ''
  })).sort((a, b) => a.name.localeCompare(b.name, 'de')), [collection])

  const [source, setSource] = useState(scanDays.length ? 'added' : sets.length ? 'set' : 'list')
  const [fromDay, setFromDay] = useState(scanDays[0]?.day || '')
  const [toDay, setToDay] = useState(scanDays[0]?.day || '')
  const [setCode, setSetCode] = useState(sets[0]?.code || '')
  const [looseOnly, setLooseOnly] = useState(true)
  const [listText, setListText] = useState('')
  const [chosenDecks, setChosenDecks] = useState(() => new Set(decks.filter(d => d.commander).map(d => d.name)))

  const cards = useMemo(() => {
    if (source === 'list') return parseList(listText)
    const inRange = (card) => {
      const day = card.added ? localDay(card.added) : ''
      return day && (!fromDay || day >= fromDay) && (!toDay || day <= toDay)
    }
    const names = (collection?.cards || [])
      .filter(card => (source === 'added' ? inRange(card) : card.setCode === setCode) && (!looseOnly || card.binderType !== 'deck'))
      .map(card => card.name)
    return [...new Set(names)]
  }, [source, listText, setCode, fromDay, toDay, looseOnly, collection])

  const [last, setLast] = useState(loadLast)
  const [running, setRunning] = useState(false)
  const [since, setSince] = useState(null)
  const [error, setError] = useState(null)
  const [, setTick] = useState(0)
  const progress = describeAiProgress(useAiJobProgress(JOB_KEY))
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [running])

  const finish = async (response, meta) => {
    if (!response.ok) { setError(await readApiError(response)); return }
    const result = await response.json()
    const entry = { at: new Date().toISOString(), label: meta?.label || '', count: meta?.count || 0, engine: response.headers.get('X-AI-Provider') === 'claude' ? 'claude' : 'gemini', result }
    setLast(entry)
    try { localStorage.setItem(LAST_KEY, JSON.stringify(entry)) } catch {}
  }

  // A check still running on the PC (page reloaded meanwhile): pick it up again.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    const pending = getPendingAiJob(JOB_KEY)
    if (!pending) return
    setRunning(true)
    setSince(pending.startedAt)
    resumeAiJob(JOB_KEY)
      .then(response => finish(response, pending.meta))
      .catch(err => { if (!err.cancelled) setError(err.message) })
      .finally(() => setRunning(false))
  }, [])

  const rangeLabel = fromDay === toDay ? `erfasst am ${formatDay(fromDay)}` : `erfasst ${fromDay ? `ab ${formatDay(fromDay)}` : ''}${toDay ? ` bis ${formatDay(toDay)}` : ''}`
  const sourceLabel = source === 'list'
    ? 'Eingefügte Liste'
    : `${source === 'set' ? sets.find(s => s.code === setCode)?.name || setCode : rangeLabel}${looseOnly ? ' (nicht in Decks)' : ''}`
  const selectedDecks = decks.filter(deck => deck.commander && chosenDecks.has(deck.name))

  const run = async () => {
    cancelAiJob(JOB_KEY)
    setRunning(true)
    setSince(Date.now())
    setError(null)
    const meta = { label: sourceLabel, count: Math.min(cards.length, MAX_CARDS) }
    const preferences = decks.map(deck => getBrainMirror(deck.name)?.preferences).find(Boolean) || ''
    try {
      const response = await aiFetch('/.netlify/functions/check-cards', {
        method: 'POST',
        body: JSON.stringify({ cards: cards.slice(0, MAX_CARDS).map(name => ({ name })), decks: selectedDecks, preferences })
      }, { jobKey: JOB_KEY, jobMeta: meta })
      await finish(response, meta)
    } catch (err) {
      if (!err.cancelled) setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const elapsed = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0
  const toggleDeck = (name) => setChosenDecks(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  if (!collection) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1>Neue Karten prüfen</h1>
        <p className="text-cmd-muted mb-4">Dafür braucht es deine Decks – lade zuerst deine Sammlung hoch.</p>
        <Link to="/upload" className="btn-primary inline-flex items-center min-h-[44px] px-5">Sammlung hochladen</Link>
      </div>
    )
  }

  const result = last?.result
  const withPicks = (result?.results || []).filter(r => r.picks.length).sort((a, b) => b.picks.length - a.picks.length)
  const withoutPicks = (result?.results || []).filter(r => !r.picks.length)

  return (
    <div className="max-w-5xl mx-auto">
      <h1>Neue Karten prüfen</h1>
      <p className="mb-6 leading-relaxed max-w-3xl" style={{ color: 'var(--color-text-secondary)' }}>
        Andersherum analysiert: Du hast neue Karten – ein Booster-Display, ein Tausch – und willst wissen, welche davon
        deine Decks wirklich besser machen und was sie dort ersetzen würden.
      </p>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start mb-8">
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">1. Welche Karten?</h2>
          <div className="flex flex-wrap gap-2">
            {[['added', 'Nach Erfassungsdatum'], ['set', 'Nach Set'], ['list', 'Liste einfügen']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSource(key)}
                aria-pressed={source === key}
                className="px-4 min-h-[40px] text-sm font-semibold"
                style={{
                  background: source === key ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: source === key ? 'var(--color-bg)' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {source === 'added' && (
            scanDays.length ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="block mb-1">Erfasst ab</span>
                    <input type="date" value={fromDay} max={toDay || undefined} onChange={(e) => setFromDay(e.target.value)} className="text-fg rounded-xl p-2 text-sm min-h-[44px]" />
                  </label>
                  <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <span className="block mb-1">bis</span>
                    <input type="date" value={toDay} min={fromDay || undefined} onChange={(e) => setToDay(e.target.value)} className="text-fg rounded-xl p-2 text-sm min-h-[44px]" />
                  </label>
                </div>
                <div>
                  <span className="text-xs block mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Deine letzten Scan-Tage</span>
                  <div className="flex flex-wrap gap-1.5">
                    {scanDays.slice(0, 8).map(day => {
                      const on = fromDay === day.day && toDay === day.day
                      return (
                        <button
                          key={day.day}
                          type="button"
                          onClick={() => { setFromDay(day.day); setToDay(day.day) }}
                          aria-pressed={on}
                          className="px-2.5 min-h-[36px] [@media(pointer:coarse)]:min-h-[40px] text-xs tabular-nums"
                          style={{
                            background: on ? 'var(--color-accent)' : 'var(--color-surface)',
                            color: on ? 'var(--color-bg)' : 'var(--color-text)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)'
                          }}
                        >
                          {formatDay(day.day)} · {day.count}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Deine gespeicherte Sammlung kennt das Erfassungsdatum noch nicht. Lade deinen ManaBox-Export einmal neu hoch
                (<Link to="/upload" className="underline">Sammlung hochladen</Link>) – danach kannst du hier nach Scan-Tag filtern.
              </p>
            )
          )}

          {source === 'set' && (
            sets.length ? (
              <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className="w-full text-fg rounded-xl p-2.5 text-sm min-h-[44px]" aria-label="Set wählen">
                {sets.map(set => (
                  <option key={set.code} value={set.code}>{set.name} ({set.code}) – {set.count} Karten, {set.loose} nicht in Decks</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-cmd-muted">In deiner Sammlung stehen keine Set-Angaben – füge die Karten als Liste ein.</p>
            )
          )}

          {source !== 'list' && (scanDays.length > 0 || source === 'set') && (
            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={looseOnly} onChange={(e) => setLooseOnly(e.target.checked)} className="mt-1" />
              <span>Nur Karten, die noch in keinem Deck stecken</span>
            </label>
          )}

          {source === 'list' && (
            <textarea
              value={listText}
              onChange={(e) => setListText(e.target.value)}
              placeholder={'Eine Karte pro Zeile, z. B.\n1 Mana Crypt\n1x The Ur-Dragon (2X2) 12'}
              className="w-full text-fg rounded-xl p-3 h-48 resize-y text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
            />
          )}
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <span className="tabular-nums font-semibold text-fg">{cards.length}</span> verschiedene Karten
            {cards.length > MAX_CARDS && ` – geprüft werden die ersten ${MAX_CARDS}`}
            {' '}· Standardländer und Karten, die schon im jeweiligen Deck sind, fallen automatisch raus.
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-bold">2. Gegen welche Decks?</h2>
          <ul className="max-h-72 overflow-y-auto -mx-1">
            {decks.map(deck => (
              <li key={deck.name}>
                <label className="flex items-start gap-2 px-1 py-1.5 text-sm cursor-pointer" style={{ opacity: deck.commander ? 1 : 0.55 }}>
                  <input type="checkbox" checked={Boolean(deck.commander) && chosenDecks.has(deck.name)} disabled={!deck.commander} onChange={() => toggleDeck(deck.name)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="font-medium block truncate text-fg">{deck.name}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{deck.commander || 'kein Commander gemerkt'}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={run}
            disabled={running || !cards.length || !selectedDecks.length}
            className="btn-primary w-full min-h-[44px]"
          >
            {running ? 'Prüfe …' : `${Math.min(cards.length, MAX_CARDS)} Karten gegen ${selectedDecks.length} Decks prüfen`}
          </button>
          <p className="text-xs leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            {isClaudeActive()
              ? `Mit Claude ${getClaudeModelLabel()} – bei einem ganzen Display einige Minuten.`
              : 'Mit Gemini (online). Für ein ganzes Display ist der Claude-Modus deutlich gründlicher.'}
          </p>
        </section>
      </div>

      {running && (
        <div className="card mb-6 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-mtg-blue rounded-full flex-shrink-0" />
          <p className="text-sm text-fg-2">
            Prüfe die Karten gegen deine Decks … <span className="tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
            {progress && <span className="block text-xs text-fg-muted mt-0.5">Claude {progress}</span>}
          </p>
        </div>
      )}
      {error && !running && (
        <div className="card mb-6" style={{ borderColor: 'var(--r)' }}>
          <p className="text-sm" style={{ color: 'var(--r)' }}>{error}</p>
        </div>
      )}

      {result && !running && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-xl font-bold">Ergebnis</h2>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {last.label} · {last.count} Karten · {new Date(last.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          </div>
          {result.parseError && <p className="text-sm mb-3" style={{ color: 'var(--r)' }}>Die Antwort der KI war unvollständig – bitte noch einmal prüfen.</p>}
          {result.summary && <p className="leading-relaxed mb-6 max-w-3xl text-fg-2">{result.summary}</p>}

          <div className="space-y-4">
            {withPicks.map(deck => (
              <div key={deck.deck} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold">{deck.deck}</h3>
                    <p className="text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                      {deck.colors?.length > 0 && <ManaCost cost={['W', 'U', 'B', 'R', 'G'].filter(c => deck.colors.includes(c)).map(c => `{${c}}`).join('')} size={13} />}
                      {deck.commander}
                    </p>
                  </div>
                  <Link to={`/decks/${encodeURIComponent(deck.deck)}`} className="btn-secondary text-sm px-4 min-h-[40px] inline-flex items-center">Deck öffnen</Link>
                </div>
                <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {deck.picks.map(pick => {
                    const where = formatCardLocations(locationsFromIndex(locationIndex, pick.card))
                    return (
                      <li key={pick.card} className="flex gap-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
                        {pick.image
                          ? <img src={pick.image} alt="" loading="lazy" className="w-16 flex-shrink-0 self-start" style={{ borderRadius: 4 }} />
                          : <span className="w-16 h-[90px] flex-shrink-0" style={{ background: 'var(--color-surface)', borderRadius: 4 }} />}
                        <div className="min-w-0 text-sm">
                          <div className="font-semibold text-fg">
                            {pick.card}
                            {pick.eur ? <span className="font-normal text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>€{Number(pick.eur).toFixed(2)}</span> : null}
                          </div>
                          {where && <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>📍 {where}</div>}
                          <p className="mt-1 text-fg-2 leading-snug">{pick.reason}</p>
                          {pick.cut && (
                            <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                              <span style={{ color: 'var(--r)' }}>statt {pick.cut}</span>{pick.cutReason ? ` – ${pick.cutReason}` : ''}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          {withPicks.length === 0 && <p className="text-sm text-cmd-muted">Keine der Karten ist für eines deiner Decks eine echte Verbesserung.</p>}
          {withoutPicks.length > 0 && (
            <p className="text-sm mt-4" style={{ color: 'var(--color-text-muted)' }}>
              Nichts dabei für: {withoutPicks.map(d => d.deck).join(', ')}
            </p>
          )}

          <div className="mt-6 space-y-2">
            {[
              ['Passt farblich, aber keine Verbesserung', result.unpicked],
              ['Passt farblich in keins der Decks', result.fitsNowhere],
              ['Nicht gefunden (Name prüfen)', result.unknown]
            ].filter(([, list]) => list?.length).map(([label, list]) => (
              <details key={label} className="card">
                <summary className="cursor-pointer text-sm font-semibold min-h-[32px] flex items-center">
                  {label} <span className="font-normal tabular-nums ml-1" style={{ color: 'var(--color-text-muted)' }}>({list.length})</span>
                </summary>
                <p className="text-sm mt-2 leading-relaxed text-fg-2">{list.join(' · ')}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
