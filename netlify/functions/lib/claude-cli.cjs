/**
 * "Claude-Modus": answers the app's AI requests with Claude through the local Claude Code CLI
 * (the user's own Claude login) instead of Gemini. Only ever active inside the local bridge
 * (scripts/claude-bridge.mjs), which sets AI_PROVIDER=claude — on Netlify there is no CLI and
 * nothing here runs.
 *
 * generateWithClaude() takes the exact params gemini-api.cjs passes to Gemini and returns a
 * Gemini-shaped result ({ text, functionCalls, usageMetadata, candidates }), so every caller
 * there — prompts, schemas, deterministic post-processing — stays one code path.
 *
 * Claude gets the MTG connector's read-only tools (Scryfall + EDHREC) and nothing else: no
 * shell, no file access, no other MCP servers.
 */

const { spawn } = require('child_process')
const { AsyncLocalStorage } = require('async_hooks')
const os = require('os')

// Per-request settings from the website (the model picked on /claude-modus). The bridge runs
// each request inside withClaudeRequest(), so the choice reaches runClaudeCli without being
// threaded through every function in gemini-api.cjs — and the models that actually answered
// are collected on the same object for the response header.
const requestContext = new AsyncLocalStorage()

function withClaudeRequest(context, fn) {
  return requestContext.run(context, fn)
}

// modelUsage can list a helper model next to the main one; the main one wrote the most.
function mainModel(modelUsage) {
  const entries = Object.entries(modelUsage || {})
  if (!entries.length) return null
  entries.sort(([, a], [, b]) => (b?.outputTokens ?? 0) - (a?.outputTokens ?? 0))
  return entries[0][0]
}

const MCP_URL = process.env.MTG_MCP_URL || 'https://mtgepicdeckbuilder.netlify.app/mcp'
const MCP_CONFIG = JSON.stringify({ mcpServers: { mtg: { type: 'http', url: MCP_URL } } })
const CLI_TIMEOUT_MS = 8 * 60 * 1000

const SYSTEM_PROMPT = `Du arbeitest als KI-Backend einer Magic: The Gathering Commander-Deckbau-App. Dir stehen Werkzeuge für Scryfall (exakte Kartentexte, Farbidentität, Legalität, Preise) und EDHREC (was echte Decks spielen) zur Verfügung.
Verlass dich nie auf dein Gedächtnis, was eine Karte tut: Prüfe Kartentexte mit card_lookup, bevor du Karten bewertest, streichst oder empfiehlst — bündle dabei viele Namen in EINEM Aufruf. Nutze edhrec_commander für die Daten echter Decks und scryfall_search, um passende Karten zu finden. Halte die Zahl der Werkzeugaufrufe klein.
Deine Antwort wird maschinell weiterverarbeitet: Halte dich exakt an das verlangte Format und die Vorgaben im Auftrag.`

function isClaudeProvider() {
  return process.env.AI_PROVIDER === 'claude'
}

function partsText(content) {
  return (content?.parts || []).map(part => part.text || '').join('\n')
}

// Gemini takes either a prompt string or a list of {role, parts} turns (the chat). The CLI
// takes one prompt, so a conversation becomes a labelled transcript.
function contentsToPrompt(contents) {
  if (typeof contents === 'string') return contents
  if (!Array.isArray(contents)) return String(contents ?? '')
  if (contents.length === 1) return partsText(contents[0])
  const transcript = contents
    .map(turn => `${turn.role === 'model' ? 'ASSISTENT' : 'NUTZER'}:\n${partsText(turn)}`)
    .join('\n\n---\n\n')
  return `${transcript}\n\n---\nAntworte jetzt als ASSISTENT auf die letzte NUTZER-Nachricht.`
}

// Gemini's function calling lets the chat return app actions (add_card, build_full_deck, ...)
// that the frontend applies. The CLI's own tools are executed by MCP servers instead, so the
// actions travel in the structured answer: {reply, functionCalls: [{name, args}]}.
function describeAppActions(declarations) {
  const lines = declarations.map(d =>
    `- ${d.name}: ${d.description}\n  Parameter (args): ${JSON.stringify(d.parameters?.properties || {})}${d.parameters?.required?.length ? ` — Pflicht: ${d.parameters.required.join(', ')}` : ''}`
  )
  return `\n\nAPP-AKTIONEN: Du kannst die folgenden Aktionen der App auslösen, indem du sie im Feld "functionCalls" deiner Antwort aufführst (das sind KEINE Werkzeuge zum Aufrufen — die App führt sie nach deiner Antwort aus). Ohne passende Aktion bleibt "functionCalls" leer. Deine Nachricht an den Nutzer steht in "reply".\n${lines.join('\n')}`
}

