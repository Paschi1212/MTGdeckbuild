import { useEffect, useState } from 'react'
import { STYLES, TABLE_LOOKS, getStyle, getTableLook, setStyle, setTableLook, subscribeAppearance, preloadStyleFonts } from '../lib/appearance'
import { useTheme } from '../hooks/useTheme'

// What each style looks like, painted with its own colors — the page around it may be in
// another style, so the previews carry their palette themselves.
const SWATCHES = {
  standard: {
    light: { bg: '#ffffff', surface: '#f9f9f7', border: '#e5e5e0', text: '#1a1a1a', muted: '#6e6e6e', accent: '#1a1a1a', onAccent: '#ffffff', gold: '#8a6a1c' },
    dark: { bg: '#0f0f0f', surface: '#1a1a1a', border: '#2a2a2a', text: '#f5f5f5', muted: '#8c8c8c', accent: '#f5f5f5', onAccent: '#0f0f0f', gold: '#cdb27e' },
    font: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    heading: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    radius: 4
  },
  tavern: {
    light: { bg: '#efe4cb', surface: '#f8efda', border: '#ccb487', text: '#2d2015', muted: '#6c573e', accent: '#5b3a1d', onAccent: '#efe4cb', gold: '#85601c' },
    dark: { bg: '#1b130c', surface: '#281c12', border: '#4b3725', text: '#f1e4c7', muted: '#ab946f', accent: '#d8b166', onAccent: '#1b130c', gold: '#d8b166' },
    font: "'Crimson Pro', Georgia, serif",
    heading: "'Cinzel', Georgia, serif",
    radius: 6
  },
  modern: {
    light: { bg: '#f3f5f8', surface: '#ffffff', border: '#e1e5ec', text: '#151a21', muted: '#66707f', accent: '#2a5ccc', onAccent: '#ffffff', gold: '#926400' },
    dark: { bg: '#0e1116', surface: '#161b23', border: '#272e3a', text: '#edf0f5', muted: '#8a94a6', accent: '#7aa2ff', onAccent: '#0e1116', gold: '#e2b95b' },
    font: "'Manrope', 'Segoe UI', sans-serif",
    heading: "'Manrope', 'Segoe UI', sans-serif",
    radius: 14
  }
}

function Choice({ selected, onSelect, label, hint, children }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="text-left p-3 flex flex-col gap-3"
      style={{
        background: 'var(--color-surface)',
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: selected ? 11 : 12
      }}
    >
      {children}
      <span>
        <span className="flex items-center gap-2 font-semibold text-fg">
          {label}
          {selected && <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>· gewählt</span>}
        </span>
        <span className="block text-sm leading-snug mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>
      </span>
    </button>
  )
}

function StylePreview({ id, theme }) {
  const style = SWATCHES[id]
  const c = style[theme === 'dark' ? 'dark' : 'light']
  return (
    <span aria-hidden="true" className="block p-3" style={{ background: c.bg, borderRadius: style.radius, border: `1px solid ${c.border}`, fontFamily: style.font }}>
      <span className="block text-base font-semibold mb-2" style={{ color: c.text, fontFamily: style.heading, letterSpacing: id === 'modern' ? '-0.02em' : id === 'tavern' ? '0.03em' : 0 }}>
        Meine Decks
      </span>
      <span className="block p-2.5 mb-2" style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: style.radius, boxShadow: id === 'tavern' ? `inset 0 0 0 2px ${c.surface}, inset 0 0 0 3px ${c.border}` : id === 'modern' ? '0 2px 8px rgba(20,30,50,0.08)' : 'none' }}>
        <span className="block text-sm" style={{ color: c.text }}>Olivia, Crimson Bride</span>
        <span className="block text-xs" style={{ color: c.muted }}>100 Karten · <span style={{ color: c.gold }}>€312</span></span>
      </span>
      <span className="inline-block text-xs font-semibold px-3 py-1.5" style={{ background: c.accent, color: c.onAccent, borderRadius: Math.min(style.radius, 8) }}>Analysieren</span>
    </span>
  )
}

function TablePreview({ id }) {
  // The real table classes inside a wrapper carrying the look — the same CSS as at the table.
  return (
    <span aria-hidden="true" className="block">
      <span data-table={id === 'standard' ? undefined : id} className="game-table grid grid-cols-2 gap-2" style={id === 'standard' ? { display: 'grid' } : { padding: 8, borderRadius: 10, borderWidth: id === 'felt' ? 6 : undefined }}>
        {['Anna', 'Du'].map(name => (
          <span key={name} className="play-mat block p-2 h-16" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <span className="block text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{name}</span>
            <span className="flex gap-1 mt-1.5">
              {[0, 1, 2].map(i => <span key={i} className="block w-4 h-6" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 2 }} />)}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}

export default function SettingsPage() {
  const [style, setStyleState] = useState(getStyle)
  const [table, setTableState] = useState(getTableLook)
  const { theme, setTheme, followsSystem } = useTheme()

  useEffect(() => {
    preloadStyleFonts()
    return subscribeAppearance(() => { setStyleState(getStyle()); setTableState(getTableLook()) })
  }, [])

  const themeChoice = followsSystem ? 'system' : theme

  return (
    <div className="max-w-4xl mx-auto">
      <h1>Einstellungen</h1>
      <p className="mb-8 -mt-2" style={{ color: 'var(--color-text-secondary)' }}>
        Wie die Seite auf diesem Gerät aussieht. Änderungen gelten sofort; deine Daten bleiben davon unberührt.
      </p>

      <section className="mb-10">
        <h2>Stil</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {STYLES.map(option => (
            <Choice key={option.id} selected={style === option.id} onSelect={() => setStyle(option.id)} label={option.label} hint={option.hint}>
              <StylePreview id={option.id} theme={theme} />
            </Choice>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2>Hell oder dunkel</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Farbschema">
          {[['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Wie das Gerät']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={themeChoice === value}
              className="px-5 min-h-[44px] text-sm font-semibold"
              style={{
                background: themeChoice === value ? 'var(--color-accent)' : 'var(--color-surface)',
                color: themeChoice === value ? 'var(--color-bg)' : 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Jeder Stil hat eine helle und eine dunkle Fassung.</p>
      </section>

      <section className="mb-10">
        <h2>Spieltisch</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {TABLE_LOOKS.map(option => (
            <Choice key={option.id} selected={table === option.id} onSelect={() => setTableLook(option.id)} label={option.label} hint={option.hint}>
              <TablePreview id={option.id} />
            </Choice>
          ))}
        </div>
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Gilt für den Spieltisch und den Live Tester, unabhängig vom Stil.</p>
      </section>
    </div>
  )
}
