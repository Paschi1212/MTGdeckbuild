/**
 * Tablet & phone access to the Claude bridge through Tailscale (a private network of the
 * user's own devices — nothing here is reachable from the public internet).
 *
 * On start the bridge asks the local Tailscale client for this PC's name and, if needed,
 * runs `tailscale serve --bg`, which publishes https://<pc>.<tailnet>.ts.net (with a real
 * certificate) inside the tailnet and forwards it to the bridge on 127.0.0.1. The setting
 * survives reboots, so this normally only does real work once.
 *
 * Everything is optional: without Tailscale the bridge simply stays local-only.
 * CLAUDE_BRIDGE_REMOTE=off disables the whole thing; TAILSCALE_BIN points to another CLI.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'

const WINDOWS_DEFAULT = 'C:\\Program Files\\Tailscale\\tailscale.exe'

function run(bin, args, timeoutMs = 15000) {
  // A .js/.mjs "CLI" (test double) runs through Node itself.
  const [file, fileArgs] = /\.m?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args]
  return new Promise(resolve => {
    execFile(file, fileArgs, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        missing: error?.code === 'ENOENT',
        timedOut: Boolean(error?.killed),
        stdout: String(stdout || ''),
        stderr: String(stderr || '')
      })
    })
  })
}

async function findTailscale() {
  if (process.env.TAILSCALE_BIN) return process.env.TAILSCALE_BIN
  const onPath = await run('tailscale', ['version'], 5000)
  if (!onPath.missing) return 'tailscale'
  if (process.platform === 'win32' && fs.existsSync(WINDOWS_DEFAULT)) return WINDOWS_DEFAULT
  return null
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// Does the serve config already forward https://<host>/ to this bridge?
function servesBridge(serveStatus, host, port) {
  const handlers = serveStatus?.Web?.[`${host}:443`]?.Handlers || {}
  return Object.values(handlers).some(h => new RegExp(`^(https?://)?(127\\.0\\.0\\.1|localhost):${port}/?$`).test(String(h?.Proxy || '')))
}

/**
 * Makes the bridge reachable for the user's other Tailscale devices.
 * Returns { state, url, owner, hint } — state is one of:
 *   ready | off | not-installed | not-running | https-disabled | error
 */
export async function setupRemote(port) {
  if (process.env.CLAUDE_BRIDGE_REMOTE === 'off') {
    return { state: 'off', hint: 'Tablet-Zugriff ist abgeschaltet (CLAUDE_BRIDGE_REMOTE=off).' }
  }
  const bin = await findTailscale()
  if (!bin) {
    return { state: 'not-installed', hint: 'Tailscale ist auf diesem PC nicht installiert – nur nötig für Tablet & Handy.' }
  }

  const status = parseJson((await run(bin, ['status', '--json'])).stdout)
  if (!status || status.BackendState !== 'Running' || !status.Self?.DNSName) {
    return { state: 'not-running', hint: 'Tailscale läuft nicht oder ist nicht angemeldet – Tailscale am PC öffnen und verbinden.' }
  }
  const host = status.Self.DNSName.replace(/\.$/, '')
  const url = `https://${host}`
  const owner = status.User?.[String(status.Self.UserID)]?.LoginName || null

  const before = parseJson((await run(bin, ['serve', 'status', '--json'])).stdout)
  if (servesBridge(before, host, port)) return { state: 'ready', url, owner }

  // Publishes the bridge inside the tailnet; persists across reboots (--bg).
  const result = await run(bin, ['serve', '--bg', '--https=443', `http://127.0.0.1:${port}`], 20000)
  const output = `${result.stdout}\n${result.stderr}`
  const after = parseJson((await run(bin, ['serve', 'status', '--json'])).stdout)
  if (servesBridge(after, host, port)) return { state: 'ready', url, owner }

  // Tailscale prints a link when HTTPS/Serve still has to be switched on for the tailnet.
  const link = output.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0]
  if (link || /not enabled|enable https|https.*disabled/i.test(output)) {
    return {
      state: 'https-disabled',
      url,
      owner,
      link: link || 'https://login.tailscale.com/admin/dns',
      hint: 'In Tailscale sind HTTPS-Zertifikate noch aus: in der Tailscale-Verwaltung unter DNS „MagicDNS“ und „HTTPS Certificates“ einschalten – die Brücke prüft danach von selbst erneut.'
    }
  }
  return {
    state: 'error',
    url,
    owner,
    hint: `„tailscale serve“ hat nicht geklappt${result.timedOut ? ' (keine Antwort)' : ''}: ${output.trim().split('\n').slice(-2).join(' ').slice(0, 300) || 'keine Meldung'}`
  }
}
