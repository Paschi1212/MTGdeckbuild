/**
 * Google Gemini API Integration
 * Analyzes decks and suggests commanders using Gemini, returning structured
 * card lists (enriched with real Scryfall images) instead of free prose.
 */

const { GoogleGenAI } = require('@google/genai')
const { getBulkPrices, getBudgetAlternatives } = require('./scryfall-api.cjs')
const { getCommanderData, extractRecommendations, extractSynergyCommanders } = require('./edhrec-api.cjs')

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
// The deck audit's strategy-read + cut/add judgment is the one call in this codebase where
// reasoning QUALITY matters more than raw speed/cost — it runs once per "Analysieren" click,
// not on every keystroke like chat, and not multiple rounds like the full-deck builder.
// Same model family/generation as the lite tier (verified available for this API key), so
// latency should stay in a similar ballpark rather than jumping to a much heavier "pro" tier.
const GEMINI_MODEL_AUDIT = 'gemini-3.5-flash'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Gemini occasionally returns 503 "UNAVAILABLE — high demand" for a few seconds at a time;
// this is Google-side and transient, not something wrong with the request, so it's worth
// one or two short retries before giving up rather than failing the whole request on the
// first hiccup. The SDK surfaces the raw API error body as error.message (a JSON string),
// not structured status/code fields, so this checks the message text defensively.
function isRetryableGeminiError(error) {
  const text = String(error?.message ?? error ?? '')
  return error?.status === 503 || text.includes('"code":503') || text.includes('UNAVAILABLE') || text.includes('overloaded')
}

// A 429 RESOURCE_EXHAUSTED on the free tier's PER-DAY quota (observed live: 20
// requests/day for gemini-3.5-flash) is a dead end for THAT model until the quota resets —
// retrying the same model just wastes the request budget further. Not covered by
// isRetryableGeminiError on purpose: that one is for transient "try again in a moment"
// errors, this one means "this model is done for today, switch models instead".
function isQuotaExhaustedError(error) {
  const text = String(error?.message ?? error ?? '')
  return error?.status === 429 && (text.includes('RESOURCE_EXHAUSTED') || text.includes('GenerateRequestsPerDayPerProjectPerModel'))
}

// Kept deliberately short (2 retries, ~0.6s/1.2s backoff) — every one of this file's
// generateContent calls already runs inside a 30s Netlify function budget that's been hit
// more than once this session, so retries must stay cheap, not turn one slow call into three.
async function generateContentWithRetry(params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params)
    } catch (error) {
      if (attempt === retries || !isRetryableGeminiError(error)) throw error
      const delayMs = 600 * (attempt + 1)
      console.warn(`[Gemini] transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs}ms:`, error.message)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

function mapUsage(result) {
  return {
    prompt_tokens: result.usageMetadata?.promptTokenCount ?? 0,
    completion_tokens: result.usageMetadata?.candidatesTokenCount ?? 0
  }
}

async function enrichWithImages(cards) {
  const names = cards.map(c => c.name).filter(Boolean)
  if (names.length === 0) return cards

  const prices = await getBulkPrices(names)
  return cards.map(card => ({
    ...card,
    image: prices[card.name]?.image,
    eur: prices[card.name]?.eur,
    usd: prices[card.name]?.usd
  }))
}

// Plain lowercase-only comparison let real duplicates slip through: a double-faced card
// named with just its front face on one side and "Front // Back" on the other (Gemini isn't
// consistent about which form it uses), stray/doubled whitespace, or — very common in
// Gemini's own JSON output for names like "Sram's Expertise" — a typographic/"smart" quote
// (’) where the deck data has a plain ASCII apostrophe ('), which a naive comparison treats
// as two different card names entirely. Normalizing all of these to one canonical form is
// what actually makes the dedup checks below reliable.
function normalizeCardName(name) {
  return (name || '')
    .split('//')[0]
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJson(text) {
  try {
    // Gemini can wrap JSON in markdown fences even with responseMimeType set; strip defensively
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    return JSON.parse(cleaned)
  } catch (error) {
    return null
  }
}

const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          colors: { type: 'string' },
          reason: { type: 'string' },
          strategy: { type: 'string' },
          estimatedCost: { type: 'string' }
        },
        required: ['name', 'reason']
      }
    }
  },
  required: ['intro', 'suggestions']
}

const AUDIT_STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    strategy: {
      type: 'object',
      properties: {
        winCondition: { type: 'string' },
        gamePlan: { type: 'string' },
        weaknesses: { type: 'string' }
      },
      required: ['winCondition', 'gamePlan', 'weaknesses']
    },
    summary: { type: 'string' },
    cardsToCut: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason']
      }
    }
  },
  required: ['strategy', 'summary', 'cardsToCut']
}

const AUDIT_SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    cardsToAdd: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason']
      }
    },
    cardsToBuy: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason']
      }
    }
  },
  required: ['cardsToAdd', 'cardsToBuy']
}

// Same EDHREC "not in any real list for this commander" signal used by both audit phases —
// extracted so phase 1 (cuts) and phase 2 (adds/buys context) build it identically.
function buildEdhecCutSignal(commander, deckCards, edhecData) {
  if (!edhecData?.allCards?.length) return ''
  const edhecNameSet = new Set(edhecData.allCards.map(c => normalizeCardName(c.name)))
  const unlisted = deckCards
    .filter(c => !FULL_DECK_BASIC_LAND_NAMES.has(c.name.toLowerCase()) && !edhecNameSet.has(normalizeCardName(c.name)))
    .map(c => c.name)
  if (!unlisted.length) return ''
  return `\nDIESE KARTEN AUS DER DECKLISTE TAUCHEN IN KEINER EDHREC-LISTE FÜR ${commander} AUF (weder Top-Karten noch High-Synergy — reales Signal für unterdurchschnittliche Verbreitung, aber KEIN Automatismus, wäge strategisch ab): ${unlisted.join(', ')}\n`
}

function formatStrategyForPrompt(strategy) {
  return `- winCondition: ${strategy.winCondition}\n- gamePlan: ${strategy.gamePlan}\n- weaknesses: ${strategy.weaknesses}`
}

// The user's correction (DeckAuditPage's "✏️ Korrigieren" box) is a single free-text blob in
// the client's "Win Condition: X\n\nSpielplan: Y\n\nSchwächen: Z" format (see
// DeckAuditPage.jsx's formatStrategy()). The model was previously just told to echo it back
// into the 3 structured fields "unverändert" — not actually guaranteed, and observed live
// losing/rewording a user's edit despite the instruction. Parsing it deterministically here
// instead means whatever the user wrote is GUARANTEED to show up exactly as typed.
function parseStrategyOverride(text) {
  const winMatch = text.match(/Win Condition:\s*([\s\S]*?)(?=\n\s*\n\s*Spielplan:|\n\s*\n\s*Schwächen:|$)/i)
  const planMatch = text.match(/Spielplan:\s*([\s\S]*?)(?=\n\s*\n\s*Schwächen:|$)/i)
  const weakMatch = text.match(/Schwächen:\s*([\s\S]*)$/i)

  if (winMatch || planMatch || weakMatch) {
    return {
      winCondition: (winMatch?.[1] || '').trim(),
      gamePlan: (planMatch?.[1] || '').trim(),
      weaknesses: (weakMatch?.[1] || '').trim()
    }
  }

  // Doesn't match the expected labeled format (user rewrote it freeform) — rather than
  // silently dropping part of it or guessing where to split, keep the whole text visible.
  return { winCondition: '', gamePlan: text.trim(), weaknesses: '' }
}

/**
 * Audit phase 1/2: strategy read + cardsToCut only. Kept deliberately light (no collection
 * list, bounded output) — this call used to also produce the uncapped cardsToAdd/cardsToBuy
 * lists in one shot, which together with a much larger collection sample (raised from 150 to
 * 2000 names) started reliably blowing Netlify's 30s function budget, even on small/medium
 * decks. Splitting into two independently-budgeted calls (same pattern already used for the
 * price-gainer scan's chunked requests) is what actually fixes that, rather than trading away
 * either the bigger collection sample or the uncapped suggestions.
 */
