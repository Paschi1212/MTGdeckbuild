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
5. **Beide Farbschemata.** Nur Tokens verwenden (`var(--color-…)`), keine festen Farben wie
   `text-white` – die sind im hellen Modus unsichtbar.

## Tokens (src/index.css)

| Rolle | Token | Herkunft |
|---|---|---|
| Hintergrund / Fläche / Linie | `--color-bg`, `--color-surface`, `--color-border` | neutral, hell + dunkel |
| Text / sekundär / leise | `--color-text`, `--color-text-secondary`, `--color-text-muted` | neutral |
| Akzent (Primärbutton, aktiver Reiter) | `--color-accent` | invertiert je Schema |
| Bedeutung: vorhanden/hinzufügen, Zukauf/streichen, Freunde | `--g`, `--r`, `--u` | MTG-Farben |
| Manasymbole | `--pip-w/u/b/r/g/c`, `--pip-ink` | Tönung der gedruckten Manasymbole |
| Höhe der Seitennavigation | `--nav-h` | für Sticky-Elemente darunter |

Radien in zwei Stufen: `--radius-sm` (2 px, Bedienelemente), `--radius-md` (4 px, Flächen).
Zahlen in Tabellen und Leisten mit `tabular-nums`.

## Signaturelement

**Manakosten als Pips** (`src/components/ManaCost.jsx`): jede Karte zeigt ihre Kosten wie gedruckt –
ein Kreis pro Symbol in der Tönung des echten Manasymbols, X- und Hybridkosten inklusive. Einziges
farbiges Element in Listen; alles andere bleibt ruhig.

## Muster: Editor (src/pages/EditDeckPage.jsx)

- **Deck-Leiste** (sticky unter der Navigation): Commander, Karten x/99 (grün = 99, gold = zu wenig,
  rot = zu viel), Wert, Zukauf, alle Aktionen.
- **Desktop:** links die Deckliste in fließenden Spalten (`columns`), rechts eine Seitenleiste mit
  Reitern *Vorschläge* (Streichen/Ergänzen mit einem Klick), *Einkauf*, *Statistik*.
- **Handy:** dieselben Reiter, „Deck“ zuerst; Aktionen in einer festen Leiste unten.
- Bedienelemente einer Zeile (−, +, ✕) erscheinen bei Hover/Fokus, auf Touch-Geräten immer.

## Bewegung

Nur zur Orientierung, nie als Deko: Hover-Vorschau, Einblenden der Zeilen-Bedienelemente. Keine
Einflug-Animationen, keine Hover-Lifts in Listen.
