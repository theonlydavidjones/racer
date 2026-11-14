import { describe, expect, it } from 'vitest';
import { DrillCoach, idealTurn, SET, type CoachView } from '../src/app/drillCoach';
import { FOLKBOAT } from '../src/boat/polar';
import { simCrew } from '../src/sim/drill';

const D2R = Math.PI / 180;
/** Her state: at (x, y) on heading h at `kt`, the wind from 270 at 12 kt. */
function view(x: number, y: number, h: number, kt: number, t: number, extra: Partial<CoachView> = {}): CoachView {
  const v = kt * 0.5144, twa = ((270 - h + 540) % 360) - 180;
  return { t, user: { x, y, h, v, vx: Math.sin(h * D2R) * v, vy: Math.cos(h * D2R) * v, twa, tack: twa >= 0 ? 'S' : 'P', ww: { from: 270, kt: 12 } }, ...extra };
}

describe('The drills\' coach by the boat (app/drillCoach.ts)', () => {
  it('a good crew\'s turn: ends on the new course, at the sim crew\'s rate', () => {
    const c = simCrew('tack', 12), pts = idealTurn({ x: 0, y: 0 }, 312, 228, 2.4, 'tack', 12);
    expect(pts.length - 1).toBeCloseTo((84 / c.rate) / 0.25 + 1, -0.5);
    const a = pts[pts.length - 2], b = pts[pts.length - 1], h = (Math.atan2(b.x - a.x, b.y - a.y) / D2R + 360) % 360;
    expect(Math.abs(((h - 228 + 540) % 360) - 180)).toBeLessThan(c.rate * 0.25 + 1);
  });
  it('tacks: a lane and a bar ahead; Build speed when slow, Hold at speed, Tack now at the bar; the score after; rep by rep', () => {
    const co = new DrillCoach(), beat = FOLKBOAT.beatAngle(12), hP = 270 + beat - 360, full = FOLKBOAT.speedKt(12, beat);
    const drill = { list: [] as { scored: boolean; lostM: number; goodM: number; kind: 'tack' | 'gybe' }[] };
    let o = co.tick(view(0, 0, hP, full * 0.6, 0, { drill }), 'manoeuvres');
    expect(o.cue?.word).toBe('Build speed'); expect(o.spec?.gate).toBeTruthy(); expect(o.cue?.sub).toMatch(`Rep 1 of ${SET}`);
    const d = { x: Math.sin(hP * D2R), y: Math.cos(hP * D2R) };
    o = co.tick(view(d.x * 30, d.y * 30, hP, full, 10, { drill }), 'manoeuvres');
    expect(o.cue?.word).toBe('Hold');
    o = co.tick(view(d.x * 76, d.y * 76, hP, full, 20, { drill }), 'manoeuvres');
    expect(o.cue?.word).toBe('Tack now'); expect(o.cue?.tone).toBe('go');
    // through the turn: on starboard now, slow: Ease, the good crew's turn and the new lane drawn
    o = co.tick(view(d.x * 82, d.y * 82, 230, full * 0.6, 26, { drill }), 'manoeuvres');
    expect(o.cue?.word).toBe('Ease'); expect(o.spec?.ideal?.length).toBeGreaterThan(5); expect(o.spec?.lane?.length).toBe(2);
    // scored: the short score by the boat
    drill.list.push({ scored: true, lostM: 6.4, goodM: 5.2, kind: 'tack' });
    o = co.tick(view(d.x * 90, d.y * 90, 230, full, 40, { drill }), 'manoeuvres');
    expect(o.cue?.word).toBe('6 m lost'); expect(o.cue?.sub).toMatch(/Rep 1 · a good crew 5 m/);
    // and then rep 2, from where she is
    o = co.tick(view(0, 200, 230, full, 47, { drill }), 'manoeuvres');
    expect(o.cue?.sub).toMatch(`Rep 2 of ${SET}`);
  });
  it('the windward mark: Hold on the layline, Bear away at the mark, Close out once round (no "Wide in": she can\'t go wide close-hauled)', () => {
    const co = new DrillCoach(), beat = FOLKBOAT.beatAngle(12), hS = 270 - beat, s = { x: Math.sin(hS * D2R), y: Math.cos(hS * D2R) };
    const rounding = { marks: [{ p: { x: 0, y: 0 } }, { p: { x: 800, y: 0 } }], leg: 0, list: [] as never[] };
    const at = (k: number) => co.tick(view(-s.x * k, -s.y * k, hS + 4, 4.5, 0, { rounding }), 'roundings').cue;
    expect(at(150)).toMatchObject({ word: 'Hold', sub: 'on the layline' }); expect(at(30)?.word).toBe('Hold'); expect(at(8)?.word).toBe('Bear away');
    rounding.leg = 1; // (round: the tracker's on to the next mark; the windward mark's guides stay up)
    const o = co.tick(view(20, -5, 90, 4.5, 0, { rounding }), 'roundings');
    expect(o.cue?.word).toBe('Close out'); expect(o.spec?.zone).toEqual({ x: 0, y: 0 });
  });
  it('the leeward mark: Wide in at the zone, Head up at the mark; the phase never steps back', () => {
    const co = new DrillCoach(), rounding = { marks: [{ p: { x: 0, y: 0 } }, { p: { x: 800, y: 0 } }], leg: 1, list: [] as never[] };
    const at = (x: number) => co.tick(view(x, 0, 90, 4.5, 0, { rounding }), 'roundings').cue?.word;
    expect(at(600)).toBe('Hold'); expect(at(775)).toBe('Wide in'); expect(at(795)).toBe('Head up'); expect(at(775)).toBe('Head up');
  });
  it('the start: Hold while she\'d be early, Build speed while late, Go as her time to the line meets the gun', () => {
    const co = new DrillCoach(), start = { pin: { x: -100, y: 0 }, committee: { x: 100, y: 0 } };
    expect(co.tick(view(0, -60, 0, 3, -60, { start }), 'start').cue?.word).toBe('Hold');
    expect(co.tick(view(0, -300, 0, 3, -20, { start }), 'start').cue?.word).toBe('Build speed');
    const kt = FOLKBOAT.speedKt(12, 90), need = 60 / (kt * 0.5144);
    expect(co.tick(view(0, -60, 0, kt, -need, { start }), 'start').cue?.word).toBe('Go');
  });
});
