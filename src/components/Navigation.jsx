import { Link } from 'react-router-dom'

export default function Navigation({ user, onLogout }) {
  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-mtg-gold">
          🎴 MTG Deck Builder
        </Link>

        <div className="flex gap-4 items-center">
          {user && (
            <>
              <Link to="/upload" className="text-gray-300 hover:text-white transition">
                Sammlung
              </Link>
              <Link to="/select-commander" className="text-gray-300 hover:text-white transition">
                Commander
              </Link>
              <Link to="/analyze" className="text-gray-300 hover:text-white transition">
                Analysieren
              </Link>

              <div className="text-sm text-gray-400">
                {user.email}
              </div>

              <button
                onClick={onLogout}
                className="btn-secondary text-sm"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
