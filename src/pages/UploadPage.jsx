import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseCollectionCsv, saveCollection, loadCollection } from '../lib/collection'

export default function UploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    setSummary(loadCollection())
  }, [])

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Bitte wähle eine CSV Datei')
      return
    }

    setUploading(true)
    setError('')
    try {
      const parsed = await parseCollectionCsv(file)
      saveCollection(parsed)
      setSummary(parsed)
      setFile(null)
    } catch (err) {
      setError('❌ ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1>📥 Sammlung Hochladen</h1>

      <div className="card mb-8">
        <h2 className="text-xl font-bold mb-4">ManaBox CSV exportieren</h2>
        <ol className="text-cmd-muted space-y-2 mb-4">
          <li>1. Gehe zu <a href="https://www.manabox.app" target="_blank" rel="noopener" style={{ color: 'var(--u)' }} className="hover:underline">manabox.app</a></li>
          <li>2. Klicke "Export" → "CSV"</li>
          <li>3. Lade die Datei hier hoch</li>
        </ol>
      </div>

      <form onSubmit={handleUpload} className="card mb-8">
        <div className="rounded-2xl p-8 text-center mb-4" style={{ border: '2px dashed var(--border)' }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-input"
          />
          <label htmlFor="csv-input" className="cursor-pointer">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-cmd-muted">
              {file ? file.name : 'Klicke zum Dateiauswahl oder ziehe CSV hierher'}
            </p>
          </label>
        </div>

        <button
          type="submit"
          disabled={!file || uploading}
          className="btn-primary w-full"
        >
          {uploading ? 'Lädt...' : 'Hochladen'}
        </button>

        {error && (
          <p className="mt-4 text-center text-sm" style={{ color: 'var(--r)' }}>{error}</p>
        )}
      </form>

      {summary && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--g)' }}>✅ Sammlung geladen</h2>
          <p className="text-xs text-cmd-muted mb-4">
            Zuletzt aktualisiert: {new Date(summary.uploadedAt).toLocaleString('de-DE')}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-cmd-muted">Gesamt Karten</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--u)' }}>{summary.totalCards}</div>
            </div>
            <div>
              <div className="text-xs text-cmd-muted">Gesamtwert</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--g)' }}>€{summary.totalValue.toFixed(2)}</div>
            </div>
          </div>

          {summary.decks.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-cmd-muted mb-2">Erkannte Decks ({summary.decks.length})</div>
              <div className="flex flex-col gap-1">
                {summary.decks.map(deck => (
                  <button
                    key={deck.name}
                    onClick={() => navigate('/collection', { state: { deckName: deck.name } })}
                    className="flex justify-between text-sm rounded-lg px-3 py-2 text-left hover:brightness-125 transition"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                  >
                    <span>{deck.name}</span>
                    <span className="text-cmd-muted">{deck.cardCount} Karten</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-cmd-muted">
            {summary.unsortedCount} Karten unsortiert (nicht in einem Deck)
          </div>
        </div>
      )}
    </div>
  )
}
