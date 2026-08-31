# MTG Commander Deck Builder

AI-gestützter Helper zum Bauen und Optimieren von Commander-Decks.

## Features

- ✅ **Sammlung Analysieren** — Lade ManaBox CSV und analysiere deine Karten
- ✅ **Commander Wählen** — Finde Commander basierend auf Spielstil und Budget
- ✅ **Decks Optimieren** — Erhalte AI-Vorschläge (Cards to Add/Cut)
- ✅ **EDHREC Integration** — Nutze Meta-Daten von EDHREC
- ✅ **Preis-Tracking** — Sehe Deck-Kosten mit Scryfall-Daten
- ✅ **Google Drive Sync** — Speichere Decks in Google Drive

## Tech Stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Netlify Functions
- **Storage**: Google Drive API
- **AI**: Claude API
- **Data**: EDHREC JSON Endpoints + Scryfall API

## Setup

```bash
# Install dependencies
npm install

# Create .env (siehe .env.example)
cp .env.example .env

# Development
npm run dev:all

# Build
npm run build
```

## Ordnerstruktur

```
├── src/
│   ├── components/    — React Components
│   ├── pages/         — Page Components
│   ├── utils/         — Utilities
│   └── App.jsx
├── netlify/
│   └── functions/     — Netlify Functions (Backend)
└── docs/              — Dokumentation
```

## Nächste Schritte

1. ✅ Projekt-Setup
2. 🔨 EDHREC API Wrapper
3. 🔨 Commander Selection Component
4. 🔨 Deck Analyzer (Claude Integration)
5. 🔨 Google Drive OAuth
6. 🔨 Deployment
