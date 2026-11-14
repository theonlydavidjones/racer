/**
 * The airports' rain reports into src/environment/data/sf-rain.json's days (scripts/fetch-rain.mjs, the recent week from
 * the NWS API; scripts/fetch-rain-history.mjs, the years from the ASOS archive). environment/rain.ts reads them.
 *
 * A day (local, San Francisco) is 120 bytes, base64:
 *  - bytes 0–23, each local hour's rain, tenths of a mm (0–254): the most any report in that hour gave for the
 *    accumulation since the last routine report (the routine report just before the hour, :53 or :56, carries the hour's
 *    total; a special report part way through, what has fallen so far that hour);
 *  - bytes 24–119, each quarter hour's reported wet weather (0 none, 1 light, 2 moderate, 3 heavy): a report's weather
 *    holds from its time until the next report, for 75 minutes at most (the routine reports are hourly, and a change of
 *    weather brings a special report);
 *  - 255: no report.
 */
export const SLOTS = 96, SLOT_MIN = 15, HOLD_MIN = 75;
const DAY_MIN = 1440;

/**
 * Days from reports: `{ date: 'YYYY-MM-DD' (local), min: minutes into that local day, mm: number | null (the accumulation
 * since the last routine report), code: 0–3 }`, in any order. Returns date → Uint8Array(120).
 */
export function encodeDays(reports) {
  const key = r => Date.parse(r.date + 'T00:00Z') / 60000 + r.min; // (local minutes, for the order)
  const rs = [...reports].sort((a, b) => key(a) - key(b)), days = new Map();
  const day = date => { if (!days.has(date)) days.set(date, new Uint8Array(24 + SLOTS).fill(255)); return days.get(date); };
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i], a = day(r.date), h = Math.floor(r.min / 60);
    if (r.mm != null && Number.isFinite(r.mm)) a[h] = Math.max(a[h] === 255 ? 0 : a[h], Math.min(254, Math.round(r.mm * 10)));
    // the weather it reports, from now until the next report (75 minutes at most)
    const t0 = key(r), t1 = Math.min(t0 + HOLD_MIN, i + 1 < rs.length ? key(rs[i + 1]) : t0 + HOLD_MIN);
    for (let t = t0 - (t0 % SLOT_MIN); t < Math.max(t1, t0 + 1); t += SLOT_MIN) {
      const dayStart = Math.floor(t / DAY_MIN) * DAY_MIN, date = new Date(dayStart * 60000).toISOString().slice(0, 10), b = day(date), s = (t - dayStart) / SLOT_MIN;
      b[24 + s] = Math.max(b[24 + s] === 255 ? 0 : b[24 + s], r.code);
    }
  }
  return days;
}

/** Merge a day already on file into a newly fetched one: the new one's reports win, the old fill its gaps. */
export function mergeDay(a, oldB64) {
  if (!oldB64) return a;
  const old = Buffer.from(oldB64, 'base64');
  if (old.length !== a.length) return a; // (an older encoding: refetched)
  a.forEach((x, i) => { if (x === 255 && old[i] !== 255) a[i] = old[i]; });
  return a;
}

/** The sim's two strengths from a quarter hour (as environment/rain.ts: keep the two the same). */
export const HEAVY_MM = 7.6, MODERATE_SPLIT_MM = 4, MEASURABLE_MM = 0.25;
export function slotLevel(a, s) {
  const h = Math.floor(s / 4), mm = a[h] === 255 ? null : a[h] / 10, code = a[24 + s];
  const anyCode = [0, 1, 2, 3].some(k => a[24 + h * 4 + k] !== 255 && a[24 + h * 4 + k] > 0);
  // (no wet weather reported this hour, but a measurable amount fell: the hour's rain, by its amount)
  const byAmount = () => mm == null ? null : mm >= MODERATE_SPLIT_MM ? 2 : mm >= MEASURABLE_MM ? 1 : 0;
  if (code === 255) return anyCode ? null : byAmount();
  if (code === 0) return anyCode ? 0 : byAmount();
  if (code === 3 || (mm != null && mm > HEAVY_MM)) return 2;
  if (code === 2) return mm != null && mm >= MODERATE_SPLIT_MM ? 2 : 1;
  return 1;
}
/** Whether a day must be kept on file: any rain, or any quarter hour without a report (a dry day with every report isn't). */
export function needed(a) {
  for (let s = 0; s < SLOTS; s++) { const l = slotLevel(a, s); if (l == null || l > 0) return true; }
  return false;
}
/** A local (San Francisco) date, YYYY-MM-DD. */
export const localDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** The local date and minutes into it at an instant. */
export function localAt(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, hour: +p.hour % 24 };
}
