export const BUSINESS_TZ = process.env.BUSINESS_TZ || "Europe/Amsterdam";
export const WORK_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri (0 = Sunday)
export const START_HOUR = 9;
export const END_HOUR = 18;
export const SLOT_MINUTES = 30;
export const DAYS_AHEAD = 5;
export const MIN_LEAD_HOURS = 12;

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const match = tzName.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

// Interprets `time` (HH:MM) as wall-clock time on `date` (YYYY-MM-DD) in `timeZone`,
// returns the corresponding UTC Date instant.
export function zonedTimeToUtc(dateStr, timeStr, timeZone = BUSINESS_TZ) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naiveUtcMs = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUtcMs), timeZone);
  return new Date(naiveUtcMs - offsetMinutes * 60000);
}

export function todayInBusinessTz() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isWorkDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WORK_DAYS.includes(dow);
}

export function workDatesAhead(count = DAYS_AHEAD) {
  const [y, m, d] = todayInBusinessTz().split("-").map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));
  const dates = [];
  while (dates.length < count) {
    cursor = new Date(cursor.getTime() + 86400000);
    const dateStr = cursor.toISOString().slice(0, 10);
    if (isWorkDay(dateStr)) dates.push(dateStr);
  }
  return dates;
}

export function slotTimes() {
  const times = [];
  const startMin = START_HOUR * 60;
  const endMin = END_HOUR * 60;
  for (let t = startMin; t + SLOT_MINUTES <= endMin; t += SLOT_MINUTES) {
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    times.push(`${hh}:${mm}`);
  }
  return times;
}

// busyIntervals: array of { start, end } as ISO strings/Date-parseable values (UTC)
export function computeAvailableSlots(dateStr, busyIntervals = []) {
  if (!isWorkDay(dateStr)) return [];
  const minStartMs = Date.now() + MIN_LEAD_HOURS * 3600000;
  return slotTimes().filter((time) => {
    const startUtc = zonedTimeToUtc(dateStr, time);
    if (startUtc.getTime() < minStartMs) return false;
    const endUtc = new Date(startUtc.getTime() + SLOT_MINUTES * 60000);
    return !busyIntervals.some((b) => startUtc < new Date(b.end) && endUtc > new Date(b.start));
  });
}

export function isSlotAvailable(dateStr, timeStr, busyIntervals = []) {
  if (!isWorkDay(dateStr) || !slotTimes().includes(timeStr)) return false;
  return computeAvailableSlots(dateStr, busyIntervals).includes(timeStr);
}
