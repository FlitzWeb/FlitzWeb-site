import { computeAvailableSlots, workDatesAhead, DAYS_AHEAD } from "./_lib/businessHours.js";
import { getBusyTimes } from "./_lib/google.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const date = typeof req.query.date === "string" ? req.query.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid or missing date" });
    return;
  }
  if (!workDatesAhead(DAYS_AHEAD).includes(date)) {
    res.status(400).json({ error: "Date is not bookable" });
    return;
  }

  try {
    const busy = await getBusyTimes(date);
    const slots = computeAvailableSlots(date, busy);
    res.status(200).json({ slots });
  } catch (err) {
    console.error("availability error:", err);
    res.status(502).json({ error: "Could not load availability" });
  }
}