async function auditDeckStrategy({ commander, deckCards, edhecData, strategyOverride, powerLevel }) {
  const cardInfo = await getBulkPrices(deckCards.map(c => c.name))
  const deckListText = deckCards
    .map(c => {
      const info = cardInfo[c.name]
      const typeInfo = info?.typeLine ? ` [${info.typeLine}${info.cmc != null ? `, CMC ${info.cmc}` : ''}]` : ''
      return `${c.quantity > 1 ? `${c.quantity}x ` : ''}${c.name}${typeInfo}`
    })
    .join(', ')

  const edhecContext = edhecData?.allCards?.length
    ? `\nEDHREC-DATEN (echte Decks mit ${commander}):\n- High Synergy Cards: ${(edhecData.highSynergyCards || []).slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n- Meistgespielte Karten insgesamt: ${edhecData.topCards?.slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n`
    : ''

  const edhecCutSignal = buildEdhecCutSignal(commander, deckCards, edhecData)

  const strategyContext = strategyOverride
    ? `\nVOM NUTZER BESTÄTIGTE/KORRIGIERTE STRATEGIE (verbindlich — übernimm das exakt als "strategy" in deiner Antwort, erfinde keine eigene, abweichende Strategie): ${strategyOverride}\n`
    : ''

  const powerLevelContext = powerLevel
    ? `\nZIEL-POWER-LEVEL DES SPIELERS: ${powerLevel} — bewerte "schwach"/"stark" relativ zu DIESEM Niveau, nicht absolut.\n`
    : ''

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Expert — arbeite wie ein erfahrener Deckbuilder: zuerst verstehen, was das Deck WILL, dann erst bewerten, was nicht passt.

COMMANDER: ${commander}

AKTUELLE DECKLISTE (${deckCards.length} Karten, [Typ, Manawert] wo bekannt):
${deckListText}
${edhecContext}${edhecCutSignal}${strategyContext}${powerLevelContext}
AUFGABE:
Bewerte dieses BEREITS GEBAUTE Deck. Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Fließtext außerhalb des JSON) mit:
- "strategy": ${strategyOverride ? 'übernimm die vom Nutzer bestätigte Strategie oben unverändert in winCondition/gamePlan/weaknesses.' : 'lies aus der Deckliste (Kartentypen, Manawerte, Commander-Fähigkeiten) das TATSÄCHLICHE Spielplan des Decks heraus, BEVOR du irgendeine Karte bewertest — "winCondition" (wie gewinnt dieses Deck konkret), "gamePlan" (Früh-/Mittel-/Spätspiel-Ablauf, Kernrollen: Ramp, Kartenvorteil, Removal/Interaktion, Payoffs — mit welchen Karten sie abgedeckt sind), "weaknesses" (welche dieser Rollen fehlen oder sind unterbesetzt — UND GLEICHBERECHTIGT DAZU: falls die Strategie auf einer bestimmten Kartenkategorie/Synergie basiert, die der Commander direkt belohnt oder verstärkt (z.B. X-Spells, Token-Erzeugung, +1/+1-Counter, Artefakte, ein Tribal-Typ), zähle die Karten dieser Kategorie im Deck AUSDRÜCKLICH durch und benenne "zu wenig [Kategorie]-Karten" explizit als eigene Schwäche, wenn die Dichte für eine konsequente Strategie zu gering ist — das ist für ein Synergie-Deck oft die wichtigste Schwäche überhaupt, nicht nur eine generische Rolle unter vielen). Das ist die Grundlage für ALLES danach.'}
- "summary": kurze deutsche Fließtext-Bewertung basierend auf der obigen Strategie-Einschätzung, 3-5 Sätze
- "cardsToCut": Schwächste Karten AUS DER OBIGEN DECKLISTE mit Begründung (EIN kurzer Satz), warum sie raus sollten. KRITISCH: jede Begründung muss sich auf die oben festgelegte "strategy" beziehen (z.B. "trägt nichts zu [winCondition] bei" oder "redundant zu [andere Karte], die dieselbe Rolle besser erfüllt") — keine generischen "das ist eine schwache Karte"-Begründungen ohne Bezug zu DIESEM Deck.${edhecCutSignal ? ' Die oben genannten, bei EDHREC nicht gelisteten Karten sind bevorzugte (aber nicht zwingende) Kandidaten — nenne bei Bedarf auch andere.' : ''} KEINE feste Obergrenze — wenn das Deck wirklich viele Schwachstellen hat, nenne entsprechend viele; wenn es schon stark ist, nenne weniger oder auch gar keine. "name" muss EXAKT und WORTWÖRTLICH einem Eintrag aus der Deckliste oben entsprechen (ohne den [Typ, Manawert]-Zusatz) — erfinde niemals eine Karte, die dort nicht steht, und ändere keine Namen.

