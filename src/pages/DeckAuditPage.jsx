import { useState, useMemo, useEffect, useRef } from 'react'
import CardTile from '../components/CardTile'
import { readApiError } from '../lib/apiError'
import ChatWidget from '../components/ChatWidget'
import { getDeckPreferences, setDeckPreferences } from '../lib/deckPreferences'
import { getSecondaryAvailability } from '../lib/secondaryCollections'
import { aiFetch, isClaudeActive, getClaudeModelLabel, formatModelId, getPendingAiJob, resumeAiJob, getBridgeTarget, cancelAiJob } from '../lib/aiMode'
import { loadCollection, buildLocationIndex, locationsFromIndex, formatCardLocations } from '../lib/collection'
import { getDeckMemory, updateDeckMemory, forgetDeckMemoryEntry } from '../lib/deckMemory'
import { getBrainMirror, refreshBrain, brainRequestFields, logToBrain } from '../lib/brain'
import { useAiMode } from '../hooks/useAiMode'
import { useAiJobProgress, describeAiProgress } from '../hooks/useAiJobProgress'

const normalizeName = (name) => String(name || '').split('//')[0].trim().toLowerCase()
const sameCard = (a, b) => normalizeName(a) === normalizeName(b)
// "Wrexial, the Risen Deep" → "Wrexial": for buttons, where the full name is too long.
const shortName = (name) => String(name || '').split(',')[0].trim()

// Older saved plans/results don't say which commander they were made for — then their text
// has to mention the current one (a game plan is always written around the commander).
function mentionsCommander(text, commander) {
  const words = String(commander || '').split(/[\s,]+/).filter(word => word.length >= 4)
  const lower = String(text || '').toLowerCase()
  return words.some(word => lower.includes(word.toLowerCase()))
}

function planBelongsTo(savedFor, text, commander) {
  return savedFor ? sameCard(savedFor, commander) : mentionsCommander(text, commander)
}

