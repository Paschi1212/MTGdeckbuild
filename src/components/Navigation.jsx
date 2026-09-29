import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

// "Entwürfe" lives as a tab inside "Meine Decks", and "Chat-Aufbau"/"Analysieren" as tabs
// inside "Commander" — keeps the top nav from growing every time a new tool gets added.
const NAV_LINKS = [
  { to: '/upload', label: 'Sammlung' },
  { to: '/collection', label: 'Meine Sammlung' },
  { to: '/decks', label: 'Meine Decks' },
  { to: '/select-commander', label: 'Commander' }
]

function NavPillLink({ to, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `px-3 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
          isActive ? 'text-white' : 'text-cmd-muted hover:text-white'
        }`
      }
      style={({ isActive }) =>
        isActive
          ? { backgroundImage: 'linear-gradient(135deg, var(--u), var(--b))' }
          : undefined
      }
    >
      {label}
    </NavLink>
  )
}

export default function Navigation({ user, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const initials = user?.email ? user.email[0].toUpperCase() : '?'

  return (
    <header className="fixed top-4 md:top-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
      <div
        className="flex items-center justify-between gap-2 rounded-full px-3 py-2 backdrop-blur-xl"
        style={{ backgroundColor: 'var(--surface-solid)', border: '1px solid var(--border)' }}
      >
        <Link to="/" className="flex items-center gap-2 pl-2 pr-1 shrink-0">
          <span className="text-lg">🎴</span>
          <span className="font-display font-extrabold text-sm hidden lg:inline">MTG Deckbuilder</span>
        </Link>

        {user && (
          <>
            <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
              {NAV_LINKS.map(link => (
                <NavPillLink key={link.to} {...link} />
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-2 shrink-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#0e0b1a]"
                style={{ backgroundImage: 'linear-gradient(135deg, var(--g), var(--u))' }}
                title={user.email}
              >
                {initials}
              </div>
              <button onClick={onLogout} className="btn-secondary text-xs px-4 py-2">
                Logout
              </button>
            </div>

            <button
              onClick={() => setMobileOpen(open => !open)}
              className="md:hidden p-2 rounded-full text-cmd-muted hover:text-white"
              aria-label="Menü öffnen"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </>
        )}
      </div>

      {user && mobileOpen && (
        <div
          className="md:hidden mt-2 rounded-2xl p-3 backdrop-blur-xl flex flex-col gap-1"
          style={{ backgroundColor: 'var(--surface-solid)', border: '1px solid var(--border)' }}
        >
          {NAV_LINKS.map(link => (
            <NavPillLink key={link.to} {...link} onClick={() => setMobileOpen(false)} />
          ))}
          <div className="flex items-center justify-between px-4 py-2 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs text-cmd-muted truncate">{user.email}</span>
            <button onClick={onLogout} className="btn-secondary text-xs px-4 py-1.5">
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
