import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import type { Vessel } from '../src/sim/traffic';
import { COMMITTEE, decide, hearings, raceScores, type ProtestRec } from '../src/rules';
import { standings, type SeasonResult, type Series } from '../src/club/season';

// Commercial traffic, the Bay's rule: a ship's danger signal brings a race committee protest, the boat presumed to have
// impeded her (Inland Rule 9; Richmond YC 2025 SIs, clause 16), DNE if upheld (Bay series SIs; RRS 90.3(b)). docs/SHIP-PROTESTS.md
const SS2 = ss2 as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 1, current: 'slack', judging: 'protests', ...o });

/** A World with one vessel (the container ship unless `id` says: SERVICES order) steaming east at her speed, her middle
 * `away` m west of the user's boat and `offset` m north of it. */
function withShip(away: number, offset = 0, id = 0, kt = 12, s: Partial<Settings> = {}) {
  const w = new World(SS2, settings(s), 3);
  w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; }
  w.boats[1].y += 5000; // (the other boat well out of it)
  const u = w.user, kinds = ['container', 'tanker', 'ferry', 'alcatraz', 'tour', 'tour', 'coastguard'] as const;
  const ship: Vessel = { id, kind: kinds[id], x: u.x - away, y: u.y + offset, h: 90, v: kt * 0.5144, moving: true };
  const t0 = w.t; w.traffic.vessels = () => [{ ...ship, x: ship.x + (w.t - t0) * ship.v }];
  return { w, u, ship };
}
const pin = (w: World, x: number, y: number, vx = 0) => { const u = w.user; u.x = x; u.y = y; u.v = Math.abs(vx); u.vx = vx; u.vy = 0; if (vx) u.h = vx > 0 ? 90 : 270; }; // (her heading too: the step's velocity is her own)
/** Sail it on for `s` seconds with the user's boat held at (x + vx·t, y); the horns heard. */
function run(w: World, s: number, x: number, y: number, vx = 0, until?: () => boolean): number {
  let horns = 0; const t0 = w.t;
  for (let i = 0; i < s / DT && !until?.(); i++) { pin(w, x + vx * (w.t - t0), y, vx); w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') horns++; }
  return horns;
}
const done = (w: World) => () => !!w.protests[0]?.committee?.done;
const heardOut = (w: World) => decide(w.protests[0], { id: w.user.id, racing: false, retired: false }).outcome;

describe('A ship\'s danger signal and the race committee\'s protest', () => {
  // (the container ship: 300 m, 12 kt; her way reaches two lengths ahead of her bow, 750 m ahead of her middle)
  it('a boat lying in her track ahead, about to be in her way: five blasts, a committee protest under Rule 9', () => {
    const { w, u } = withShip(950); const x = u.x, y = u.y;
    expect(run(w, 2, x, y)).toBe(5);
    expect(w.protests).toEqual([expect.objectContaining({ by: COMMITTEE, vs: u.id, rule: '9', committee: expect.objectContaining({ vessel: 0, entered: false, done: false }) })]);
  });

  it('she lies there: in her way, the presumption stands, DNE; one protest for the encounter, however long', () => {
    const { w, u } = withShip(950); const x = u.x, y = u.y;
    run(w, 400, x, y + 0.01, 0, done(w)); // (a hair off the centerline: run down, pushed off)
    expect(w.protests.length).toBe(1); expect(w.protests[0].committee!.entered).toBe(true);
    expect(heardOut(w)).toBe('DNE');
  });

  it('she gets out of the way at the signal: never in it, the presumption rebutted, dismissed', () => {
    const { w, u } = withShip(950); const x = u.x, y = u.y;
    run(w, 1, x, y); expect(w.protests.length).toBe(1);
    run(w, 400, x, y + 200, 0, done(w)); // (out to the north, clear of her way, while she passes)
    expect(w.protests[0].committee).toMatchObject({ entered: false, done: true }); expect(heardOut(w)).toBe('dismissed');
  });

  it('retiring doesn\'t end the record: she retires in the ship\'s way and stays there: DNE', () => {
    const { w, u } = withShip(950); const x = u.x, y = u.y;
    run(w, 1, x, y); u.retired = true;
    run(w, 400, x, y + 0.01, 0, done(w));
    expect(heardOut(w)).toBe('DNE');
  });

  it('a boat astern of her, or alongside well off her side going her way: no signal', () => {
    const a = withShip(-300); expect(run(a.w, 60, a.u.x, a.u.y)).toBe(0); // (the ship 300 m east of her, going away)
    const b = withShip(300, 150); expect(run(b.w, 120, b.u.x, b.u.y, 5 * 0.5144)).toBe(0); // (129 m off her side, being overtaken)
    expect(a.w.protests.concat(b.w.protests)).toEqual([]);
  });

  it('two boats in her way: one signal, a protest of each', () => {
    const { w, u } = withShip(950); const o = w.boats[1], x = u.x, y = u.y; let horns = 0;
    for (let i = 0; i < 2 / DT; i++) { pin(w, x, y); o.x = x + 20; o.y = y; o.v = 0; o.vx = 0; o.vy = 0; w.step(DT); for (const e of w.drainEvents()) if (e.type === 'horn') horns++; }
    expect(horns).toBe(5);
    expect(w.protests.map(p => p.vs).sort()).toEqual([u.id, o.id].sort());
  });

  it('a ferry sounds it too, but she isn\'t confined to a channel (Rule 9(b)): no protest', () => {
    const { w, u } = withShip(150, 0, 2, 17); // (the Sausalito ferry, 50 m, 17 kt)
    expect(run(w, 2, u.x, u.y)).toBe(5); expect(w.protests).toEqual([]);
  });

  it('under umpiring (practice), the signal sounds but there\'s no protest', () => {
    const { w, u } = withShip(950, 0, 0, 12, { judging: 'umpired' });
    expect(run(w, 2, u.x, u.y)).toBe(5); expect(w.protests).toEqual([]);
  });
});

describe('The AI fleet and a ship', () => {
  it('a container ship steaming through the fleet on the beat: the AI boats keep out of her way, and none is protested into a DNE', () => {
    const w = new World(SS2, settings({ fleet: 7 }), 5);
    while (w.t < 90) w.step(DT); // (started and up the beat)
    const cx = w.boats.reduce((a, b) => a + b.x, 0) / w.boats.length, cy = w.boats.reduce((a, b) => a + b.y, 0) / w.boats.length;
    const ship: Vessel = { id: 0, kind: 'container', x: cx - 2200, y: cy, h: 90, v: 12 * 0.5144, moving: true }, t0 = w.t;
    w.traffic.vessels = () => [{ ...ship, x: ship.x + (w.t - t0) * ship.v }];
    while (w.t < t0 + 600) { w.step(DT); w.drainEvents(); }
    const ai = w.protests.filter(p => p.committee && !w.boats[p.vs].isUser);
    expect(ai.filter(p => p.committee!.entered)).toEqual([]);
  }, 120000);
});

describe('The hearing of a committee ship protest', () => {
  const P = (c: Partial<NonNullable<ProtestRec['committee']>>): ProtestRec => ({ by: COMMITTEE, vs: 2, t: 100, rule: '9', fouler: 2, kind: null, hailT: 100, flagT: 100, owed: null, turnsT: null,
    committee: { vessel: 0, name: 'Container ship', entered: true, closest: 40, done: true, ...c } });
  it('still passing: not decided yet; then DNE if she was in the ship\'s way, dismissed if never', () => {
    const v = { id: 2, racing: true, retired: false };
    expect(decide(P({ done: false }), v).outcome).toBe('pending');
    expect(decide(P({}), v).outcome).toBe('DNE');
    expect(decide(P({ entered: false, closest: 230 }), v).outcome).toBe('dismissed');
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
