# FlitzWeb-site

De website van FlitzWeb — een statische site (HTML/CSS/vanilla JS) met een
boekingssysteem, gehost op Cloudflare Workers (`wrangler.jsonc`).

## Structuur
- `index.html`, `site.css`, `site.js` — de site zelf (één pagina, Nederlands).
  De gloeiende horizon in de hero en de afsluiter is pure CSS (`.horizon` in
  `site.css`); de kleuren staan als variabelen bovenaan dat bestand.
- `assets/brand/` — het Bolt Z-logo uit de logokit (woordmerk, omgekeerd, wit,
  symbool). Het woordmerk in de pagina staat inline als `<symbol id="fw-logo">`;
  typ het logo nooit na, vervang het uit de kit.
- `favicon.*`, `apple-touch-icon.png`, `icon-*.png`, `maskable-512.png`,
  `site.webmanifest` — de faviconset uit de logokit.
- `cloudflare/` — de Worker: serveert de site en de boekings-API.
- `api/` — de oorspronkelijke Vercel-functies; `api/_lib/businessHours.js` wordt
  nog door de Worker gebruikt:
  - `availability.js` — vrije tijdslots ophalen (Google Calendar free/busy).
  - `book.js` — een boeking maken + bevestigingsmails versturen.
  - `_lib/` — gedeelde helpers (Google auth/calendar, e-mail via Resend, openingstijden).

## Lokaal draaien
```bash
npx wrangler dev   # de site + /api lokaal (boeken werkt alleen met de secrets)
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
`main` is live (flitzweb.nl). Werk gaat naar de branch `concept`; die krijgt een
eigen voorbeeldadres op workers.dev. Boeken werkt daar niet.
