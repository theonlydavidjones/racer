// Rule 20 (RRS 2025–2028) at every obstruction, not just the Cityfront shore: Alcatraz, Angel Island, the Marin shore,
// Treasure Island and the Wharf's piers.
//   20.1 "A boat may hail for room to tack and avoid a boat on the same tack by hailing 'Room to tack'. However, she
//   shall not hail unless (a) she is approaching an obstruction and will soon need to make a substantial course change
//   to avoid it safely, and (b) she is sailing close-hauled or above. In addition, she shall not hail if the obstruction
//   is a mark and a boat that is fetching it would be required to change course as a result of the hail."
//
//      ↑ wind                       ░░ the obstruction ░░
//                                          ↖
//            Blue (windward, same tack) ↖   ↖ Red, close-hauled, about to hit it: "Room to tack!"
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import ss41 from '../src/courses/data/seaweed-soup-2026-course41.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, n360, type Vec } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { WHARF, onLand } from '../src/geo/shore';
import { inBasin } from '../src/geo/marina';
import { beatAngle } from '../src/boat/polar';
import { SUBSTANTIAL_TURN, hailRange, obstructionAhead } from '../src/sim/obstruction';
import { begunTack } from '../src/rules/pairs';
import { rightOfWay, newPairRecord, hailBreach } from '../src/rules';
import { boat, WIND } from './diagram';

const SS2 = ss2 as unknown as CourseFile, SS41 = ss41 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', current: 'slack', fleet: 1, ...o });

/** A race under way, you and one AI boat (Red), both started on leg 0. */
function race(file = SS2) {
  const w = new World(file, settings(), 4);
  w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
  w.step(DT);
  return { w, u: w.user, red: w.boats[1] };
}
/** Put a boat at p, close-hauled on `tack`, sailing at 2.4 m/s. */
function sail(w: World, b: World['boats'][number], p: Vec, tack: 'S' | 'P') {
  const beat = beatAngle(w.wind.kt), h = n360(tack === 'S' ? w.wind.from - beat : w.wind.from + beat);
  Object.assign(b, { x: p.x, y: p.y, h, desired: h, v: 2.4, tack, tacking: false, twa: beat, ww: { from: w.wind.from, kt: w.wind.kt }, lastTackT: -999, turnTarget: null });
  return h;
}
/**
 * Near `seed`, a spot in open water where a boat close-hauled on `tack` meets the obstruction squarely, 25–35 m ahead
 * (land there, on onLand's own say, and still land if she bore away a little more than SUBSTANTIAL_TURN), with water 9 m to windward of her for Blue.
 */
function pinnedSpot(w: World, seed: Vec, tack: 'S' | 'P'): Vec | null {
  const beat = beatAngle(w.wind.kt), h = tack === 'S' ? w.wind.from - beat : w.wind.from + beat, u = V(h), wv = V(w.wind.from);
  const away = V(h + (tack === 'S' ? -SUBSTANTIAL_TURN - 5 : SUBSTANTIAL_TURN + 5));
  for (let r = 0; r < 900; r += 10) for (let k = 0; k < 36; k++) {
    const p = { x: seed.x + Math.sin(k * Math.PI / 18) * r, y: seed.y + Math.cos(k * Math.PI / 18) * r };
    const firstLand = (v: Vec, L: number) => { for (let s = 0; s <= L; s += 0.5) if (onLand({ x: p.x + v.x * s, y: p.y + v.y * s })) return s; return Infinity; };
    const d = firstLand(u, 40);
    if (d < 25 || d > 35 || inBasin(p)) continue;
    if (firstLand(away, 60) > 60) continue; // squarely: a small bear-away wouldn't clear it either
    const blue = { x: p.x + wv.x * 9, y: p.y + wv.y * 9 };
    if (onLand(blue) || firstLand(V(h), 0) === 0) continue;
    return p;
  }
  return null;
}

const PLACES: [string, Vec, 'S' | 'P'][] = [
  ['Alcatraz', LL(37.8267, -122.4230), 'S'],
  ['Angel Island', LL(37.8560, -122.4320), 'S'],
  ['the Marin shore (Yellow Bluff)', LL(37.8360, -122.4720), 'P'],
  ['Treasure Island', LL(37.8240, -122.3720), 'S'],
  ['the Wharf (Pier 39\'s breakwater and Pier 41)', LL(37.8105, -122.4130), 'S']
];

