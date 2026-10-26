import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadSecondaryCollections } from '../lib/secondaryCollections'
import { loadCollection, getAvailableQuantities } from '../lib/collection'
import { loadCardData } from '../lib/cardData'
import { aiFetch, cancelAiJob, isClaudeActive, getClaudeModelLabel } from '../lib/aiMode'
import { readApiError } from '../lib/apiError'
import { BASIC_LAND_NAMES } from '../lib/cardType'
import { useAiJobProgress, describeAiProgress } from '../hooks/useAiJobProgress'
import { useCommanderColors } from './CommanderColors'

// check-cards takes up to 400 cards per request; a big friend's binder is checked in parts.
const CHUNK = 400
const MAX_CHUNKS = 3

const storeKey = (key) => `mtg_friend_fit:${key}`
const loadLast = (key) => { try { return JSON.parse(localStorage.getItem(storeKey(key)) || 'null') } catch { return null } }

/**
 * "Bei Freunden suchen" on a deck's analysis: the friends' collections the player picks are
 * searched for cards that improve THIS deck — with the reason, what they'd replace, and who
 * has them. Cards the player owns a free copy of are left out (nothing to borrow).
 */
export default function FriendCardSearch({ commander, deckName, storageKey, deckCards, strategy, onOpenEditor }) {
  const [friends] = useState(loadSecondaryCollections)
  const [chosen, setChosen] = useState(() => new Set(friends.map(f => f.id)))
  const [last, setLast] = useState(() => loadLast(storageKey))
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState(null)
  const { colors: identity } = useCommanderColors(commander)
  const jobKey = `friendfit:${storageKey}`
  const progress = describeAiProgress(useAiJobProgress(jobKey))

  useEffect(() => { setLast(loadLast(storageKey)) }, [storageKey])

  if (!friends.length) {
    return (
      <section className="card mb-8">
        <h3 className="text-lg font-bold mb-1">Bei Freunden suchen</h3>
        <p className="text-sm text-fg-muted mb-3">
          Lade die ManaBox-CSV eines Freundes hoch – dann findet die Analyse Karten in seiner Sammlung, die dieses Deck verbessern.
        </p>
        <Link to="/upload" className="btn-secondary text-sm px-4 min-h-[40px] inline-flex items-center">Freundes-Sammlung hinzufügen</Link>
      </section>
    )
  }

  const toggle = (id) => setChosen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const run = async () => {
    cancelAiJob(jobKey)
    setRunning(true)
    setError(null)
    try {
      const picked = friends.filter(f => chosen.has(f.id))
      const own = getAvailableQuantities(loadCollection(), deckName)
      const inDeck = new Set([...(deckCards || []).map(c => c.name.toLowerCase()), ...String(commander).split(/\s*(?:\+|&&)\s*/).map(n => n.toLowerCase())])

      // Every card the chosen friends have, with who has how many.
      const owners = new Map()
      const idFor = new Map()
      const ownedNames = new Set()
      for (const friend of picked) {
        for (const row of friend.cards || []) {
          if (!row.name || BASIC_LAND_NAMES.has(row.name) || inDeck.has(row.name.toLowerCase())) continue
          if (own.get(row.name)?.available > 0) { ownedNames.add(row.name); continue }
          const list = owners.get(row.name) || []
          const hit = list.find(o => o.label === friend.label)
          if (hit) hit.quantity += row.quantity || 1
          else list.push({ label: friend.label, quantity: row.quantity || 1 })
          owners.set(row.name, list)
          if (row.scryfallId && !idFor.has(row.name)) idFor.set(row.name, row.scryfallId)
        }
      }
      let names = [...owners.keys()]

      // Sure misfits out before the AI sees them: a card's own colors outside the commander's
      // identity (the server checks the full identity once more).
      setStep(`Prüfe Farben von ${names.length} Karten …`)
      let byId = {}
      await loadCardData({ ids: names.map(n => idFor.get(n)).filter(Boolean), onUpdate: (data) => { byId = data.byId } })
      const fits = (name) => {
        const colors = String(byId[idFor.get(name)]?.colors || '').split(/\s+/).filter(Boolean)
        return !identity || colors.every(c => identity.includes(c))
      }
      names = names.filter(fits)
      // Too many for one pass: the more valuable cards first (a rough stand-in for power).
      names.sort((a, b) => (byId[idFor.get(b)]?.eur || 0) - (byId[idFor.get(a)]?.eur || 0))
      const checked = names.slice(0, CHUNK * MAX_CHUNKS)

      const deck = {
        name: deckName || storageKey || commander,
        commander,
        cards: (deckCards || []).map(c => c.name),
        strategy: strategy || ''
      }
      const picks = []
      const summaries = []
      const parts = Math.ceil(checked.length / CHUNK)
      for (let i = 0; i < parts; i += 1) {
        setStep(parts > 1 ? `Teil ${i + 1} von ${parts}: ${CHUNK} Karten …` : `Prüfe ${checked.length} Karten gegen dein Deck …`)
        const response = await aiFetch('/.netlify/functions/check-cards', {
          method: 'POST',
          body: JSON.stringify({ cards: checked.slice(i * CHUNK, (i + 1) * CHUNK).map(name => ({ name })), decks: [deck] })
        }, { jobKey, jobMeta: { commander } })
        if (!response.ok) throw new Error(await readApiError(response))
        const result = await response.json()
        if (result.summary) summaries.push(result.summary)
        for (const pick of result.results?.[0]?.picks || []) {
          if (!picks.some(p => p.card === pick.card)) picks.push({ ...pick, owners: owners.get(pick.card) || [] })
        }
      }

      const entry = {
        at: new Date().toISOString(),
        commander,
        friends: picked.map(f => f.label),
        checked: checked.length,
        dropped: names.length - checked.length,
        skippedOwned: ownedNames.size,
        summary: summaries.join(' '),
        picks
      }
      setLast(entry)
      try { localStorage.setItem(storeKey(storageKey), JSON.stringify(entry)) } catch { /* storage full: shown, not kept */ }
    } catch (err) {
      if (!err.cancelled) setError(err.message)
    } finally {
      setRunning(false)
      setStep('')
    }
  }

  const result = last && last.commander === commander ? last : null
  const adds = result?.picks.map(p => ({ name: p.card, reason: p.reason, eur: p.eur })) || []
  const cuts = result?.picks.filter(p => p.cut).map(p => ({ name: p.cut, reason: p.cutReason })) || []

  return (
    <section className="card mb-8">
      <h3 className="text-lg font-bold mb-1">Bei Freunden suchen</h3>
      <p className="text-sm text-fg-muted mb-3">
        Welche Karten aus den Sammlungen deiner Freunde machen dieses Deck besser? Karten, die du selbst frei hast, bleiben außen vor.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {friends.map(friend => {
          const count = (friend.cards || []).reduce((sum, c) => sum + (c.quantity || 1), 0)
          return (
            <label key={friend.id} className="inline-flex items-center gap-2 text-sm px-3 py-2 cursor-pointer" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: chosen.has(friend.id) ? 'var(--color-surface)' : 'transparent' }}>
              <input type="checkbox" checked={chosen.has(friend.id)} onChange={() => toggle(friend.id)} />
              <span className="text-fg">{friend.label}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{count} Karten</span>
            </label>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={running || chosen.size === 0} className="btn-primary text-sm px-5 min-h-[44px]">
          {running ? 'Suche läuft …' : chosen.size === friends.length && friends.length > 1 ? 'Alle Freunde durchsuchen' : 'Sammlung durchsuchen'}
        </button>
        {running && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {step}{isClaudeActive() ? ` · Claude ${getClaudeModelLabel()}` : ''}{progress ? ` · ${progress}` : ''}
          </span>
        )}
      </div>
      {error && <p className="text-sm mt-3" style={{ color: 'var(--r)' }}>{error}</p>}

      {result && !running && (
        <div className="mt-5">
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            {new Date(result.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {result.friends.join(', ')} · {result.checked} Karten geprüft
            {result.dropped > 0 ? ` (die ${result.dropped} günstigsten nicht)` : ''}
            {result.skippedOwned > 0 ? ` · ${result.skippedOwned} hast du selbst` : ''}
          </p>
          {result.summary && <p className="text-sm leading-relaxed mb-3 text-fg-2">{result.summary}</p>}
          {result.picks.length === 0 ? (
            <p className="text-sm text-fg-muted">Nichts gefunden, was dieses Deck wirklich besser macht.</p>
          ) : (
            <>
              <ul className="divide-y mb-4" style={{ borderColor: 'var(--color-border)' }}>
                {result.picks.map(pick => (
                  <li key={pick.card} className="flex gap-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
                    {pick.image
                      ? <img src={pick.image} alt="" loading="lazy" className="w-16 flex-shrink-0 self-start" style={{ borderRadius: 4 }} />
                      : <span className="w-16 h-[90px] flex-shrink-0" style={{ background: 'var(--color-surface)', borderRadius: 4 }} />}
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-fg">
                        {pick.card}
                        {pick.eur ? <span className="font-normal text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>€{Number(pick.eur).toFixed(2)}</span> : null}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--gold)' }}>
                        bei {pick.owners.map(o => (o.quantity > 1 ? `${o.label} (${o.quantity}×)` : o.label)).join(', ')}
                      </div>
                      <p className="mt-1 text-fg-2 leading-snug">{pick.reason}</p>
                      {pick.cut && (
                        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
                          <span style={{ color: 'var(--r)' }}>statt {pick.cut}</span>{pick.cutReason ? ` – ${pick.cutReason}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {onOpenEditor && (
                <button type="button" onClick={() => onOpenEditor(adds, cuts)} className="btn-secondary text-sm px-4 min-h-[40px]">
                  Im Editor ausprobieren
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
