// "Manuell": by default a turn runs on by itself up to main phase 1 (like MTG Arena); with
// this on, it stops at every step — for upkeep triggers or instants in the draw step.
export default function ManualStepsToggle({ manual, onToggle, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={manual}
      onClick={onToggle}
      className={`flex items-center gap-2 text-xs text-left min-h-[36px] [@media(pointer:coarse)]:min-h-[40px] ${className}`}
      style={{ color: 'var(--color-text-secondary)' }}
      title={manual
        ? 'Hält an jeder Phase an – du klickst jedes Mal „Weiter“'
        : 'Enttappen, Versorgung und Ziehen laufen von selbst, dein Zug hält in Hauptphase 1'}
    >
      <span
        aria-hidden="true"
        className="relative inline-block flex-shrink-0 w-7 h-4 transition-colors"
        style={{ background: manual ? 'var(--gold)' : 'var(--color-border)', borderRadius: 999 }}
      >
        <span
          className="absolute top-0.5 w-3 h-3 transition-transform"
          style={{ left: 2, background: manual ? '#1d1f24' : 'var(--color-surface)', borderRadius: 999, transform: manual ? 'translateX(12px)' : 'none' }}
        />
      </span>
      <span className="leading-tight">
        Manuell
        <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {manual ? 'hält an jeder Phase' : 'automatisch bis Hauptphase 1'}
        </span>
      </span>
    </button>
  )
}
