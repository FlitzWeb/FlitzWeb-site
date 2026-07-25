import { DAYS_AHEAD, isSlotAvailable, slotTimes, workDatesAhead } from "./_lib/businessHours.js";
import { createEvent, getBusyTimes } from "./_lib/google.js";
import { formatWhen, sendConfirmation, sendOwnerNotification } from "./_lib/email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body || {};
  // Honeypot: a hidden "website" field that real visitors never see. If it's
  // filled, it's a bot — drop it silently with a fake success so it doesn't
  // learn to adapt, and never touch the calendar or send any email.
  if ((body.website || "").toString().trim()) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim();
  const company = (body.company || "").toString().trim();
  const type = (body.type || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const date = (body.date || "").toString();
  const time = (body.time || "").toString();

  if (!name || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Invalid name or email" });
    return;
  }
  if (!workDatesAhead(DAYS_AHEAD).includes(date) || !slotTimes().includes(time)) {
    res.status(400).json({ error: "Invalid date or time" });
    return;
  }

  try {
    // Re-check freshly against Google Calendar right before booking to close the
    // race where two visitors hold the same slot in the UI at once.
    const busy = await getBusyTimes(date);
    if (!isSlotAvailable(date, time, busy)) {
      res.status(409).json({ error: "slot_taken" });
      return;
    }

    const notes = [company && `Bedrijf: ${company}`, type && `Type: ${type}`, message]
      .filter(Boolean)
      .join("\n");
    await createEvent({ name, email, date, time, notes });

    const when = formatWhen(date, time);
    await Promise.all([
      sendConfirmation({ name, email, when }),
      sendOwnerNotification({ name, email, company, type, message, when }),
    ]);

    res.status(200).json({ ok: true, when });
  } catch (err) {
    console.error("book error:", err);
    res.status(502).json({ error: "Could not create booking" });
  }
}
