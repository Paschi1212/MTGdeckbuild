import { useEffect, useState } from 'react'
import { useAiMode } from '../hooks/useAiMode'
import {
  checkBridge, setClaudeFeatureEnabled, setPreferredMode, setClaudeModel, CLAUDE_MODELS,
  setBridgeTarget, setRemoteBridgeUrl
} from '../lib/aiMode'

// ok: true ✅ · false ❌ · null ⏳ (still checking) · 'info' ○ (optional, nothing wrong)
function StatusRow({ ok, label, detail, children }) {
  const icon = ok === 'info' ? '○' : ok === null ? '⏳' : ok ? '✅' : '❌'
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className="text-lg leading-none w-6 text-center flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        {detail && <div className="text-xs mt-0.5 break-words" style={{ color: 'var(--color-text-muted)' }}>{detail}</div>}
        {children}
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <code
      className="px-1.5 py-0.5 text-xs"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text)' }}
    >
      {children}
    </code>
  )
}

function OptionButton({ selected, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3 min-h-[44px]"
      style={{
        background: selected ? 'var(--color-accent-light)' : 'var(--color-surface)',
        border: `2px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text)'
      }}
    >
      <div className="font-bold text-sm mb-1">{selected ? '● ' : '○ '}{title}</div>
      <div className="text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{children}</div>
    </button>
  )
}

const formatStamp = (iso) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// The PC bridge's Tailscale share, as the bridge reports it on /health.
function tailscaleRow(remote) {
  if (!remote || remote.state === 'checking') return { ok: null, detail: 'Wird geprüft …' }
  if (remote.state === 'ready') return { ok: true, detail: `Freigegeben unter ${remote.url} – auf dem Tablet „Über Tailscale“ wählen.` }
  if (remote.state === 'not-installed' || remote.state === 'off') return { ok: 'info', detail: remote.hint }
  return { ok: false, detail: remote.hint, link: remote.link }
}

// Setup + live status for the Claude-Modus (see src/lib/aiMode.js). Switching the feature on
// here is per device — it is what allows the site to look for the bridge at all.
export default function ClaudeModePage() {
  const { enabled, preferred, model, bridge, claudeActive, target, remoteBridge } = useAiMode()
  const [manualUrl, setManualUrl] = useState('')

  useEffect(() => {
    if (enabled) checkBridge()
  }, [enabled])

  const remote = target === 'remote'
  const bridgeDetail = !bridge.checked
    ? 'Noch nicht geprüft'
    : bridge.reachable
      ? remote
        ? `Dein PC antwortet über Tailscale (Modell: ${bridge.model || '?'})`
        : `Läuft auf diesem Computer (Modell: ${bridge.model || '?'})`
      : remote
        ? bridge.error || 'Nicht erreichbar – Tailscale auf diesem Gerät eingeschaltet? Ist der PC wach und läuft dort die Claude-Brücke?'
        : 'Nicht gefunden — Claude-Brücke auf diesem PC starten (Doppelklick auf „Claude-Bridge-starten“). Fragt der Browser nach dem Zugriff auf lokale Geräte: zulassen.'
  const tailscale = tailscaleRow(bridge.remote)

  const saveManualUrl = (event) => {
    event.preventDefault()
    if (!/^https:\/\/\S+$/.test(manualUrl.trim())) return
    setRemoteBridgeUrl(manualUrl)
    setManualUrl('')
    checkBridge()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1>🧠 Claude-Modus</h1>
      <p className="mb-8 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Hier beantwortet <strong>Claude</strong> statt Gemini die KI-Anfragen dieser Seite:
        Deck-Analyse, Chat-Deckbau, Analyse und Commander-Ideen. Claude läuft dabei auf deinem PC (Claude-Brücke),
        prüft Kartentexte live auf Scryfall und vergleicht mit EDHREC. Es zählt gegen dein Claude-Abo, hat kein
        30-Sekunden-Limit und braucht je nach Modell bis zu einigen Minuten pro Antwort. Tablet und Handy erreichen
        die Brücke über Tailscale. Für andere Nutzer bleibt alles bei Gemini.
      </p>

      <div className="card mb-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-lg font-bold">Status auf diesem Gerät</h2>
          {enabled && (
            <button onClick={checkBridge} className="btn-secondary text-xs px-3 py-1.5 min-h-[36px]" disabled={bridge.checking}>
              {bridge.checking ? 'Prüfe …' : 'Erneut prüfen'}
            </button>
          )}
        </div>

        <StatusRow ok={enabled} label="Claude-Modus auf diesem Gerät freigeschaltet" />
        {enabled && (
          <>
            <StatusRow
              ok={bridge.checked ? bridge.reachable : null}
              label={remote ? 'Dein PC erreichbar (über Tailscale)' : 'Claude-Brücke erreichbar'}
              detail={bridgeDetail}
            />
            {bridge.reachable && (
              <StatusRow
                ok={bridge.ready ? true : bridge.error === 'Selbsttest läuft noch …' ? null : false}
                label="Claude angemeldet"
                detail={bridge.ready ? 'Selbsttest erfolgreich' : bridge.error || 'Am PC: Terminal öffnen, „claude“ starten, „/login“ eingeben – dann die Brücke neu starten.'}
              />
            )}
            {!remote && bridge.reachable && (
              <StatusRow ok={tailscale.ok} label="Tablet & Handy (Tailscale)" detail={tailscale.detail}>
                {tailscale.link && (
                  <a href={tailscale.link} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: 'var(--color-text)' }}>
                    Tailscale-Verwaltung öffnen
                  </a>
                )}
              </StatusRow>
            )}
            <StatusRow
              ok={claudeActive}
              label={claudeActive ? `Aktive KI: 🧠 Claude ${CLAUDE_MODELS.find(m => m.id === model)?.label || ''}` : 'Aktive KI: ✨ Gemini'}
              detail={!claudeActive && bridge.ready ? 'Unten oder oben in der Leiste auf Claude umschalten.' : null}
            />
          </>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          {!enabled ? (
            <button
              onClick={() => { setClaudeFeatureEnabled(true); setPreferredMode('claude') }}
              className="btn-primary text-sm px-5 py-2 min-h-[44px]"
            >
              Auf diesem Gerät freischalten
            </button>
          ) : (
            <>
              {bridge.ready && (
                <div className="flex" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  {[['claude', '🧠 Claude'], ['gemini', '✨ Gemini']].map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setPreferredMode(mode)}
                      className="text-sm px-4 py-2 font-medium min-h-[44px]"
                      style={{
                        background: preferred === mode ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: preferred === mode ? 'var(--color-bg)' : 'var(--color-text)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setClaudeFeatureEnabled(false)} className="btn-secondary text-sm px-4 py-2 min-h-[44px]">
                Auf diesem Gerät ausschalten
              </button>
            </>
          )}
        </div>
      </div>

      {enabled && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-1">Verbindung</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Wo läuft die Claude-Brücke für dieses Gerät? Gilt nur für dieses Gerät.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionButton selected={!remote} onClick={() => setBridgeTarget('local')} title="💻 Dieser PC">
              Die Brücke läuft auf diesem Computer.
            </OptionButton>
            <OptionButton selected={remote} onClick={() => setBridgeTarget('remote')} title="📱 Über Tailscale">
              Tablet, Handy oder ein anderer Rechner: verbindet sich mit der Brücke auf deinem PC.
            </OptionButton>
          </div>

          {remote && (
            <div className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {remoteBridge ? (
                <p>
                  Adresse deines PCs: <span className="break-all" style={{ color: 'var(--color-text)' }}>{remoteBridge.url}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> · gemeldet am {formatStamp(remoteBridge.updatedAt)}</span>
                </p>
              ) : (
                <p>
                  Noch keine Adresse bekannt. Starte die Claude-Brücke am PC (mit laufendem Tailscale) und öffne diese
                  Seite dort einmal – die Adresse kommt dann automatisch hierher.
                </p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs" style={{ color: 'var(--color-text-muted)' }}>Adresse von Hand eintragen</summary>
                <form onSubmit={saveManualUrl} className="flex flex-wrap gap-2 mt-2">
                  <input
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://dein-pc.tail1234.ts.net"
                    className="flex-1 min-w-[220px] text-fg rounded-xl p-2.5 text-sm"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  <button type="submit" className="btn-secondary text-sm px-4 min-h-[44px]" disabled={!/^https:\/\/\S+$/.test(manualUrl.trim())}>
                    Übernehmen
                  </button>
                </form>
              </details>
            </div>
          )}
        </div>
      )}

      {enabled && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-1">Modell</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Gilt für dieses Gerät und sofort für die nächste Anfrage. Es wird immer die neueste Version des gewählten Modells genutzt.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CLAUDE_MODELS.map(option => (
              <OptionButton
                key={option.id}
                selected={option.id === model}
                onClick={() => setClaudeModel(option.id)}
                title={`${option.label}${option.id === 'opus' ? ' (Standard)' : ''}`}
              >
                {option.description}
              </OptionButton>
            ))}
          </div>
        </div>
      )}

      <div className="card mb-6 space-y-4">
        <h2 className="text-lg font-bold">Anleitung – am PC</h2>
        <ol className="list-decimal pl-5 space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <li>
            <strong>Einmalig – Claude anmelden:</strong> Terminal öffnen, <Code>claude</Code> eingeben, dort{' '}
            <Code>/login</Code> ausführen und anmelden. Danach das Terminal schließen.
          </li>
          <li>
            <strong>Jedes Mal – Brücke starten:</strong> Doppelklick auf <strong>Claude-Bridge-starten</strong> (Desktop).
            Warten auf „✅ Claude-Modus bereit“ und das Fenster offen lassen (minimieren geht).
          </li>
          <li>
            <strong>Einmalig pro Browser – freischalten:</strong> Auf dieser Seite „Auf diesem Gerät freischalten“ klicken.
            Fragt der Browser, ob die Seite auf Geräte im lokalen Netzwerk zugreifen darf: <strong>Zulassen</strong>.
          </li>
          <li>
            <strong>Umschalten:</strong> Oben in der Leiste zeigt der Schalter die aktive KI –
            ein Klick wechselt zwischen <strong>🧠 Claude</strong> und <strong>✨ Gemini</strong>.
          </li>
          <li>
            <strong>Beenden:</strong> Brücken-Fenster schließen. Die Seite nutzt dann automatisch wieder Gemini.
          </li>
        </ol>
      </div>

      <div className="card mb-6 space-y-4">
        <h2 className="text-lg font-bold">Anleitung – Tablet & Handy</h2>
        <ol className="list-decimal pl-5 space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <li>
            <strong>Einmalig – Tailscale:</strong> Tailscale auf PC und Tablet installieren und auf beiden mit demselben
            Konto anmelden. In der Tailscale-Verwaltung unter <strong>DNS</strong> „MagicDNS“ und „HTTPS Certificates“ einschalten.
          </li>
          <li>
            <strong>Einmalig – Adresse übernehmen:</strong> Brücke am PC starten und diese Seite am PC einmal öffnen –
            die Zeile „Tablet & Handy (Tailscale)“ muss ✅ zeigen.
          </li>
          <li>
            <strong>Einmalig am Tablet:</strong> diese Seite öffnen, „Auf diesem Gerät freischalten“, dann unter
            Verbindung <strong>„📱 Über Tailscale“</strong> wählen.
          </li>
          <li>
            <strong>Jedes Mal:</strong> PC wach, Brücke läuft, Tailscale am Tablet an – dann die Seite wie gewohnt nutzen.
            Analysen laufen auf dem PC weiter, auch wenn du das Tablet zwischendurch sperrst.
          </li>
          <li>
            <strong>PC aus oder Brücke zu?</strong> Oben steht „PC nicht erreichbar“, und Gemini antwortet, bis der PC wieder da ist.
          </li>
        </ol>
      </div>
    </div>
  )
}
