// Google Calendar for the booking system, on Cloudflare Workers.
// Same calls as api/_lib/google.js (the Vercel version), but signs the
// service-account token with Web Crypto instead of google-auth-library.
import { BUSINESS_TZ, SLOT_MINUTES, zonedTimeToUtc } from "../api/_lib/businessHours.js";

const SCOPE = "https://www.googleapis.com/auth/calendar";
let cached = null; // { token, exp } reused while this worker instance is warm

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (text) => b64url(new TextEncoder().encode(text));

async function signingKey(pem) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const header = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(
    JSON.stringify({ iss: env.GOOGLE_CLIENT_EMAIL, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(env.GOOGLE_PRIVATE_KEY || ""), new TextEncoder().encode(unsigned));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }),
  });
  if (!res.ok) throw new Error(`Google token failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cached.token;
}

export async function getBusyTimes(env, dateStr) {
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const dayStart = zonedTimeToUtc(dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.calendars?.[calendarId]?.busy || [];
}

export async function createEvent(env, { name, email, date, time, notes }) {
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const startUtc = zonedTimeToUtc(date, time);
  const endUtc = new Date(startUtc.getTime() + SLOT_MINUTES * 60000);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    // No `attendees`: Google rejects them for a service account on a non-Workspace
    // calendar. The visitor's details go in the description (see api/_lib/google.js).
    body: JSON.stringify({
      summary: `Gesprek met ${name}`,
      description: [`Contact: ${name} <${email}>`, notes].filter(Boolean).join("\n\n"),
      start: { dateTime: startUtc.toISOString(), timeZone: BUSINESS_TZ },
      end: { dateTime: endUtc.toISOString(), timeZone: BUSINESS_TZ },
    }),
  });
  if (!res.ok) throw new Error(`Google events.insert failed: ${res.status} ${await res.text()}`);
  return res.json();
}
