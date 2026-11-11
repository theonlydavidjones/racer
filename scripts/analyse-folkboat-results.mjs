#!/usr/bin/env node
/**
 * What the real Folkboat results say, in the terms a skipper model is calibrated against. Reads and rewrites
 * src/boat/data/sf-folkboat-results.json (no network); scripts/fetch-folkboat-results.mjs runs it after fetching.
 *
 *   node scripts/analyse-folkboat-results.mjs
 *
 * For each race it adds `realDay`: whether the sim's real-day data has that date (observed wind at Fort Point,
 * NOAA CO-OPS 9414290, 10:00–17:54 local, from src/environment/data/sf-real-days.json; tidal current is predicted
 * from NOAA harmonics for any date) and the observed mean wind over the race. Then `calibration`:
 *  - spread: each finisher's elapsed time as % behind the winner, by place, and in seconds per nautical mile;
 *  - consistency: how alike the finishing order is from race to race (Kendall's tau over boats in both races), and
 *    each boat's and skipper's mean place;
 *  - wind: the fleet's spread against the race's observed wind;
 *  - gaps: the top boat against the middle and the back of the fleet.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FILE = new URL('../src/boat/data/sf-folkboat-results.json', import.meta.url);
const REAL = new URL('../src/environment/data/sf-real-days.json', import.meta.url);

const hms = s => { const m = /(\d{1,2}):(\d\d):(\d\d)/.exec(s ?? ''); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return { r: sxy / Math.sqrt(sxx * syy), slope: sxy / sxx, intercept: my - (sxy / sxx) * mx };
}
/** One skipper however the scorer typed the name ("Tricia D Antin", "Tricia Dantin"). */
const skipperKey = s => s.toLowerCase().replace(/[^a-z]/g, '');

/** Kendall's tau-a between two finishing orders, over the boats that finished both (null under 3 such boats). */
function kendall(a, b) {
  const pa = new Map(a.map(x => [x.key, x.place])), common = b.filter(x => pa.has(x.key));
  if (common.length < 3) return null;
  let c = 0, d = 0;
  for (let i = 0; i < common.length; i++) for (let j = i + 1; j < common.length; j++) {
    const s = Math.sign(pa.get(common[i].key) - pa.get(common[j].key)) * Math.sign(common[i].place - common[j].place);
    if (s > 0) c++; else if (s < 0) d++;
  }
  return { tau: (c - d) / (c + d), n: common.length };
}

/** The sim's observed real days: Fort Point wind, 6-minute slots from 10:00 local. */
function realDays(real) {
  return (date, fromS, toS) => {
    const b64 = real.wind?.[date];
    if (!b64) return { windObserved: false };
    const bytes = Buffer.from(b64, 'base64');
    const slot0 = real.slot0 * 60, step = real.slotMin * 60;
    const out = { windObserved: true, windWindow: '10:00–17:54' };
    if (fromS == null) return out;
    const sp = [], gu = [], ve = [0, 0];
    for (let t = fromS; t <= (toS ?? fromS + 3600); t += step) {
      const i = Math.floor((t - slot0) / step);
      if (i < 0 || i >= real.slots) continue;
      const [s, d, g] = bytes.subarray(i * 3, i * 3 + 3);
      if (s === 255) continue;
      sp.push(s / 4);
      if (g !== 255) gu.push(g / 4);
      if (d !== 255) { ve[0] += Math.sin(d * 2 * Math.PI / 180); ve[1] += Math.cos(d * 2 * Math.PI / 180); }
    }
    if (sp.length) {
      out.fortPoint = {
        meanKt: r1(mean(sp)), minKt: r1(Math.min(...sp)), maxKt: r1(Math.max(...sp)),
        meanGustKt: gu.length ? r1(mean(gu)) : null,
        fromDeg: Math.round((Math.atan2(ve[0], ve[1]) * 180 / Math.PI + 360) % 360), samples: sp.length,
      };
    }
    return out;
  };
}

