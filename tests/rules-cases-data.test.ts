// The World Sailing Cases kept as data (src/rules/cases.ts), for the Rules trainer and these tests alike: each one sailed
// through the engine frame by frame, its checks along the way, and its answer.
import { describe, expect, it } from 'vitest';
import { V, wrap } from '../src/core/math';
import { CASES, type RulesCase } from '../src/rules/cases';
import { rightOfWay } from '../src/rules';
import { WIND, boat, ctx, pair, type DiagramBoat } from './diagram';

/** Sail a Case: the engine's verdicts at each frame, and its first incident (or none). */
export function sailCase(c: RulesCase) {
  const bs = new Map<string, DiagramBoat>(c.boats.map(b => { const f = b.frames[0]; return [b.letter, boat(b.letter, { at: [f.x, f.y], heading: f.h, started: b.started, leg: b.leg, speed: f.v })]; }));
  const fleet = [...bs.values()];
  const extra = { ...(c.fleet ? { fleet, keepsClearOf: (a: DiagramBoat, o: DiagramBoat) => rightOfWay(a, o, ctx(0)).kc.id === a.id } : {}), ...(c.bank ? { obstacle: () => ({ d: c.bank!.d, n: c.bank!.n, continuing: true }) } : {}) };
  const p = pair(bs.get(c.pair[0])!, bs.get(c.pair[1])!, c.marks ?? [], extra as never);
  const times = [...new Set(c.boats.flatMap(b => b.frames.map(f => f.t)))].sort((a, b) => a - b);
  const seen: Record<number, { keepsClear: string; rule: string }> = {};
  let foul: { t: number; by: string; rule: string } | null = null, last: ReturnType<typeof p.at> | null = null;
  for (const t of times) {
    let look = false;
    for (const b of c.boats) for (const f of b.frames) if (f.t === t) {
      const o = bs.get(b.letter)!, u = V(f.h), sp = f.v ?? (Math.hypot(o.vx, o.vy) || 2.5);
      o.headingAgo = f.ago ?? o.h; o.x = f.x; o.y = f.y; o.h = f.h; o.vx = u.x * sp; o.vy = u.y * sp;
      if (f.tacking !== undefined) o.tacking = f.tacking;
      if (f.tackT !== undefined) { o.lastTackT = f.tackT; o.headToWindT = f.tackT; }
      if (!o.tacking) o.tack = wrap(WIND - f.h) >= 0 ? 'S' : 'P';
      if (f.tack) o.tack = f.tack;
      if (f.aboveProper !== undefined) o.aboveProper = f.aboveProper;
      if (f.look !== false) look = true;
    }
    if (!look) continue;
    const r = p.at(t, { swerve: !!c.swerveAt?.includes(t) });
    seen[t] = { keepsClear: r.keepsClear, rule: r.rule }; last = r;
    if (r.foul && !foul) { foul = { t, by: r.foul.by, rule: r.foul.part ?? r.foul.rule }; break; }
  }
  return { seen, foul, last };
}

describe('the World Sailing Cases as data (src/rules/cases.ts): the engine answers each as the Case does', () => {
  for (const c of CASES) it(`Case ${c.case}: ${c.title}`, () => {
    const r = sailCase(c);
    for (const k of c.checks ?? []) expect(r.seen[k.t], `at ${k.t}`).toEqual({ keepsClear: k.keepsClear, rule: k.rule });
    if (c.ask === 'keepsClear') expect(r.last).toMatchObject({ keepsClear: c.answer.who, rule: c.answer.rule, foul: null });
    else if (c.answer.who === 'neither') expect(r.foul).toBeNull();
    else {
      expect(r.foul).toMatchObject({ by: c.answer.who, rule: c.answer.rule });
      expect(r.foul!.t, 'the trainer pauses before the incident').toBeGreaterThan(c.momentT);
    }
  });
  it('every Case\'s frames are in time order and its letters match its pair', () => {
    for (const c of CASES) {
      for (const b of c.boats) b.frames.forEach((f, i) => { if (i) expect(f.t, `Case ${c.case} ${b.letter}`).toBeGreaterThan(b.frames[i - 1].t); });
      for (const l of c.pair) expect(c.boats.some(b => b.letter === l)).toBe(true);
    }
  });
});
