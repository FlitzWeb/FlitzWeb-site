// Booking emails through Resend's HTTP API (same texts as api/_lib/email.js).
// Best-effort: a booking still succeeds when email fails; errors are logged.
import { BUSINESS_TZ } from "../api/_lib/businessHours.js";

async function send(env, message) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `FlitzWeb <${env.BOOKING_FROM_EMAIL}>`, ...message }),
    });
    if (!res.ok) console.error("Resend error:", res.status, await res.text());
  } catch (err) {
    console.error("Resend failed:", err);
  }
}

export function formatWhen(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayLabel = new Intl.DateTimeFormat("nl-NL", { timeZone: BUSINESS_TZ, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  return `${dayLabel} om ${timeStr}`;
}

export function sendConfirmation(env, { name, email, when }) {
  return send(env, {
    to: email,
    subject: "Je gesprek is ingepland",
    text: `Hoi ${name},\n\nJe gesprek staat gepland voor ${when} (${BUSINESS_TZ}).\n\nTot dan!\nFlitzWeb`,
  });
}

export async function sendOwnerNotification(env, { name, email, company, type, message, when }) {
  const owners = (env.BOOKING_OWNER_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!owners.length) return;
  const text = [
    `Nieuwe boeking: ${name} <${email}>`,
    company ? `Bedrijf: ${company}` : null,
    type ? `Type: ${type}` : null,
    `Wanneer: ${when}`,
    message ? `Bericht: ${message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return send(env, { to: owners, subject: `Nieuwe boeking: ${name}`, text });
}