Nutze ausschließlich echte, existierende Magic: The Gathering Kartennamen.`

  try {
    console.log('[Gemini] Auditing deck (phase 1/2: strategy+cuts):', commander, `(model: ${GEMINI_MODEL_AUDIT})`)

    let result
    try {
      result = await generateContentWithRetry({
        model: GEMINI_MODEL_AUDIT,
        contents: prompt,
        config: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          responseSchema: AUDIT_STRATEGY_SCHEMA,
          maxOutputTokens: 3500,
          // gemini-3.5-flash has "thinking" enabled by default, which burns hidden reasoning
          // tokens out of the SAME maxOutputTokens budget as the visible JSON — observed live:
          // a 72-card deck's strategy+cuts call (well within the visible-output budget) still
          // got truncated at MAX_TOKENS and took 24s wall-clock, with the hidden thinking
          // tokens being the only explanation. This is a single structured-JSON analytical
          // call under a hard 30s Netlify ceiling — reliability matters far more here than the
          // marginal reasoning-quality gain from letting the model "think" before answering.
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    } catch (error) {
      if (!isQuotaExhaustedError(error)) throw error
      // gemini-3.5-flash's free-tier quota is PER DAY (observed live: 20 requests/day) —
      // once it's gone, it's gone until tomorrow, no amount of retrying helps. Falling back
      // to the lite model (same one phase 2 already uses) keeps the audit WORKING today,
      // at a modest cost to reasoning depth, instead of hard-failing the whole feature until
      // the quota resets. Lite has no "thinking" variant to configure — it 400s if sent
      // thinkingConfig at all (verified live), so that option is dropped for this call only.
      console.warn(`[Gemini] auditDeckStrategy: ${GEMINI_MODEL_AUDIT} daily quota exhausted, falling back to ${GEMINI_MODEL} for this request`)
      result = await generateContentWithRetry({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          responseSchema: AUDIT_STRATEGY_SCHEMA,
          maxOutputTokens: 3500
        }
      })
    }

    const parsed = parseJson(result.text)

    if (!parsed) {
      const truncated = result.candidates?.[0]?.finishReason === 'MAX_TOKENS'
      console.warn(`[Gemini] auditDeckStrategy: could not parse structured JSON (truncated: ${truncated}), falling back`)
      return {
        strategy: null,
        summary: truncated
          ? 'Die Analyse wurde wegen Längenlimit abgeschnitten, bevor sie fertig war — bitte "Erneut versuchen" klicken.'
          : 'Die Antwort konnte nicht als strukturierte Analyse gelesen werden — bitte "Erneut versuchen" klicken.',
        cardsToCut: [],
        parseError: true,
        usage: mapUsage(result)
      }
    }

    const deckCardNames = new Set(deckCards.map(c => normalizeCardName(c.name)))
    const rawCardsToCut = parsed.cardsToCut || []
    const validCardsToCut = rawCardsToCut.filter(c => deckCardNames.has(normalizeCardName(c.name)))
    if (validCardsToCut.length !== rawCardsToCut.length) {
      console.warn(
        `[Gemini] auditDeckStrategy: dropped ${rawCardsToCut.length - validCardsToCut.length} hallucinated cardsToCut ` +
        `entr${rawCardsToCut.length - validCardsToCut.length === 1 ? 'y' : 'ies'} not present in the actual decklist`
      )
    }

    const cardsToCut = await enrichWithImages(validCardsToCut)

    // Deterministic override, not the model's own (unreliable) echo of it — see
    // parseStrategyOverride()'s comment above.
    const strategy = strategyOverride ? parseStrategyOverride(strategyOverride) : parsed.strategy

    return {
      strategy,
      summary: parsed.summary,
      cardsToCut,
      usage: mapUsage(result)
    }
  } catch (error) {
    console.error('[Gemini] Error auditing deck (strategy phase):', error)
    throw error
  }
}

/**
 * Audit phase 2/2: cardsToAdd (collection-only) + cardsToBuy (unbounded), run as its own
 * Netlify invocation with its own fresh 30s budget — this is the half of the audit that
 * actually needs the big (up to 2000-name) collection list and produces unbounded output, so
 * it's the half that was timing out when it shared a single request with the strategy phase.
 * Takes the already-determined `strategy` object from phase 1 instead of re-deriving it, so
 * the suggestions stay consistent with what the user already saw and confirmed.
 */
async function auditDeckSuggestions({ commander, deckCards, collectionSampleNames, budget, edhecData, strategy }) {
  const deckCardNames = new Set(deckCards.map(c => c.name))
  const deckListText = [...deckCardNames].join(', ')

  const collectionContext = collectionSampleNames?.length
    ? `\nWEITERE KARTEN IN DER SAMMLUNG DES SPIELERS (nicht in diesem Deck, mögliche Tauschkandidaten):\n${collectionSampleNames.join(', ')}\n`
    : ''

  const edhecContext = edhecData?.allCards?.length
    ? `\nEDHREC-DATEN (echte Decks mit ${commander}):\n- High Synergy Cards (überdurchschnittlich oft speziell mit diesem Commander gespielt — starkes Synergie-/Combo-Signal): ${(edhecData.highSynergyCards || []).slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n- Meistgespielte Karten insgesamt: ${edhecData.topCards?.slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n`
    : ''

  // Budget is always a cap on the TOTAL cost of everything in "cardsToBuy" together — never
  // a per-card limit, and never applies to "cardsToAdd" (those are already-owned collection
  // cards, nothing to buy, a per-piece price cap on them wouldn't mean anything).
  const budgetContext = budget ? `\nZUKAUFSBUDGET: Die Summe der geschätzten Preise ALLER "cardsToBuy"-Vorschläge ZUSAMMEN sollte ca. €${budget} nicht überschreiten (Basisländer ausgenommen) — das ist ein Gesamtbudget für den kompletten Zukauf, kein Limit pro Einzelkarte. Gilt NICHT für "cardsToAdd" (bereits besessen, nichts zu kaufen).\n` : ''

  const strategyContext = `\nBEREITS FESTGELEGTE STRATEGIE DIESES DECKS (verbindlich — nicht neu bewerten, nur als Grundlage für deine Vorschläge nutzen):\n${formatStrategyForPrompt(strategy)}\n`

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Expert.

COMMANDER: ${commander}

AKTUELLE DECKLISTE (${deckCards.length} Karten): ${deckListText}
${strategyContext}${collectionContext}${edhecContext}${budgetContext}
AUFGABE:
Schlage auf Basis der oben festgelegten Strategie und ihrer "weaknesses" Karten vor. Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Fließtext außerhalb des JSON) mit:
- "cardsToAdd": ALLE Karten AUSSCHLIESSLICH aus der Sammlungs-Liste oben ("WEITERE KARTEN IN DER SAMMLUNG..."), die eine der in "weaknesses" identifizierten Lücken schließen würden — der Nutzer besitzt sie bereits, nichts davon muss gekauft werden. KEINE feste Obergrenze — geh die Sammlungs-Liste wirklich durch und nenne JEDE Karte, die strategisch passt, nicht nur ein paar Beispiele. KRITISCH: jeder "name" muss WORTWÖRTLICH in dieser Sammlungs-Liste stehen; wenn die Liste leer ist oder nichts davon wirklich passt, gib ein leeres Array zurück statt eine Karte zu erfinden oder eine zu nennen, die nicht dort steht.
- "cardsToBuy": UNABHÄNGIG von der Sammlung — starke Kartenvorschläge, die konkret eine der "weaknesses" schließen oder die "winCondition" verstärken, auch wenn der Nutzer sie nicht besitzt. KEINE feste Obergrenze, nenne so viele wie wirklich sinnvoll sind. Das ist eine eigene, separate Liste — nenne hier ruhig auch Karten, die es in der Sammlungs-Liste nicht gibt.

Für beide Listen gemeinsam: dürfen NICHT bereits in der Deckliste oben stehen — prüfe das aktiv, bevor du eine Karte nennst.${edhecData?.allCards?.length ? ' Nutze die EDHREC-Daten oben als echtes Signal, welche Karten in der Community wirklich mit diesem Commander funktionieren — bevorzuge insbesondere die High Synergy Cards, wenn sie zur Strategie oben passen.' : ''} Jede Begründung muss konkret erklären, WAS sie in DIESEM Deck bewirkt (Bezug zur Strategie oben, Synergie mit einer bestehenden Karte oder Commander-Fähigkeit) statt nur "ist eine gute Karte" — aber halte jede Begründung auf EINEN kurzen Satz, damit bei vielen Vorschlägen die Antwort nicht zu lang wird.

Nutze ausschließlich echte, existierende Magic: The Gathering Kartennamen.`

  try {
    // Deliberately the LITE model, not GEMINI_MODEL_AUDIT — two reasons. First, this half of
    // the task is comparatively mechanical ("match collection names against known gaps"), not
    // the deep strategic read phase 1 already did. Second, and decisive in practice: Gemini's
    // free-tier quota is PER MODEL (observed live: gemini-3.5-flash's free tier caps out at
    // 20 requests/DAY total) — splitting strategy and suggestions across two different models
    // means one audit costs 1 request from EACH model's separate quota, instead of 2 requests
    // from the same one, which would have halved how many audits/day the app could serve.
    console.log('[Gemini] Auditing deck (phase 2/2: suggestions):', commander, `(model: ${GEMINI_MODEL})`)

    const result = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.35,
        responseMimeType: 'application/json',
        responseSchema: AUDIT_SUGGESTIONS_SCHEMA,
        // No thinkingConfig here (unlike the strategy phase) — the lite model rejects it
        // outright with a 400 INVALID_ARGUMENT (verified live), it simply doesn't have a
        // "thinking" variant to configure in the first place.
        maxOutputTokens: 8000
      }
    })

    const parsed = parseJson(result.text)

    if (!parsed) {
      const truncated = result.candidates?.[0]?.finishReason === 'MAX_TOKENS'
      console.warn(`[Gemini] auditDeckSuggestions: could not parse structured JSON (truncated: ${truncated}), falling back`)
      return {
        cardsToAdd: [],
        cardsToBuy: [],
        parseError: true,
        truncated,
        usage: mapUsage(result)
      }
    }

    const collectionNames = new Set((collectionSampleNames || []).map(n => normalizeCardName(n)))
    const normalizedDeckNames = new Set(deckCards.map(c => normalizeCardName(c.name)))
    const rawCardsToAdd = parsed.cardsToAdd || []
    const validCardsToAdd = rawCardsToAdd.filter(c =>
      !normalizedDeckNames.has(normalizeCardName(c.name)) && collectionNames.has(normalizeCardName(c.name))
    )
    if (validCardsToAdd.length !== rawCardsToAdd.length) {
      console.warn(
        `[Gemini] auditDeckSuggestions: dropped ${rawCardsToAdd.length - validCardsToAdd.length} cardsToAdd ` +
        `entr${rawCardsToAdd.length - validCardsToAdd.length === 1 ? 'y' : 'ies'} already in the decklist or not actually in the collection sample`
      )
    }

    const rawCardsToBuy = parsed.cardsToBuy || []
    const validCardsToBuy = rawCardsToBuy.filter(c => !normalizedDeckNames.has(normalizeCardName(c.name)))
    if (validCardsToBuy.length !== rawCardsToBuy.length) {
      console.warn(
        `[Gemini] auditDeckSuggestions: dropped ${rawCardsToBuy.length - validCardsToBuy.length} cardsToBuy ` +
        `entr${rawCardsToBuy.length - validCardsToBuy.length === 1 ? 'y' : 'ies'} already present in the decklist`
      )
    }

    const [cardsToAdd, cardsToBuy] = await Promise.all([
      enrichWithImages(validCardsToAdd),
      enrichWithImages(validCardsToBuy)
    ])

    return {
      cardsToAdd,
      cardsToBuy,
      usage: mapUsage(result)
    }
  } catch (error) {
    console.error('[Gemini] Error auditing deck (suggestions phase):', error)
    throw error
  }
}

/**
 * Generate a full new-deck proposal for the questionnaire flow (StrategyPage → AnalyzePage).
 * Delegates to buildFullDeckFromChat() — the same verified, lands/spells-split, count-
 * checked builder the chat flow uses — instead of a separate single-shot generation. The
 * old version here had none of those safeguards and was observed timing out at 30s on a
 * full 99-card generation with no retry/verification.
 */
async function analyzeDeck({ commander, strategy, collection, edhecData, budget }) {
  const requestStartedAt = Date.now()
  const strategyParts = []
  if (strategy?.playStyle) strategyParts.push(`Spielstil: ${strategy.playStyle}`)
  if (strategy?.primaryWinCon) strategyParts.push(`Primäre Win Condition: ${strategy.primaryWinCon}`)
  if (strategy?.keyMechanics?.length) strategyParts.push(`Wichtige Mechaniken: ${strategy.keyMechanics.join(', ')}`)
  if (strategy?.combos?.length) strategyParts.push(`Gewünschte Combos: ${strategy.combos.join('; ')}`)
  if (strategy?.notes) strategyParts.push(`Weitere Notizen: ${strategy.notes}`)

  try {
    console.log('[Gemini] Analyzing deck (via buildFullDeckFromChat):', commander)

    const built = await buildFullDeckFromChat({
      commander,
      strategyHint: strategyParts.join('. '),
      collectionSampleNames: collection?.sampleCardNames,
      edhecData
    })

    if (!built) {
      return { summary: '', cards: [], parseError: true, usage: { prompt_tokens: 0, completion_tokens: 0 } }
    }

    // "Budget" is always a cap on the TOTAL cost of cards that still need to be bought, never
    // a per-card limit — enforced deterministically here (the same enforcePurchaseBudget pass
    // the chat's build_full_deck flow uses: sums the real purchase cost of everything not
    // already owned, swaps the priciest offenders for cheaper EDHREC-pool alternatives if over)
    // instead of a soft per-card prompt hint the model could (and did, before this fix)
    // interpret as "every single card must individually cost under €X".
    let finalCards = built.cards
    let budgetNote = ''
    if (budget) {
      const budgetResult = await enforcePurchaseBudget(built.cards, collection?.sampleCardNames, budget, requestStartedAt)
      finalCards = budgetResult.cards
      budgetNote = budgetResult.budgetNote
    }

    // The chat flow resolves images/prices client-side after the fact; this flow's
    // consumer (AnalyzePage) expects them already attached to each card, like before.
    const cards = await enrichWithImages(finalCards)

    return {
      summary: (built.summary || '') + budgetNote,
      cards,
      usage: built.usage
    }
  } catch (error) {
    console.error('[Gemini] Error analyzing deck:', error)
    throw error
  }
}

