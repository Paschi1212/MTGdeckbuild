import { TURN_STEPS } from '../../lib/table/game'

// The steps of the current turn as a row; the current one stands out. The active player can
// jump to a step by clicking it (e.g. straight to combat); everyone else just sees where the turn is.
export default function PhaseBar({ step, canControl, onJump }) {
  const current = TURN_STEPS.findIndex(s => s.key === step)
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Phasen des Zugs">
      {TURN_STEPS.map((s, index) => {
        const isCurrent = index === current
        const done = index < current
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={canControl && !isCurrent ? () => onJump(s.key) : undefined}
              disabled={!canControl}
              aria-current={isCurrent ? 'step' : undefined}
              className="px-2 min-h-[30px] text-xs whitespace-nowrap"
              style={{
                background: isCurrent ? 'var(--gold)' : 'transparent',
                color: isCurrent ? '#1d1f24' : done ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                fontWeight: isCurrent ? 700 : 500,
                border: `1px solid ${isCurrent ? 'var(--gold)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: canControl && !isCurrent ? 'pointer' : 'default'
              }}
              title={canControl && !isCurrent ? `Zu „${s.label}“ springen` : s.label}
            >
              {s.label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
