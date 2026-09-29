import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'

// "Entwürfe" lives as a tab inside "Meine Decks", and "Chat-Aufbau"/"Analysieren" as tabs
// inside "Commander" — keeps the top nav from growing every time a new tool gets added.
const NAV_LINKS = [
  { to: '/upload', label: 'Sammlung' },
  { to: '/collection', label: 'Meine Sammlung' },
  { to: '/decks', label: 'Meine Decks' },
  { to: '/select-commander', label: 'Commander' }
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

export default function Navigation({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const initials = user?.email ? user.email[0].toUpperCase() : '?'

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between gap-4 px-4 md:px-12 py-4 md:py-6"
      style={{ background: 'var(--color-bg)', borderBottom: '3px solid var(--color-accent)' }}
    >
      <Link to="/" className="flex items-center gap-3 flex-1 min-w-0" style={{ color: 'var(--color-text)' }}>
        <LogoIcon size={36} />
        <span className="font-bold text-base tracking-wide hidden sm:inline truncate" style={{ letterSpacing: '0.5px' }}>
          MTG DECK BUILDER
        </span>
      </Link>

      {user && (
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(link => (
            <NavTextLink key={link.to} {...link} />
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3 flex-shrink-0">
        {user && (
          <>
            <div
              className="hidden md:flex w-8 h-8 items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'var(--color-accent-light)', color: 'var(--color-text)', borderRadius: 'var(--radius-sm)' }}
              title={user.email}
            >
              {initials}
            </div>
            <button onClick={onLogout} className="hidden md:inline-flex btn-secondary text-xs px-4 py-2">
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
            className="md:hidden w-11 h-11 flex items-center justify-center"
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
          className="md:hidden absolute top-full left-0 right-0 flex flex-col gap-1 p-3"
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