/**
 * Generate commander suggestions based on user preferences using Gemini
 */
async function suggestCommanders(preferences) {
  const {
    colors,
    playStyle,
    budget,
    powerLevel
  } = preferences

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Experte.

USER PREFERENCES:
- Lieblings-Farben: ${colors.join(', ')}
- Spielstil: ${playStyle}
- Budget: €${budget}
- Power Level: ${powerLevel}

Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Fließtext außerhalb des JSON) mit:
- "intro": kurzer deutscher Fließtext-Einstieg, 1-2 Sätze
- "suggestions": die TOP 5 Commander (echte, existierende Magic-Karten), die in den Farben spielbar sind, zum Spielstil passen und fürs Budget geeignet sind. Für jeden: name, colors (z.B. "W U B"), reason (warum passt er), strategy (Schwerpunkt-Strategie), estimatedCost (geschätzte Deck-Kosten als String, z.B. "ca. 80€")`

  try {
    console.log('[Gemini] Suggesting commanders for:', playStyle)

    const result = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: SUGGEST_SCHEMA,
        maxOutputTokens: 1500
      }
    })

    const parsed = parseJson(result.text)

    if (!parsed) {
      console.warn('[Gemini] suggestCommanders: could not parse structured JSON, falling back to raw text')
      return {
        intro: result.text,
        suggestions: [],
        parseError: true,
        usage: mapUsage(result)
      }
    }

    const suggestions = await enrichWithImages(parsed.suggestions || [])

    return {
      intro: parsed.intro,
      suggestions,
      usage: mapUsage(result)
    }
  } catch (error) {
    console.error('[Gemini] Error suggesting commanders:', error)
    throw error
  }
}

const CHAT_HISTORY_LIMIT = 10
// A Commander deck tops out at 99 non-commander cards by the game's own rules, so the
// deck's own list never needs truncating — unlike truncating it at some smaller number,
// which left Gemini unable to see (and correctly count) everything already added.
const CHAT_CARD_LIST_LIMIT = 99
const CHAT_COLLECTION_LIMIT = 150
// Chat has no responseSchema (unlike the other Gemini calls here), so nothing else bounds
// generation length — an unlucky long/rambling answer can blow past the 30s function timeout.
const CHAT_MAX_OUTPUT_TOKENS = 500
// bulkBuild turns need room for many function calls in one response (proactively adding
// 30-40 cards at once instead of one at a time) — a much larger cap than plain chat.
const CHAT_BULK_BUILD_MAX_OUTPUT_TOKENS = 4500

// Function-calling tools that let the assistant actually change the deck it's talking
// about (add_card/remove_card/update_card_count), instead of only describing changes in
// text. The deck's real state lives in the browser (React state, no backend DB), so these
// aren't executed here — Gemini's function-call requests are just relayed back to the
// frontend, which applies them to its own card list.
function buildDeckActionTools(bulkBuild) {
  const functionDeclarations = [
    {
      name: 'add_card',
      description: 'Fügt EINZELNE, gezielte Karten zum aktuellen Deck hinzu (z.B. eine bestimmte Karte auf Nutzerwunsch). quantity wird zu einer eventuell schon vorhandenen Anzahl ADDIERT (nicht ersetzt) — für einen festen Zielwert stattdessen update_card_count nutzen. NIEMALS für eine Karte aufrufen, die laut Kartenliste oben bereits im Deck ist, außer es ist ein Basisland (Singleton-Format) — sonst entsteht eine ungültige zweite Kopie.' + (bulkBuild ? ' Für einen KOMPLETTEN Deck-Neuaufbau NICHT verwenden — dafür gibt es build_full_deck.' : ''),
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exakter, echter Magic-Kartenname' },
          quantity: { type: 'integer', description: 'Anzahl NEUER Kopien, die hinzukommen. Standard 1 (nur Basisländer dürfen insgesamt >1 sein — Singleton-Format)' }
        },
        required: ['name']
      }
    },
    {
      name: 'remove_card',
      description: 'Entfernt eine Karte komplett aus dem aktuellen Deck.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Exakter Name der zu entfernenden Karte, muss in der aktuellen Deckliste stehen' } },
        required: ['name']
      }
    },
    {
      name: 'update_card_count',
      description: 'Ändert die Anzahl einer bereits im Deck vorhandenen Karte (z.B. Basisländer-Anzahl anpassen).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exakter Name, muss bereits in der aktuellen Deckliste stehen' },
          quantity: { type: 'integer' }
        },
        required: ['name', 'quantity']
      }
    },
    {
      name: 'set_commander',
      description: 'Legt den Commander für das aktuell im Aufbau befindliche Deck fest oder ändert ihn.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exakter, echter Name einer legendären Kreatur/eines Planeswalkers, der als Commander spielbar ist' }
        },
        required: ['name']
      }
    }
  ]

  if (bulkBuild) {
    functionDeclarations.push({
      name: 'build_full_deck',
      description: 'Baut in EINEM Rutsch ein komplettes, spielbares 99-Karten-Deck (inkl. korrekter Manabasis) für den aktuellen Commander. IMMER hierfür nutzen, wenn der Nutzer einen kompletten Deck-Vorschlag will (z.B. "bau mir ein Deck", "schlag mir 99 Karten vor", "bau aus meiner Sammlung ein komplettes Deck") — NIEMALS versuchen, das stattdessen über viele einzelne add_card-Aufrufe zu tun, das führt zuverlässig zu falschen Kartenzahlen.',
      parameters: {
        type: 'object',
        properties: {
          strategyHint: { type: 'string', description: 'Kurze Zusammenfassung (1-2 Sätze) der gewünschten Strategie/des Spielstils basierend auf dem bisherigen Gespräch, z.B. "aggressiv, Token-fokussiert, wenig Budget"' },
          maxPurchaseBudgetEur: { type: 'number', description: 'NUR wenn der Nutzer explizit einen maximalen Zukaufswert in Euro für Karten genannt hat, die er NICHT bereits besitzt (z.B. "maximal 60€ zukaufen", "Budget für neue Karten: 100€") — reine Zahl in Euro, sonst weglassen.' }
        },
        required: []
      }
    })
  }

  return [{ functionDeclarations }]
}

const ACTION_TYPE_BY_FUNCTION_NAME = {
  add_card: 'add',
  remove_card: 'remove',
  update_card_count: 'update',
  set_commander: 'setCommander'
}

// Safety net for when Gemini calls functions but skips the accompanying text despite
// being told not to (small/fast models don't always comply) — a generic "Erledigt." told
// the user nothing; this at least shows exactly what changed.
function synthesizeFallbackReply(actions) {
  if (!actions.length) return ''

  const parts = []
  const setCommanderAction = actions.find(a => a.type === 'setCommander')
  if (setCommanderAction) parts.push(`Commander gesetzt: ${setCommanderAction.name}`)

  const added = actions.filter(a => a.type === 'add')
  if (added.length) parts.push(`hinzugefügt: ${added.map(a => (a.quantity > 1 ? `${a.quantity}x ${a.name}` : a.name)).join(', ')}`)

  const replaceDeckAction = actions.find(a => a.type === 'replaceDeck')
  if (replaceDeckAction) {
    const total = replaceDeckAction.cards.reduce((sum, c) => sum + c.quantity, 0)
    parts.push(`komplettes Deck gebaut (${total} Karten)`)
  }

  const removed = actions.filter(a => a.type === 'remove')
  if (removed.length) parts.push(`entfernt: ${removed.map(a => a.name).join(', ')}`)

  const updated = actions.filter(a => a.type === 'update')
  if (updated.length) parts.push(`Anzahl geändert: ${updated.map(a => `${a.name} → ${a.quantity}`).join(', ')}`)

  return `✅ ${parts.join(' | ')}`
}

const FULL_DECK_BASIC_LAND_NAMES = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'])
// A flat "99 cards total" instruction let Gemini treat lands as a soft afterthought
// inside one big list — it consistently under-included them (seen as low as 15/99).
// Splitting lands into their own array with its own hard numeric target makes them a
// mandatory structural requirement instead of something to balance by feel. The target
// itself is NOT a fixed constant, though — most decks want ~36-38, but a genuine
// lands-matter/extreme-ramp archetype (Lord Windgrace, Tatyova, Titania, ...) legitimately
// wants far more. Gemini decides the right number for THIS commander/strategy once (in
// round 0, as "landCount"), and that becomes the hard target enforced for the rest of the
// build — so it's still a deliberate per-deck choice, just never neglected once made.
const FULL_DECK_DEFAULT_LAND_TARGET = 37

const DECK_CARD_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    quantity: { type: 'integer' },
    reason: { type: 'string' }
  },
  required: ['name', 'quantity', 'reason']
}

const FULL_DECK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    landCount: { type: 'integer' },
    lands: { type: 'array', items: DECK_CARD_ITEM_SCHEMA },
    spells: { type: 'array', items: DECK_CARD_ITEM_SCHEMA }
  },
  required: ['summary', 'lands', 'spells']
}

// Structure (name/quantity/reason fields) is enforced by responseSchema, but the SUM of
// quantities across an array is a semantic constraint the schema can't enforce — Gemini
// has been observed to both under- and overshoot a requested exact total despite explicit
// instructions. Merges additional cards from a top-up round into an existing list,
// skipping anything that would create an illegal 2nd copy of a nonbasic (Singleton format).
function mergeDeckCards(existingCards, additionalCards) {
  const result = [...existingCards]
  const indexByName = new Map(result.map((c, i) => [c.name.toLowerCase(), i]))

  for (const card of additionalCards) {
    if (!card.name || !card.quantity) continue
    const key = card.name.toLowerCase()
    const existingIndex = indexByName.get(key)

    if (existingIndex === undefined) {
      indexByName.set(key, result.length)
      result.push(card)
      continue
    }

    if (FULL_DECK_BASIC_LAND_NAMES.has(key)) {
      result[existingIndex] = { ...result[existingIndex], quantity: result[existingIndex].quantity + card.quantity }
    }
    // else: nonbasic duplicate from the top-up round — ignore, singleton format
  }

  return result
}

// Deterministic last resort if Gemini still undershoots the land target after every top-up
// round — rather than another (equally unreliable) AI call, just round-robin extra copies
// across whichever basic land types are already present, keeping the deck's existing color
// balance instead of introducing a new, unrelated basic type.
function padWithBasicLands(lands, shortfall) {
  if (shortfall <= 0) return lands

  const basics = lands.filter(c => FULL_DECK_BASIC_LAND_NAMES.has(c.name.toLowerCase()))
  if (basics.length === 0) {
    return [...lands, { name: 'Wastes', quantity: shortfall, reason: 'Automatisch ergänzt, um die Ziel-Kartenzahl zu erreichen.' }]
  }

  const result = [...lands]
  for (let added = 0; added < shortfall; added++) {
    const basicName = basics[added % basics.length].name
    const idx = result.findIndex(c => c.name === basicName)
    result[idx] = { ...result[idx], quantity: result[idx].quantity + 1 }
  }
  return result
}

// Trims a card list down to an exact target total (protects against a top-up round
// overshooting its own requested amount) by removing/reducing from the end first.
function clampDeckCards(cards, target) {
  const total = cards.reduce((sum, c) => sum + c.quantity, 0)
  if (total <= target) return cards

  let excess = total - target
  const result = [...cards]

  for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
    const card = result[i]
    if (card.quantity <= excess) {
      excess -= card.quantity
      result.splice(i, 1)
    } else {
      result[i] = { ...card, quantity: card.quantity - excess }
      excess = 0
    }
  }

  return result
}

async function generateDeckRound({ commander, strategyHint, collectionSampleNames, existingLandNames, existingSpellNames, landsNeeded, spellsNeeded, isFirstRound, edhecData }) {
  const collectionContext = collectionSampleNames?.length
    ? `\nKARTEN IN DER SAMMLUNG DES SPIELERS (bevorzugt verwenden, wenn strategisch passend, muss nicht gekauft werden): ${collectionSampleNames.slice(0, CHAT_COLLECTION_LIMIT).join(', ')}\n`
    : ''

  const exclusionContext = (existingLandNames?.length || existingSpellNames?.length)
    ? `\nBEREITS IM DECK (NICHT wiederholen, außer du erhöhst bewusst eine Basisland-Anzahl):\nLänder: ${existingLandNames?.length ? existingLandNames.join(', ') : '(keine)'}\nSprüche: ${existingSpellNames?.length ? existingSpellNames.join(', ') : '(keine)'}\n`
    : ''

  // EDHREC's real community data: which cards are actually played with this exact commander,
  // and disproportionately so ("High Synergy" = over-represented here vs the general meta —
  // the closest public signal to "these cards combo/synergize specifically with this
  // commander", short of a dedicated combo database).
  const edhecContext = edhecData?.allCards?.length
    ? `\nEDHREC-DATEN (echte Decks mit ${commander}):\n- High Synergy Cards (überdurchschnittlich oft speziell mit diesem Commander gespielt — starkes Synergie-/Combo-Signal): ${(edhecData.highSynergyCards || []).slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n- Meistgespielte Karten insgesamt: ${edhecData.topCards?.slice(0, 15).map(c => c.name).join(', ') || '(keine Daten)'}\n- Synergie-Commander (oft als Partner/ähnliche Strategie genannt): ${edhecData.synergyCommanders?.slice(0, 5).map(c => c.name).join(', ') || '(keine Daten)'}\n`
    : ''

  const landsInstruction = isFirstRound
    ? `Entscheide zuerst selbst die für DIESES Deck passende Gesamt-Länderzahl und setze sie als "landCount". Für die allermeisten Commander-Decks sind 36-38 der sinnvolle Standard — weiche davon nur ab, wenn Commander oder gewünschte Strategie es wirklich verlangen (z.B. eine echte Lands-Matter-/Landfall-Payoff-Strategie, extremes Ramp, ein Commander wie Lord Windgrace, Titania oder Tatyova, der gezielt sehr viele Länder will). "lands": Summe aller "quantity"-Werte MUSS GENAU deinem gewählten "landCount" entsprechen — das ist danach eine harte Zahl, keine Richtlinie. Nutze Basisländer (exakt "Plains"/"Island"/"Swamp"/"Mountain"/"Forest", quantity passend zum Farbanteil der Sprüche verteilt) plus sinnvolle Nichtbasisländer/Fixer (je quantity 1).`
    : `"lands": Summe aller "quantity"-Werte MUSS GENAU ${landsNeeded} ergeben — das ist eine harte Zahl aus dem bisherigen Deckaufbau, zähle aktiv mit.${landsNeeded === 0 ? ' Die Manabasis ist bereits vollständig, gib ein leeres Array zurück.' : ''}`

  const spellsInstruction = isFirstRound
    ? `"spells": Summe aller "quantity"-Werte MUSS GENAU (99 - dein gewähltes "landCount") ergeben.`
    : `"spells": Summe aller "quantity"-Werte MUSS GENAU ${spellsNeeded} ergeben.${spellsNeeded === 0 ? ' Gib ein leeres Array zurück.' : ''}`

  const prompt = `Du bist ein Magic: The Gathering Commander Deck Experte.

COMMANDER: ${commander}
${strategyHint ? `GEWÜNSCHTE STRATEGIE/SPIELSTIL (aus dem Gespräch mit dem Nutzer): ${strategyHint}\n` : ''}${collectionContext}${exclusionContext}${edhecContext}
AUFGABE:
${isFirstRound ? 'Baue die Manabasis und den Rest eines vollständigen Commander-Decks.' : 'Ergänze das Deck um die fehlenden Karten (siehe unten, was schon drin ist).'} Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Fließtext außerhalb des JSON) mit:
- "summary": ${isFirstRound ? `deutscher Fließtext, 4-6 Sätze — Früh-/Mittel-/Spätspiel-Plan, Kern-Synergien mit ${commander} (mit echten Kartennamen), primäre Win Condition. Keine generischen Floskeln.` : 'ein kurzer deutscher Satz, was diese Ergänzung bringt.'}
- "lands": ${landsInstruction}
- "spells": Array aller Nichtland-Karten (Kreaturen, Instants, Sorceries, Artefakte, Enchantments, Planeswalker). ${spellsInstruction} Commander-Format ist Singleton: jede quantity hier ist 1. Mana-Ramp, Kartenvorteil, Removal/Interaktion, Wincons/Payoffs und Synergie-Karten passend zur Strategie und zu ${commander}s konkreten Fähigkeiten — keine generische "gute Karten"-Liste.${edhecData?.allCards?.length ? ' Nutze die EDHREC-Daten oben als echtes Signal, welche Karten in der Community wirklich mit diesem Commander funktionieren — bevorzuge insbesondere die High Synergy Cards, wenn sie zur Strategie passen.' : ''} Bevorzuge Karten aus der Sammlungs-Liste oben.

