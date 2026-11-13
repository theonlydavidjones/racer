import { describe, expect, it } from 'vitest';
import type { Frame } from '../src/replay/recorder';
import { legWords, rivalOf, versus, type VsInput } from '../src/replay/versus';

/** Two boats sailing one leg due north (y up), 1000 m from (0,0) to (0,1000), once a second. */
function race(you: (t: number) => [number, number] | null, them: (t: number) => [number, number] | null, T: number): Frame[] {
  const F: Frame[] = [];
  // (each boat heading the way she's going, as a sailing boat's bow does)
  const hd = (f: (t: number) => [number, number] | null, t: number) => { const a = f(t), b = f(t + 1) ?? a; return a && b && (b[0] !== a[0] || b[1] !== a[1]) ? (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360 : 0; };
  for (let t = 0; t <= T; t++) F.push({ t, b: [you, them].map(f => { const p = f(t); return p ? [p[0], p[1], hd(f, t), 'S', 0] : [0, 0, 0, 'S', 0]; }) as Frame['b'] });
  return F;
}
const input = (F: Frame[], youFin: number, themFin: number, o: Partial<VsInput> = {}): VsInput => ({
  frames: F, you: 0, startTimes: [0, 0], marks: [[], []], from: { x: 0, y: 0 },
  boats: [{ id: 0, name: 'You', finishT: youFin, dsq: false }, { id: 1, name: 'Blue', finishT: themFin, dsq: false }],
  legs: [{ name: 'the finish', to: { x: 0, y: 1000 }, kind: 'beat' }], ...o
});

describe('your race against the winner', () => {
  it('slower on the same line: all of it is speed, and the rows add up to the gap at the finish', () => {
    const F = race(t => [0, Math.min(1000, t * 4)], t => [0, Math.min(1000, t * 5)], 260);
    const V = versus(input(F, 250, 200))!;
    expect(V.rivalName).toBe('Blue'); expect(V.won).toBe(true);
    const L = V.legs[1];
    expect(L.lost).toBeCloseTo(50, 5); expect(L.fromDist).toBeCloseTo(0, 0); expect(L.fromSpeed).toBeCloseTo(50, 0);
    expect(V.total).toBeCloseTo(50, 5);
    expect(legWords(L, 'Blue')).toMatch(/slower over the ground \(about 50 s\)/);
  });

  it('the same speed on a longer line: the extra metres are the loss; and where she sailed, by the compass', () => {
    // you zigzag 200 m either side of the line (a longer way at 5 m/s), she goes straight up it, 100 m to the west
    const W = [[0, 0], [200, 250], [-200, 500], [200, 750], [0, 1000]], seg = W.slice(1).map((q, k) => Math.hypot(q[0] - W[k][0], q[1] - W[k][1]));
    const len = seg.reduce((a, b) => a + b, 0), youEnd = Math.ceil(len / 5);
    const zig = (t: number): [number, number] => {
      let s2 = Math.min(len, t * 5), k = 0;
      while (k < seg.length - 1 && s2 > seg[k]) { s2 -= seg[k]; k++; }
      const f = Math.min(1, s2 / seg[k]); return [W[k][0] + (W[k + 1][0] - W[k][0]) * f, W[k][1] + (W[k + 1][1] - W[k][1]) * f];
    };
    const F = race(zig, t => [-100, Math.min(1000, t * 5)], youEnd + 5);
    const V = versus(input(F, youEnd, 200))!, L = V.legs[1];
    expect(L.youM).toBeGreaterThan(L.themM + 300);
    expect(L.fromDist).toBeGreaterThan(0.8 * L.lost); expect(Math.abs(L.fromSpeed)).toBeLessThan(0.2 * L.lost);
    expect(L.apartDir).toBe('W'); expect(L.apartM).toBeGreaterThan(80);
  });

  it('drift isn\'t sailing further: set astern by the current, the time is lost to speed', () => {
    // both sail straight up the line at 5 m/s; you're set back 100 m stern first (bow still north) for 50 s mid-leg
    const youP = (t: number): [number, number] => t < 100 ? [0, t * 5] : t < 150 ? [0, 500 - (t - 100) * 2] : [0, Math.min(1000, 400 + (t - 150) * 5)];
    const F: Frame[] = [];
    for (let t = 0; t <= 280; t++) F.push({ t, b: [[...youP(t), 0, 'S', 0], [0, Math.min(1000, t * 5), 0, 'S', 0]] as Frame['b'] });
    const V = versus(input(F, 270, 200))!, L = V.legs[1];
    // the 100 m set astern isn't sailing; sailing it again is (1100 m, where the ground track's sum would say 1200)
    expect(L.youM).toBeCloseTo(L.themM + 100, -1);
    expect(L.fromDist).toBeCloseTo(100 / (1100 / 270), 0); // those 100 m at her own mean speed
    expect(L.fromSpeed).toBeGreaterThan(L.fromDist); // and the 50 s adrift is lost to speed
  });

  it('times read as minutes and whole seconds (never 1:60)', () => {
    const L = { i: 1, name: 'A', kind: 'beat' as const, you: 119.6, them: 59.7, lost: 59.9, fromDist: 0, fromSpeed: 59.9, youM: 500, themM: 500, t0: 0, t1: 120, apartM: 0, apartDir: '', moments: [] };
    expect(legWords(L, 'Blue')).toMatch(/You 2:00, Blue 1:00\./);
  });

  it('the start is its own row: who crossed first', () => {
    const F = race(t => [0, Math.max(0, t - 10) * 5], t => [0, t * 5], 220);
    const V = versus(input(F, 210, 200, { startTimes: [10, 0] }))!;
    expect(V.legs[0].kind).toBe('start'); expect(V.legs[0].lost).toBe(10);
    expect(V.total).toBeCloseTo(10, 5);
  });

  it('who you\'re measured against: the winner; the boat second if you won; not a disqualified boat; the leader mid-race', () => {
    const base = input(race(() => [0, 0], () => [0, 0], 2), 100, 200);
    const three = (o: Partial<VsInput>) => ({ ...base, boats: [{ id: 0, name: 'You', finishT: 100, dsq: false }, { id: 1, name: 'Blue', finishT: 200, dsq: false }, { id: 2, name: 'Red', finishT: 150, dsq: false }], startTimes: [0, 0, 0], marks: [[], [], []], ...o });
    expect(rivalOf(three({}))).toBe(2); // you won: Red came second
    // you won and nobody else is in yet: the boat furthest on
    expect(rivalOf(three({ boats: [{ id: 0, name: 'You', finishT: 100, dsq: false }, { id: 1, name: 'Blue', finishT: null, dsq: false }, { id: 2, name: 'Red', finishT: null, dsq: false }], marks: [[20, 50], [40], [45, 80]] }))).toBe(2);
    expect(rivalOf(three({ boats: [{ id: 0, name: 'You', finishT: 300, dsq: false }, { id: 1, name: 'Blue', finishT: 200, dsq: false }, { id: 2, name: 'Red', finishT: 150, dsq: true }] }))).toBe(1);
    expect(rivalOf(three({ boats: [{ id: 0, name: 'You', finishT: null, dsq: false }, { id: 1, name: 'Blue', finishT: null, dsq: false }, { id: 2, name: 'Red', finishT: null, dsq: false }], marks: [[50], [40, 90], [45, 80]] }))).toBe(2);
  });

  it('the big moments: she tacked on the header and you held on: when, how much longer, and the metres it cost', () => {
    // a beat due north to a mark 1000 m up; both close-hauled at 3 m/s, 45° off the wind, from the same spot on starboard.
    // At 100 s the wind backs 10° (350°): starboard is headed, port lifted. She tacks at 110 s, you at 150 s.
    const wind = (t: number) => t < 100 ? 0 : 350;
    const sail = (tackAt: number) => { const P: [number, number, number, string, number][] = []; let x = 0, y = 0, tack = 'S';
      for (let t = 0; t <= 400; t++) { if (t === tackAt) tack = 'P'; const W = wind(t), h = tack === 'S' ? W - 45 : W + 45;
        const dev = ((W - 0 + 540) % 360) - 180, shift = tack === 'S' ? -dev : dev;
        P.push([x, y, (h + 360) % 360, tack, 0, shift] as never); x += 3 * Math.sin(h * Math.PI / 180); y += 3 * Math.cos(h * Math.PI / 180); }
      return P; };
    const you = sail(150), her = sail(110);
    const F = you.map((p, t) => ({ t, b: [p, her[t]] })) as unknown as Frame[];
    const V = versus(input(F, 400, 395))!;
    const tack = V.moments.find(m => m.kind === 'tack')!;
    expect(tack.text).toMatch(/Blue tacked onto port on a 10° header at 1:50; you stayed on starboard 40 s longer, on a 10° header, and lost \d+ m\./);
    // the cost: 40 s at 3 m/s with 20° worse to the mark than her: about 40·3·(cos 35° − cos 55°) ≈ 30 m
    expect(tack.lostM).toBeGreaterThan(20); expect(tack.lostM).toBeLessThan(45);
    expect(V.moments.some(m => m.kind === 'mark' && /Blue finished at 6:35 with you \d+ m back; you finished 5 s later/.test(m.text))).toBe(true);
  });

  it('a penalty\'s turns aren\'t tacks (the track flags them; in the sim they come 17–32 s apart)', () => {
    const F: Frame[] = [];
    for (let t = 0; t <= 200; t++) {
      const pen = t >= 50 && t < 110, herTack = pen && t >= 70 && t < 95 ? 'P' : 'S';
      F.push({ t, b: [[0, t * 3, 0, 'S', 0, 0, 0, 0], [0, pen ? 150 : t * 3, 0, herTack, 0, 0, 0, pen ? 1 : 0]] as Frame['b'] });
    }
    const V = versus(input(F, 200, 199))!;
    expect(V.moments.filter(m => m.kind === 'tack')).toEqual([]);
  });

  // a beat on a steady or shifting wind: both boats close-hauled at 3 m/s, 45° off the wind, from the same spot on starboard,
  // each tacking at the given times (a tack is instant here); the wind recorded in the track
  const beat = (tacks: number[], wind: (t: number) => number, T = 500) => { const P: Frame['b'][number][] = []; let x = 0, y = 0, tack = 'S';
    for (let t = 0; t <= T; t++) { if (tacks.includes(t)) tack = tack === 'S' ? 'P' : 'S'; const W = wind(t), h = tack === 'S' ? W - 45 : W + 45;
      P.push([x, y, (h + 360) % 360, tack as 'S', 0, 0, W, 0]); x += 3 * Math.sin(h * Math.PI / 180); y += 3 * Math.cos(h * Math.PI / 180); }
    return P; };
  const race2 = (you: Frame['b'][number][], her: Frame['b'][number][], mark = { x: 0, y: 1000 }) => versus(input(you.map((p, t) => ({ t, b: [p, her[t]] })) as Frame[], 500, 495, { legs: [{ name: 'the finish', to: mark, kind: 'beat' }] }))!;

  it('you were already on her new tack: you led her onto it, you didn\'t fail to follow', () => {
    const V = race2(beat([100, 300], () => 0), beat([150], () => 0));
    const t = V.moments.filter(m => m.kind === 'tack');
    // (in a steady wind, below the layline, leading her onto port by 50 s cost and gained nothing: no moment at all)
    expect(t.some(m => /you stayed on starboard, and over the next/.test(m.text))).toBe(false);
  });

  it('in a steady wind, tacking later costs nothing below the layline, even on a leg 10° off the wind', () => {
    // the mark 10° to the right of the wind: measured across the mean wind (not along the leg), the order of tacks is free
    const mark = { x: 1000 * Math.sin(10 * Math.PI / 180), y: 1000 * Math.cos(10 * Math.PI / 180) };
    const V = race2(beat([150], () => 0), beat([110], () => 0), mark);
    expect(V.moments.filter(m => m.kind === 'tack')).toEqual([]);
  });

  it('the plain speed difference isn\'t charged to a tack', () => {
    // she's 10% faster all the way and you tack together: no tack moment
    const fast = beat([150], () => 0).map(p => [p[0] * 1.1, p[1] * 1.1, ...p.slice(2)] as Frame['b'][number]);
    const V = race2(beat([150], () => 0), fast);
    expect(V.moments.filter(m => m.kind === 'tack')).toEqual([]);
  });
});