// Embedded as the "Analyse" tab of a deck's consolidated detail page — no longer a standalone
// route. `cachedAudit`/`onAuditComplete` let the parent remember the last result across tab
// switches (so hopping to another tab and back doesn't silently re-run a real AI call), and
// `onOpenEditor`/`onBack` switch tabs on that page instead of navigating to a separate route.
// `storageKey` (default: deckName) is where the strategy correction is remembered — a draft
// passes "draft:<id>" so it never collides with a real ManaBox deck of the same name.
// `onChangeCommander`: lets the Analyse tab send the player to wherever the commander is set.
export default function DeckAuditPage({ commander, deckName, storageKey = deckName, deckCards, collectionSampleNames, powerLevel, cachedAudit, onAuditComplete, onAnalysisStart, onOpenEditor, onBack, onChangeCommander, backLabel = '← Zurück zur Übersicht' }) {
  // The remembered game plan belongs to ONE commander. It is fed into every new analysis as
  // binding — so after switching the commander (e.g. the guess said Sheoldred, the deck is
  // Wrexial) the old plan must not come along, or the analysis can never leave it.
  const deckPrefs = getDeckPreferences(storageKey)
  const rememberedStrategy = deckPrefs.strategyOverride && planBelongsTo(deckPrefs.strategyCommander, deckPrefs.strategyOverride, commander)
    ? deckPrefs.strategyOverride
    : ''
  // Only a plan the player wrote or corrected binds the next analysis. The AI's own last read is
  // kept for display, but sending it back as "confirmed by the player" made the AI repeat its
  // first guess forever (e.g. a Nekusar deck analysed around Ghyrson Starn from its 99 every time).
  const playerStrategy = deckPrefs.strategyByPlayer ? rememberedStrategy : ''

  const [audit, setAudit] = useState(cachedAudit || null)
  // The user's own collection — for where each "Aus deiner Sammlung" card is stored.
  const [collection] = useState(loadCollection)
  const locationIndex = useMemo(() => buildLocationIndex(collection), [collection])
  const [loading, setLoading] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [error, setError] = useState(null)
  const [suggestionsError, setSuggestionsError] = useState(null)
  const [strategyDraft, setStrategyDraft] = useState(rememberedStrategy)
  const [editingStrategy, setEditingStrategy] = useState(false)
  // What earlier analyses led to (adds kept, cuts made) — sent along so the next analysis
  // doesn't flip-flop on them. Updated from the previous result each time a new one starts.
  const [deckMemory, setDeckMemory] = useState(() => getDeckMemory(storageKey))
  const [showMemory, setShowMemory] = useState(false)
  // Last known state of this deck's Obsidian note (core cards, notes) — see lib/brain.js.
  const [brainMirror, setBrainMirror] = useState(() => getBrainMirror(storageKey))
  // Re-read the note when the page opens (and once the bridge turns up), so edits made in
  // Obsidian show here before the next analysis starts.
  const bridgeReachable = useAiMode().bridge.reachable
  useEffect(() => {
    let cancelled = false
    refreshBrain(storageKey, { deck: deckName, commander }).then(mirror => { if (!cancelled) setBrainMirror(mirror) })
    return () => { cancelled = true }
  }, [storageKey, deckName, commander, bridgeReachable])

  const formatStrategy = (strategy) => strategy
    ? `Win Condition: ${strategy.winCondition}\n\nSpielplan: ${strategy.gamePlan}\n\nSchwächen: ${strategy.weaknesses}`
    : ''

  // Claude calls are remembered under these keys, so the result is picked up again if the
  // browser reloaded the page meanwhile (tablet in standby) — see aiFetch/resumeAiJob.
  const strategyJobKey = `audit:${storageKey}:strategy`
  const suggestionsJobKey = `audit:${storageKey}:suggestions`
  // What Claude is doing in each of them right now — so a long run visibly lives.
  const strategyProgress = describeAiProgress(useAiJobProgress(strategyJobKey))
  const suggestionsProgress = describeAiProgress(useAiJobProgress(suggestionsJobKey))

  // Running time while Claude works — an Opus analysis takes minutes, the suggestions too.
  const [loadingSince, setLoadingSince] = useState(null)
  const [suggestionsSince, setSuggestionsSince] = useState(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!loading && !loadingSuggestions) return undefined
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [loading, loadingSuggestions])
  const clock = (since) => {
    const seconds = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }
  const elapsedLabel = clock(loadingSince)

  // Each "Analysieren" starts a new run. Answers of an older run that arrive later (it was
  // still busy when the player started over) are ignored, and its jobs on the PC stopped.
  const runRef = useRef(0)

  const handleSuggestionsResponse = async (response) => {
    if (!response.ok) {
      setSuggestionsError(await readApiError(response))
      return
    }
    const data = await response.json()
    const where = (name) => formatCardLocations(locationsFromIndex(locationIndex, name))
    const fromCollection = (data.cardsToAdd || []).map(c => (where(c.name) ? `${c.name} (📍 ${where(c.name)})` : c.name))
    const toBuy = (data.cardsToBuy || []).map(c => (c.eur != null ? `${c.name} (€${Number(c.eur).toFixed(2)})` : c.estimatedCost ? `${c.name} (${c.estimatedCost})` : c.name))
    // Another tab of this deck already logged this result.
    if (!response.handledElsewhere) logToBrain({
      deck: deckName,
      commander,
      title: 'Vorschläge',
      lines: [
        fromCollection.length ? `Aus der Sammlung: ${fromCollection.join(', ')}` : null,
        toBuy.length ? `Zukauf: ${toBuy.join(', ')}` : null
      ]
    })
    setAudit(prev => {
      const merged = { ...prev, cardsToAdd: data.cardsToAdd, cardsToBuy: data.cardsToBuy }
      onAuditComplete?.(merged)
      return merged
    })
    if (data.parseError) {
      setSuggestionsError('Die Kaufvorschläge wurden wegen Längenlimit abgeschnitten, bevor sie fertig waren.')
    }
  }

  // cardsToAdd/cardsToBuy (the uncapped half, scanning a collection of up to 2000 names) ran
  // in the same request as the strategy read and reliably blew Netlify's 30s budget once both
  // the collection sample and the suggestion counts were uncapped. Split into two requests —
  // each with its own fresh 30s window — the same chunking idea already used for the
  // Preisgewinner scan. Phase 2 needs phase 1's "strategy" object as input, so it only starts
  // once phase 1 has actually returned one. `pending`: a remembered job to wait for instead.
  const runSuggestions = async (strategy, pending = null) => {
    const run = runRef.current
    try {
      setLoadingSuggestions(true)
      setSuggestionsSince(pending ? getPendingAiJob(suggestionsJobKey)?.startedAt || Date.now() : Date.now())
      setSuggestionsError(null)
      const response = pending ? await pending : await aiFetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, collectionSampleNames, strategy, phase: 'suggestions', removedCards: getDeckMemory(storageKey).removed, brainNotes: brainRequestFields(getBrainMirror(storageKey)).brainNotes })
      }, { jobKey: suggestionsJobKey, jobMeta: { commander } })
      if (run !== runRef.current) return
      await handleSuggestionsResponse(response)
    } catch (err) {
      if (err.cancelled || run !== runRef.current) return
      console.error('Error:', err)
      setSuggestionsError(err.message)
    } finally {
      if (run === runRef.current) setLoadingSuggestions(false)
    }
  }

  // context: what the logbook entry needs besides the answer — kept with a remembered job.
  const handleStrategyResponse = async (response, { engine, newlyKept = [], newlyRemoved = [], strategyOverride = null, commander: madeFor = commander }) => {
    // A result for another commander (the commander was changed while it ran) is obsolete.
    if (!sameCard(madeFor, commander)) {
      setLoading(false)
      return
    }
    if (!response.ok) {
      setError(await readApiError(response))
      setLoading(false)
      return
    }
    const data = await response.json()
    // The bridge reports the exact model that answered (e.g. "claude-opus-5-5").
    const engineModel = engine === 'claude' ? response.headers.get('X-AI-Model') : null
    const partial = { ...data, cardsToAdd: [], cardsToBuy: [], engine, engineModel, commander }
    // Another tab of this deck already logged this result.
    if (!response.handledElsewhere) logToBrain({
      deck: deckName,
      commander,
      title: `Analyse (${engine === 'claude' ? `Claude ${formatModelId(engineModel) || getClaudeModelLabel()}` : 'Gemini'})`,
      lines: [
        (newlyKept.length || newlyRemoved.length)
          ? `Seit der letzten Analyse übernommen – rein: ${newlyKept.join(', ') || '–'} · raus: ${newlyRemoved.join(', ') || '–'}`
          : null,
        data.strategy?.winCondition ? `Siegbedingung: ${data.strategy.winCondition.slice(0, 300)}` : null,
        data.strategy?.weaknesses ? `Schwächen: ${data.strategy.weaknesses.slice(0, 300)}` : null,
        `Streichen vorgeschlagen: ${(data.cardsToCut || []).map(c => `${c.name} (${String(c.reason || '').slice(0, 120)})`).join('; ') || 'nichts'}`
      ]
    })
    setAudit(partial)
    onAuditComplete?.(partial)
    // A fresh AI read (no override) is persisted too, not just an explicit manual
    // correction — otherwise running "Analysieren" once leaves nothing to show on the
    // deck's own page, since that page only ever read the remembered override.
    if (!strategyOverride) {
      const formatted = formatStrategy(data.strategy)
      setStrategyDraft(formatted)
      if (formatted) setDeckPreferences(storageKey, { strategyOverride: formatted, strategyCommander: commander, strategyByPlayer: false })
    }
    setEditingStrategy(false)
    setLoading(false)
    if (data.strategy && !data.parseError) {
      runSuggestions(data.strategy)
    }
  }

  const runAudit = async (strategyOverride) => {
    const run = ++runRef.current
    // A previous run of this deck that is still busy on the PC is replaced, not run twice.
    cancelAiJob(strategyJobKey)
    cancelAiJob(suggestionsJobKey)
    try {
      setLoading(true)
      setLoadingSince(Date.now())
      setLoadingSuggestions(false)
      setError(null)
      setSuggestionsError(null)

      // Fold the previous result into the deck memory before it gets replaced.
      const previousMemory = getDeckMemory(storageKey)
      const memory = updateDeckMemory(storageKey, audit, deckCards)
      setDeckMemory(memory)
      const newlyKept = memory.kept.filter(n => !previousMemory.kept.includes(n))
      const newlyRemoved = memory.removed.filter(n => !previousMemory.removed.includes(n))

      // The player's own notes and core cards from Obsidian (or their last mirrored state).
      const brain = await refreshBrain(storageKey, { deck: deckName, commander })
      setBrainMirror(brain)

      // Remembered with the result, so a saved analysis still says which AI wrote it.
      const engine = isClaudeActive() ? 'claude' : 'gemini'
      const context = { engine, newlyKept, newlyRemoved, strategyOverride: strategyOverride || null, commander }
      onAnalysisStart?.()
      const response = await aiFetch('/.netlify/functions/audit-deck', {
        method: 'POST',
        body: JSON.stringify({ commander, deckName, deckCards, strategyOverride, powerLevel, phase: 'strategy', keptCards: memory.kept, ...brainRequestFields(brain) })
      }, { jobKey: strategyJobKey, jobMeta: context })
      if (run !== runRef.current) return
      await handleStrategyResponse(response, context)
    } catch (err) {
      if (err.cancelled || run !== runRef.current) return
      console.error('Error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  // A Claude job still running on the PC from before a reload: wait for it again instead of
  // starting over. (Ref: React's dev double-run must not pick it up twice.)
  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current) return
    resumedRef.current = true
    // A job made for another commander is not picked up — its result would show up under this
    // one. (Changing the commander stops such jobs on the PC: DeckDetailPage.saveCommander.)
    const forThisCommander = (job) => job && (!job.meta?.commander || sameCard(job.meta.commander, commander))
    const pendingStrategy = forThisCommander(getPendingAiJob(strategyJobKey)) ? getPendingAiJob(strategyJobKey) : null
    if (pendingStrategy) {
      setLoading(true)
      setLoadingSince(pendingStrategy.startedAt)
      resumeAiJob(strategyJobKey)
        .then(response => handleStrategyResponse(response, { ...(pendingStrategy.meta || {}), engine: 'claude' }))
        .catch(err => { setError(err.message); setLoading(false) })
    } else if (forThisCommander(getPendingAiJob(suggestionsJobKey))) {
      runSuggestions(null, resumeAiJob(suggestionsJobKey))
    }
  }, [])

  // Which commander the shown result was made for (older results: judged by their game plan).
  const auditIsForOtherCommander = Boolean(audit) && (audit.commander
    ? !sameCard(audit.commander, commander)
    : Boolean(audit.strategy) && !mentionsCommander(formatStrategy(audit.strategy), commander))

  const runFreshForCommander = () => {
    setDeckPreferences(storageKey, { strategyOverride: '', strategyCommander: commander, strategyByPlayer: false })
    setStrategyDraft('')
    setEditingStrategy(false)
    runAudit()
  }

  if (!commander || !deckCards) {
    return <p className="text-[color:var(--r)]">Keine Daten zum Analysieren</p>
  }

  if (!audit && !loading && !error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <p className="text-cmd-muted mb-4">Noch keine Analyse für dieses Deck gelaufen.</p>
        <p className="text-sm text-fg-2 mb-4">
          Commander: <strong className="text-fg">{commander}</strong>
          {onChangeCommander && <> · <button type="button" onClick={onChangeCommander} className="underline">ändern</button></>}
        </p>
        <button onClick={() => runAudit(playerStrategy || undefined)} className="btn-primary">
          🔍 Jetzt analysieren
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-gray-600 border-t-mtg-blue rounded-full mb-4"></div>
          <p className="text-fg-2 mb-2">Analysiere {deckName}...</p>
          <p className="text-sm text-fg-muted">
            {isClaudeActive()
              ? `🧠 Claude ${getClaudeModelLabel()} prüft Kartentexte auf Scryfall & EDHREC — das kann einige Minuten dauern`
              : 'Dies kann eine Minute dauern'}
          </p>
          {isClaudeActive() && (
            <p className="text-sm text-fg-muted mt-3">
              Läuft auf {getBridgeTarget() === 'remote' ? 'deinem PC' : 'diesem PC'} · <span className="tabular-nums">{elapsedLabel}</span>
              {strategyProgress && <><br />Claude {strategyProgress}</>}
              {getBridgeTarget() === 'remote' && <><br />Du kannst das Gerät zwischendurch sperren – das Ergebnis wartet auf dem PC.</>}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card bg-red-900/20 border-red-700 mb-6">
          <p className="text-[color:var(--r)]">❌ {error}</p>
        </div>
        <button onClick={() => runAudit()} className="btn-primary w-full">
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="card mb-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-2">
          <strong className="text-fg">Commander:</strong> {commander}
          {powerLevel && <span className="text-fg-muted"> · {powerLevel}</span>}
        </p>
        {onChangeCommander && (
          <button type="button" onClick={onChangeCommander} className="btn-secondary text-xs px-3 min-h-[36px]">
            Commander ändern
          </button>
        )}
      </div>

      {auditIsForOtherCommander && (
        <div role="alert" className="card mb-4" style={{ borderLeft: '4px solid var(--gold)' }}>
          <p className="text-sm text-fg leading-relaxed mb-3">
            {audit.commander
              ? <>Diese Analyse wurde für <strong>{audit.commander}</strong> erstellt – dein Commander ist jetzt <strong>{commander}</strong>.</>
              : <>Diese Analyse und ihr Spielplan drehen sich nicht um <strong>{commander}</strong> – sie stammen vermutlich von einem anderen (geratenen) Commander.</>}
            {' '}Die neue Analyse startet ohne den alten Spielplan.
          </p>
          <button type="button" onClick={runFreshForCommander} className="btn-primary text-sm px-4 min-h-[44px]">
            🔄 Für {shortName(commander)} neu analysieren
          </button>
        </div>
      )}

      {brainMirror && (
        <div className="card mb-4 py-3">
          <p className="text-sm leading-relaxed text-fg-2">
            <strong className="text-fg">🧠 Obsidian:</strong>{' '}
            {brainMirror.coreCards?.length
              ? <>{brainMirror.coreCards.length} Kernkarte{brainMirror.coreCards.length === 1 ? '' : 'n'} geschützt ({brainMirror.coreCards.map(c => c.name).join(', ')})</>
              : <>keine Kernkarten <span className="text-fg-muted">(in Obsidian unter Decks › {deckName || commander} eintragen)</span></>}
            {(brainMirror.strategy || brainMirror.notes) && ' · Strategie/Notizen'}
            {brainMirror.preferences && ' · Vorlieben'}
            {' fließen in die Analyse ein'}
            <span className="text-fg-muted"> · Stand {new Date(brainMirror.fetchedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{brainMirror.file ? ` · ${brainMirror.file}` : ''}</span>
          </p>
        </div>
      )}

      {(deckMemory.kept.length > 0 || deckMemory.removed.length > 0) && (
        <div className="card mb-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm leading-relaxed text-fg-2">
              <strong className="text-fg">🧠 Deck-Gedächtnis:</strong>{' '}
              {deckMemory.kept.length > 0 && <>{deckMemory.kept.length} übernommene Ergänzung{deckMemory.kept.length === 1 ? '' : 'en'} {deckMemory.kept.length === 1 ? 'wird' : 'werden'} nicht mehr zum Streichen vorgeschlagen</>}
              {deckMemory.kept.length > 0 && deckMemory.removed.length > 0 && ' · '}
              {deckMemory.removed.length > 0 && <>{deckMemory.removed.length} gestrichene Karte{deckMemory.removed.length === 1 ? '' : 'n'} {deckMemory.removed.length === 1 ? 'wird' : 'werden'} nicht erneut vorgeschlagen</>}
            </p>
            <button type="button" onClick={() => setShowMemory(v => !v)} className="text-xs underline whitespace-nowrap text-fg-2">
              {showMemory ? 'Ausblenden' : 'Anzeigen'}
            </button>
          </div>
          {showMemory && (
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              {[['kept', 'Übernommene Ergänzungen (geschützt)'], ['removed', 'Gestrichene Karten (nicht wieder vorschlagen)']].map(([kind, title]) => (
                <div key={kind}>
                  <h4 className="text-xs font-semibold mb-1 text-fg-muted">{title}</h4>
                  {deckMemory[kind].length === 0 ? (
                    <p className="text-xs text-fg-muted">–</p>
                  ) : (
                    <ul className="text-sm space-y-0.5">
                      {deckMemory[kind].map(name => (
                        <li key={name} className="flex items-center justify-between gap-2">
                          <span className="text-fg">{name}</span>
                          <button
                            type="button"
                            onClick={() => setDeckMemory(forgetDeckMemoryEntry(storageKey, kind, name))}
                            className="text-xs underline text-fg-muted"
                            title="Die Analyse darf diese Karte wieder frei bewerten"
                          >
                            freigeben
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {audit?.strategy && (
        <div className="card mb-6" style={{ borderColor: 'var(--u)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: 'var(--u)' }}>🎯 Spielplan</h2>
            {!editingStrategy && (
              <button onClick={() => setEditingStrategy(true)} className="btn-secondary text-xs px-3 py-1.5">
                ✏️ Korrigieren
              </button>
            )}
          </div>
          <p className="text-xs text-cmd-muted mb-3">
            Alle Cuts/Adds unten sind gegen genau diesen Spielplan bewertet. Falls er danebenliegt, korrigiere ihn —
            die Bewertung wird dann strikt an deiner Version ausgerichtet, statt neu zu raten.
          </p>

          {editingStrategy ? (
            <>
              <textarea
                value={strategyDraft}
                onChange={(e) => setStrategyDraft(e.target.value)}
                className="w-full text-fg rounded-xl p-3 h-40 resize-y text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--border)' }}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setDeckPreferences(storageKey, { strategyOverride: strategyDraft, strategyCommander: commander, strategyByPlayer: true }); runAudit(strategyDraft) }}
                  className="btn-primary text-sm flex-1"
                >
                  🔄 Neu bewerten mit diesem Spielplan
                </button>
                <button onClick={() => { setEditingStrategy(false); setStrategyDraft(formatStrategy(audit.strategy)) }} className="btn-secondary text-sm px-4">
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-fg-2 space-y-2 whitespace-pre-wrap leading-relaxed">
              <p><strong>Win Condition:</strong> {audit.strategy.winCondition}</p>
              <p><strong>Spielplan:</strong> {audit.strategy.gamePlan}</p>
              <p><strong>Schwächen:</strong> {audit.strategy.weaknesses}</p>
              {playerStrategy && (
                <p className="text-xs text-cmd-muted">
                  Von dir festgelegt – jede Analyse richtet sich danach.{' '}
                  <button
                    onClick={() => { setDeckPreferences(storageKey, { strategyOverride: '', strategyCommander: commander, strategyByPlayer: false }); runAudit() }}
                    className="underline"
                  >
                    Festlegung aufheben & KI neu einschätzen lassen
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card mb-6">
        <h2 className="text-2xl font-bold mb-4 text-mtg-gold">
          Analyse-Ergebnis
          {audit?.engine && (
            <span className="ml-3 align-middle text-xs font-semibold px-2 py-1 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {audit.engine === 'claude' ? `🧠 von Claude ${formatModelId(audit.engineModel)}`.trim() : '✨ von Gemini'}
            </span>
          )}
        </h2>

        {audit?.summary && (
          <p className="text-fg-2 leading-relaxed whitespace-pre-wrap mb-2">{audit.summary}</p>
        )}

        {audit?.parseError && (
          <button onClick={() => runAudit(playerStrategy || undefined)} className="btn-primary text-sm mt-2">
            🔄 Erneut versuchen
          </button>
        )}

        <button onClick={() => runAudit(playerStrategy || undefined)} className="btn-secondary text-xs mt-3">
          🔄 Neu analysieren
        </button>
      </div>

      {audit?.cardsToCut?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>✂️ Cards to Cut ({audit.cardsToCut.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToCut.map(card => (
              <CardTile key={card.name} card={card} />
            ))}
          </div>
        </div>
      )}

      {loadingSuggestions && (
        <div className="card mb-8 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-mtg-blue rounded-full flex-shrink-0"></div>
          <p className="text-sm text-fg-2">
            Lade Kaufvorschläge & Sammlungs-Treffer…{isClaudeActive() && ` (🧠 Claude ${getClaudeModelLabel()}, kann einige Minuten dauern)`}
            {isClaudeActive() && (
              <span className="block text-xs text-fg-muted mt-0.5">
                Läuft auf {getBridgeTarget() === 'remote' ? 'deinem PC' : 'diesem PC'} · <span className="tabular-nums">{clock(suggestionsSince)}</span>
                {getClaudeModelLabel() === 'Opus' && ' · mit Opus meist 4–6 Minuten'}
                {suggestionsProgress && <span className="block">Claude {suggestionsProgress}</span>}
              </span>
            )}
          </p>
        </div>
      )}

      {suggestionsError && !loadingSuggestions && (
        <div className="card bg-red-900/20 border-red-700 mb-8">
          <p className="text-[color:var(--r)] mb-3">❌ {suggestionsError}</p>
          <button onClick={() => runSuggestions(audit.strategy)} className="btn-primary text-sm">
            🔄 Kaufvorschläge erneut laden
          </button>
        </div>
      )}

      {audit?.cardsToAdd?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--g)' }}>✅ Aus deiner Sammlung ({audit.cardsToAdd.length})</h3>
          <p className="text-xs text-cmd-muted mb-3">Besitzt du bereits — nichts zu kaufen. 📍 zeigt, in welchem Ordner die Karte liegt.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToAdd.map(card => (
              <CardTile key={card.name} card={{ ...card, location: formatCardLocations(locationsFromIndex(locationIndex, card.name)) }} />
            ))}
          </div>
        </div>
      )}

      {audit?.cardsToBuy?.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--r)' }}>🛒 Zusätzliche Kaufvorschläge ({audit.cardsToBuy.length})</h3>
          <p className="text-xs text-cmd-muted mb-3">Nicht in deiner Sammlung — unabhängig davon starke Verbesserungen für dieses Deck.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {audit.cardsToBuy.map(card => (
              <CardTile key={card.name} card={{ ...card, friendAvailability: getSecondaryAvailability(card.name) }} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onOpenEditor?.([...(audit?.cardsToAdd || []), ...(audit?.cardsToBuy || [])], audit?.cardsToCut)}
          className="btn-primary flex-1"
        >
          ✏️ Deck Editieren
        </button>
        <button onClick={onBack} className="btn-secondary flex-1">
          {backLabel}
        </button>
      </div>

      <ChatWidget
        commander={commander}
        cards={(deckCards || []).map(c => ({ name: c.name, count: c.quantity }))}
        collectionSampleNames={collectionSampleNames}
      />
    </div>
  )
}