export function analyse(data, real) {
  const day = real ? realDays(real) : null;
  // Every race, with its event's id and source alongside (the race objects themselves, so annotations show up in both).
  const races = data.events.flatMap(e => e.races.map(r => ({ r, event: e.id, source: e.source })));

  // Per race: the real day, and the spread where there are times.
  for (const e of data.events) for (const r of e.races) {
    const start = hms(r.start);
    const timed = r.boats.filter(b => b.place && b.elapsedS != null).sort((a, b) => a.elapsedS - b.elapsedS);
    const useTimes = e.source === 'jibeset' && timed.length >= 2;
    const lastS = useTimes ? start + timed.at(-1).elapsedS : null;
    r.realDay = { ...(day ? day(r.date, start, useTimes ? start + timed[0].elapsedS : null) : {}), currentPredicted: true };
    if (r.realDay.windObserved && start != null) r.realDay.raceInsideWindow = start >= real.slot0 * 60 && (lastS ?? start + 3600) <= (real.slot0 + real.slots * real.slotMin) * 60;
    if (useTimes) {
      const w = timed[0].elapsedS;
      r.spread = {
        finishers: timed.length,
        winnerElapsed: timed[0].elapsedS, winnerSpeedKt: r.distanceNm ? r2(r.distanceNm / (w / 3600)) : null, // over the nominal distance, current included
        gapPct: timed.map(b => r1((b.elapsedS / w - 1) * 100)),
        gapSecPerNm: r.distanceNm ? timed.map(b => Math.round((b.elapsedS - w) / r.distanceNm)) : null,
      };
    }
  }

  // --- Spread within a fleet (timed races)
  const timedRaces = races.filter(x => x.r.spread).map(x => x.r);
  const lastGap = timedRaces.map(r => r.spread.gapPct.at(-1));
  const medGap = timedRaces.map(r => median(r.spread.gapPct.slice(1)));
  // Gap by relative place: 0 = winner, 1 = last finisher, in quarters.
  const byRel = [[], [], [], []];
  for (const r of timedRaces) {
    const n = r.spread.gapPct.length;
    r.spread.gapPct.forEach((g, i) => { if (i) byRel[Math.min(3, Math.floor((i / (n - 1)) * 4 - 1e-9))].push(g); });
  }
  const spread = {
    races: timedRaces.length,
    note: 'Elapsed times % behind the race winner. Seaweed Soup races (GGYC), 5–8 Folkboats, courses of 3–7 nm.',
    lastFinisherPct: { median: r1(median(lastGap)), p25: r1(quantile(lastGap, 0.25)), p75: r1(quantile(lastGap, 0.75)), min: r1(Math.min(...lastGap)), max: r1(Math.max(...lastGap)) },
    medianBoatPct: { median: r1(median(medGap)), min: r1(Math.min(...medGap)), max: r1(Math.max(...medGap)) },
    byRelativePlace: ['first quarter after the winner', 'second quarter', 'third quarter', 'last quarter'].map((label, i) => ({ label, n: byRel[i].length, medianPct: r1(median(byRel[i])) })),
    lastFinisherSecPerNm: { median: Math.round(median(timedRaces.filter(r => r.spread.gapSecPerNm).map(r => r.spread.gapSecPerNm.at(-1))) ?? NaN) || null },
    winnerSpeedKt: { median: r2(median(timedRaces.map(r => r.spread.winnerSpeedKt).filter(x => x))), min: r2(Math.min(...timedRaces.map(r => r.spread.winnerSpeedKt).filter(x => x))), max: r2(Math.max(...timedRaces.map(r => r.spread.winnerSpeedKt).filter(x => x))) },
  };

  // --- Consistency: Kendall's tau between pairs of races, by how far apart they were.
  const placed = races.map(x => ({ ...x.r, event: x.event, source: x.source, fin: x.r.boats.filter(b => b.place) })).filter(r => r.fin.length >= 3);
  const pairs = { sameDay: [], sameEvent: [], otherEvents: [] };
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const k = kendall(placed[i].fin, placed[j].fin);
    if (!k) continue;
    const kind = placed[i].date === placed[j].date ? 'sameDay' : placed[i].event === placed[j].event ? 'sameEvent' : 'otherEvents';
    pairs[kind].push(k.tau);
  }
  const tauSummary = a => ({ pairs: a.length, meanTau: r2(mean(a)), sdTau: r2(sd(a)) });
  // Each boat's (and skipper's) relative place: 0 = won, 1 = last finisher.
  const per = (keyOf, labelOf) => {
    const m = new Map();
    for (const r of placed) {
      const n = r.fin.length;
      for (const b of r.fin) {
        const k = keyOf(b);
        if (!m.has(k)) m.set(k, { key: k, label: labelOf(b), rel: [], wins: 0, gaps: [] });
        const x = m.get(k);
        x.rel.push((b.place - 1) / (n - 1));
        if (b.place === 1) x.wins++;
        if (r.source === 'jibeset' && b.elapsedS != null) x.gaps.push((b.elapsedS / Math.min(...r.fin.map(f => f.elapsedS)) - 1) * 100);
      }
    }
    return [...m.values()].filter(x => x.rel.length >= 4)
      .map(x => ({ key: x.key, name: x.label, races: x.rel.length, wins: x.wins, meanRelPlace: r2(mean(x.rel)), sdRelPlace: r2(sd(x.rel)), timedRaces: x.gaps.length, meanGapPct: x.gaps.length ? r1(mean(x.gaps)) : null }))
      .sort((a, b) => a.meanRelPlace - b.meanRelPlace);
  };
  const boats = per(b => b.key, b => `${b.boat} (${b.key})`);
  const skippers = per(b => skipperKey(b.skipper), b => b.skipper);
  // How much of the race-to-race scatter in place is the boat/skipper, and how much is the day: the share of the
  // variance in relative place explained by who it is (one-way ANOVA R², boats with 4+ races).
  const share = list => {
    const all = [], groups = new Map();
    for (const r of placed) for (const b of r.fin) {
      const k = list === 'boat' ? b.key : skipperKey(b.skipper);
      const v = (b.place - 1) / (r.fin.length - 1);
      all.push([k, v]);
      groups.set(k, [...(groups.get(k) ?? []), v]);
    }
    const keep = all.filter(([k]) => groups.get(k).length >= 4).map(([k, v]) => [k, v]);
    const m = mean(keep.map(x => x[1]));
    const ssT = keep.reduce((s, [, v]) => s + (v - m) ** 2, 0);
    const ssB = [...groups].filter(([, v]) => v.length >= 4).reduce((s, [, v]) => s + v.length * (mean(v) - m) ** 2, 0);
    return r2(ssB / ssT);
  };
  const consistency = {
    note: 'Kendall\'s tau between two races\' finishing orders over the boats that finished both: 1 = same order, 0 = no relation. ' +
      'Relative place: 0 = won, 1 = last finisher. Boats and skippers with 4+ finishes.',
    tau: { sameDay: tauSummary(pairs.sameDay), sameEventOtherDay: tauSummary(pairs.sameEvent), otherEvents: tauSummary(pairs.otherEvents) },
    varianceExplainedByBoat: share('boat'), varianceExplainedBySkipper: share('skipper'),
    boats, skippers,
  };

  // --- Spread against wind (timed races with observed wind over the race).
  const windPts = timedRaces.filter(r => r.realDay?.fortPoint).map(r => ({ date: r.date, raceNo: r.raceNo, windKt: r.realDay.fortPoint.meanKt, lastPct: r.spread.gapPct.at(-1), medianPct: r1(median(r.spread.gapPct.slice(1))), winnerSpeedKt: r.spread.winnerSpeedKt }));
  const fit = windPts.length >= 3 ? pearson(windPts.map(p => p.windKt), windPts.map(p => p.lastPct)) : null;
  const spdPts = windPts.filter(p => p.winnerSpeedKt != null);
  const fitSpeed = spdPts.length >= 3 ? pearson(spdPts.map(p => p.windKt), spdPts.map(p => p.winnerSpeedKt)) : null;
  // How far each race's order strays from the fleet's usual order (boats ranked by mean relative place over all
  // races), by the observed wind: light, shifty days should scramble the order more.
  const usual = new Map(boats.map((b, i) => [b.key, i]));
  const bands = [{ label: 'under 8 kt', lo: 0, hi: 8 }, { label: '8–14 kt', lo: 8, hi: 14 }, { label: '14 kt and over', lo: 14, hi: 99 }];
  const orderByWind = bands.map(band => {
    const taus = [];
    for (const r of placed) {
      const w = r.realDay?.fortPoint?.meanKt;
      if (w == null || w < band.lo || w >= band.hi) continue;
      const fin = r.fin.filter(b => usual.has(b.key));
      if (fin.length < 4) continue;
      const k = kendall(fin.map(b => ({ key: b.key, place: usual.get(b.key) })), fin);
      if (k) taus.push(k.tau);
    }
    return { wind: band.label, races: taus.length, meanTauWithUsualOrder: r2(mean(taus)), sdTau: r2(sd(taus)) };
  });

  const wind = {
    orderByWind,
    note: 'Fort Point (NOAA 9414290) mean wind over the race (start to the winner\'s finish where timed, else the first hour). ' +
      'Fort Point reads the Gate; the race areas are usually a little lighter. orderByWind: Kendall\'s tau between each race\'s ' +
      'order and the fleet\'s usual order (all races with observed wind). races: the timed races, last finisher\'s gap ' +
      'against wind; winner speed is over the nominal course distance and includes the current, so it is not boat speed.',
    races: windPts,
    lastPctVsWind: fit ? { slopePctPerKt: r2(fit.slope), interceptPct: r1(fit.intercept), r: r2(fit.r) } : null,
    winnerSpeedVsWind: fitSpeed ? { slopeKtPerKt: r2(fitSpeed.slope), interceptKt: r2(fitSpeed.intercept), r: r2(fitSpeed.r) } : null,
  };

  // --- Top against the fleet: the boat with the best mean place, against the middle and the back, in timed races.
  const timedBoats = boats.filter(b => b.timedRaces >= 3).sort((a, b) => a.meanGapPct - b.meanGapPct);
  const gaps = timedBoats.length >= 3 ? {
    note: 'Mean % behind each race\'s winner, over the timed races each boat finished (3+). The top boat\'s own figure is ' +
      'above 0 because it doesn\'t win every race.',
    top: { name: timedBoats[0].name, meanGapPct: timedBoats[0].meanGapPct },
    median: { name: timedBoats[timedBoats.length >> 1].name, meanGapPct: timedBoats[timedBoats.length >> 1].meanGapPct },
    back: { name: timedBoats.at(-1).name, meanGapPct: timedBoats.at(-1).meanGapPct },
    topToMedianPct: r1(timedBoats[timedBoats.length >> 1].meanGapPct - timedBoats[0].meanGapPct),
    topToBackPct: r1(timedBoats.at(-1).meanGapPct - timedBoats[0].meanGapPct),
  } : null;

  const topByPlace = boats[0] ? { name: boats[0].name, races: boats[0].races, wins: boats[0].wins, meanRelPlace: boats[0].meanRelPlace,
    note: 'The fleet\'s top boat by place over all races (Regatta Network included); it sailed none of the timed races.' } : null;
  if (gaps) gaps.topByPlace = topByPlace;

  // --- What's covered and what isn't.
  const coverage = {
    events: data.events.length, races: races.length, timedRaces: timedRaces.length,
    placesOnlyRaces: races.length - timedRaces.length,
    raceDays: [...new Set(races.map(x => x.r.date))].sort(),
    raceDaysWithObservedWind: [...new Set(races.filter(x => x.r.realDay?.windObserved).map(x => x.r.date))].sort(),
    racesWithStartTime: races.filter(x => x.r.start).length,
    racesInsideWindWindow: races.filter(x => x.r.realDay?.raceInsideWindow).length,
    withCourseNumber: races.filter(x => x.r.course).length,
    gatedEvents: data.gated?.length ?? 0,
  };

  data.calibration = { computed: new Date().toISOString().slice(0, 10), coverage, spread, consistency, wind, gaps };
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(await readFile(FILE, 'utf8'));
  const real = JSON.parse(await readFile(REAL, 'utf8'));
  for (const e of data.events) for (const r of e.races) { delete r.realDay; delete r.spread; }
  await writeFile(FILE, JSON.stringify(analyse(data, real), null, 1) + '\n');
  console.log(JSON.stringify(data.calibration, (k, v) => (k === 'boats' || k === 'skippers' || k === 'races' && Array.isArray(v)) ? v.slice(0, 12) : v, 1));
}
