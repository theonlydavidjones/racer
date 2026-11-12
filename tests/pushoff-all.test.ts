import { describe, expect, it } from 'vitest';
import { HARBORS, NO_WAY_OUT, SLIPS, berthClear, harborAt, hitsHarbor, inBasin, pushOffPlan, pushOffPoses, slipsIn, type Slip } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';

/**
 * Push off from every berth in every marina (geo/marina.ts pushOffPlan): the slow test (all ~1,400 berths planned and
 * checked), so it's in npm test but not test:fast.
 */
describe('push off, every berth in every marina (the slow one: npm test, not test:fast)', () => {
  it('push off, from every berth in every marina: in the fairway, clear of the docks and the boats, pointed at a way out, free to steer out', () => {
    let allToward = 0, all = 0, allSwung = 0, allBowIn = 0; const trapped: string[] = [];
    for (const H of HARBORS) {
      if (!slipsIn(H.id).length) continue; // (a harbor with no berths yet: the East Bay's, water and docks only)
      // where a Folkboat can steer to the way out from: a flood from the harbor's exits over water with room for her beam
      const step = 1.5, key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
      const roomy = (q: { x: number; y: number }) => [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]].every(([dx, dy]) => !onLand({ x: q.x + dx, y: q.y + dy }));
      // (from the basin's roomy water nearest each way out, over the basin's water)
      const seen = new Map<string, number>(); let fr: { x: number; y: number }[] = [], n = 0;
      for (const e of H.exits) {
        let best: { x: number; y: number } | null = null;
        for (let x = Math.round(H.box.x0 / step) * step; x <= H.box.x1; x += step) for (let y = Math.round(H.box.y0 / step) * step; y <= H.box.y1; y += step)
          if (harborAt({ x, y }) === H && roomy({ x, y }) && (!best || Math.hypot(x - e.x, y - e.y) < Math.hypot(best.x - e.x, best.y - e.y))) best = { x, y };
        if (best) { seen.set(key(best), 0); fr.push(best); }
      }
      while (fr.length) { n++;
        const nx: typeof fr = [];
        for (const p of fr) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
          if (seen.has(k) || harborAt(q) !== H || !roomy(q)) continue;
          seen.set(k, n); nx.push(q);
        }
        fr = nx;
      }
      // how far she'd have to go from here to the way out, along the water (steps of 1.5 m); Infinity if she can't
      const togo = (q: { x: number; y: number }) => { const g = { x: Math.round(q.x / step) * step, y: Math.round(q.y / step) * step }; return Math.min(...[[0, 0], [step, 0], [-step, 0], [0, step], [0, -step]].map(([dx, dy]) => seen.get(key({ x: g.x + dx, y: g.y + dy })) ?? Infinity)); };
      // (an independent check, not the planner's berthClear: her hull every 0.35 m against the docks, and against the boats
      // moored in the other slips as render/marina.ts draws them at their longest)
      const drawn = slipsIn(H.id).map(o => { const len = o.kind === 'alongside' ? 7 : Math.min(13, Math.max(7, o.finger * 1.05)); return { o, len, u: { x: Math.sin(o.heading * Math.PI / 180), y: Math.cos(o.heading * Math.PI / 180) } }; });
      const hullFree = (c: { x: number; y: number }, h: number, s: Slip) => {
        const u = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) }, n = { x: u.y, y: -u.x };
        const near = drawn.filter(d => d.o !== s && Math.hypot(d.o.p.x - c.x, d.o.p.y - c.y) < 12);
        for (let a = -3.8; a <= 3.8; a += 0.35) for (let b = -1.1; b <= 1.1; b += 0.35) {
          const q = { x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b };
          if (hitsHarbor(q) || !inBasin(q)) return false;
          for (const d of near) { const dx = q.x - d.o.p.x, dy = q.y - d.o.p.y; if (Math.abs(dx * d.u.x + dy * d.u.y) < d.len / 2 && Math.abs(dx * d.u.y - dy * d.u.x) < 0.17 * d.len) return false; }
        }
        return true;
      };
      let good = 0, exitward = 0, swung = 0; const slips = slipsIn(H.id), bad: string[] = [];
      for (const s of slips) {
        const p = pushOffPlan(s), poses = pushOffPoses(s, p), { c, h } = poses[poses.length - 1];
        // every pose on the way clear of every dock and of the boats in the other slips (as drawn)
        let ok = poses.every(q => berthClear(q.c, q.h, s)) && poses.filter((_, i) => i >= poses.length - 8 || i % 4 === 0).every(q => hullFree(q.c, q.h, s));
        if (p.kind !== 'off') ok &&= Math.hypot(c.x - s.p.x, c.y - s.p.y) - 0.45 * s.finger >= 3.8 || p.kind === 'swing'; // her whole hull out of the slip
        const v = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) };
        if (p.kind === 'astern') {
          ok &&= Number.isFinite(togo(c)); // shoved off astern: into water she can steer out of, stern first
          ok &&= [1, -1].some(sg => { for (let k = 1; k <= 12; k++) if (!berthClear(c, h + sg * 90 * k / 12, s)) return false; return true; }); // with room to turn her there (else she's not offered: NO_WAY_OUT)
          if (!ok) trapped.push(s.id);
        }
        else {
          ok &&= [2, 4, 6].every(d => berthClear({ x: c.x + v.x * d, y: c.y + v.y * d }, h, s)); // at least a boat's length of clear water ahead
          ok &&= Number.isFinite(togo(c)); // and somewhere she can steer out from
          if (p.kind === 'swing') swung++;
          if (p.kind === 'off' || togo({ x: c.x + v.x * 12, y: c.y + v.y * 12 }) <= togo(c)) exitward++; // (no further from the way out, along the water: where either way round is as far, either will do)
        }
        if (ok) good++; else bad.push(s.label);
      }
      expect(good / slips.length, `${H.id}: ${bad.slice(0, 12).join(' ')}`).toBeGreaterThan(0.97);
      // sprung off and pointed toward the way out (along the water) from most; the rest down open fairway, or shoved off astern
      // (pointed toward the way out where she can be swung that way: in some harbors, Horseshoe Bay's especially, the turn
      // that way doesn't fit from a good many berths, and she's let go pointing down the fairway the other way to be steered round)
      expect(exitward / slips.length, `${H.id}: toward the way out`).toBeGreaterThan(0.6);
      allToward += exitward; all += slips.length;
      const bowIn = slips.filter(s => s.kind === 'bow-in').length;
      if (bowIn) expect(swung / bowIn, `${H.id}: swung out`).toBeGreaterThan(0.6); // (the rest shoved off astern: no room to swing her; a harbor with only berths alongside, Berkeley's guest dock, has none to swing)
      allSwung += swung; allBowIn += slips.filter(s => s.kind === 'bow-in').length;
    }
    expect(allToward / all, 'all the marinas: toward the way out').toBeGreaterThan(0.85);
    expect(allSwung / allBowIn, 'all the marinas: swung out').toBeGreaterThan(0.85);
    expect(trapped, 'berths she\'d be shoved off astern into a corner from: add them to NO_WAY_OUT (geo/marina.ts)').toEqual([]);
    for (const id of NO_WAY_OUT) expect(SLIPS.some(s => s.id === id)).toBe(false);
  }, 300000);
});
