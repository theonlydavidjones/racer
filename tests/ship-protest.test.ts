import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World, shipRoom } from '../src/sim/world';
import type { Vessel } from '../src/sim/traffic';
import { COMMITTEE, decide, hearings, raceScores, type ProtestRec } from '../src/rules';
import { standings, type SeasonResult, type Series } from '../src/club/season';

// Commercial traffic, the Bay's rule: a ship's danger signal brings a race committee protest, the boat presumed to have
// impeded her (Inland Rule 9; Richmond YC 2025 SIs, clause 16), DNE if upheld (Bay series SIs; RRS 90.3(b)). docs/SHIP-PROTESTS.md
const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'slack', judging: 'protests', ...o });

/** A World with one container ship bound straight for (or, `offset` m to the side of) the user's boat, `away` m off. */
function withShip(away: number, offset = 0) {
  const w = new World(SS2, settings(), 3);
  w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; }
  w.boats[1].y += 3000; // (the other boat well out of it)
  const u = w.user, h = 90, ship: Vessel = { id: 0, kind: 'container', x: u.x - away, y: u.y + offset, h, v: 12 * 0.5144, moving: true };
  // (the ship steams east at her 12 kt; the World asks the traffic where she is each step)
  const t0 = w.t; w.traffic.vessels = () => [{ ...ship, x: ship.x + (w.t - t0) * ship.v }];
  return { w, u, ship };
}
const pin = (w: World, x: number, y: number) => { const u = w.user; u.x = x; u.y = y; u.v = 0; u.vx = 0; u.vy = 0; };

describe('A ship\'s danger signal and the race committee\'s protest', () => {
  it('a boat standing into her way inside SHIP_LOOK: five blasts, and a committee protest under Rule 9', () => {
    const { w, u } = withShip(300); const x = u.x, y = u.y, horns: number[] = [];
    for (let i = 0; i < 20; i++) { pin(w, x, y); w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') horns.push(1); }
    expect(horns.length).toBe(5);
    expect(w.protests).toEqual([expect.objectContaining({ by: COMMITTEE, vs: u.id, rule: '9', committee: expect.objectContaining({ vessel: 0, done: false }) })]);
  });

  it('two boats in her way: one signal, a protest of each', () => {
    const { w, u } = withShip(300); const o = w.boats[1]; let horns = 0;
    const x = u.x, y = u.y;
    for (let i = 0; i < 20; i++) { pin(w, x, y); o.x = x + 20; o.y = y; o.v = 0; o.vx = 0; o.vy = 0; w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') horns++; }
    expect(horns).toBe(5);
    expect(w.protests.map(p => p.vs).sort()).toEqual([u.id, o.id].sort());
  });

  it('a boat well to the side of her track: no signal, no protest', () => {
    const { w, u } = withShip(300, 400); const x = u.x, y = u.y;
    for (let i = 0; i < 200; i++) { pin(w, x, y); w.step(DT); w.drainEvents(); }
    expect(w.protests).toEqual([]);
  });

  it('she held on in the ship\'s way: the presumption stands, DNE; one protest for the encounter', () => {
    const { w, u } = withShip(300); const x = u.x, y = u.y;
    for (let i = 0; i < 150 / DT && !w.protests[0]?.committee?.done; i++) { pin(w, x, y); w.step(DT); w.drainEvents(); }
    expect(w.protests.length).toBe(1);
    const c = w.protests[0].committee!;
    expect(c.done).toBe(true); expect(c.closest).toBeLessThan(shipRoom({ kind: 'container' } as Vessel));
    expect(decide(w.protests[0], { id: u.id, racing: false, retired: false }).outcome).toBe('DNE');
  });

  it('she got out of the way at the signal: the record rebuts the presumption, dismissed', () => {
    const { w, u } = withShip(300); const x = u.x, y = u.y;
    for (let i = 0; i < 20 && !w.protests.length; i++) { pin(w, x, y); w.step(DT); w.drainEvents(); }
    expect(w.protests.length).toBe(1);
    // (clear out to the north, beyond the room she wants, and stay there while she passes)
    for (let i = 0; i < 150 / DT && !w.protests[0].committee!.done; i++) { pin(w, x, y + 400); w.step(DT); w.drainEvents(); }
    expect(decide(w.protests[0], { id: u.id, racing: false, retired: false }).outcome).toBe('dismissed');
  });

  it('under umpiring (practice), the signal sounds but there\'s no protest', () => {
    const w = new World(SS2, settings({ judging: 'umpired' }), 3); w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; }
    w.boats[1].y += 3000;
    const u = w.user, x = u.x, y = u.y, t0 = w.t; let horns = 0;
    w.traffic.vessels = () => [{ id: 0, kind: 'container', x: x - 300 + (w.t - t0) * 6.17, y, h: 90, v: 6.17, moving: true }];
    for (let i = 0; i < 20; i++) { pin(w, x, y); w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') horns++; }
    expect(horns).toBe(5); expect(w.protests).toEqual([]);
  });

});

describe('The hearing of a committee ship protest', () => {
  const P = (c: Partial<NonNullable<ProtestRec['committee']>>): ProtestRec => ({ by: COMMITTEE, vs: 2, t: 100, rule: '9', fouler: 2, kind: null, hailT: 100, flagT: 100, owed: null, turnsT: null,
    committee: { vessel: 0, name: 'Container ship', room: 210, closest: 120, done: true, ...c } });
  it('still passing: not decided yet; then DNE inside the room, dismissed outside it', () => {
    const v = { id: 2, racing: true, retired: false };
    expect(decide(P({ done: false }), v).outcome).toBe('pending');
    expect(decide(P({}), v).outcome).toBe('DNE');
    expect(decide(P({ closest: 230 }), v).outcome).toBe('dismissed');
  });
  it('retiring doesn\'t answer it (a Rule 9 breach isn\'t exonerated by a penalty, RYC SIs 16)', () => {
    expect(decide(P({}), { id: 2, racing: false, retired: true }).outcome).toBe('DNE');
  });
  it('the hearings list her DNE apart from the DSQs', () => {
    const h = hearings([P({})], id => ({ id, racing: false, retired: false }));
    expect([...h.dne.keys()]).toEqual([2]); expect(h.dsq.size).toBe(0);
  });
});

describe('DNE in the scores', () => {
  it('a race: scored as a disqualification, one more than the boats entered (A5.2)', () => {
    const s = raceScores([{ id: 0, finishT: 100, code: 'DNE' }, { id: 1, finishT: 110, code: null }, { id: 2, finishT: 120, code: null }]);
    expect(s.find(x => x.id === 0)).toMatchObject({ points: 4, code: 'DNE' });
    expect(s.find(x => x.id === 1)!.points).toBe(1);
  });
  it('the series: a DNE is never the throwout (RRS 90.3(b)); the next worst is', () => {
    const series = { races: [1, 2, 3, 4, 5].map(no => ({ no })), scheduled: 5 } as unknown as Series;
    const r = (pts: number, code: string | null = null): SeasonResult => ({ at: '', scores: [{ sail: 'USA 1', name: 'A', hull: '#fff', you: false, points: pts, code }, { sail: 'USA 2', name: 'B', hull: '#fff', you: false, points: 1, code: null }] });
    const res = { 1: r(3, 'DNE'), 2: r(2), 3: r(1), 4: r(1), 5: r(1) };
    const a = standings(series, res).rows.find(x => x.sail === 'USA 1')!;
    expect(a.races[1].out).toBe(false); expect(a.races[2].out).toBe(true);
    expect(a.nett).toBe(3 + 1 + 1 + 1);
  });
});
