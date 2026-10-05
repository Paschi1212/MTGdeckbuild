import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAiMode } from '../hooks/useAiMode'
import { setPreferredMode, CLAUDE_MODELS } from '../lib/aiMode'
import CommanderSearchInput from './CommanderSearchInput'

// "Entwürfe" lives as a tab inside "Meine Decks", and "Chat-Aufbau"/"Analysieren" as tabs
// inside "Commander" — keeps the top nav from growing every time a new tool gets added.
const NAV_LINKS = [
  { to: '/upload', label: 'Sammlung' },
  { to: '/collection', label: 'Meine Sammlung' },
  { to: '/decks', label: 'Meine Decks' },
  { to: '/select-commander', label: 'Deck bauen' },
  { to: '/spieltisch', label: 'Spieltisch' }
]

function LogoIcon({ size = 44 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d="M 60 15 L 85 30 L 85 60 C 85 80 60 105 60 105 C 60 105 35 80 35 60 L 35 30 Z" fill="currentColor" />
      <g transform="translate(60, 55)">
        <polygon points="0,-20 -12,-20 -8,0 -12,20 0,20" fill="var(--color-bg)" />
        <polygon points="0,-20 12,-20 8,0 12,20 0,20" fill="var(--color-bg)" />
      </g>
    </svg>
  )
}

function NavTextLink({ to, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `nav-link text-sm font-medium ${isActive ? 'nav-link-active' : ''}`}
      style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.3px' }}
    >
      {label}
    </NavLink>
  )
}

// Which AI answers right now — only on devices where the Claude-Modus was switched on
// (/claude-modus). Click flips Claude ⇄ Gemini; without a running bridge it opens the setup page.
function AiModeSwitch() {
  const navigate = useNavigate()
  const { enabled, preferred, model, bridge, claudeActive, target } = useAiMode()
  if (!enabled) return null
  const modelLabel = CLAUDE_MODELS.find(m => m.id === model)?.label || 'Claude'
  const where = target === 'remote' ? 'deinem PC über Tailscale' : 'der lokalen Brücke'
  // Claude chosen but the PC can't be reached: say so instead of silently showing Gemini.
  const fallbackNote = preferred === 'claude' && bridge.checked && !bridge.ready
    ? (bridge.reachable ? 'Claude nicht bereit' : 'PC nicht erreichbar')
    : null

  const handleClick = () => {
    if (!bridge.ready) navigate('/claude-modus')
    else setPreferredMode(claudeActive ? 'gemini' : 'claude')
  }
  const title = claudeActive
    ? `Claude ${modelLabel} beantwortet die KI-Anfragen (über ${where}). Klick: zu Gemini wechseln. Modell ändern: Seite /claude-modus.`
    : bridge.ready
      ? 'Gemini aktiv. Klick: zu Claude wechseln.'
      : `Gemini aktiv — ${fallbackNote || 'Claude-Brücke nicht bereit'}. Klick: Status & Anleitung.`

  return (
    <button
      onClick={handleClick}
      title={title}
      className="h-11 md:h-12 px-3 flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"
      style={{
        background: claudeActive ? 'var(--color-accent)' : 'var(--color-surface)',
        color: claudeActive ? 'var(--color-bg)' : 'var(--color-text)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)'
      }}
    >
      {claudeActive ? `🧠 ${modelLabel}` : '✨ Gemini'}
      {fallbackNote && <span className="hidden sm:inline font-normal text-xs" style={{ color: 'var(--color-text-muted)' }}>· {fallbackNote}</span>}
      {!bridge.ready && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-text-muted)' }} />}
    </button>
  )
}

export default function Navigation({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const initials = user?.email ? user.email[0].toUpperCase() : '?'

  // Same handoff CommanderSelectPage's own "pick a commander" flow uses — jumps straight to
  // the strategy questionnaire for that commander from ANY page, not just from inside the
  // "Commander finden" hub.
  const handleGlobalCommanderPick = (commander) => {
    if (!commander?.trim()) return
    sessionStorage.setItem('selectedCommander', commander)
    setSearchOpen(false)
    setSearchValue('')
    navigate('/strategy', { state: { commander } })
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 md:px-12 py-4 md:py-6"
      style={{ background: 'var(--color-bg)', borderBottom: '3px solid var(--color-accent)' }}
    >
      <Link to="/" className="flex items-center gap-3 flex-1 min-w-0" style={{ color: 'var(--color-text)' }}>
        <LogoIcon size={36} />
        {/* Between 1024 and 1280px the five links need the room — the logo alone says it then. */}
        <span className="font-bold text-base tracking-wide hidden sm:inline lg:hidden xl:inline truncate" style={{ letterSpacing: '0.5px' }}>
          MTG DECK BUILDER
        </span>
      </Link>

      {/* Full link row from 1024px (iPad landscape, desktop); below that — iPad portrait,
          phones — the menu button, so the row never wraps over the logo. */}
      {user && (
        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map(link => (
            <NavTextLink key={link.to} {...link} />
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3 flex-shrink-0">
        {user && (
          <>
            <AiModeSwitch />

            <div
              className="relative"
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false) }}
            >
              <button
                onClick={() => setSearchOpen(open => !open)}
                className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center text-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)' }}
                aria-label="Commander suchen"
                title="Commander suchen"
              >
                🔍
              </button>

              {searchOpen && (
                <div
                  className="absolute right-0 mt-2 p-3 rounded-xl"
                  style={{ width: 320, maxWidth: '90vw', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 48px -16px rgba(0,0,0,0.5)' }}
                >
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Commander suchen und direkt damit starten
                  </p>
                  <CommanderSearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    onSubmit={handleGlobalCommanderPick}
                    placeholder="z.B. Atraxa, Praetors' Voice"
                    className="w-full text-fg rounded-xl p-2.5 text-sm"
                  />
                </div>
              )}
            </div>

            <div
              className="hidden lg:flex w-8 h-8 items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}
              title={user.email}
            >
              {initials}
            </div>
            <button onClick={onLogout} className="hidden lg:inline-flex btn-secondary text-xs px-4 py-2">
              Logout
            </button>
          </>
        )}

        <button
          onClick={toggle}
          className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center text-lg"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)' }}
          aria-label="Farbschema wechseln"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {user && (
          <button
            onClick={() => setMobileOpen(open => !open)}
            className="lg:hidden w-11 h-11 flex items-center justify-center"
            style={{ color: 'var(--color-text)' }}
            aria-label="Menü öffnen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        )}
      </div>

      {user && mobileOpen && (
        <div
          className="lg:hidden absolute top-full left-0 right-0 flex flex-col gap-1 p-3"
          style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}
        >
          {NAV_LINKS.map(link => (
            <NavTextLink key={link.to} {...link} onClick={() => setMobileOpen(false)} />
          ))}
          <div className="flex items-center justify-between px-1 py-2 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{user.email}</span>
            <button onClick={onLogout} className="btn-secondary text-xs px-4 py-1.5">
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
