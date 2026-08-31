# MTG Deck Builder - Detailliertes Setup

## 1. Prerequisites

- Node.js 18+
- npm oder yarn
- Git
- Netlify CLI (für lokale Entwicklung)

## 2. Lokale Entwicklung Setup

### Step 1: Repository klonen

```bash
cd /path/to/projects
git clone https://github.com/Paschi1212/MTGdeckbuild.git
cd MTGdeckbuild
```

### Step 2: Dependencies installieren

```bash
npm install
# oder
yarn install
```

### Step 3: Environment Setup

```bash
cp .env.example .env
```

Dann `.env` mit echten Werten füllen:

```env
# Claude API
CLAUDE_API_KEY=sk-ant-v0-xxxxxxxxxxxx

# Google OAuth (später)
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=xxxxx

# API URLs (Auto in netlify.toml)
VITE_API_URL=http://localhost:9000
```

### Step 4: Entwicklungsserver starten

```bash
npm run dev:all
```

Das startet:
- Frontend auf http://localhost:3000 (Vite)
- Backend auf http://localhost:9000 (Netlify Functions)

## 3. API Keys Abrufen

### Claude API Key

1. Gehe zu https://console.anthropic.com
2. Melde dich an
3. Navigiere zu API Keys
4. Erstelle neuen Key
5. Kopiere in `.env` als `CLAUDE_API_KEY`

### Google OAuth (Optional)

1. Gehe zu https://console.cloud.google.com
2. Erstelle neues Project
3. Aktiviere "Google+ API"
4. Erstelle OAuth 2.0 Credentials (Web Application)
5. Authorized Redirect URIs:
   - `http://localhost:3000/callback`
   - `https://yourdomain.netlify.app/callback`
6. Kopiere Client ID & Secret in `.env`

## 4. Struktur verstehen

### Frontend Ordner

```
src/
├── pages/
│   ├── HomePage.jsx          — Landing page
│   ├── UploadPage.jsx         — CSV Upload
│   ├── CommanderSelectPage.jsx — Commander Wählen
│   ├── StrategyPage.jsx       — Strategie Definieren
│   ├── AnalyzePage.jsx        — Deck Analysieren
│   └── EditDeckPage.jsx       — Deck Editor
├── components/
│   └── Navigation.jsx         — Top Bar
├── App.jsx                    — Main App + Router
└── index.css                  — Tailwind + Global Styles
```

### Backend Ordner

```
netlify/functions/
├── lib/
│   ├── edhrec-api.js      — EDHREC Datenzugriff
│   ├── scryfall-api.js    — Scryfall Preise
│   └── claude-api.js      — Claude Integration
├── auth-check.js          — Session Check
├── google-auth.js         — OAuth Flow (TODO)
├── upload-collection.js   — CSV Upload (TODO)
├── get-commander-data.js  — EDHREC Endpoint
├── get-card-price.js      — Scryfall Endpoint
├── analyze-deck.js        — Claude Analyze
└── suggest-commanders.js  — Claude Suggestions
```

## 5. Workflow für Development

### Frontend Component hinzufügen

```javascript
// src/pages/NewPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function NewPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  return (
    <div className="max-w-2xl mx-auto">
      <h1>My Page Title</h1>
      {/* Content */}
    </div>
  )
}
```

Dann in `App.jsx` Route hinzufügen:
```javascript
<Route path="/my-page" element={<NewPage />} />
```

### Netlify Function hinzufügen

```javascript
// netlify/functions/my-function.js

exports.handler = async (event) => {
  try {
    const { data } = JSON.parse(event.body || '{}')

    // Deine Logik hier

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}
```

Frontend call:
```javascript
const response = await fetch('/.netlify/functions/my-function', {
  method: 'POST',
  body: JSON.stringify({ data: 'value' })
})
```

## 6. Testing

### Frontend testen

```bash
npm run dev
# Öffne http://localhost:3000
# Teste manuell oder schreibe Tests
```

### API testen

```bash
# Mit curl
curl -X POST http://localhost:9000/suggest-commanders \
  -H "Content-Type: application/json" \
  -d '{"colors":["U","R"],"playStyle":"Combo"}'

# Oder nutze Thunder Client / Postman
```

## 7. Deployment vorbereiten

### Git Setup

```bash
git init
git add .
git commit -m "Initial commit: MTG Deck Builder v0.1"
git branch -M main
git remote add origin https://github.com/USERNAME/MTGdeckbuild.git
git push -u origin main
```

### Netlify verbinden

```bash
# Login
netlify login

# Projekt verknüpfen
netlify link
# oder
netlify init
```

### Environment Secrets setzen

```bash
netlify env:set CLAUDE_API_KEY sk-ant-v0-xxxx
netlify env:set VITE_GOOGLE_CLIENT_ID xxxxx
netlify env:set VITE_GOOGLE_CLIENT_SECRET xxxxx
```

## 8. Deploy

### Preview Deploy (kostenlos)

```bash
netlify deploy --prod
```

### Automatisches Deploy (aus GitHub)

1. Gehe zu Netlify Dashboard
2. Site → Source Control → Connect to Git
3. Wähle Repository
4. Deploy Einstellungen:
   - Build Command: `npm run build`
   - Publish Folder: `dist`
   - Functions: `netlify/functions`
5. Speichern → Auto-Deploy beim Push

## 9. Troubleshooting

### "Cannot find module" Fehler

```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install
```

### Vite Port bereits in use

```bash
# Anderen Port nutzen
npm run dev -- --port 3001
```

### Netlify Functions funktionieren lokal nicht

```bash
# Stelle sicher netlify CLI installiert ist
npm install -g netlify-cli

# Versuche functions direkt zu starten
netlify functions:serve

# Checke netlify.toml
cat netlify.toml
```

### Claude API Fehler

- Check API Key in `.env`
- Check Rate Limits (3 requests/min für free tier)
- Check Claude API Status: https://status.anthropic.com

### EDHREC Daten funktioniert nicht

- Checke ob EDHREC online ist: https://edhrec.com
- Probiere Commander-Namen anders zu schreiben (z.B. "Magus Lucea Kane")
- Schau in Browser DevTools Network Tab

## 10. Nächste Schritte

Nachdem alles funktioniert:

1. **Google Drive Integration**
   - OAuth Flow implementieren
   - CSV Speicherung in Drive
   - Feedback Logging

2. **Mehr Features**
   - Deck History
   - Multiple Decks Management
   - Deck Export (Cockatrice format)
   - Mobile Responsive UI

3. **Community**
   - Share Decks Link
   - Community Feedback
   - Best Decks Showcase

4. **Performance**
   - Caching Strategy
   - Image Optimization
   - Bundle Size Reduction
