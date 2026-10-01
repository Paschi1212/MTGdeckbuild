/**
 * POST /mcp (rewritten to /.netlify/functions/mcp in netlify.toml)
 * A remote MCP server ("connector") exposing Scryfall + EDHREC lookups as tools, so Claude —
 * in claude.ai, Claude Code, or a claude.ai Artifact page — can ground every MTG statement in
 * real card text and real deck data instead of memory.
 *
 * Streamable HTTP transport, stateless: every POST carries one JSON-RPC message (or a batch)
 * and gets a plain JSON response — no sessions, no server-sent events, which fits a
 * short-lived function. Public data only, so no authentication.
 */

import { TOOLS } from './lib/mtg-mcp-tools.js'

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

const SERVER_INFO = { name: 'mtg-deckbuilder', title: 'MTG Commander Deck Builder', version: '1.0.0' }

const INSTRUCTIONS = 'Magic: The Gathering Commander data straight from Scryfall (exact card text, color identity, legality, prices) and EDHREC (what real decks play). Never rely on memory for what a card does: look it up with card_lookup or scryfall_search first. Use edhrec_commander for what a commander\'s real decks run, edhrec_theme_commanders to find commanders for a theme, and deck_check for a deterministic check of a whole decklist before judging it.'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id'
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }
}

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

async function callTool(id, params) {
  const tool = TOOLS.find(t => t.name === params?.name)
  if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`)

  const startedAt = Date.now()
  try {
    const data = await tool.run(params.arguments || {})
    console.log(`[MCP] ${tool.name} ok in ${Date.now() - startedAt}ms`)
    return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data) }] })
  } catch (error) {
    // A failed lookup is a tool RESULT the model should see and react to (fix a query, try
    // another name) — not a protocol error that aborts the whole call.
    console.error(`[MCP] ${tool.name} failed:`, error.message)
    return rpcResult(id, { content: [{ type: 'text', text: `Fehler: ${error.message}` }], isError: true })
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0') return rpcError(message?.id, -32600, 'Invalid Request')
  if (typeof message.method !== 'string') return null // a client's response to us — nothing to answer
  if (message.id === undefined || message.id === null) return null // notification

  const { id, method, params } = message
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }))
      })
    case 'tools/call':
      return callTool(id, params)
    // Not offered (no capability declared), but some clients ask anyway — an empty list is
    // friendlier than an error there.
    case 'resources/list':
      return rpcResult(id, { resources: [] })
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] })
    case 'prompts/list':
      return rpcResult(id, { prompts: [] })
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

export const handler = async (event) => {
  const method = event.httpMethod

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }

  if (method !== 'POST') {
    // GET would open a server-sent-event stream, which this stateless server doesn't offer
    // (405 is the spec's answer). /.well-known/* is routed here too, so OAuth discovery gets
    // a clean 404 ("no auth") instead of the single-page app's index.html.
    const path = `${event.path || ''} ${event.rawUrl || ''}`
    if (path.includes('.well-known')) return jsonResponse(404, { error: 'not_found' })
    return { ...jsonResponse(405, { error: 'Use POST for MCP requests.' }), headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' } }
  }

  let body
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || ''
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, rpcError(null, -32700, 'Parse error'))
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(handleMessage))).filter(Boolean)
    return responses.length ? jsonResponse(200, responses) : { statusCode: 202, headers: CORS_HEADERS, body: '' }
  }

  const response = await handleMessage(body)
  return response ? jsonResponse(200, response) : { statusCode: 202, headers: CORS_HEADERS, body: '' }
}
