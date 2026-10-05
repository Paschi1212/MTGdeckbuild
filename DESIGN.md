# Design – MTG Commander Deck Builder

Verbindliche Gestaltungsregeln für neue und überarbeitete Seiten. Ziel: ein ruhiges Werkzeug für
Commander-Spieler – die Karten und ihre Daten sind der Inhalt, die Oberfläche tritt zurück.

## Grundsätze

1. **Die Hauptaufgabe zuerst.** Eine Seite öffnet mit dem, wofür man sie aufruft (im Editor: die
   Deckliste), nicht mit Statistik-Kacheln. Kennzahlen gehören in eine kompakte Leiste, Details in
   Reiter oder eine Seitenleiste.
2. **Wie eine Deckliste auf Papier.** Dichte Textzeilen statt Karten-Kacheln: Anzahl · Name ·
   Manakosten · Preis. Das Kartenbild gibt es auf Wunsch (Hover-Vorschau, Klick zum Vergrößern).
3. **Echte Begriffe.** Deutsche Kartentypen wie auf deutschen Karten (Kreaturen, Spontanzauber,
   Hexereien, Artefakte, Verzauberungen, Länder), Buttons sagen, was passiert („Hinzufügen“,
   „Entfernen“, „Speichern & analysieren“).
4. **Aktionen immer erreichbar.** Speichern & Co. stehen in einer mitlaufenden Leiste (Desktop oben,
   Handy unten), nie am Ende einer langen Seite.
5. **Beide Farbschemata.** Nur Tokens verwenden. Schrift: Tailwind-Klassen `text-fg`,
   `text-fg-2`, `text-fg-muted` (bzw. `var(--color-text…)`), **nie** `text-white` / `text-gray-*` –
   die bleiben im hellen Modus hell (weiß auf weiß). Ausnahme: Text auf fest dunklem Overlay
   (Kartenzoom-Pfeile, Live Tester) oder auf farbiger Fläche (`--g`-Button). Auf `--color-accent`
   gehört `var(--color-bg)` als Schriftfarbe, nicht Weiß – der Akzent ist im dunklen Modus hell.
6. **Kontrast prüfen.** Text mindestens 4,5:1, große Schrift/Icons mindestens 3:1 – in beiden
   Schemata. Gedämpfte Töne (`--color-text-muted`, `--gold`, `--u`, `--r`) sind darauf abgestimmt.

## Tokens (src/index.css)

| Rolle | Token | Herkunft |
|---|---|---|
| Hintergrund / Fläche / Linie | `--color-bg`, `--color-surface`, `--color-border` | neutral, hell + dunkel |
| Text / sekundär / leise | `--color-text`, `--color-text-secondary`, `--color-text-muted` | neutral |
| Akzent (Primärbutton, aktiver Reiter) | `--color-accent` | invertiert je Schema |
| Bedeutung: vorhanden/hinzufügen, Zukauf/streichen, Freunde | `--g`, `--r`, `--u` | MTG-Farben, im dunklen Modus aufgehellt |
| Gold (Hinweis „zu wenig“, Akzent-Überschriften) | `--gold` (Tailwind `mtg-gold`) | MTG-Gold, im hellen Modus abgedunkelt |
| Manasymbole | `--pip-w/u/b/r/g/c`, `--pip-ink` | Tönung der gedruckten Manasymbole |
| Höhe der Seitennavigation | `--nav-h` | für Sticky-Elemente darunter |

Radien in zwei Stufen: `--radius-sm` (2 px, Bedienelemente), `--radius-md` (4 px, Flächen).
Zahlen in Tabellen und Leisten mit `tabular-nums`.

## Signaturelement

**Manakosten als Pips** (`src/components/ManaCost.jsx`): jede Karte zeigt ihre Kosten wie gedruckt –
ein Kreis pro Symbol in der Tönung des echten Manasymbols, X- und Hybridkosten inklusive. Einziges
farbiges Element in Listen; alles andere bleibt ruhig.

## Muster: Editor (src/pages/EditDeckPage.jsx)

- **Deck-Leiste** (sticky unter der Navigation): Commander, Karten x/99 (grün = 99, gold `--gold` = zu wenig,
  rot = zu viel), Wert, Zukauf, alle Aktionen.
- **Desktop:** links die Deckliste in fließenden Spalten (`columns`), rechts eine Seitenleiste mit
  Reitern *Vorschläge* (Streichen/Ergänzen mit einem Klick), *Einkauf*, *Statistik*.
