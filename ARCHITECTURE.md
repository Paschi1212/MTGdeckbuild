# MTG Deck Builder - Architektur

## Überblick

```
┌─────────────────┐
│   React + Vite  │ (Frontend)
│   Tailwind CSS  │
└────────┬────────┘
         │
    ┌────▼─────┐
    │  Netlify │
    │ Functions│ (Backend)
    └────┬─────┘
         │
    ┌────┴────┬────────┬────────┐
    │          │        │        │
┌───▼──┐  ┌───▼──┐ ┌───▼──┐ ┌──▼──┐
│Claude│  │EDHREC│ │Scryfall│ │Google│
│ API  │  │JSON  │ │  API  │ │Drive │
└──────┘  └──────┘ └───────┘ └──────┘
```

## Komponenten

### Frontend (React)

**Pages:**
- `HomePage` — Login & Intro
- `UploadPage` — CSV Upload
- `CommanderSelectPage` — Commander Auswählen (3-Phasen Flow)
- `StrategyPage` — Strategie Definieren
- `AnalyzePage` — Deck-Analyse (Claude AI)
- `EditDeckPage` — Deck Editor & Preis-Tracking

**Navigation:**
- `Navigation` — Top Bar mit User-Info

### Backend (Netlify Functions)

**API Endpoints:**

```
POST /.netlify/functions/google-auth
  → Google OAuth Redirect

POST /.netlify/functions/upload-collection
  → Speichert ManaBox CSV in Google Drive

GET /.netlify/functions/get-commander-data?commander=Name
  → Lädt EDHREC-Daten für Commander

GET /.netlify/functions/get-card-price?card=Name
  → Lädt Kartenprice von Scryfall

POST /.netlify/functions/analyze-deck
  → Claude API Deck-Analyse

POST /.netlify/functions/suggest-commanders
  → Claude API Commander-Vorschläge
```

**Libraries (in `netlify/functions/lib/`):**

1. **edhrec-api.js**
   - `getCommanderData(name)` — Lädt Commander-Daten
   - `extractRecommendations(data)` — Strukturiert Card-Daten
   - `commanderToSlug(name)` — Konvertiert Name zu URL-Format
   - Caching mit Map (In-Memory, können zu Google Drive migiert werden)

2. **scryfall-api.js**
   - `getCardPrice(name)` — Einzelne Karte
   - `getBulkPrices(names)` — Mehrere Karten
   - `getBudgetAlternatives(card, maxPrice)` — Billige Alternativen
   - Caching 24 Stunden

3. **claude-api.js**
   - `analyzeDeck(analysis)` — Deck-Analyse mit KI
   - `suggestCommanders(preferences)` — Commander-Empfehlungen
   - Nutzt Anthropic API mit gemindertem Prompt-Engineering

## Datenfluss

### 1. Commander Selection Flow

```
User wählt Farben/Spielstil
       ↓
[Claude API] Empfiehlt Commander
       ↓
User speichert Commander
       ↓
sessionStorage.setItem('selectedCommander', name)
```

### 2. Strategy Definition Flow

```
User definiert:
  - Win Condition
  - Key Mechanics
  - Play Style
  - Budget
  - Combos
       ↓
sessionStorage.setItem('strategy', JSON.stringify(strategy))
```

### 3. Deck Analysis Flow

```
User klickt "Analyze"
       ↓
[1] Fetch EDHREC Data
       ↓
[2] Fetch User Collection (später: Google Drive)
       ↓
[3] Call Claude API with:
    - Commander
    - Strategy
    - EDHREC Meta
    - User Feedback History
       ↓
[4] Claude returns:
    - Cards to Add
    - Cards to Cut
    - Budget Alternatives
    - Evaluation
```

### 4. Deck Editing Flow

```
User editiert Kartenliste
       ↓
[1] Fetch Prices von Scryfall
       ↓
[2] Calculate Deck Total & Breakdowns
       ↓
[3] Save to Google Drive
```

## Technologie-Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind CSS, React Router |
| Backend | Netlify Functions (Node.js), Express-like routing |
| APIs | Claude 3.5 Sonnet, EDHREC JSON, Scryfall REST |
| Storage | Google Drive API (später implementiert) |
| Auth | Google OAuth 2.0 |

## Externe APIs

### EDHREC (json.edhrec.com)

**Endpoints:**
- `/api/commanders/{slug}` — Commander-Daten
- `/api/cards/{slug}` — Card-Synergien
- `/api/commanders` — Alle Commander (Meta-Liste)

**Response Format:**
```json
{
  "name": "Commander Name",
  "salt": 0.65,
  "deckCount": 12345,
  "creatures": [...],
  "instants": [...],
  "synergies": [...]
}
```

### Scryfall (api.scryfall.com)

**Endpoints:**
- `/cards/named?exact=Card%20Name` — Einzelne Karte
- `/cards/search?q=...` — Kartensuche

**Response:**
```json
{
  "name": "Lightning Bolt",
  "prices": {
    "usd": "25.50",
    "eur": "22.30"
  },
  "image_uris": {...}
}
```

### Claude API (Anthropic)

**Model:** `claude-3-5-sonnet-20241022`

**Prompt Structure:**
1. Role: Expert Commander Deckbuilder
2. Context: Commander, Strategy, EDHREC Data, User Feedback
3. Task: Analyze Deck or Suggest Commanders
4. Format: Structured Recommendations

## Feedback Loop

```
User gibt Feedback zu Recommendations
       ↓
Speichern in feedback.json (Google Drive)
       ↓
Bei nächster Analyse in Claude-Prompt einfügen
       ↓
Claude nutzt Feedback für bessere Recommendations
```

**Feedback Format:**
```json
{
  "date": "2026-08-30",
  "recommendation": "Craterhoof Behemoth",
  "action": "accepted/rejected/tried_and_didnt_work",
  "reason": "Too expensive / doesn't synergize / good pick",
  "commander": "X-Spells"
}
```

## Zukunfts-Features

- [ ] Google Drive OAuth & CSV Auto-Sync
- [ ] Feedback Logging & Pattern Recognition
- [ ] Multi-Deck Management
- [ ] Deck History & Version Control
- [ ] Community Suggestions (Anonymisiert)
- [ ] Mobile App
- [ ] Deck Export (Cockatrice, Archidekt, etc.)

## Deployment

```bash
# Build
npm run build

# Netlify Deploy
netlify deploy

# Environment Variables
CLAUDE_API_KEY=sk-...
VITE_GOOGLE_CLIENT_ID=...
VITE_GOOGLE_CLIENT_SECRET=...
```

## Performance-Tipps

1. **EDHREC Caching** — 7 Tage in Google Drive
2. **Scryfall Caching** — 24 Stunden in-memory
3. **Claude Requests** — Batch wenn möglich, cache Ergebnisse
4. **Image Lazy Loading** — Nutze Scryfall Image Proxies
5. **Bundle Size** — Preact statt React (später möglich)
