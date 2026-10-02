// Public, unauthenticated page — required by Google's OAuth consent screen to publish the
// app to "In Produktion" (lets anyone with a Google account log in, not just explicitly
// added test users). Describes what this app actually does with data, honestly and in plain
// language — this is a small hobby project, not a reviewed legal document.
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1>Datenschutzerklärung</h1>
      <p className="text-cmd-muted text-sm mb-8">Stand: {new Date().toLocaleDateString('de-DE')}</p>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Über dieses Projekt</h2>
        <p className="text-fg-2 leading-relaxed">
          MTG Commander Deck Builder ist ein privates, nicht-kommerzielles Hobby-Projekt zur Verwaltung
          einer Magic: The Gathering-Sammlung und zum Bauen von Commander-Decks. Es gibt keine Werbung,
          keinen Verkauf von Daten an Dritte und keine kommerzielle Nutzung der Daten.
        </p>
      </div>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Verantwortlicher</h2>
        <p className="text-fg-2 leading-relaxed">
          Diese App wird von einer Privatperson betrieben. Bei Fragen zum Datenschutz oder zur Löschung
          deiner Daten erreichst du den Betreiber unter:{' '}
          <a href="mailto:DEINE-KONTAKT-EMAIL@example.com" style={{ color: 'var(--u)' }} className="underline">
            DEINE-KONTAKT-EMAIL@example.com
          </a>
        </p>
      </div>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Welche Daten werden erhoben</h2>
        <ul className="text-fg-2 leading-relaxed list-disc pl-5 space-y-2">
          <li>
            <strong>Beim Google-Login:</strong> E-Mail-Adresse und Name deines Google-Kontos, um dich
            anzumelden und deine Daten geräteübergreifend zuzuordnen. Es werden keine weiteren
            Google-Berechtigungen (z.B. Google Drive, Kontakte) angefragt.
          </li>
          <li>
            <strong>Sammlungsdaten, die du selbst hochlädst:</strong> Kartennamen, Mengen, Kaufpreise und
            weitere Angaben aus deinem ManaBox-CSV-Export (und optional CSV-Exporten anderer Personen,
            die du als separate "Freundes-Sammlung" hochlädst).
          </li>
          <li>
            <strong>Von dir erstellte Inhalte:</strong> gebaute/entworfene Decks, Chat-Nachrichten an den
            KI-Assistenten, Strategie-Notizen und KI-Analyseergebnisse zu deinen Decks.
          </li>
          <li>
            <strong>Ein Session-Cookie</strong> (<code>mtg_session</code>), technisch notwendig für den
            Login, gültig für 30 Tage, nur vom Server lesbar (HttpOnly).
          </li>
        </ul>
      </div>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Wie und wo werden die Daten gespeichert</h2>
        <p className="text-fg-2 leading-relaxed">
          Deine Daten werden bei Netlify (Hosting-Anbieter dieser App, "Netlify Blobs") gespeichert,
          verknüpft mit deiner Google-E-Mail-Adresse — das ermöglicht den Zugriff von mehreren Geräten aus.
          Zusätzlich hält dein Browser eine lokale Kopie (localStorage) für schnellen Zugriff.
        </p>
      </div>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Weitergabe an Dritte</h2>
        <p className="text-fg-2 leading-relaxed mb-2">
          Für die Kernfunktionen der App werden Daten an folgende externe Dienste übermittelt — in der
          Regel Kartennamen und Decklisten, keine personenbezogenen Daten außer dem, was du selbst in den
          Chat eingibst:
        </p>
        <ul className="text-fg-2 leading-relaxed list-disc pl-5 space-y-2">
          <li><strong>Scryfall</strong> — Kartenbilder, Preise und Metadaten.</li>
          <li><strong>EDHREC</strong> — Community-Daten zu Commandern und Decks.</li>
          <li>
            <strong>Google Gemini (KI)</strong> — für Deckbau-Vorschläge, Analysen und den Chat-Assistenten
            werden Decklisten, Chat-Nachrichten und ähnliche Eingaben an Googles Gemini-API gesendet.
          </li>
          <li><strong>Google (Login)</strong> — zur Authentifizierung über Google OAuth.</li>
        </ul>
      </div>

      <div className="card mb-6 space-y-3">
        <h2 className="text-lg font-bold">Speicherdauer und Löschung</h2>
        <p className="text-fg-2 leading-relaxed">
          Deine Daten bleiben gespeichert, bis du ihre Löschung beantragst. Es gibt aktuell keine
          automatische Selbstbedienungs-Löschfunktion — schreib einfach eine E-Mail an die oben genannte
          Adresse, dann werden deine Daten gelöscht.
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-bold">Deine Rechte</h2>
        <p className="text-fg-2 leading-relaxed">
          Du kannst jederzeit Auskunft über die zu dir gespeicherten Daten verlangen, ihre Berichtigung
          oder Löschung verlangen, oder der Verarbeitung widersprechen — formlos per E-Mail an die oben
          genannte Adresse.
        </p>
      </div>
    </div>
  )
}
