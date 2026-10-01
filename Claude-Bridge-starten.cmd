@echo off
rem Startet den Claude-Modus fuer die MTG-Deckbuilder-Website (siehe /claude-modus).
rem Fenster offen lassen, solange Claude antworten soll. Beenden: Fenster schliessen oder Strg+C.
title Claude-Bridge - MTG Deck Builder
cd /d "%~dp0"
call npm run claude-bridge
pause
