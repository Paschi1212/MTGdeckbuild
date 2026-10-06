import { TURN_STEPS } from '../../lib/table/game'
import { artCrop } from '../../lib/table/decks'
import ManualStepsToggle from './ManualStepsToggle'

const ROW = 40 // px per step — the gold marker slides by exactly this much

// The turn at a glance, along the left edge of the table: whose turn, which round, every step
// of the turn with a gold marker that moves on to the next step. The active player can click a
// step to jump there and has "Weiter" / "Zug abgeben" right below; every player at the table
// chooses at the bottom whether their turns run on by themselves up to main phase 1.
export default function PhaseRail({ setup, round, activeSeat, step, canControl, onJump, advanceLabel, onAdvance, onPass, manual, onToggleManual }) {
  const current = Math.max(0, TURN_STEPS.findIndex(s => s.key === step))
  const art = artCrop(activeSeat?.deck?.commanderImage)

  return (
    <nav
      aria-label="Zugablauf"
      className="flex flex-col overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
    >
      {/* Whose turn: their commander, always dark behind white text */}
      <div className="relative px-3 py-2.5" style={{ background: '#1d1f24', color: '#fff' }}>
        {art && <img src={art} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.35 }} />}
        <div className="relative">
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{setup ? 'Vorbereitung' : `Runde ${round}`}</div>
          <div className="text-sm font-bold leading-tight break-words">{setup ? 'Starthände' : activeSeat?.name || '–'}</div>
        </div>
      </div>

      {setup ? (
        <p className="px-3 py-3 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Die Phasen beginnen, sobald das Spiel gestartet ist.
        </p>
      ) : (
        <ol className="relative py-2">
          {/* The marker that moves on — the "jump" you see when the next step starts */}
          <span
            aria-hidden="true"
            className="absolute left-1.5 right-1.5 phase-rail-marker"
            style={{
              top: 8,
              height: ROW,
              transform: `translateY(${current * ROW}px)`,
              background: 'var(--gold)',
              borderRadius: 'var(--radius-sm)'
            }}
          />
          {TURN_STEPS.map((s, index) => {
            const isCurrent = index === current
            const done = index < current
            return (
              <li key={s.key} className="relative" style={{ height: ROW }}>
                <button
                  type="button"
                  onClick={canControl && !isCurrent ? () => onJump(s.key) : undefined}
                  disabled={!canControl || isCurrent}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="w-full h-full flex items-center gap-2 px-3 text-left text-sm"
                  style={{
                    color: isCurrent ? '#1d1f24' : done ? 'var(--color-text-muted)' : 'var(--color-text)',
                    fontWeight: isCurrent ? 700 : 500,
                    cursor: canControl && !isCurrent ? 'pointer' : 'default'
                  }}
                  title={canControl && !isCurrent ? `Zu „${s.label}“ springen` : s.label}
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: isCurrent ? '#1d1f24' : done ? 'var(--color-text-muted)' : 'transparent', border: `1.5px solid ${isCurrent ? '#1d1f24' : 'var(--color-text-muted)'}` }}
                  />
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {!setup && canControl && (
        <div className="flex flex-col gap-2 p-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button type="button" onClick={onAdvance} className="btn-primary text-sm min-h-[44px] px-2 leading-tight">{advanceLabel}</button>
          {onPass && <button type="button" onClick={onPass} className="btn-secondary text-xs min-h-[36px] px-2">Zug abgeben</button>}
        </div>
      )}

      {onToggleManual && (
        <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--color-border)' }}>
          <ManualStepsToggle manual={manual} onToggle={onToggleManual} className="w-full" />
        </div>
      )}
    </nav>
  )
}
