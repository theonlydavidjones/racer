/**
 * The airports' rain reports into src/environment/data/sf-rain.json's days (scripts/fetch-rain.mjs, the recent week from
 * the NWS API; scripts/fetch-rain-history.mjs, the years from the ASOS archive). environment/rain.ts reads them.
 *
 * A day (local, San Francisco) is 120 bytes, base64:
 *  - bytes 0–23, each local hour's rain, tenths of a mm (0–254): the most any report in that hour gave for the
 *    accumulation since the last routine report (the METAR's P group: the routine report just before the hour, :53 or
 *    :56, carries the hour's total; a special report part way through, what has fallen so far that hour);
 *  - bytes 24–119, each quarter hour's wet weather: 0 none, 1 light rain, 2 moderate, 3 heavy, 4 drizzle only;
 *  - 255: no report.
 * The weather: what each report says, held until the next report (75 minutes at most); and where the rain or drizzle began
 * or ended between reports, the minute its remarks give (RAB35, RAE21, DZB1159E14: "rain began at :35" and so on: the
 * routine report says when since the last one, and rain starting or stopping alone brings no special report).
 */
export const SLOTS = 96, SLOT_MIN = 15, HOLD_MIN = 75;
/** How wet each code is, for the wetter of two in a quarter hour: none, drizzle, light, moderate, heavy. */
const RANK = [0, 2, 3, 4, 1];
const wetter = (a, b) => a === 255 ? b : b === 255 ? a : RANK[a] >= RANK[b] ? a : b;

/** The rain and drizzle begin/end remarks of a METAR (UTC report time `ms`): [{ ms, kind: 'RA' | 'DZ', on }]. */
export function remarkEvents(raw, ms) {
  const rmk = (raw ?? '').split(' RMK ')[1]; if (!rmk) return [];
  const out = [], t = new Date(ms), hh = t.getUTCHours(), mi = t.getUTCMinutes();
  for (const m of rmk.matchAll(/\b(?:SH|TS|FZ)?(RA|DZ)((?:[BE]\d{2}(?:\d{2})?)+)\b/g)) {
    for (const e of m[2].matchAll(/([BE])(\d{2})(\d{2})?/g)) {
      // (two digits: the minute, in the hour up to the report; four: the UTC hour and minute, on or before it)
      const back = e[3] != null ? ((hh * 60 + mi) - (+e[2] * 60 + +e[3]) + 1440) % 1440 : (mi - +e[2] + 60) % 60;
      out.push({ ms: ms - back * 60000, kind: m[1], on: e[1] === 'B' });
    }
  }
  return out;
}

/**
 * Days from reports: `{ ms (UTC), mm: number | null (the accumulation since the last routine report, mm), code: 0–4,
 * raw?: the METAR, for its begin/end remarks }`, in any order. Returns local date → Uint8Array(120).
 */
export function encodeDays(reports) {
  // the reports, and the remarks' begins and ends as reports of their own (a begin: the rain the report then shows, or
  // light if it had ended by then; an end: none)
  const items = [];
  for (const r of reports) {
    items.push(r);
    for (const e of remarkEvents(r.raw, r.ms)) {
      const code = !e.on ? 0 : e.kind === 'DZ' ? 4 : r.code >= 1 && r.code <= 3 ? r.code : 1;
      items.push({ ms: e.ms, mm: null, code, event: true });
    }
  }
  items.sort((a, b) => a.ms - b.ms || (a.event ? -1 : 1));
  const days = new Map(), day = date => { if (!days.has(date)) days.set(date, new Uint8Array(24 + SLOTS).fill(255)); return days.get(date); };
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    if (!r.event) { const L = localAt(r.ms), a = day(L.date); if (r.mm != null && Number.isFinite(r.mm)) a[L.hour] = Math.max(a[L.hour] === 255 ? 0 : a[L.hour], Math.min(254, Math.round(r.mm * 10))); }
    // the weather, from now until the next report or remark (75 minutes at most)
    const t1 = Math.min(r.ms + HOLD_MIN * 60000, i + 1 < items.length ? items[i + 1].ms : Infinity);
    for (let t = r.ms; t < Math.max(t1, r.ms + 1); t = (Math.floor(t / (SLOT_MIN * 60000)) + 1) * SLOT_MIN * 60000) {
      const L = localAt(t), a = day(L.date), s = 24 + Math.floor(L.min / SLOT_MIN);
      a[s] = wetter(a[s], r.code);
    }
  }
  return days;
}

/** Merge two encodings of a day: `keep` wins where it has a report, `fill` fills its gaps. */
export function mergeDay(keep, fill) {
  if (!fill || fill.length !== keep.length) return keep;
  return keep.map((x, i) => x === 255 ? fill[i] : x);
}
export const b64 = a => Buffer.from(a).toString('base64');
export const unb64 = s => s ? new Uint8Array(Buffer.from(s, 'base64')) : null;
/** A day with no report at all (a whole day's outage: unknown, not dry). */
export const noReports = () => new Uint8Array(24 + SLOTS).fill(255);

/** The sim's two strengths from a quarter hour (as environment/rain.ts slotLevel: tests/rain.test.ts keeps the two the same). */
export const MODERATE_SPLIT_MM = 4, MEASURABLE_MM = 0.25;
export function slotLevel(a, s) {
  const h = Math.floor(s / 4), mm = a[h] === 255 ? null : a[h] / 10, code = a[24 + s];
  let anyCode = false; for (let k = 0; k < 4; k++) { const c = a[24 + h * 4 + k]; if (c !== 255 && c > 0) anyCode = true; }
  const byAmount = () => mm == null ? null : mm >= MODERATE_SPLIT_MM ? 2 : mm >= MEASURABLE_MM ? 1 : 0;
  if (code === 255) return anyCode ? null : byAmount();
  if (code === 0) return anyCode ? 0 : byAmount();
  if (code === 4) return mm != null && mm >= MEASURABLE_MM ? 1 : 0; // (drizzle: rain only when the hour's fall was measurable)
  if (code === 3) return 2;
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
/** The local date, hour and minutes into the day at an instant. */
export function localAt(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])), hour = +p.hour % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, min: hour * 60 + +p.minute, hour };
}
/** The dates from `a` to `b` (YYYY-MM-DD), inclusive. */
export function datesBetween(a, b) {
  const out = []; for (let t = Date.parse(a + 'T12:00Z'); t <= Date.parse(b + 'T12:00Z'); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
