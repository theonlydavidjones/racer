// The navigator takes her home (the owner, 15 Nov 2026: "navigator just cannot take her home to her slip"), as a real
// tiller pilot would (the owner's ruling, 17 Nov 2026, after the physics review): on Nav it steers her to her harbor's
// mouth and stands by there, while she's still outside, for her to be slowed and brought in along the fairways by hand.
// Steered in on it before, she hit docks on the turns, gave up mid-harbor, and was handed over seconds from a dock.
import { describe, expect, it } from 'vitest';
import { HARBORS, SLIPS, harborAt, harborRoute, hitsHarbor, hitsMooredBoat, slipById, type Slip } from '../src/geo/marina';
import { landAlong, onLand } from '../src/geo/shore';
import { landDist } from '../src/sim/routing';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { engage } from '../src/boat/autopilot';
import { HALF } from '../src/core/math';

type P = { x: number; y: number };
/** Her hull's outline, sampled: the bow, the stern, and both sides at her quarters, middle and shoulders. */
function hull(u: { x: number; y: number; h: number }): P[] {
  const a = u.h * Math.PI / 180, f = { x: Math.sin(a), y: Math.cos(a) }, s = { x: f.y, y: -f.x }, out: P[] = [];
  for (const [al, ac] of [[HALF, 0], [-HALF, 0], [2, 1.05], [2, -1.05], [0, 1.1], [0, -1.1], [-2.5, 1.0], [-2.5, -1.0]]) out.push({ x: u.x + f.x * al + s.x * ac, y: u.y + f.y * al + s.y * ac });
  return out;
}
const solid = (q: P) => hitsHarbor(q) || hitsMooredBoat(q) || onLand(q);
/** The sim's own word of a touch (piles stop her before a hull sample's inside them: the review, 18 Nov 2026). */
const BUMP = /Damage|Collision|hit the piles|Set onto|aground/i;
function world(s: Slip, kt = 6, from = 270): World {
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: from, mode: 'sail', sailFrom: 'cityfront', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); w.drainEvents();
  return w;
}
/** Starts off her harbor's mouth: `off` m out on open water with a clear line in by the pilot's own look (landAlong), at
 * bearings at least 60 degrees apart, every such one: not only clear lanes (the second review: off Corinthian a start
 * whose line in brushed something solid was where she touched). */
function starts(mouth: P, off: number, n: number): P[] {
  const ok: { q: P; b: number }[] = [];
  for (let b = 0; b < 360; b += 5) {
    const t = b * Math.PI / 180, q = { x: mouth.x + Math.sin(t) * off, y: mouth.y + Math.cos(t) * off };
    if (onLand(q) || harborAt(q) || landDist(q) < 15 || landAlong(q, mouth) !== Infinity || hull({ ...q, h: b + 180 }).some(solid)) continue;
    if (ok.every(o => Math.abs(((o.b - b + 540) % 360) - 180) >= 60)) ok.push({ q, b });
  }
  return ok.slice(0, n).map(o => o.q);
}
function sail(w: World, o: P, to: P, motor: boolean, secs = 300, throttle = 0.5) {
  const u = w.user;
  Object.assign(u, { docked: undefined, x: o.x, y: o.y, h: (Math.atan2(to.x - o.x, to.y - o.y) * 180 / Math.PI + 360) % 360, v: 1, astern: 0, sway: 0, turnRate: 0 });
  if (motor) { u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; u.motor = { hp: 6, down: true, running: true, gear: 'F', throttle } as never; }
  engage(u, w.pilot, 'nav'); w.sendHome(); w.drainEvents();
  const hits: string[] = [], said: string[] = []; let t = 0;
  for (; t < secs && w.pilot.mode === 'nav'; t += DT) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.type === 'toast') { said.push(e.msg); if (!hits.length && BUMP.test(e.msg)) hits.push(`"${e.msg}" at ${t.toFixed(1)} s`); }
    if (!hits.length && hull(u).some(solid)) hits.push(`her hull on something at ${t.toFixed(1)} s, ${Math.round(u.x)},${Math.round(u.y)}`);
  }
  return { hits, said, t, pilot: w.pilot.mode };
}

// a sample of every harbor's slips (every 40th), and three the review found her hitting the dock or breakwater at
const SAMPLE = [...HARBORS.flatMap(H => SLIPS.filter(s => s.marina === H.id).filter((_, i) => i % 40 === 0).slice(0, 2)),
  ...['horseshoe-bay:A30', 'south-beach:G8', 'richmond-yc:E48'].map(id => slipById(id)).filter((s): s is Slip => !!s)];

