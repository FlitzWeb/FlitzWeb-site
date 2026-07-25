# FlitzWeb-site

De website van FlitzWeb — een statische site (HTML/CSS/vanilla JS) met een
serverless boekingssysteem, gehost op Vercel.

## Structuur
- `index.html`, `styles.css`, `script.js` — de site zelf (NL/EN taalwissel in JS).
- `analytics.js` — dunne wrapper rond Vercel Web Analytics.
- `api/` — Vercel serverless functions voor het inplannen van gesprekken:
  - `availability.js` — vrije tijdslots ophalen (Google Calendar free/busy).
  - `book.js` — een boeking maken + bevestigingsmails versturen.
  - `_lib/` — gedeelde helpers (Google auth/calendar, e-mail via Resend, openingstijden).

## Lokaal draaien
```bash
npm install
npx vercel dev   # draait de statische site + de /api functies lokaal
```

## Omgevingsvariabelen
Kopieer `.env.example` naar `.env.local` en vul in (zie Vercel project settings
voor productie). Vereist voor het boekingssysteem:
- `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` — service
  account met schrijfrechten op de agenda.
- `RESEND_API_KEY`, `BOOKING_FROM_EMAIL`, `BOOKING_OWNER_EMAIL` — bevestigings-
  en notificatiemails.
- Optioneel: `BUSINESS_TZ` (standaard `Europe/Amsterdam`).

## Deploy
Push naar een branch en open een PR; `main` is beveiligd en deployt naar
productie via Vercel na merge.
