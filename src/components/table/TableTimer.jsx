import { useEffect, useRef, useState } from 'react'

const TURN_CHOICES = [1, 2, 3, 5]
const GAME_CHOICES = [45, 60, 90, 120]

const clock = (seconds) => {
  const abs = Math.abs(Math.round(seconds))
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = String(abs % 60).padStart(2, '0')
  return `${seconds < 0 ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${s}`
}

// Optional clock for the table, the same for everyone: time per turn (restarts with every
// turn) or for the whole game (from "Spiel starten"). Only a reminder — when time is up it
// turns red and counts the overtime; what happens then, the table decides.
export default function TableTimer({ timer, turnStartedAt, gameStartedAt, canSet, onSet }) {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    if (!timer) return undefined
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [timer])
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const since = timer?.mode === 'turn' ? turnStartedAt : gameStartedAt
  const left = timer ? (since ? timer.minutes * 60 - (Date.now() - since) / 1000 : timer.minutes * 60) : null
  const over = left !== null && left < 0
  const short = left !== null && !over && left <= (timer.mode === 'turn' ? 30 : 300)
  const choose = (mode, minutes) => { onSet(mode, minutes); setOpen(false) }

  const option = (mode, minutes) => {
    const on = timer?.mode === mode && timer.minutes === minutes
    return (
      <button
        key={`${mode}${minutes}`}
        type="button"
        onClick={() => choose(mode, minutes)}
        aria-pressed={on}
        className="flex-1 min-h-[36px] [@media(pointer:coarse)]:min-h-[40px] text-xs font-semibold tabular-nums"
        style={{
          background: on ? 'var(--color-accent)' : 'var(--color-surface)',
          color: on ? 'var(--color-bg)' : 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        {minutes}
      </button>
    )
  }

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={canSet ? () => setOpen(v => !v) : undefined}
        disabled={!canSet && !timer}
        className={timer ? 'px-3 min-h-[44px] text-sm font-bold tabular-nums whitespace-nowrap' : 'btn-secondary text-sm px-3 min-h-[44px] whitespace-nowrap'}
        style={timer ? {
          background: over ? 'rgba(220,80,70,0.12)' : 'var(--color-surface)',
          color: over ? 'var(--r)' : short ? 'var(--gold)' : 'var(--color-text)',
          border: `1px solid ${over ? 'var(--r)' : short ? 'var(--gold)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: canSet ? 'pointer' : 'default'
        } : undefined}
        title={timer
          ? `${timer.minutes} Min. ${timer.mode === 'turn' ? 'pro Zug' : 'für die Partie'}${canSet ? ' – ändern' : ''}`
          : 'Optional: Zeit pro Zug oder für die ganze Partie'}
        aria-expanded={open}
      >
        {timer
          ? <>⏱ {over ? `Zeit um ${clock(left)}` : clock(left)}<span className="font-normal text-xs ml-1" style={{ color: 'var(--color-text-muted)' }}>{timer.mode === 'turn' ? 'Zug' : 'Partie'}</span></>
          : '⏱ Timer'}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-40 w-64 p-3 space-y-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
        >
          <div>
            <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Minuten pro Zug</div>
            <div className="flex gap-1.5">{TURN_CHOICES.map(m => option('turn', m))}</div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Minuten für die Partie</div>
            <div className="flex gap-1.5">{GAME_CHOICES.map(m => option('game', m))}</div>
          </div>
          <p className="text-[11px] leading-snug" style={{ color: 'var(--color-text-muted)' }}>
            Gilt für alle am Tisch. Ist die Zeit um, wird der Timer rot – was dann passiert, entscheidet ihr.
          </p>
          {timer && <button type="button" onClick={() => choose(null)} className="btn-secondary text-xs px-3 min-h-[36px] w-full">Timer aus</button>}
        </div>
      )}
    </span>
  )
}
