import { useEffect } from 'react'
import { useAiMode } from '../hooks/useAiMode'
import { checkBridge, setClaudeFeatureEnabled, setPreferredMode, setClaudeModel, CLAUDE_MODELS } from '../lib/aiMode'

function StatusRow({ ok, label, detail }) {
  return (
    <div className="flex items-start gap-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <span className="text-lg leading-none">{ok === null ? '⏳' : ok ? '✅' : '❌'}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        {detail && <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{detail}</div>}
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

// Setup + live status for the Claude-Modus (see src/lib/aiMode.js). Switching the feature on
// here is per device — it is what allows the site to look for the local bridge at all.
export default function ClaudeModePage() {
  const { enabled, preferred, model, bridge, claudeActive } = useAiMode()

  useEffect(() => {
    if (enabled) checkBridge()
  }, [enabled])

  const bridgeDetail = !bridge.checked
    ? 'Noch nicht geprüft'
    : bridge.reachable
      ? `Läuft auf diesem Computer (Modell: ${bridge.model || '?'})`
      : 'Nicht gefunden — im Projektordner "npm run claude-bridge" starten (Schritt 2). Fragt Chrome nach dem Zugriff auf lokale Geräte: zulassen.'

  return (
    <div className="max-w-3xl mx-auto">
      <h1>🧠 Claude-Modus</h1>
      <p className="mb-8 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Auf diesem Computer beantwortet <strong>Claude</strong> statt Gemini die KI-Anfragen dieser Seite:
        Deck-Analyse, Chat-Deckbau, Analyse und Commander-Ideen. Claude prüft dabei Kartentexte live auf
        Scryfall und vergleicht mit EDHREC. Es zählt gegen dein Claude-Abo, hat kein 30-Sekunden-Limit und
        braucht je nach Modell bis zu einigen Minuten pro Antwort. Auf anderen Geräten und für andere Nutzer bleibt alles bei Gemini.
      </p>

      <div className="card mb-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-lg font-bold">Status auf diesem Gerät</h2>
          {enabled && (
            <button onClick={checkBridge} className="btn-secondary text-xs px-3 py-1.5" disabled={bridge.checking}>
              {bridge.checking ? 'Prüfe …' : 'Erneut prüfen'}
            </button>
          )}
        </div>

        <StatusRow ok={enabled} label="Claude-Modus auf diesem Gerät freigeschaltet" />
        {enabled && (
          <>
            <StatusRow ok={bridge.checked ? bridge.reachable : null} label="Claude-Brücke erreichbar" detail={bridgeDetail} />
            {bridge.reachable && (
              <StatusRow
                ok={bridge.ready ? true : bridge.error === 'Selbsttest läuft noch …' ? null : false}
                label="Claude angemeldet"
                detail={bridge.ready ? 'Selbsttest erfolgreich' : bridge.error || 'Siehe Schritt 1'}
              />
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
              className="btn-primary text-sm px-5 py-2"
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
                      className="text-sm px-4 py-2 font-medium"
                      style={{
                        background: preferred === mode ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: preferred === mode ? '#fff' : 'var(--color-text)'
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setClaudeFeatureEnabled(false)} className="btn-secondary text-sm px-4 py-2">
                Auf diesem Gerät ausschalten
              </button>
            </>
          )}
        </div>
      </div>

      {enabled && (
        <div className="card mb-6">
          <h2 className="text-lg font-bold mb-1">Modell</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Gilt für dieses Gerät und sofort für die nächste Anfrage. Es wird immer die neueste Version des gewählten Modells genutzt.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CLAUDE_MODELS.map(option => {
              const selected = option.id === model
              return (
                <button
                  key={option.id}
                  onClick={() => setClaudeModel(option.id)}
                  className="text-left p-3"
                  style={{
                    background: selected ? 'var(--color-accent-light)' : 'var(--color-surface)',
                    border: `2px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)'
                  }}
                >
                  <div className="font-bold text-sm mb-1">
                    {selected ? '● ' : '○ '}{option.label}{option.id === 'opus' && ' (Standard)'}
                  </div>
                  <div className="text-xs leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{option.description}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="card mb-6 space-y-4">
        <h2 className="text-lg font-bold">Anleitung</h2>
        <ol className="list-decimal pl-5 space-y-3 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <li>
            <strong>Einmalig – Claude anmelden:</strong> Terminal öffnen, <Code>claude</Code> eingeben, dort{' '}
            <Code>/login</Code> ausführen und anmelden. Danach das Terminal schließen.
          </li>
          <li>
            <strong>Jedes Mal – Brücke starten:</strong> Terminal im Projektordner <Code>MTGdeckbuild</Code> öffnen
            und <Code>npm run claude-bridge</Code> ausführen. Warten auf „✅ Claude-Modus bereit“ und das Fenster offen lassen.
          </li>
          <li>
            <strong>Einmalig pro Browser – freischalten:</strong> Auf dieser Seite „Auf diesem Gerät freischalten“ klicken.
            Fragt Chrome, ob die Seite auf Geräte im lokalen Netzwerk zugreifen darf: <strong>Zulassen</strong>.
          </li>
          <li>
            <strong>Umschalten:</strong> Oben in der Leiste zeigt der Schalter die aktive KI –
            ein Klick wechselt zwischen <strong>🧠 Claude</strong> und <strong>✨ Gemini</strong>.
          </li>
          <li>
            <strong>Beenden:</strong> Im Brücken-Fenster <Code>Strg+C</Code> drücken. Die Seite nutzt dann automatisch wieder Gemini.
          </li>
        </ol>
      </div>
    </div>
  )
}
