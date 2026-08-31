import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function EditDeckPage() {
  const navigate = useNavigate()

  const [cards, setCards] = useState([
    { name: 'Sol Ring', count: 1, price: 25.50, category: 'Mana Rocks' },
    { name: 'Lightning Bolt', count: 2, price: 5.00, category: 'Spells' }
  ])

  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('price')
  const [deckTotal, setDeckTotal] = useState(0)
  const [showAddCard, setShowAddCard] = useState(false)
  const [newCard, setNewCard] = useState({ name: '', count: 1, price: 0 })

  useEffect(() => {
    calculateTotal()
  }, [cards])

  const calculateTotal = () => {
    const total = cards.reduce((sum, card) => sum + (card.count * card.price), 0)
    setDeckTotal(total)
  }

  const handleRemoveCard = (index) => {
    setCards(cards.filter((_, i) => i !== index))
  }

  const handleUpdateCard = (index, field, value) => {
    const updated = [...cards]
    updated[index] = { ...updated[index], [field]: value }
    setCards(updated)
  }

  const handleAddCard = () => {
    if (newCard.name && newCard.count > 0) {
      setCards([...cards, newCard])
      setNewCard({ name: '', count: 1, price: 0 })
      setShowAddCard(false)
    }
  }

  const categories = [...new Set(cards.map(c => c.category))]
  const cardsByCategory = {}
  categories.forEach(cat => {
    cardsByCategory[cat] = cards.filter(c => c.category === cat)
  })

  const filteredCards = filter === 'all'
    ? cards
    : cardsByCategory[filter] || []

  const sortedCards = [...filteredCards].sort((a, b) => {
    if (sortBy === 'price') return (b.price * b.count) - (a.price * a.count)
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    return 0
  })

  return (
    <div className="max-w-4xl mx-auto">
      <h1>✏️ Deck Editieren</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <div className="text-sm text-gray-400">Gesamt Karten</div>
          <div className="text-3xl font-bold text-mtg-gold">
            {cards.reduce((sum, c) => sum + c.count, 0)}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-gray-400">Deck-Kosten</div>
          <div className="text-3xl font-bold text-mtg-green">
            €{deckTotal.toFixed(2)}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-gray-400">Durchschnitt pro Karte</div>
          <div className="text-3xl font-bold text-mtg-blue">
            €{cards.length > 0 ? (deckTotal / cards.length).toFixed(2) : '0.00'}
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">Kategorie</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg p-2 border border-gray-700"
            >
              <option value="all">Alle Kategorien</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">Sortieren</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg p-2 border border-gray-700"
            >
              <option value="price">Nach Preis (Höchste zuerst)</option>
              <option value="name">Nach Name</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setShowAddCard(!showAddCard)}
          className="btn-success w-full"
        >
          {showAddCard ? '✕ Abbrechen' : '+ Karte hinzufügen'}
        </button>

        {showAddCard && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Kartennamen"
                value={newCard.name}
                onChange={(e) => setNewCard({...newCard, name: e.target.value})}
                className="w-full bg-gray-700 text-white rounded-lg p-2 border border-gray-600"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="1"
                  value={newCard.count}
                  onChange={(e) => setNewCard({...newCard, count: parseInt(e.target.value)})}
                  className="bg-gray-700 text-white rounded-lg p-2 border border-gray-600"
                  placeholder="Anzahl"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newCard.price}
                  onChange={(e) => setNewCard({...newCard, price: parseFloat(e.target.value)})}
                  className="bg-gray-700 text-white rounded-lg p-2 border border-gray-600"
                  placeholder="Preis (€)"
                />
              </div>
              <button
                onClick={handleAddCard}
                className="btn-primary w-full"
              >
                ✓ Hinzufügen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">Kartenliste</h2>

        {sortedCards.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Keine Karten in dieser Kategorie</p>
        ) : (
          <div className="space-y-2">
            {sortedCards.map((card, index) => (
              <div
                key={index}
                className="bg-gray-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="font-semibold text-white">{card.name}</div>
                  <div className="text-sm text-gray-400">{card.category}</div>
                </div>

                <div className="flex items-center gap-3 mr-4">
                  <input
                    type="number"
                    min="1"
                    value={card.count}
                    onChange={(e) => handleUpdateCard(index, 'count', parseInt(e.target.value))}
                    className="w-16 bg-gray-700 text-white text-center rounded p-1 border border-gray-600"
                  />
                  <span className="text-gray-300">€{(card.count * card.price).toFixed(2)}</span>
                </div>

                <button
                  onClick={() => handleRemoveCard(index)}
                  className="text-red-400 hover:text-red-300 text-lg"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/analyze')}
          className="btn-secondary flex-1"
        >
          ← Zurück
        </button>
        <button
          onClick={() => {
            alert('✅ Deck gespeichert!')
            navigate('/select-commander')
          }}
          className="btn-primary flex-1"
        >
          ✓ Speichern & Fertig
        </button>
      </div>
    </div>
  )
}