describe('the navigator takes her home to her harbor\'s mouth, and hands her over there', () => {
  it('under power, from two directions off every harbor: her hull touches nothing, and the pilot stands by outside, with time and room to slow her', () => {
    const bad: string[] = []; let runs = 0;
    for (const s of SAMPLE) {
      const r = harborRoute(s), H = HARBORS.find(h => h.id === s.marina)!;
      const mouth = r?.mouth ?? H.exits[0], w = world(s);
      for (const o of starts(mouth, 160, 3)) for (const throttle of [0.5, 0.12]) {
        runs++;
        const run = sail(w, o, mouth, true, 300, throttle), u = w.user, at = `${s.id} from ${Math.round(o.x)},${Math.round(o.y)} at ${throttle} throttle`;
        if (run.hits.length) bad.push(`${at}: ${run.hits[0]}`);
        // (handed over at the mouth, or sooner with something solid in her lane; or the pilot's own alarm, standing by)
        if (run.pilot !== 'off' || !run.said.some(m => /(At the harbor mouth|Something ahead of her): she's yours|Pilot alarm/.test(m))) { bad.push(`${at}: no hand-over in ${run.t.toFixed(0)} s (${run.said.join(' | ')})`); continue; }
        // (handed over at the mouth, with 15 s of clear water straight ahead at her speed to throttle back in)
        const a = u.h * Math.PI / 180, ahead = Math.max(20, u.v * 15);
        for (let k = 1; k <= 10; k++) { const q = { x: u.x + Math.sin(a) * ahead * k / 10, y: u.y + Math.cos(a) * ahead * k / 10 }; if (hull({ ...q, h: u.h }).some(solid)) { bad.push(`${at}: handed over ${(ahead * k / 10).toFixed(0)} m from something ahead at ${u.v.toFixed(1)} m/s`); break; } }
      }
    }
    expect(runs).toBeGreaterThanOrEqual(4 * SAMPLE.length);
    expect(bad).toEqual([]);
  }, 600_000);

  it('off Corinthian from the southwest, slow: where her lane in brushes something solid, she\'s handed over before it, with the water clear ahead (the second review\'s cases)', () => {
    const s = SLIPS.find(q => q.marina === 'corinthian' && q.kind === 'bow-in')!, r = harborRoute(s)!, bad: string[] = [];
    for (const b of [200, 210, 220]) for (const throttle of [0.12, 0.25, 0.5]) {
      const t = b * Math.PI / 180, o = { x: r.mouth.x + Math.sin(t) * 300, y: r.mouth.y + Math.cos(t) * 300 }, w = world(s), u = w.user;
      const run = sail(w, o, r.mouth, true, 400, throttle), at = `from ${b} at ${throttle}`;
      if (run.hits.length) bad.push(`${at}: ${run.hits[0]}`);
      if (run.pilot !== 'off') { bad.push(`${at}: no hand-over`); continue; }
      const a = u.h * Math.PI / 180, ahead = Math.max(20, u.v * 15);
      for (let k = 1; k <= 10; k++) { const q = { x: u.x + Math.sin(a) * ahead * k / 10, y: u.y + Math.cos(a) * ahead * k / 10 }; if (hull({ ...q, h: u.h }).some(solid)) { bad.push(`${at}: handed over ${(ahead * k / 10).toFixed(0)} m from something ahead`); break; } }
    }
    expect(bad).toEqual([]);
  }, 300_000);

  it('the same race sailed twice goes the same way: at South Beach, with two entrances, from a fresh world each time', () => {
    const s = slipById('south-beach:C1')!, r = harborRoute(s)!, [o] = starts(r.mouth, 300, 1), ends: string[] = [];
    for (let k = 0; k < 2; k++) { const w = world(s); sail(w, o, r.mouth, true, 60); ends.push(`${w.user.x.toFixed(6)},${w.user.y.toFixed(6)},${w.user.h.toFixed(6)}`); }
    expect(ends[1]).toBe(ends[0]);
  }, 120_000);

  it('already in her harbor, sent home on Nav: the pilot stands by at once and she\'s steered nowhere', () => {
    const s = slipById('gashouse-cove:572')!, w = world(s), r = harborRoute(s)!, u = w.user;
    const p = r.path[Math.floor(r.path.length / 2)]; // (in the fairways, on her way in)
    const run = sail(w, p, r.approach, true, 2);
    expect(run.said.some(m => /In the harbor: she's yours/.test(m))).toBe(true);
    expect(run.pilot).toBe('off'); expect(run.hits).toEqual([]);
    expect(Math.hypot(u.x - p.x, u.y - p.y)).toBeLessThan(6);
  });

  it('Nav home twice: handed over off the mouth, taken back out, and on Nav again, it steers her home again', () => {
    const s = slipById('gashouse-cove:572')!, w = world(s), r = harborRoute(s)!;
    const [o] = starts(r.mouth, 160, 1);
    expect(sail(w, o, r.mouth, true).pilot).toBe('off');
    const again = sail(w, o, r.mouth, true);
    expect(again.t, 'it steered her in again before handing over').toBeGreaterThan(10);
    expect(again.said.some(m => /At the harbor mouth: she's yours/.test(m))).toBe(true);
  }, 120_000);

  it('under sail, it hands her over as she comes in sight of the mouth, and says so', () => {
    const s = slipById('gashouse-cove:572')!, w = world(s, 8, 270), r = harborRoute(s)!;
    const [o] = starts(r.mouth, 400, 1);
    const run = sail(w, o, r.mouth, false, 600);
    expect(run.pilot).toBe('off'); expect(run.hits).toEqual([]);
    expect(run.said.some(m => /At the harbor mouth: she's yours/.test(m))).toBe(true);
  }, 120_000);

  it('under sail, in sight of the gap: handed over pointed at it along clear water, and then sailed in touching nothing; or there and then, with the turn in words (the playtest, 18 Nov 2026)', () => {
    // (the playtest, v208: let go 122 m off the Gashouse mouth at 5 kt heading 208°, the gap at 148°; on the breakwater
    // 40 s later. The physics review's cases: off Gashouse from the north and northeast, past the Fort Mason piers, in a
    // westerly, a northerly and a southerly; South Beach's south mouth; West Harbor)
    const at400 = (m: P, b: number): P => ({ x: m.x + Math.sin(b * Math.PI / 180) * 400, y: m.y + Math.cos(b * Math.PI / 180) * 400 });
    const CASES: [Slip, number[]][] = [
      [slipById('gashouse-cove:572')!, [328, 0, 20, 25, 30, 45]], [slipById('gashouse-cove:332')!, [25]],
      [slipById('south-beach:G2') ?? SLIPS.find(q => q.marina === 'south-beach')!, [60, 180]],
      [SLIPS.find(q => q.marina === 'west-harbor')!, []], [slipById('horseshoe-bay:A30')!, []],
    ];
    const bad: string[] = []; let runs = 0, pointed = 0;
    for (const [s, bearings] of CASES) {
      const r = harborRoute(s)!, m = r.mouth;
      const os = [...bearings.map(b => at400(m, b)), ...starts(m, 400, 2)].filter(q => !onLand(q) && !harborAt(q) && landDist(q) >= 15);
      for (const [kt, wind] of [[8, 270], [12, 270], [10, 20], [10, 200]] as const) for (const o of os) {
        const w = world(s, kt, wind), u = w.user, run = sail(w, o, m, false, 900), at = `${s.id} ${kt} kt from ${wind}, start ${Math.round(o.x)},${Math.round(o.y)}`;
        runs++;
        if (run.hits.length) { bad.push(`${at}: under the pilot, ${run.hits[0]}`); continue; }
        const said = run.said.find(q => /At the harbor mouth: she's yours/.test(q)), d0 = Math.hypot(u.x - m.x, u.y - m.y);
        if (!said) { bad.push(`${at}: no hand-over at the mouth in ${run.t.toFixed(0)} s, ${d0.toFixed(0)} m off (${run.said.join(' | ')})`); continue; }
        const gap = (Math.atan2(m.x - u.x, m.y - u.y) * 180 / Math.PI + 360) % 360, off = ((gap - u.h + 540) % 360) - 180;
        // (every hand-over with sea room: 15 s of clear water at her speed on her heading, as under power)
        const a = u.h * Math.PI / 180, room = Math.max(20, u.v * 15);
        for (let k = 1; k <= 10; k++) { const q = { x: u.x + Math.sin(a) * room * k / 10, y: u.y + Math.cos(a) * room * k / 10 }; if (hull({ ...q, h: u.h }).some(solid)) { bad.push(`${at}: "${said}", let go ${(room * k / 10).toFixed(0)} m from something ahead at ${u.v.toFixed(1)} m/s`); break; } }
        if (!/The gap's at \d{3}°, /.test(said)) { bad.push(`${at}: no bearing in "${said}"`); continue; }
        if (!/, ahead\./.test(said)) {
          // (not pointed at it: let go there and then, not steered on in closer, with the turn to her side)
          const turn = /(head up|bear away) to (port|starboard)/.exec(said);
          if (turn && turn[2] !== (off < 0 ? 'port' : 'starboard')) bad.push(`${at}: "${said}", heading ${u.h.toFixed(0)}° with the gap at ${gap.toFixed(0)}°`);
          if (!turn) continue; // (a tack or a jibe onto it, or opening it up first: a sailor's own call from there)
        } else { pointed++; if (Math.abs(off) > 30) { bad.push(`${at}: "ahead", heading ${u.h.toFixed(0)}° with the gap at ${gap.toFixed(0)}°`); continue; } }
        // (then a sailor takes her: her course held 5 s, the time to read it and take the tiller, then the turn it said and
        // steered for the gap by eye, re-aimed each second: she gets within 25 m of it with her hull touching nothing)
        engage(u, w.pilot, 'auto'); let near = false, t = 0, hit = '';
        for (; t < 150 && !near && !hit; t += DT) {
          if (t >= 5 && Math.abs(t % 1) < DT) w.pilot.course = (Math.atan2(m.x - u.x, m.y - u.y) * 180 / Math.PI + 360) % 360;
          w.step(DT); const bump = w.drainEvents().find(e => e.type === 'toast' && BUMP.test((e as { msg: string }).msg));
          if (bump) hit = `"${(bump as { msg: string }).msg}" ${t.toFixed(0)} s on`;
          else if (hull(u).some(solid)) hit = `${t.toFixed(0)} s on, ${Math.round(Math.hypot(u.x - m.x, u.y - m.y))} m from the gap`;
          near = Math.hypot(u.x - m.x, u.y - m.y) < 25;
        }
        if (hit || !near) bad.push(`${at}: "${said}" ${d0.toFixed(0)} m off, sailed for the gap: ${hit ? `hit something ${hit}` : `not there in ${t.toFixed(0)} s`}`);
      }
    }
    expect(runs).toBeGreaterThanOrEqual(30); expect(pointed, 'handed over pointed at it, some of the time').toBeGreaterThan(3);
    expect(bad).toEqual([]);
  }, 1_800_000);

  it('under sail far from home, with land on the bearing to the mouth: the pilot sails her on round it, not standing by (the third review)', () => {
    const s = slipById('gashouse-cove:572')!, r = harborRoute(s)!;
    for (const off of [1500, 2250]) {
      const t = 80 * Math.PI / 180, o = { x: r.mouth.x + Math.sin(t) * off, y: r.mouth.y + Math.cos(t) * off }, w = world(s, 10, 270);
      const run = sail(w, o, r.mouth, false, 60);
      expect(run.said.filter(m => /she's yours/.test(m)), `${off} m out`).toEqual([]);
      expect(run.pilot, `${off} m out`).toBe('nav');
    }
  }, 120_000);

  it('the way in starts in the gap between the breakwater ends, in clear sight of the entrance, and every slip that has one keeps its clear water', () => {
    let routed = 0, none = 0; const bad: string[] = [], missing: string[] = [];
    for (const s of SLIPS) {
      const r = harborRoute(s); if (!r) { none++; missing.push(s.id); continue; } routed++;
      const n = Math.ceil(Math.hypot(r.entry.x - r.mouth.x, r.entry.y - r.mouth.y) / 0.5);
      for (let i = 0; i <= n; i++) { const q = { x: r.mouth.x + (r.entry.x - r.mouth.x) * i / n, y: r.mouth.y + (r.entry.y - r.mouth.y) * i / n }; if (hitsHarbor(q) || hitsMooredBoat(q)) { bad.push(`${s.id}: the entrance to the way in crosses something`); break; } }
    }
    // (West Harbor's data has no entrance of its own: its mouth is the light on the breakwater's end, data/west-harbor.json
    // beacons, which no water inside is in sight of: the way in starts behind it, 86 m in. ROADMAP: its entrance)
    const bySlip = new Map<string, number>(); for (const b of bad) { const h = b.split(':')[0]; bySlip.set(h, (bySlip.get(h) ?? 0) + 1); }
    expect([...bySlip.keys()]).toEqual(bad.length ? ['west-harbor'] : []);
    // (17 Nov 2026: 35 slips had no way in, 23 of them end ties looked for astern along the dock)
    expect(none, missing.join(', ')).toBeLessThanOrEqual(24); expect(routed).toBeGreaterThan(1500);
  }, 600_000);
});
