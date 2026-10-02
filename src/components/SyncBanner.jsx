import { useEffect, useState } from 'react'
import { subscribeSync, getSyncState, reloadFromCloud, keepLocalVersion } from '../lib/cloudSync'

const deviceText = (device) => (device ? `deinem ${device}` : 'einem anderen Gerät')
const timeText = (iso) => (iso
  ? ` (${new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`
  : '')

// Two devices (PC + tablet): shown when the other one saved something since this page
// loaded (stale) — or when this page's own save was refused because of that (conflict).
// See lib/cloudSync.js.
export default function SyncBanner() {
  const [state, setState] = useState(getSyncState)
  const [busy, setBusy] = useState(false)
  useEffect(() => subscribeSync(() => setState(getSyncState())), [])

  const { stale, conflict } = state
  if (!stale && !conflict) return null

  const reload = () => { setBusy(true); reloadFromCloud() }
  const keepMine = async () => {
    setBusy(true)
    await keepLocalVersion()
    setBusy(false)
  }

  return (
    <div
      role="alert"
      className="mb-6 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: '4px solid var(--color-accent)',
        borderRadius: 'var(--radius-sm)'
      }}
    >
      <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--color-text)' }}>
        {conflict ? (
          <>
            <strong>Deine letzte Änderung hier ist noch nicht gespeichert:</strong> Auf {deviceText(conflict.device)} wurde
            inzwischen etwas geändert{timeText(conflict.updatedAt)}. Welcher Stand soll gelten?
          </>
        ) : (
          <>
            Auf {deviceText(stale.device)} wurde etwas geändert{timeText(stale.updatedAt)}. Lade neu, bevor du hier weiterarbeitest.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <button onClick={reload} disabled={busy} className="btn-primary text-sm px-4 min-h-[44px]">
          {conflict ? `Stand von ${conflict.device || 'dort'} laden` : 'Neu laden'}
        </button>
        {conflict && (
          <button
            onClick={keepMine}
            disabled={busy}
            className="btn-secondary text-sm px-4 min-h-[44px]"
            title={`Speichert den Stand dieses Geräts – die Änderung auf ${deviceText(conflict.device)} geht dabei verloren.`}
          >
            Meinen Stand behalten
          </button>
        )}
      </div>
    </div>
  )
}