function appActionSchema(declarations) {
  return {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Antwort an den Nutzer (Deutsch, Fließtext).' },
      functionCalls: {
        type: 'array',
        description: 'App-Aktionen, die nach der Antwort ausgeführt werden sollen.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: declarations.map(d => d.name) },
            args: { type: 'object', description: 'Parameter laut Aktionsbeschreibung.' }
          },
          required: ['name', 'args']
        }
      }
    },
    required: ['reply', 'functionCalls']
  }
}

function friendlyCliError(message) {
  if (/authenticat|oauth|log ?in|credential/i.test(message)) {
    return `Claude-CLI ist nicht angemeldet (${message}). Im Terminal "claude" starten und /login ausführen, danach auf der Seite /claude-modus "Erneut prüfen" klicken.`
  }
  return `Claude-CLI: ${message}`
}

function runClaudeCli({ prompt, schema, model }) {
  const request = requestContext.getStore()
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model || request?.model || process.env.CLAUDE_MODEL || 'opus',
    '--tools', '',
    '--strict-mcp-config',
    '--mcp-config', MCP_CONFIG,
    '--allowedTools', 'mcp__mtg',
    // Only "project" settings — and the working directory is the temp folder, which has none:
    // the user's own hooks/plugins never run inside these background calls.
    '--setting-sources', 'project',
    '--no-session-persistence',
    '--append-system-prompt', SYSTEM_PROMPT
  ]
  if (schema) args.push('--json-schema', JSON.stringify(schema))

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN || 'claude', args, { cwd: os.tmpdir(), windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Claude hat nach ${CLI_TIMEOUT_MS / 60000} Minuten nicht geantwortet.`))
    }, CLI_TIMEOUT_MS)

    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => {
      clearTimeout(timer)
      reject(new Error(error.code === 'ENOENT'
        ? 'Claude-CLI nicht gefunden — ist Claude Code installiert und "claude" im PATH?'
        : `Claude-CLI konnte nicht starten: ${error.message}`))
    })
    child.on('close', () => {
      clearTimeout(timer)
      let result
      try {
        result = JSON.parse(stdout)
      } catch {
        return reject(new Error(friendlyCliError((stderr || stdout || 'keine Ausgabe').trim().slice(0, 300))))
      }
      if (result.is_error) return reject(new Error(friendlyCliError(String(result.result || result.subtype || 'unbekannter Fehler'))))
      const answeredBy = mainModel(result.modelUsage)
      if (answeredBy) request?.modelsUsed?.add(answeredBy)
      resolve(result)
    })

    child.stdin.end(prompt)
  })
}

async function generateWithClaude(params, { model } = {}) {
  const config = params.config || {}
  const declarations = (config.tools || []).flatMap(tool => tool.functionDeclarations || [])

  let prompt = contentsToPrompt(params.contents)
  let schema = config.responseSchema || null
  if (declarations.length) {
    prompt += describeAppActions(declarations)
    schema = appActionSchema(declarations)
  }

  const startedAt = Date.now()
  const result = await runClaudeCli({ prompt, schema, model })
  console.log(`[Claude] answered in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${result.num_turns ?? '?'} turns, model ${mainModel(result.modelUsage) || '?'})`)

  const structured = result.structured_output
  const usageMetadata = {
    promptTokenCount: result.usage?.input_tokens ?? 0,
    candidatesTokenCount: result.usage?.output_tokens ?? 0
  }
  const candidates = [{ finishReason: 'STOP' }]

  if (declarations.length) {
    let answer = structured
    if (!answer) {
      try { answer = JSON.parse(result.result) } catch { answer = { reply: String(result.result || ''), functionCalls: [] } }
    }
    const known = new Set(declarations.map(d => d.name))
    const functionCalls = (answer.functionCalls || [])
      .filter(call => call && known.has(call.name))
      .map(call => ({ name: call.name, args: call.args || {} }))
    return { text: answer.reply || '', functionCalls, usageMetadata, candidates }
  }

  const text = structured != null ? JSON.stringify(structured) : String(result.result || '')
  return { text, usageMetadata, candidates }
}

module.exports = { isClaudeProvider, generateWithClaude, runClaudeCli, withClaudeRequest }