- **Handy:** dieselben Reiter, „Deck“ zuerst; Aktionen in einer festen Leiste unten.
- Bedienelemente einer Zeile (−, +, ✕) erscheinen bei Hover/Fokus über dem Zeilenende (sie nehmen dem
  Namen keinen Platz weg), auf Touch-Geräten stehen sie fest in der Zeile.
- **Kartennamen werden nie abgeschnitten** – sie brechen um.
- **Speicherstatus sichtbar** in der Deck-Leiste („Nicht gespeichert“ in Gold / „Gespeichert hh:mm“
  in Grün); Speichern lässt den Editor offen. ManaBox-Decks werden nie überschrieben – sie werden
  „Als Entwurf gespeichert“ (Kopie „Name (bearbeitet)“).
- **Ablageort 📍**: Bei Karten aus der eigenen Sammlung steht der ManaBox-Ordner mit freien Exemplaren
  (Analyse „Aus deiner Sammlung“, Vorschläge, Tabelle, Excel-Export) – verbaute Deck-Exemplare zählen nicht.
- **Exportieren ▾** am Ende der Werkzeugleiste: CSV für ManaBox (Komma, ManaBox-Spaltennamen), CSV
  für Excel (Semikolon, Dezimalkomma, BOM), Deckliste .txt.
- **Drei Ansichten** (Umschalter in der Werkzeugleiste, pro Gerät gemerkt): *Liste* (dichte
  Deckliste, Standard), *Bilder* (Kartenbilder mit Namen und Preis darunter, Streichkandidaten rot
  umrandet), *Tabelle* (Anzahl, Name, vollständiger Kartentyp, Kosten, Preis, Status).

## Tablet & Handy

- **Navigation:** volle Linkzeile erst ab 1024 px (`lg:` – iPad quer, Desktop); darunter (iPad hoch,
  Handy) das Menü-Symbol. Die Zeile darf nie umbrechen oder das Logo überdecken.
- **Touch-Ziele mindestens 40 px:** kleine Bedienelemente (−, +, ✕, Listeneinträge) bekommen mit
  `[@media(pointer:coarse)]:…` Fingergröße; mit Maus bleiben sie kompakt.
- **KI-Schalter** sagt, warum Gemini antwortet, wenn Claude gewählt ist („· PC nicht erreichbar“,
  „· Claude nicht bereit“) – ab `sm:` als Text, darunter nur der graue Punkt.
- **Lange Claude-Läufe** zeigen, wo sie laufen und wie lange schon („Läuft auf deinem PC · 1:42“) und
  dass man das Gerät sperren darf. Nach einem Neuladen öffnet die Seite den Reiter, in dem der
  Auftrag lief, und holt das Ergebnis ab.
- **Zwei Geräte:** Hat ein anderes Gerät gespeichert, erscheint oben ein Hinweis (`SyncBanner`) mit
  Akzent-Kante links: „Neu laden“ bzw. bei einem Konflikt die Wahl „Stand von … laden“ / „Meinen Stand
  behalten“. Nie still überschreiben.

## Muster: Spieltisch (src/pages/TablePage.jsx, TableRoomPage.jsx)

- **Küchentisch, keine Regel-Engine:** Jeder darf jede Zahl ändern; der **Spielverlauf** rechts (Handy:
  unten) macht sichtbar, wer was getan hat. Schnelles Tippen auf dieselbe Zahl wird zu einer Zeile
  zusammengefasst („Leben −6 → 34“).
- **Spielertafel:** oben ein **dunkler Streifen mit dem Art-Crop des Commanders** (immer dunkel, damit die
  weiße Schrift in beiden Schemata trägt), darunter Leben groß in der Mitte (±1, ±5), Zähler nur wenn > 0
  („+ Zähler“ fügt hinzu), Commander-Schaden je gegnerischem Commander (zieht auch Leben ab), Steuer in
  2er-Schritten. Wer am Zug ist, bekommt den goldenen Rahmen (`--gold`); Tödliches (0 Leben, 10 Gift,
  21 Commander-Schaden) wird rot markiert, ausscheiden entscheidet der Tisch.
- **Eigene Tafel zuerst**, danach die anderen in Sitzreihenfolge; die Zug-Leiste („Am Zug: …“ / „Zug
  beenden“) bleibt unter der Navigation stehen.

## Bewegung

Nur zur Orientierung, nie als Deko: Hover-Vorschau, Einblenden der Zeilen-Bedienelemente. Keine
Einflug-Animationen, keine Hover-Lifts in Listen.