Nutze ausschließlich echte, existierende Magic: The Gathering Kartennamen.`

  const result = await generateContentWithRetry({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: FULL_DECK_SCHEMA,
      maxOutputTokens: 6000
    }
  })

  const parsed = parseJson(result.text)
  if (!parsed) return null

  return {
    summary: parsed.summary,
    landCount: parsed.landCount,
    lands: (parsed.lands || []).filter(c => c.name && c.quantity),
    spells: (parsed.spells || []).filter(c => c.name && c.quantity),
    usage: mapUsage(result)
  }
}

const FULL_DECK_TOP_UP_ATTEMPTS = 2

/**
 * Builds a complete, schema-validated 99-card decklist — the same reliable structured-
 * output approach as analyzeDeck(), just driven by a chat strategy hint instead of the
 * questionnaire's structured fields, and with lands/spells tracked as separate hard
 * targets instead of one flat list. Used by chatAssistant() when the model calls
 * build_full_deck, instead of trying to hit exact counts through many individual add_card
 * tool calls (which small/fast models are unreliable at tallying).
 *
 * The schema forces the right STRUCTURE per card, but not the right total COUNT per
 * section — Gemini has both undershot (e.g. 64/99 total) and neglected lands specifically
 * (e.g. 15 instead of ~37) despite explicit instructions. So this verifies the actual sums
 * after each round, runs top-up rounds for whichever section (or both) is still short, and
 * finally clamps each section to its exact target in case a round overshot instead. The
 * land target itself is Gemini's own per-deck judgment call from round 0 (most decks land
 * around 36-38, but a genuine lands-matter/extreme-ramp archetype legitimately wants much
 * more) — once decided it's enforced like any other hard target, never just neglected.
 */
// Commander's single most important legality rule — every nonland card (and most nonbasic
// lands) must be within the commander's color identity — had NO deterministic check
// anywhere in this pipeline before; the build simply trusted Gemini never to violate it.
// Same philosophy as every other fix in this file: verify against real Scryfall data, don't
// just hope the model got it right. A replacement is pulled from the EDHREC pool already
// fetched for this commander (guaranteed legal + genuinely recommended, not a random swap),
// falling back to a basic land in an identity color only if that pool is exhausted.
// A partner/background commander pair is often passed around this codebase as one combined
// string ("Zurgo and Ojutai", "Thrasios + Tymna") rather than two separate card names — no
// single Scryfall card matches that string. Looking it up as-is either misses entirely (safe,
// the check below just skips) or — worse — silently fuzzy-matches to ONE unrelated/partial
// card, producing a too-narrow identity that then wrongly flags half the deck as illegal
// (observed live: 16-21 "illegal" cards on a real partner-commander build). Splitting on the
// common separators and unioning each piece's own identity avoids both failure modes.
function splitCommanderNames(commander) {
  return commander
    .split(/\s*(?:\/\/|\+|&|\band\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean)
}

async function enforceColorIdentity(commander, lands, spells, edhecData) {
  const commanderNames = splitCommanderNames(commander)
  const info = await getBulkPrices([...commanderNames, ...lands.map(c => c.name), ...spells.map(c => c.name)])

  const commanderIdentity = new Set()
  for (const name of commanderNames) {
    for (const c of (info[name]?.colorIdentity || '').split(' ').filter(Boolean)) commanderIdentity.add(c)
  }
  // No Scryfall match for any piece of the commander name — nothing reliable to validate
  // against, better to skip the check than wrongly flag an otherwise-legal deck.
  if (commanderNames.every(name => !info[name])) return { lands, spells, illegal: [] }

  const isLegalName = (name) => {
    const entry = info[name]
    if (!entry) return true // unmatched name (lookup miss) — don't punish what we can't verify
    return (entry.colorIdentity || '').split(' ').filter(Boolean).every(c => commanderIdentity.has(c))
  }

  const edhecPool = [...(edhecData?.highSynergyCards || []), ...(edhecData?.topCards || [])].map(c => c.name)
  const existingNames = new Set([...lands, ...spells].map(c => normalizeCardName(c.name)))
  const fallbackColor = [...commanderIdentity][0]
  const fallbackBasic = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' }[fallbackColor] || 'Wastes'

  const illegal = []
  const fixCard = (card) => {
    if (isLegalName(card.name)) return card
    illegal.push(card.name)
    existingNames.delete(normalizeCardName(card.name))
    const replacement = edhecPool.find(name => isLegalName(name) && !existingNames.has(normalizeCardName(name)))
    const newName = replacement || fallbackBasic
    existingNames.add(normalizeCardName(newName))
    return { ...card, name: newName, reason: `Automatisch ersetzt — "${card.name}" liegt außerhalb der Farbidentität von ${commander}.` }
  }

  // Routed through mergeDeckCards so a fallback-basic replacement stacks onto an existing
  // copy instead of creating a separate duplicate row.
  const fixedLands = mergeDeckCards([], lands.map(fixCard))
  const fixedSpells = mergeDeckCards([], spells.map(fixCard))

  if (illegal.length) {
    console.warn(`[Gemini] buildFullDeckFromChat: replaced ${illegal.length} color-identity-illegal card(s) for ${commander}:`, illegal)
  }

  return { lands: fixedLands, spells: fixedSpells, illegal }
}

async function buildFullDeckFromChat({ commander, strategyHint, collectionSampleNames, edhecData }) {
  let lands = []
  let spells = []
  let summary = ''
  let landTarget = null
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 }

  for (let round = 0; round <= FULL_DECK_TOP_UP_ATTEMPTS; round++) {
    const isFirstRound = round === 0
    const landsNeeded = isFirstRound ? undefined : Math.max(landTarget - lands.reduce((sum, c) => sum + c.quantity, 0), 0)
    const spellsNeeded = isFirstRound ? undefined : Math.max((99 - landTarget) - spells.reduce((sum, c) => sum + c.quantity, 0), 0)
    if (!isFirstRound && landsNeeded <= 0 && spellsNeeded <= 0) break

    const batch = await generateDeckRound({
      commander,
      strategyHint,
      collectionSampleNames,
      existingLandNames: lands.map(c => c.name),
      existingSpellNames: spells.map(c => c.name),
      landsNeeded,
      spellsNeeded,
      isFirstRound,
      edhecData
    })
    if (!batch) {
      console.warn(`[Gemini] buildFullDeckFromChat: round ${round} returned unparseable JSON, stopping`)
      break
    }

    if (isFirstRound) {
      summary = batch.summary
      // Trust Gemini's own landCount choice within a plausible band (covers real variation —
      // control decks running fewer, ramp-heavy or lands-matter decks running more — without
      // a rigid single number). Outside that band is far more likely a miscalibration than a
      // deliberate, functional archetype choice (a normal 5-color goodstuff deck reporting 16
      // lands has been observed) — fall back to the safe default rather than trust it blindly.
      landTarget = Number.isInteger(batch.landCount) && batch.landCount >= 30 && batch.landCount <= 60
        ? batch.landCount
        : FULL_DECK_DEFAULT_LAND_TARGET
      console.log(`[Gemini] buildFullDeckFromChat: Gemini proposed landCount=${batch.landCount} -> using target ${landTarget}`)
    }
    lands = mergeDeckCards(lands, batch.lands)
    spells = mergeDeckCards(spells, batch.spells)
    totalUsage = {
      prompt_tokens: totalUsage.prompt_tokens + batch.usage.prompt_tokens,
      completion_tokens: totalUsage.completion_tokens + batch.usage.completion_tokens
    }
    console.log(`[Gemini] buildFullDeckFromChat: after round ${round} — lands=${lands.reduce((s, c) => s + c.quantity, 0)}, spells=${spells.reduce((s, c) => s + c.quantity, 0)}`)
  }

  const finalLandTarget = landTarget ?? FULL_DECK_DEFAULT_LAND_TARGET
  lands = clampDeckCards(lands, finalLandTarget)
  spells = clampDeckCards(spells, 99 - finalLandTarget)

  // Absolute final guarantee: if Gemini still fell short of the land target after every
  // top-up round (a null/failed batch, or just undershooting again), pad deterministically
  // instead of serving a deck with a broken manabase.
  const landShortfall = finalLandTarget - lands.reduce((sum, c) => sum + c.quantity, 0)
  if (landShortfall > 0) {
    console.log(`[Gemini] buildFullDeckFromChat: padding ${landShortfall} basic lands to reach target ${finalLandTarget}`)
    lands = padWithBasicLands(lands, landShortfall)
  }

  // Legality check runs last, after count/budget are already settled — a swap preserves the
  // card's slot (and quantity), so it doesn't disturb the land/spell counts just finalized.
  const identityResult = await enforceColorIdentity(commander, lands, spells, edhecData)
  lands = identityResult.lands
  spells = identityResult.spells
  const identityNote = identityResult.illegal.length
    ? `\n\n⚠️ ${identityResult.illegal.length} Karte(n) außerhalb der Farbidentität von ${commander} automatisch ersetzt: ${identityResult.illegal.join(', ')}.`
    : ''

  const finalLandCount = lands.reduce((s, c) => s + c.quantity, 0)
  const finalSpellCount = spells.reduce((s, c) => s + c.quantity, 0)
  console.log(`[Gemini] buildFullDeckFromChat: FINAL lands=${finalLandCount}, spells=${finalSpellCount}, total=${finalLandCount + finalSpellCount}`)

  return {
    summary: summary + identityNote,
    // Tagged here (not re-derived later from Scryfall type_line, which arrives async and
    // can lag behind for a large batch) — the backend already knows this with certainty,
    // no reason to make the frontend guess again from external data that hasn't loaded yet.
    cards: [
      ...lands.map(c => ({ ...c, isLand: true })),
      ...spells.map(c => ({ ...c, isLand: false }))
    ],
    usage: totalUsage
  }
}

// Kept small on purpose — each candidate still costs 1-2 Scryfall round-trips (fetched in
// parallel below, but a slow/rate-limited response is still a risk), and this whole step
// runs AFTER up to 3 full-deck generation rounds inside the same 30s function invocation —
// the exact timeout this codebase has already fought hard to avoid elsewhere.
const MAX_BUDGET_CORRECTION_CANDIDATES = 5
// Leaves headroom under Netlify's 30s hard limit for the rest of the response to serialize.
const BUDGET_CORRECTION_DEADLINE_MS = 25000

// A "max €X to buy" instruction handed to Gemini as free text is exactly the kind of
// numeric constraint it has proven unreliable at self-enforcing across a 99-card build
// (see the land-count reliability work above) — so it's verified here against REAL
// Scryfall prices after generation, same pattern: trust the AI for a first attempt, then
// deterministically correct against ground truth instead of hoping it got it right.
// `requestStartedAt` lets it bail out (reporting the real total but skipping swaps) if the
// full-deck generation above already ate most of the 30s budget.
async function enforcePurchaseBudget(cards, collectionSampleNames, maxPurchaseBudgetEur, requestStartedAt) {
  if (!maxPurchaseBudgetEur || maxPurchaseBudgetEur <= 0) {
    return { cards, budgetNote: '' }
  }

  const owned = new Set((collectionSampleNames || []).map(n => n.toLowerCase()))
  const isOwned = (card) => owned.has(card.name.toLowerCase())

  const prices = await getBulkPrices(cards.map(c => c.name).filter(Boolean))
  let result = cards.map(c => ({ ...c, eur: prices[c.name]?.eur || 0, image: prices[c.name]?.image }))

  let purchaseTotal = result.filter(c => !isOwned(c)).reduce((sum, c) => sum + c.eur * c.quantity, 0)
  console.log(`[Gemini] enforcePurchaseBudget: initial purchase total €${purchaseTotal.toFixed(2)} vs budget €${maxPurchaseBudgetEur}`)

  if (purchaseTotal <= maxPurchaseBudgetEur) {
    return { cards: result, budgetNote: `\n\n🛒 Zukaufswert: ca. €${purchaseTotal.toFixed(2)} (innerhalb deines Budgets von €${maxPurchaseBudgetEur}).` }
  }

  if (Date.now() - requestStartedAt > BUDGET_CORRECTION_DEADLINE_MS) {
    console.warn('[Gemini] enforcePurchaseBudget: skipping correction, too close to the function timeout')
    return {
      cards: result,
      budgetNote: `\n\n⚠️ Zukaufswert: ca. €${purchaseTotal.toFixed(2)} — über deinem Budget von €${maxPurchaseBudgetEur}. Für eine automatische Ersetzung teurer Karten war keine Zeit mehr übrig (Deckbau hat schon lange gedauert) — frag im Chat gezielt nach günstigeren Alternativen für einzelne teure Karten.`
    }
  }

  // Worst (priciest) non-owned, non-land offenders first — lands are left alone since
  // swapping one risks breaking the manabase, and budget overruns are almost always
  // expensive nonland staples/tutors anyway.
  const offenders = result
    .filter(c => !isOwned(c) && !c.isLand && c.eur > 0)
    .sort((a, b) => b.eur - a.eur)
    .slice(0, MAX_BUDGET_CORRECTION_CANDIDATES)

  const existingNamesLower = new Set(result.map(c => c.name.toLowerCase()))

  // Fetched in parallel — sequentially, up to 5 candidates x 2 Scryfall calls each risked
  // 10+ seconds of pure network wait on top of an already-tight budget (this timed out
  // in testing). Running them concurrently bounds the wait to roughly the slowest single
  // lookup instead of the sum of all of them; the tradeoff is a few now-unused alternative
  // lookups when an early swap would otherwise have already closed the gap — an acceptable
  // cost against blowing the 30s deadline entirely.
  const alternativesByOffender = await Promise.all(
    offenders.map(offender => {
      const overBudgetBy = purchaseTotal - maxPurchaseBudgetEur
      const priceCeiling = Math.max(1, offender.eur - overBudgetBy / offender.quantity)
      return getBudgetAlternatives(offender.name, priceCeiling)
        .then(alternatives => ({ offender, alternatives }))
        .catch(error => {
          console.warn('[Gemini] enforcePurchaseBudget: alternative lookup failed for', offender.name, error.message)
          return { offender, alternatives: [] }
        })
    })
  )

  for (const { offender, alternatives } of alternativesByOffender) {
    if (purchaseTotal <= maxPurchaseBudgetEur) break

    const pick = alternatives.find(a => a.eur > 0 && !existingNamesLower.has(a.name.toLowerCase()))
    if (!pick) continue

    const idx = result.findIndex(c => c.name === offender.name)
    if (idx === -1) continue

    const savedPerCopy = offender.eur - pick.eur
    result[idx] = {
      ...result[idx],
      name: pick.name,
      eur: pick.eur,
      image: pick.image,
      reason: `Günstiger ersetzt für dein Budget (war ${offender.name}, €${offender.eur.toFixed(2)}).`
    }
    existingNamesLower.delete(offender.name.toLowerCase())
    existingNamesLower.add(pick.name.toLowerCase())
    purchaseTotal -= savedPerCopy * offender.quantity
    console.log(`[Gemini] enforcePurchaseBudget: swapped ${offender.name} (€${offender.eur.toFixed(2)}) -> ${pick.name} (€${pick.eur.toFixed(2)})`)
  }

  const budgetNote = purchaseTotal <= maxPurchaseBudgetEur
    ? `\n\n🛒 Zukaufswert nach automatischer Anpassung: ca. €${purchaseTotal.toFixed(2)} (innerhalb deines Budgets von €${maxPurchaseBudgetEur}).`
    : `\n\n⚠️ Zukaufswert: ca. €${purchaseTotal.toFixed(2)} — liegt trotz automatischer Ersetzungen noch über deinem Budget von €${maxPurchaseBudgetEur}. Für die verbleibenden teuren Karten wurde keine passende günstigere Alternative gefunden.`

  return { cards: result, budgetNote }
}

/**
 * Conversational deck-building assistant — answers questions and gives
 * optimization suggestions about the deck currently open in the builder.
 * With enableActions, it can also directly add/remove/adjust cards via function calling.
 */
async function chatAssistant({ commander, cards, message, history, enableActions, contextNote, collectionSampleNames, bulkBuild }) {
  const requestStartedAt = Date.now()
  const totalCount = (cards || []).reduce((sum, c) => sum + (c.count || 1), 0)

  const deckContext = commander
    ? `AKTUELLES DECK:
