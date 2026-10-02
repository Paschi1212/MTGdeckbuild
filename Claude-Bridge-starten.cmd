@echo off
rem Startet den Claude-Modus fuer die MTG-Deckbuilder-Website (siehe /claude-modus).
rem Fenster offen lassen, solange Claude antworten soll. Beenden: Fenster schliessen oder Strg+C.
title Claude-Bridge - MTG Deck Builder
cd /d "%~dp0"
where npm >nul 2>nul || (echo FEHLER: npm wurde nicht gefunden - ist Node.js installiert? & echo FEHLER: npm nicht gefunden > claude-bridge.log & pause & exit /b 1)
call npm run claude-bridge
echo.
echo Die Bruecke wurde beendet. Details stehen in claude-bridge.log im Projektordner.
pause
