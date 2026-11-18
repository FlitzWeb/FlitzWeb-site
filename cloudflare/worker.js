// flitzweb.nl on Cloudflare Workers: the static site plus the booking API
// (/api/availability and /api/book, ported from the Vercel functions in api/).
import { computeAvailableSlots, DAYS_AHEAD, isSlotAvailable, slotTimes, workDatesAhead } from "../api/_lib/businessHours.js";
import { createEvent, getBusyTimes } from "./google.js";
import { formatWhen, sendConfirmation, sendOwnerNotification } from "./email.js";

const SITE = "flitzweb.nl";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const preview = url.hostname.endsWith(".workers.dev");

    // One address: https, no www (as on Vercel).
    if (!preview && (url.hostname !== SITE || url.protocol === "http:")) {
      url.hostname = SITE;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname === "/api/availability") return availability(request, env, url);
    if (url.pathname === "/api/book") return book(request, env, ctx);

    // The old Vercel analytics scripts: answer quietly instead of a 404 per page view.
    if (url.pathname.startsWith("/_vercel/")) {
      return new Response("", { headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400" } });
    }

    if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
      request = new Request(url, request);
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) return notFound(preview);

    const headers = new Headers(response.headers);
    if (preview) headers.set("X-Robots-Tag", "noindex");
    else headers.set("Strict-Transport-Security", "max-age=63072000");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

async function availability(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const date = url.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Invalid or missing date" }, 400);
  if (!workDatesAhead(DAYS_AHEAD).includes(date)) return json({ error: "Date is not bookable" }, 400);
  try {
    return json({ slots: computeAvailableSlots(date, await getBusyTimes(env, date)) });
  } catch (err) {
    console.error("availability error:", err);
    return json({ error: "Could not load availability" }, 502);
  }
}

async function book(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    return json({ error: "Invalid name or email" }, 400);
  }
  const field = (k) => (body[k] ?? "").toString().trim();

  // Honeypot: bots fill the hidden "website" field. Fake success, do nothing.
  if (field("website")) return json({ ok: true });

  const [name, email, company, type, message, date, time] = ["name", "email", "company", "type", "message", "date", "time"].map(field);
  if (!name || !EMAIL_RE.test(email)) return json({ error: "Invalid name or email" }, 400);
  if (!workDatesAhead(DAYS_AHEAD).includes(date) || !slotTimes().includes(time)) return json({ error: "Invalid date or time" }, 400);

  try {
    // Re-check right before booking so two visitors can't take the same slot.
    if (!isSlotAvailable(date, time, await getBusyTimes(env, date))) return json({ error: "slot_taken" }, 409);
    const notes = [company && `Bedrijf: ${company}`, type && `Type: ${type}`, message].filter(Boolean).join("\n");
    await createEvent(env, { name, email, date, time, notes });
    const when = formatWhen(date, time);
    // Emails go out after the answer; a failed email never fails the booking.
    ctx.waitUntil(Promise.all([sendConfirmation(env, { name, email, when }), sendOwnerNotification(env, { name, email, company, type, message, when })]));
    return json({ ok: true, when });
  } catch (err) {
    console.error("book error:", err);
    return json({ error: "Could not create booking" }, 502);
  }
}

function notFound(preview) {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pagina niet gevonden | FlitzWeb</title><link rel="icon" href="/assets/brand/favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-content:center;gap:1rem;padding:1.5rem;font:1.0625rem/1.5 system-ui,sans-serif;text-align:center;background:#f8fafc;color:#0f172a}a{color:#2563eb}</style></head><body><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet (meer).</p><p><a href="/">Naar flitzweb.nl</a></p></body></html>`;
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (preview) headers["X-Robots-Tag"] = "noindex";
  return new Response(html, { status: 404, headers });
}
