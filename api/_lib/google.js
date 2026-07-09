import { JWT } from "google-auth-library";
import { BUSINESS_TZ, SLOT_MINUTES, zonedTimeToUtc } from "./businessHours.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

let client;
function getClient() {
  if (!client) {
    client = new JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: SCOPES,
    });
  }
  return client;
}

async function getAccessToken() {
  const { token } = await getClient().getAccessToken();
  return token;
}

export async function getBusyTimes(dateStr) {
  const dayStart = zonedTimeToUtc(dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);
  const token = await getAccessToken();

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: CALENDAR_ID }],
    }),
  });
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return data.calendars?.[CALENDAR_ID]?.busy || [];
}

export async function createEvent({ name, email, date, time, notes }) {
  const startUtc = zonedTimeToUtc(date, time);
  const endUtc = new Date(startUtc.getTime() + SLOT_MINUTES * 60000);
  const token = await getAccessToken();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // No `attendees` field: Google rejects events.insert outright ("cannot invite
      // attendees without domain-wide delegation") for any service account on a
      // non-Workspace calendar, even with sendUpdates left at its default "none".
      // The visitor's contact info goes in the description instead, and their
      // confirmation is sent separately via Resend.
      body: JSON.stringify({
        summary: `Gesprek met ${name}`,
        description: [`Contact: ${name} <${email}>`, notes].filter(Boolean).join("\n\n"),
        start: { dateTime: startUtc.toISOString(), timeZone: BUSINESS_TZ },
        end: { dateTime: endUtc.toISOString(), timeZone: BUSINESS_TZ },
      }),
    }
  );
  if (!res.ok) throw new Error(`Google events.insert failed: ${res.status} ${await res.text()}`);

  return res.json();
}