Commander: ${commander}
Aktuelle Deckgröße: ${totalCount} / 99 Karten (Commander zählt nicht mit; diese Zahl ist die exakte Wahrheit — verlass dich beim Rechnen darauf, nicht auf Abzählen der Liste unten)
${cards?.length
  ? `Kartenliste (${cards.length} Einträge${cards.length > CHAT_CARD_LIST_LIMIT ? `, erste ${CHAT_CARD_LIST_LIMIT} gezeigt` : ''}): ${cards
      .slice(0, CHAT_CARD_LIST_LIMIT)
      .map(c => (c.count > 1 ? `${c.count}x ${c.name}` : c.name))
      .join(', ')}`
  : 'Die Kartenliste ist noch leer.'}`
    : 'Der Nutzer hat aktuell noch keinen Commander/kein Deck ausgewählt.'

  const collectionContext = collectionSampleNames?.length
    ? `\nKARTEN IN DER SAMMLUNG DES NUTZERS (${collectionSampleNames.length}${collectionSampleNames.length > CHAT_COLLECTION_LIMIT ? `, erste ${CHAT_COLLECTION_LIMIT} gezeigt` : ''} — bereits besessen, muss nicht gekauft werden): ${collectionSampleNames.slice(0, CHAT_COLLECTION_LIMIT).join(', ')}\n`
    : ''

  const bulkBuildInstructions = bulkBuild
    ? ` Wenn der Nutzer einen KOMPLETTEN Deck-Vorschlag will (z.B. "bau mir ein Deck", "schlag mir 99 Karten vor", "nutze meine Sammlung für ein komplettes Deck"), rufe SOFORT build_full_deck auf (mit einer kurzen strategyHint-Zusammenfassung des bisherigen Gesprächs) — das übernimmt den kompletten 99-Karten-Aufbau inkl. korrekter Manabasis zuverlässig in einem Rutsch. WICHTIG: Falls in DERSELBEN Nachricht auch noch kein Commander gewählt war und der Nutzer einen klar erkennbaren Commander nennt (Name oder eindeutige Beschreibung), rufe in DIESER EINEN Antwort BEIDES auf — zuerst set_commander, DANN direkt im selben Funktionsaufruf-Batch auch build_full_deck. Warte NICHT auf eine weitere Nachricht, nur weil du gerade erst den Commander gesetzt hast — wenn der Nutzer erkennbar schon einen kompletten Deckbau wollte, liefere ihn sofort mit. Versuche NIEMALS, ein komplettes Deck stattdessen über viele einzelne add_card-Aufrufe zu bauen, das führt zuverlässig zu falschen Kartenzahlen. Für kleinere, gezielte Änderungen an einem bereits gebauten Deck (einzelne Karte tauschen/hinzufügen/entfernen) weiterhin add_card/remove_card/update_card_count normal nutzen.`
    : ''

  const actionsInstructions = enableActions
    ? `\n\nDu kannst das Deck direkt verändern: Wenn der Nutzer darum bittet (z.B. "füge Sol Ring hinzu", "entferne X", "mach 12 Islands draus", "ich will mit Marisi spielen"), rufe die passende Funktion auf (add_card/remove_card/update_card_count/set_commander). add_card ADDIERT die angegebene Anzahl zur bestehenden Anzahl (z.B. add_card("Island", 3) bei bereits 5 vorhandenen ergibt 8) — für einen FESTEN Zielwert (z.B. "mach es 12 Islands") nutze stattdessen update_card_count. remove_card und update_card_count funktionieren nur für Karten, die WIRKLICH in der Kartenliste oben stehen. Falls noch kein Commander gewählt ist und der Nutzer einen Spielstil/Farben/eine Idee nennt, schlage 1-3 passende, echte Commander vor und rufe set_commander auf, sobald er sich entscheidet.${bulkBuildInstructions}\n\nDeine Text-Antwort ist PFLICHT und darf NIEMALS leer oder nur ein Wort wie "Erledigt" sein — beschreibe konkret (mit Kartennamen), was du getan hast und warum. Wenn der Nutzer explizit eine Strategie-/Begründungs-Erklärung verlangt hat, schreibe diese ausführlich (4-6 Sätze: Gameplan, Kern-Synergien mit Commander-Namen, primäre Win Condition) — Funktionsaufrufe ersetzen niemals eine verlangte Texterklärung.`
    : ''

  const systemPrompt = `Du bist ein hilfsbereiter Magic: The Gathering Commander-Experte, eingebettet als Chat-Assistent direkt in einer Deckbau-App. Du hilfst dem Nutzer beim gesamten Commander-Workflow — von der Commander-Wahl bis zur Optimierung eines bestehenden Decks.

