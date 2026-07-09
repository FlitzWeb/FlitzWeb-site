import { Resend } from "resend";
import { BUSINESS_TZ } from "./businessHours.js";

const FROM_ADDR = process.env.BOOKING_FROM_EMAIL;
const FROM = FROM_ADDR ? `FlitzWeb <${FROM_ADDR}>` : FROM_ADDR;
const OWNERS = (process.env.BOOKING_OWNER_EMAIL || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

let resend;
// The Resend constructor throws synchronously if the key is missing, which would
// otherwise crash the whole function at import time before it can even route the
// request — so the client is built lazily on first send instead.
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export function formatWhen(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayLabel = new Intl.DateTimeFormat("nl-NL", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return `${dayLabel} om ${timeStr}`;
}

// Best-effort: a booking should still succeed even if the email provider is down,
// so failures here are logged, never thrown.
export async function sendConfirmation({ name, email, when }) {
  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to: email,
      subject: "Je gesprek is ingepland",
      text: `Hoi ${name},\n\nJe gesprek staat gepland voor ${when} (${BUSINESS_TZ}).\n\nTot dan!\nFlitzWeb`,
    });
    // Resend returns delivery errors in the response body rather than throwing,
    // so an unverified domain / bad address would otherwise pass silently.
    if (error) console.error("Resend confirmation email error:", error);
  } catch (err) {
    console.error("Resend confirmation email failed:", err);
  }
}

export async function sendOwnerNotification({ name, email, company, type, message, when }) {
  if (!OWNERS.length) return;
  const lines = [
    `Nieuwe boeking: ${name} <${email}>`,
    company ? `Bedrijf: ${company}` : null,
    type ? `Type: ${type}` : null,
    `Wanneer: ${when}`,
    message ? `Bericht: ${message}` : null,
  ].filter(Boolean);
  try {
    const { error } = await getResend().emails.send({
      from: FROM,
      to: OWNERS,
      subject: `Nieuwe boeking: ${name}`,
      text: lines.join("\n"),
    });
    if (error) console.error("Resend owner notification error:", error);
  } catch (err) {
    console.error("Resend owner notification failed:", err);
  }
}
