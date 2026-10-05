import { useEffect, useRef, useState } from 'react'

// "How many?" for scry X, mill X, draw X — with quick picks for the usual numbers.
export default function NumberPrompt({ prompt, onClose }) {
  const [value, setValue] = useState(prompt?.initial ?? 2)
  const inputRef = useRef(null)
  useEffect(() => { setValue(prompt?.initial ?? 2); setTimeout(() => inputRef.current?.select(), 0) }, [prompt])
  if (!prompt) return null
  const max = Math.max(1, prompt.max ?? 99)
  const count = Math.min(max, Math.max(1, Math.floor(Number(value) || 0)))
  const confirm = (n = count) => { prompt.onConfirm(n); onClose() }

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center p-4" style={{ background: 'rgba(8,8,10,0.7)' }} onClick={onClose}>
      <form
        className="w-full max-w-xs p-4 space-y-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); confirm() }}
      >
        <h3 className="font-bold text-fg">{prompt.title}</h3>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 7].filter(n => n <= max).map(n => (
            <button key={n} type="button" onClick={() => confirm(n)} className="btn-secondary flex-1 min-h-[40px] text-sm tabular-nums">{n}</button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 text-fg rounded-xl p-2.5 text-sm min-h-[44px] tabular-nums"
            aria-label="Anzahl"
          />
          <button type="submit" className="btn-primary px-4 min-h-[44px] text-sm">{prompt.confirmLabel || 'OK'}</button>
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Höchstens {max}.</p>
      </form>
    </div>
  )
}