${deckContext}
${collectionContext}${contextNote ? `\n${contextNote}\n` : ''}
Antworte auf Deutsch, knapp und konkret (max. ca. 150 Wörter, außer der Nutzer bittet ausdrücklich um mehr, oder du gerade aktiv eine Kartenladung aufbaust). Wenn du Karten oder Commander vorschlägst, nenne echte, existierende Magic-Kartennamen mit kurzer Begründung. Antworte als Fließtext, kein JSON, keine Markdown-Codeblöcke.${actionsInstructions}`

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Verstanden — ich helfe dir gerne bei diesem Deck weiter. Was möchtest du wissen?' }] },
    ...(history || []).slice(-CHAT_HISTORY_LIMIT).map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ]

  try {
    const result = await generateContentWithRetry({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.7,
        maxOutputTokens: bulkBuild ? CHAT_BULK_BUILD_MAX_OUTPUT_TOKENS : CHAT_MAX_OUTPUT_TOKENS,
        ...(enableActions ? { tools: buildDeckActionTools(bulkBuild) } : {})
      }
    })

    if (bulkBuild) {
      console.log(`[Gemini] chatAssistant: functionCalls this turn = [${(result.functionCalls || []).map(fc => fc.name).join(', ')}]`)
    }

    const buildFullDeckCall = (result.functionCalls || []).find(fc => fc.name === 'build_full_deck')
    if (buildFullDeckCall) {
      // The model can (and did, in testing) call set_commander AND build_full_deck in the
      // SAME turn — e.g. "build me a Kenrith deck" with no commander picked yet. The
      // `commander` param here still reflects the frontend's state as of when this request
      // was SENT, which is empty/stale in that case — use the just-set name instead, or
      // the whole build (EDHREC lookup included) silently runs with no commander at all.
      const setCommanderCall = (result.functionCalls || []).find(fc => fc.name === 'set_commander')
      const effectiveCommander = setCommanderCall?.args?.name || commander
      console.log('[Gemini] chatAssistant: build_full_deck invoked for commander =', effectiveCommander, '| strategyHint =', buildFullDeckCall.args?.strategyHint || '(none, using raw message)')

      // Best-effort — a broken/rate-limited EDHREC fetch shouldn't block the deck build,
      // it just loses the community-data signal for this one build.
      let edhecData = null
      try {
        const rawEdhecData = await getCommanderData(effectiveCommander)
        edhecData = extractRecommendations(rawEdhecData)
        edhecData.synergyCommanders = extractSynergyCommanders(rawEdhecData)
        console.log(`[Gemini] chatAssistant: EDHREC data loaded for ${effectiveCommander} — ${edhecData.allCards.length} cards, ${edhecData.highSynergyCards.length} high-synergy`)
      } catch (error) {
        console.warn('[Gemini] chatAssistant: EDHREC fetch failed, continuing without it:', error.message)
      }

      const maxPurchaseBudgetEur = buildFullDeckCall.args?.maxPurchaseBudgetEur
      const strategyHint = buildFullDeckCall.args?.strategyHint || message

      const built = await buildFullDeckFromChat({
        commander: effectiveCommander,
        strategyHint: maxPurchaseBudgetEur
          ? `${strategyHint} (Zukaufsbudget für Karten außerhalb der Sammlung: max. €${maxPurchaseBudgetEur} — bevorzuge besessene oder günstige Karten.)`
          : strategyHint,
        collectionSampleNames,
        edhecData
      })

      if (built) {
        let finalCards = built.cards
        let budgetNote = ''
        if (maxPurchaseBudgetEur) {
          const budgetResult = await enforcePurchaseBudget(built.cards, collectionSampleNames, maxPurchaseBudgetEur, requestStartedAt)
          finalCards = budgetResult.cards
          budgetNote = budgetResult.budgetNote
        }

        // A single 'replaceDeck' action, NOT one 'add' action per card — a full build is a
        // fresh, self-contained 99-card deck, not an increment to whatever was already there.
        // Funneling it through the same 'add' semantics as a single manual add_card request
        // was the bug behind runaway card counts: 'add' on a basic land ADDS to its existing
        // count (correct for "add 3 more Islands"), so asking for a full rebuild a second
        // time in the same chat session silently stacked a whole second manabase on top of
        // the first (observed live: 87 basic lands across 2 builds instead of ~37) — nonbasic
        // duplicates were silently dropped by the existing-card guard, masking the same bug
        // there. A full build should always replace the deck outright.
        const fullDeckActions = []
        // Relay set_commander too (if the model called it) — otherwise the frontend's own
        // commander state never gets updated even though the build used the right name.
        if (setCommanderCall?.args?.name) {
          fullDeckActions.push({ type: 'setCommander', name: setCommanderCall.args.name })
        }
        fullDeckActions.push({
          type: 'replaceDeck',
          cards: finalCards
            .filter(c => c.name && c.quantity)
            .map(c => ({ name: c.name, quantity: c.quantity, isLand: c.isLand }))
        })

        return {
          reply: (built.summary || synthesizeFallbackReply(fullDeckActions)) + budgetNote,
          actions: fullDeckActions,
          usage: built.usage
        }
      }
      // If the internal build call failed to parse, fall through and handle whatever
      // else the model returned (e.g. plain text) instead of returning nothing.
    }

    const actions = (result.functionCalls || [])
      .filter(fc => ACTION_TYPE_BY_FUNCTION_NAME[fc.name] && fc.args?.name)
      .map(fc => ({
        type: ACTION_TYPE_BY_FUNCTION_NAME[fc.name],
        name: fc.args.name,
        quantity: fc.args.quantity
      }))

    return {
      reply: result.text || synthesizeFallbackReply(actions),
      actions,
      usage: mapUsage(result)
    }
  } catch (error) {
    console.error('[Gemini] Error in chat assistant:', error)
    throw error
  }
}

module.exports = {
  analyzeDeck,
  auditDeckStrategy,
  auditDeckSuggestions,
  suggestCommanders,
  chatAssistant
}