describe('Rule 20 at every obstruction (the islands, the Marin shore, the Wharf)', () => {
  for (const [name, seed, tack] of PLACES) {
    it(`${name}: pinned close-hauled with a boat to windward, you may hail; your "Room to tack!" goes to her, and she must respond`, () => {
      const { w, u, red } = race();
      const p = pinnedSpot(w, seed, tack);
      expect(p, `a spot pinned against ${name}`).not.toBeNull();
      const wv = V(w.wind.from);
      sail(w, u, p!, tack); sail(w, red, { x: p!.x + wv.x * 9, y: p!.y + wv.y * 9 }, tack);
      w.pairs = {};
      expect(obstructionAhead(u, u.h, u.tack, hailRange(u.v)), 'Rule 20.1(a)').not.toBeNull();
      expect(w.roomBlocker(u)).toBe(red);
      w.userHail();
      const h = w.pairRecord(u, red)?.hail;
      expect(h).toMatchObject({ by: u.id, kind: 'room' });
      // she answers it: an AI boat beside you tacks (or, clear ahead, replies "You tack")
      let answered = false;
      for (let i = 0; i < 60 * 6 && !answered; i++) { w.step(DT); const r = w.pairRecord(u, red)?.hail; answered = !r || r.respondedAt != null || red.tacking || red.lastTackT >= h!.at; }
      expect(answered).toBe(true);
    });
  }

  it('an AI boat pinned against Alcatraz hails you; ignore it and you foul Rule 20', () => {
    const { w, u, red } = race();
    const p = pinnedSpot(w, PLACES[0][1], 'S')!, wv = V(w.wind.from);
    sail(w, red, p, 'S'); sail(w, u, { x: p.x + wv.x * 9, y: p.y + wv.y * 9 }, 'S');
    red.lastTackT = w.t - 3; w.pairs = {};
    let hailed = false, foul: string | null = null;
    for (let i = 0; i < 60 * 12 && !foul; i++) {
      w.step(DT);
      if (w.pairRecord(u, red)?.hail?.by === red.id) hailed = true;
      for (const e of w.drainEvents()) if (e.type === 'incident') foul = e.incident.rule;
    }
    expect(hailed).toBe(true);
    expect(foul).toBe('20');
  });

  it('not yet "soon": 150 m off Angel Island there is nothing to hail (20.1(a))', () => {
    const { w, u, red } = race();
    const beat = beatAngle(w.wind.kt), h = w.wind.from - beat, uh = V(h), wv = V(w.wind.from), seed = PLACES[1][1];
    let p: Vec | null = null;
    search: for (let r = 0; r < 1500; r += 10) for (let k = 0; k < 36; k++) {
      const q = { x: seed.x + Math.sin(k * Math.PI / 18) * r, y: seed.y + Math.cos(k * Math.PI / 18) * r };
      let d = Infinity; for (let s = 0; s <= 170; s += 0.5) if (onLand({ x: q.x + uh.x * s, y: q.y + uh.y * s })) { d = s; break; }
      if (d < 140 || d > 160) continue;
      let open = true; for (let a = 0; a < 360 && open; a += 10) for (let s = 0; s <= 60 && open; s += 2) if (onLand({ x: q.x + Math.sin(a * Math.PI / 180) * s, y: q.y + Math.cos(a * Math.PI / 180) * s })) open = false;
      if (open) { p = q; break search; }
    }
    expect(p).not.toBeNull();
    sail(w, u, p!, 'S'); sail(w, red, { x: p!.x + wv.x * 9, y: p!.y + wv.y * 9 }, 'S');
    w.pairs = {};
    expect(w.tackBlocker(u)).toBe(red);
    expect(w.roomBlocker(u)).toBeNull();
    w.drainEvents(); w.userHail();
    expect(w.pairRecord(u, red)?.hail ?? null).toBeNull();
    const toast = w.drainEvents().find(e => e.type === 'toast');
    expect(toast && 'msg' in toast ? toast.msg : '').toMatch(/Not yet.*20\.1\(a\)/);
  });

  it('not close-hauled: reaching onto Alcatraz, she may not hail (20.1(b))', () => {
    const { w, u, red } = race();
    const p = pinnedSpot(w, PLACES[0][1], 'S')!, wv = V(w.wind.from);
    sail(w, u, p, 'S'); sail(w, red, { x: p.x + wv.x * 9, y: p.y + wv.y * 9 }, 'S');
    u.twa = 90;
    expect(w.roomBlocker(u)).toBeNull();
  });

  it('a pier head she can clear by bearing away 10° is no reason to hail: only a substantial course change is (20.1(a))', () => {
    // aimed at the end of one of the Wharf's piers so that the pier is dead ahead, but SUBSTANTIAL_TURN lower clears all of it
    const { w } = race();
    const beat = beatAngle(w.wind.kt);
    let found = 0;
    for (const L of WHARF.lines) {
      if (found >= 3) break;
      const tip = L.pts[L.pts.length - 1];
      for (const tack of ['S', 'P'] as const) {
        const h = tack === 'S' ? w.wind.from - beat : w.wind.from + beat, u = V(h), away = V(h + (tack === 'S' ? -SUBSTANTIAL_TURN : SUBSTANTIAL_TURN));
        const p = { x: tip.x - u.x * 30, y: tip.y - u.y * 30 };
        const clear = (v: Vec, len: number, side: number) => { const n = { x: v.y, y: -v.x }; for (let s = 0; s <= len; s += 0.25) if (onLand({ x: p.x + v.x * s + n.x * side, y: p.y + v.y * s + n.y * side })) return false; return true; };
        if (onLand(p) || clear(u, 40, 0)) continue; // the pier really is ahead
        if (![-1.8, 0, 1.8].every(k => clear(away, 4 * hailRange(2.4), k))) continue; // and that much lower clears it all
        found++;
        expect(obstructionAhead(p, h, tack, hailRange(2.4)), `${L.name ?? L.kind}`).toBeNull();
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('Alcatraz as the mark (course 41): she may not hail a boat that is fetching it (20.1, last sentence), but may one that is not', () => {
    const { w, u, red } = race(SS41);
    const m = w.C.marks[0], R = Math.max(...m.reach!) + 300, wv = V(w.wind.from);
    expect(m.reach).toBeDefined();
    let fetchingCase = 0, notFetchingCase = 0;
    for (const tack of ['S', 'P'] as const) {
      const beat = beatAngle(w.wind.kt), h = tack === 'S' ? w.wind.from - beat : w.wind.from + beat, uh = V(h), n = { x: uh.y, y: -uh.x };
      // rays along her close-hauled course, side by side across the island: where they start to hit it
      const hitAt = (c: number) => { const o = { x: m.p.x - uh.x * R + n.x * c, y: m.p.y - uh.y * R + n.y * c }; for (let s = 0; s < 2 * R; s += 0.5) if (onLand({ x: o.x + uh.x * s, y: o.y + uh.y * s })) return { o, s }; return null; };
      let prev = hitAt(-R);
      for (let c = -R + 1; c <= R; c += 1) {
        const cur = hitAt(c);
        if (!!cur !== !!prev) {
          // an edge of the island, seen along her course: Red on the side that hits it, 25 m short of its shore; Blue 9 m to windward
          for (const off of [-3, -1.5, 0, 1.5, 3]) {
            const hit = hitAt(cur ? c + off : c - 1 + off); if (!hit) continue;
            const p = { x: hit.o.x + uh.x * (hit.s - 25), y: hit.o.y + uh.y * (hit.s - 25) }, q = { x: p.x + wv.x * 9, y: p.y + wv.y * 9 };
            if (onLand(p) || onLand(q)) continue;
            sail(w, u, p, tack); sail(w, red, q, tack); w.pairs = {};
            if (!obstructionAhead(u, u.h, u.tack, hailRange(u.v)) || w.tackBlocker(u) !== red) continue;
            if (w.fetchingIsland(red, m)) { fetchingCase++; expect(w.roomBlocker(u), `${tack} ${c}`).toBeNull(); }
            else { notFetchingCase++; expect(w.roomBlocker(u), `${tack} ${c}`).toBe(red); }
          }
        }
        prev = cur;
      }
    }
    expect(fetchingCase).toBeGreaterThan(0);
    expect(notFetchingCase).toBeGreaterThan(0);
  });
});

describe('Rule 20.2(e): while a hail for room to tack is under way, rule 18.2 does not apply between the two boats', () => {
  //   ↑ wind     (mark M to port, Blue inside and overlapped, both in the zone)
  it('mark-room gives way to the hail until the hailing boat has tacked', () => {
    const M = { name: 'M', p: { x: 0, y: 0 }, type: 'round' as const, side: 'p' as const, beat: true };
    const ctx = { t: 50, windFrom: WIND, marks: [M], beat: 42 };
    const red = boat('Red', { at: [-12, -10], heading: 315 }), blue = boat('Blue', { at: [-6, -16], heading: 315 });
    const rec = newPairRecord();
    rec.mark = { idx: 0, overlapped: true, inside: blue.id, tackT: -999 };
    expect(rightOfWay(red, blue, ctx, rec).rule).toBe('18.2(a)');
    rec.hail = { by: blue.id, at: 49, kind: 'room' };
    expect(rightOfWay(red, blue, ctx, rec).rule).not.toBe('18.2(a)');
  });
});

describe('Rule 20.2(c): the hailed boat responds by starting to tack, however slow she is', () => {
  //   "the hailed boat shall respond either by tacking as soon as possible, or by immediately replying 'You tack'"
  // A boat slowed in dirty air turns slowly (her rudder needs water over it): the response is putting the helm down, not
  // getting through head to wind within the 5 s allowed (rules/pairs.ts TACK_BEGUN).
  it('turned up 15° from her heading at the hail, she has responded; drifting a few degrees in the sea, she has not', () => {
    const hailed = { id: 1, h: 315, lastTackT: -999, tacking: false, ww: { from: 0 } } as Parameters<typeof begunTack>[0];
    const h = { at: 50, headAt: { 1: { h: 315, wind: 0 } } };
    expect(begunTack(hailed, h, 0)).toBe(false);
    hailed.h = 322; expect(begunTack(hailed, h, 0)).toBe(false); // 7° up: the sea knocks her about this much
    hailed.h = 331; expect(begunTack(hailed, h, 0)).toBe(true);
    hailed.h = 300; expect(begunTack(hailed, h, 0)).toBe(false); // bearing away is no tack
    expect(begunTack({ ...hailed, h: 331 }, { at: 50 }, 0)).toBe(false); // heading at the hail unknown: only head to wind counts
  });
  it('her response starts the clock on nothing: the hailing boat\'s 5 s (20.2(d)) run from when she is through the wind', () => {
    const mk = (id: number, h: number) => ({ id, h, x: 0, y: 0, vx: 0, vy: 0, tack: 'S' as const, tacking: false, lastTackT: -999, penalty: 0, ocs: false, started: true, leg: 0, ww: { from: 0 } });
    const L = mk(0, 315), M = mk(1, 315), rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', headAt: { 0: { h: 315, wind: 0 }, 1: { h: 315, wind: 0 } } };
    M.h = 335; expect(hailBreach(rec, L, M, 52, 0)).toBeNull();
    expect(rec.hail.respondedAt).toBe(52); expect(rec.hail.clearAt).toBeUndefined();
    expect(hailBreach(rec, L, M, 58, 0)).toBeNull(); // L waits for her: M still swinging through the wind
    M.lastTackT = 59; M.tacking = true; M.tack = 'P' as never;
    expect(hailBreach(rec, L, M, 59, 0)).toBeNull(); expect(rec.hail.clearAt).toBe(59);
    expect(hailBreach(rec, L, M, 64.5, 0)).toMatchObject({ boat: L, role: 'hailer' });
  });
  it('begun but never through the wind is no response', () => {
    const mk = (id: number, h: number) => ({ id, h, x: 0, y: 0, vx: 0, vy: 0, tack: 'S' as const, tacking: false, lastTackT: -999, penalty: 0, ocs: false, started: true, leg: 0, ww: { from: 0 } });
    const L = mk(0, 315), M = mk(1, 335), rec = newPairRecord();
    rec.hail = { by: L.id, at: 50, kind: 'room', headAt: { 0: { h: 315, wind: 0 }, 1: { h: 315, wind: 0 } } };
    expect(hailBreach(rec, L, M, 51, 0)).toBeNull();
    expect(hailBreach(rec, L, M, 66.5, 0)).toMatchObject({ boat: M, role: 'hailed' });
  });
  const mk = (id: number, h: number) => ({ id, h, x: 0, y: 0, vx: 0, vy: 0, tack: 'S' as 'S' | 'P', tacking: false, lastTackT: -999, penalty: 0, ocs: false, started: true, leg: 0, ww: { from: 0 } });
  const hail = (o: Partial<NonNullable<ReturnType<typeof newPairRecord>['hail']>> = {}) => {
    const rec = newPairRecord(); rec.hail = { by: 0, at: 50, kind: 'room', headAt: { 0: { h: 315, wind: 0 }, 1: { h: 315, wind: 0 } }, ...o }; return rec;
  };
  it('the hailing boat may not luff 15° and hold it: she too must go through the wind (20.2(d))', () => {
    const L = mk(0, 315), M = mk(1, 315), rec = hail({ replyAt: 51 });
    expect(hailBreach(rec, L, M, 52, 0)).toBeNull();
    L.h = 335; expect(hailBreach(rec, L, M, 54, 0)).toBeNull(); // she luffs within the 5 s
    expect(hailBreach(rec, L, M, 68, 0)).toBeNull();
    expect(hailBreach(rec, L, M, 69.5, 0)).toMatchObject({ boat: L, role: 'hailer' }); // and holds it, never tacking
  });
  it('the hailed boat that luffs and bears away again has not responded', () => {
    const L = mk(0, 315), M = mk(1, 335), rec = hail();
    expect(hailBreach(rec, L, M, 51, 0)).toBeNull();
    M.h = 312; expect(hailBreach(rec, L, M, 52, 0)).toBeNull();
    expect(rec.hail!.respondedAt).toBeUndefined();
    expect(hailBreach(rec, L, M, 55.5, 0)).toMatchObject({ boat: M, role: 'hailed' });
  });
  it('a lift after the hail, or coming up from footing to close-hauled, is not beginning to tack', () => {
    const M = mk(1, 330); M.ww.from = 15; // the wind lifted her 15° and she followed it
    expect(begunTack(M, { at: 50, headAt: { 1: { h: 315, wind: 0 } } }, 0)).toBe(false);
    const F = mk(1, 318); // footing at 60° when hailed, now close-hauled at 42°
    expect(begunTack(F, { at: 50, headAt: { 1: { h: 300, wind: 0 } } }, 0)).toBe(false);
  });
  it('20.3: luffing first and then passing the hail on, she waits for the boat to windward without breach', () => {
    const L = mk(0, 315), M = mk(1, 333), rec = hail();
    expect(hailBreach(rec, L, M, 51, 0)).toBeNull(); // she's begun
    rec.hail!.passedOn = { to: 2, at: 51.5 }; // then sees W to windward and passes it on
    expect(hailBreach(rec, L, M, 70, 0)).toBeNull(); // W not through yet: M can't tack
    rec.hail!.passedOn.respondedAt = 71;
    expect(hailBreach(rec, L, M, 85, 0)).toBeNull();
    expect(hailBreach(rec, L, M, 86.5, 0)).toMatchObject({ boat: M, role: 'hailed' }); // 15 s from W through, still not
  });
  for (const [name, seed] of [PLACES[0], PLACES[3]] as const) for (const v0 of [0.9, 2.4]) {
    it(`two AI boats off ${name}, the hailed one at ${v0} m/s: both tack and stay tacked`, () => {
      const w = new World(SS2, settings({ fleet: 2 }), 4);
      w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
      w.step(DT);
      const [u, red, blue] = w.boats, p = pinnedSpot(w, seed, 'S')!, wv = V(w.wind.from);
      u.x += 3000;
      sail(w, red, p, 'S'); sail(w, blue, { x: p.x + wv.x * 9, y: p.y + wv.y * 9 }, 'S'); blue.v = v0;
      w.pairs = {};
      w.hail(red, blue, 'room');
      const at = w.t;
      for (let i = 0; i < 60 * 20; i++) w.step(DT);
      for (const b of [red, blue]) {
        expect(b.lastTackT, `${b.name} tacked`).toBeGreaterThan(at);
        expect(b.tack, `${b.name} on port`).toBe('P');
      }
    });
  }
  for (const v0 of [0.9, 1.4, 1.9]) {
    it(`an AI boat sailing ${v0} m/s, hailed off Alcatraz, tacks through the wind and is not in breach`, () => {
      const { w, u, red } = race();
      const p = pinnedSpot(w, PLACES[0][1], 'S')!, wv = V(w.wind.from);
      sail(w, u, p, 'S'); sail(w, red, { x: p.x + wv.x * 9, y: p.y + wv.y * 9 }, 'S'); red.v = v0;
      w.pairs = {};
      w.userHail();
      const at = w.t;
      let responded = NaN, redFoul = false;
      for (let i = 0; i < 60 * 9; i++) {
        w.step(DT);
        const h = w.pairRecord(u, red)?.hail;
        if (isNaN(responded) && h?.respondedAt != null) responded = h.respondedAt - at;
        for (const e of w.drainEvents()) if (e.type === 'incident' && e.incident.fouler === red) redFoul = true;
      }
      expect(responded, 'she put her helm down within the 5 s').toBeLessThan(5);
      expect(red.tack, 'through the wind onto port, not gybed round').toBe('P');
      expect(red.lastTackT).toBeGreaterThan(at);
      expect(redFoul).toBe(false);
    });
  }
});
