# Einsatzbericht PWA (Firebase MVP)

Techniker-only PWA für digitale Einsatzberichte mit Firebase Auth, Firestore, Storage und Cloud Functions.

## Implementierter Umfang

- Deutsche PWA Oberfläche (online-only) mit Login (`email/password`)
- Kleiner Kunden-Manager (E-Mail, Telefon, Standort)
- Berichts-Workflow mit folgenden Abschnitten:
  - Projekt/Termin
  - Kontakte
  - Schadensbild
  - Anwesende
  - Ergebnis + Weiteres Vorgehen
  - Verfahren/Technik
  - Bilddokumentation (9 Slots)
  - Abrechnung
  - Techniker-Signatur
- 4 Vorlagen (`svt`, `brasa`, `angerhausen`, `aqua-braun`)
- Callable Functions in `europe-west3`:
  - `finalizeReport({ reportId })`
  - `previewPdf({ reportId })`
  - `sendReportEmail({ reportId, clientId })`
- Die PDF-Vorschau wird direkt als PDF-Blob an das Frontend geliefert (robuster als temporäre Storage-Links).
- PDF-Erzeugung mit Checksumme/Versionierung bei Finalisierung
- Firestore + Storage Sicherheitsregeln
- Unit Tests + Firestore-Regeltest (Emulator)

## Projektstruktur

- `app/` React + Vite + PWA Frontend
- `functions/` Firebase Functions + PDF Rendering + Tests
- `firestore.rules`, `storage.rules`, `firebase.json`
- `scripts/provision-user.mjs` Admin-Skript für Techniker-Provisionierung

## Setup

1. Installieren:

```bash
npm install
```

2. Firebase Projekt eintragen:

- `.firebaserc` -> `default` Projekt-ID setzen
- Firebase Web Config in `app/.env` eintragen (`VITE_FIREBASE_*`)

3. Default-Vorlagen in Firestore schreiben:

```bash
npm run seed:templates
```

4. Techniker-Konto provisionieren:

```bash
npm run provision:user -- --email tech@example.com --password 'SECRET' --displayName 'Max Mustermann'
```

## Lokale Entwicklung

- Nur Frontend (gegen Firebase Cloud, empfohlen mit deiner config actual):

```bash
npm run dev
```

- Frontend + Emulatoren:

```bash
npm run dev:local
```

- Hinweis: Für Firestore/Functions Emulator ist Java 11+ erforderlich.

- Nur Tests:

```bash
npm test
```

## Deployment

```bash
npm run build
firebase deploy
```

## Hinweise

- Audio-Upload/-Transkription ist in v1 nicht enthalten.
- Keine externe Synchronisierung (z. B. Aqua-Radar) in v1.
- Für echte EU-Datenhaltung müssen Firestore/Storage in EU Regionen im Firebase-Projekt angelegt sein.
- Für E-Mail Versand müssen SMTP Variablen für Functions gesetzt sein:
  - Lokal im Emulator z. B. über `functions/.env`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
