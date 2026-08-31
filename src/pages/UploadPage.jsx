import { useState } from 'react'

export default function UploadPage() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) {
      setMessage('Bitte wähle eine CSV Datei')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/.netlify/functions/upload-collection', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })

      if (response.ok) {
        setMessage('✅ Sammlung erfolgreich hochgeladen!')
        setFile(null)
      } else {
        setMessage('❌ Fehler beim Upload')
      }
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1>📥 Sammlung Hochladen</h1>

      <div className="card mb-8">
        <h2 className="text-xl font-bold mb-4">ManaBox CSV exportieren</h2>
        <ol className="text-gray-300 space-y-2 mb-4">
          <li>1. Gehe zu <a href="https://www.manabox.app" target="_blank" rel="noopener" className="text-mtg-blue hover:underline">manabox.app</a></li>
          <li>2. Klicke "Export" → "CSV"</li>
          <li>3. Lade die Datei hier hoch</li>
        </ol>
      </div>

      <form onSubmit={handleUpload} className="card">
        <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center mb-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csv-input"
          />
          <label htmlFor="csv-input" className="cursor-pointer">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-gray-300">
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

        {message && (
          <p className="mt-4 text-center text-sm">{message}</p>
        )}
      </form>
    </div>
  )
}
