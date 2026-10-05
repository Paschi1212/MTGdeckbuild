import { useEffect, useRef } from 'react'

// Context menu for one of your cards (right-click, long-press, or tap on a hand card).
export default function CardMenu({ menu, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return undefined
    const close = (event) => { if (!ref.current?.contains(event.target)) onClose() }
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    // Next tick: the press that opened the menu must not close it again.
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', close)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, onClose])
  if (!menu) return null

  const width = 230
  const left = Math.min(Math.max(8, menu.x - width / 2), window.innerWidth - width - 8)
  const estimatedHeight = 44 * menu.items.length + 48
  const top = menu.y + estimatedHeight > window.innerHeight - 8 ? Math.max(8, menu.y - estimatedHeight) : menu.y + 8

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[130] py-1"
      style={{ left, top, width, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
    >
      <div className="px-3 py-2 text-xs font-semibold truncate" style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>{menu.title}</div>
      {menu.items.map(item => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => { item.onClick(); onClose() }}
          className="w-full text-left px-3 min-h-[40px] text-sm hover:bg-[color:var(--color-accent-light)]"
          style={{ color: item.danger ? 'var(--r)' : 'var(--color-text)' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
