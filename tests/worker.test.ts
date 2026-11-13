// The race in its worker (sim/worker.ts RaceWorker, sim/host.ts WorkerHost; docs/CAPACITY.md step 3) sails exactly as
// in the page's own thread (LocalHost): the same frames and commands give the same race to the last bit, whether the
// worker answers within the frame or a frame late (as a real one does), and the page's mirror comes out equal to the
// worker's World. Every message goes through a structured clone, as postMessage does. If the worker fails, the mirror
// sails on. (The worker here is RaceWorker behind a stand-in for the browser's Worker: Node has no Web Workers.)
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { LocalHost, WorkerHost, type WorldArgs } from '../src/sim/host';
import { RaceWorker, type FromWorker, type ToWorker } from '../src/sim/worker';
import type { Command } from '../src/sim/commands';
import { SWEEP_EVERY } from '../src/sim/sync';
import { firstDifference } from './helpers/worlds';
import { laylinesFor } from '../src/sim/laylines';
import { passageNow } from '../src/sim/navigator';

/** The page's own questions (asked of the mirror in the worker's case): the field, current, sea, laylines, rights, the passage. */
function questions(w: World): string {
  const out: unknown[] = [];
  for (const p of [{ x: 0, y: 0 }, { x: 900, y: -300 }, ...w.boats.map(b => ({ x: b.x + 25, y: b.y - 15 }))]) out.push(w.fieldAt(p), w.fieldExtra(p), w.currentAt(p), w.windHere(p), w.seaHere(p), w.puffs.at(p));
  for (const b of w.boats) { out.push(laylinesFor(w, b), w.nextMark(b)?.name ?? null); for (const o of w.boats) if (o !== b) out.push(w.rights(b, o).kc.id); }
  if (w.freeSail) out.push(passageNow(w));
  return JSON.stringify(out, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : typeof v === 'object' && v && 'isUser' in v ? `boat ${(v as { id: number }).id}` : v));
}

/** A stand-in for the browser's Worker: RaceWorker answering each message (cloned both ways), now or when told. */
class FakeWorker {
  onmessage: ((e: { data: FromWorker }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  readonly race = new RaceWorker();
  private out: FromWorker[] = [];
  terminated = false;
  constructor(private late: boolean) {}
  postMessage(m: ToWorker): void { const r = this.race.handle(structuredClone(m)); if (r) this.out.push(structuredClone(r)); if (!this.late) this.deliver(); }
  deliver(): void { for (const r of this.out.splice(0)) this.onmessage?.({ data: r }); }
  terminate(): void { this.terminated = true; }
}

/** Every boat's whole state and the race's clock, to the last bit (as tests/host.test.ts). */
function state(w: World): string {
  return JSON.stringify({ t: w.t, steps: w.steps, wind: w.wind, pilot: w.pilot, dest: w.dest, paused: w.paused, speed: w.speed,
    boats: w.boats.map(b => ({ ...b, ai: b.ai ? { ...b.ai } : null })) }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
}
const frameDt = (i: number) => [1 / 60, 1 / 60, 0.0171, 1 / 60, 0.033, 1 / 60, 0.016, 0.05][i % 8];
const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, tideDate: '2026-11-14', ...o }) as Settings;
const race = (): WorldArgs => ({ file: ss2 as unknown as CourseFile, settings: S({ fleet: 3, current: 'real' }), seed: 21, opts: {} });
const at = (list: [number, Command][]) => { const m = new Map<number, Command[]>(); for (const [i, c] of list) (m.get(i) ?? m.set(i, []).get(i)!).push(c); return m; };
const SCRIPT = at([
  [0, { k: 'running', on: true }], [5, { k: 'speed', v: 4 }],
  [20, { k: 'helm', steer: 1, luff: false, ctl: { mainsheet: -1 } }], [60, { k: 'helm', steer: 0, luff: false, ctl: {} }],
  [70, { k: 'tiller', v: 0.4 }], [90, { k: 'lash', on: true }], [120, { k: 'lash', on: false }],
  [130, { k: 'ctlTarget', key: 'vang', v: 0.7 }], [180, { k: 'crewPlace', place: { across: 'hike', fore: null } }],
  [240, { k: 'pole', want: true }], [300, { k: 'pause', on: true }], [320, { k: 'pause', on: false }], [330, { k: 'speed', v: 1 }],
  [400, { k: 'allToCrew' }], [450, { k: 'running', on: false }], [470, { k: 'running', on: true }]
]);

/** The same frames and commands through LocalHost and through WorkerHost; the two races' states, frame by frame. */
function sail(late: boolean, frames: number): { local: string[]; worker: string[]; asked: [string, string][]; mirror: World; real: World } {
  const L = new LocalHost(new World(race().file, race().settings, race().seed, race().opts));
  const fake = new FakeWorker(late), W = new WorkerHost(fake as unknown as Worker, race());
  const local: string[] = [], worker: string[] = [], asked: [string, string][] = [];
  for (let i = 0; i < frames; i++) {
    for (const c of SCRIPT.get(i) ?? []) { L.send(c); W.send(c); }
    L.advance(frameDt(i)); W.advance(frameDt(i));
    if (late) fake.deliver(); // (a frame late: the answer to this frame comes before the next)
    if (i % 25 === 0) { local.push(state(L.world)); worker.push(state(fake.race.world!)); }
    // (the page's questions: of the mirror, once it has this frame's answer, against the race in the page)
    if (i % 50 === 0) { fake.deliver(); asked.push([questions(L.world), questions(W.world)]); }
  }
  fake.deliver();
  return { local, worker, asked, mirror: W.world, real: fake.race.world! };
}

describe('the race in its worker sails as in the page', () => {
  for (const late of [false, true]) it(late ? 'the worker answering a frame late, as a real one does' : 'the worker answering within the frame', () => {
    const r = sail(late, 600);
    const k = r.local.findIndex((x, i) => x !== r.worker[i]);
    expect(k, `the races part at frame ${k * 25}`).toBe(-1);
    // and the page's mirror is the worker's World after the last answer
    expect(state(r.mirror)).toBe(state(r.real));
    r.asked.forEach(([a, b], i) => expect(b, `the page's questions at frame ${i * 50}`).toBe(a));
    expect(r.real.t).toBeGreaterThan(-170); // (it sailed)
  }, 300_000);

  it('answers come back (the motor, the chart\'s move), and a worker that fails leaves the race sailing in the page', async () => {
    const args: WorldArgs = { file: COURSES[0], settings: S({ mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'slack' }), seed: 4, opts: { freeSail: true } };
    const fake = new FakeWorker(false); let failed = '';
    const W = new WorkerHost(fake as unknown as Worker, args, false, why => { failed = why; });
    W.send({ k: 'running', on: true });
    const moved = W.ask({ k: 'moveHere', p: { x: 1200, y: 600 }, name: 'Off the city front' });
    W.advance(1 / 60);
    expect(await moved).toBe(true);
    W.send({ k: 'dest', p: { x: 2500, y: 1800 }, name: 'Off somewhere' });
    for (let i = 0; i < 60; i++) W.advance(1 / 60);
    expect(W.mode).toBe('worker');
    // (the passage plan, the laylines and the field, asked of the mirror, as of the worker's own World)
    expect(questions(W.world)).toBe(questions(fake.race.world!));
    const t0 = W.view.t;
    // (a command that fails in the worker: a penalty for a boat that isn't there)
    W.send({ k: 'penalty', boat: 99 });
    W.advance(1 / 60);
    expect(W.mode).toBe('local'); expect(failed).not.toBe(''); expect(fake.terminated).toBe(true);
    for (let i = 0; i < 60; i++) W.advance(1 / 60);
    expect(W.view.t).toBeGreaterThan(t0 + 0.9); // (the mirror sails on: a second more)
  }, 300_000);

  it('new conditions mid-race (the wind turned, a slack tide made real): the mirror rebuilds its own and stays the race', () => {
    // (the conditions panel from the pause menu: World.applyConditions makes a new weather, tide, sea and wind field,
    // functions and all, and turns the course's legs; the mirror must have them too, not plain copies)
    const args: WorldArgs = { file: ss2 as unknown as CourseFile, settings: S({ fleet: 3, current: 'slack' }), seed: 8, opts: {} };
    const fake = new FakeWorker(true), W = new WorkerHost(fake as unknown as Worker, args);
    const L = new LocalHost(new World(args.file, args.settings, args.seed, args.opts));
    const turn = (s: Partial<Settings>) => ({ ...args.settings, ...s }) as Settings;
    const script = at([[0, { k: 'running', on: true }], [3, { k: 'speed', v: 4 }], [150, { k: 'helm', steer: 1, luff: false, ctl: {} }],
      [151, { k: 'conditions', settings: turn({ windKt: 20, windTurn: 60, current: 'real' }) }], [152, { k: 'helm', steer: 0, luff: false, ctl: {} }],
      [400, { k: 'conditions', settings: turn({ windKt: 9, windTurn: -30, current: 'real', sea: 'flat' }) }]]);
    for (let i = 0; i < 700; i++) {
      for (const c of script.get(i) ?? []) { L.send(c); W.send(c); }
      L.advance(frameDt(i)); W.advance(frameDt(i)); fake.deliver();
      // (the page asks its questions every frame, filling the mirror's memos, as the moorings and the maps do)
      questions(W.world);
      if (i % 50 === 0 || i === 152 || i === 401) {
        expect(firstDifference(fake.race.world!, W.world), `frame ${i}`).toBeNull();
        expect(questions(W.world), `the questions at frame ${i}`).toBe(questions(L.world));
        expect(state(fake.race.world!), `the race at frame ${i}`).toBe(state(L.world));
      }
    }
    expect(W.world.C.marks.map(m => m.leg).join()).toBe(L.world.C.marks.map(m => m.leg).join()); // (the legs turned with the wind)
    expect(W.faults).toBe(0);
    expect(W.world.tide).not.toBeNull(); // (the real tide, with its functions: currentAt above would have thrown)
  }, 600_000);

  it('the worker behind (two frames in flight, the page\'s time held back) and past the sweeps: the mirror is still the race', () => {
    const fake = new FakeWorker(true), W = new WorkerHost(fake as unknown as Worker, race());
    W.send({ k: 'running', on: true }); W.send({ k: 'speed', v: 4 });
    for (let i = 0; i < 2.5 * SWEEP_EVERY * 3; i++) {
      if (i % 120 === 30) W.send({ k: 'tiller', v: i % 240 === 30 ? 0.5 : 0 });
      W.advance(frameDt(i));
      if (i % 3 === 2) fake.deliver(); // (the worker answering only every third frame)
    }
    fake.deliver(); W.advance(1 / 60); fake.deliver();
    expect(firstDifference(fake.race.world!, W.world)).toBeNull();
    expect(state(W.world)).toBe(state(fake.race.world!));
    expect(questions(W.world)).toBe(questions(fake.race.world!));
    expect(W.faults).toBe(0);
    expect(W.world.t).toBeGreaterThan(-180 + 60); // (it sailed: past a minute of race)
  }, 600_000);

  it('the setup\'s own World, asked its questions, becomes the mirror (no second World built), and the race is the same', () => {
    // (the race setup builds a World for its cards and asks it things: the current, the line's transit, the sea; at
    // Start the host takes that World as its mirror)
    const a = race(), facts = new World(a.file, a.settings, a.seed, a.opts);
    questions(facts); facts.laylineTransit(facts.C.marks[0].p, { x: 0, y: 0 }); facts.lineTransit; facts.seaDurationAt(facts.clockUtc);
    const fake = new FakeWorker(true), W = new WorkerHost(fake as unknown as Worker, a, false, undefined, facts);
    expect(W.world).toBe(facts);
    const L = new LocalHost(new World(a.file, a.settings, a.seed, a.opts));
    for (let i = 0; i < 300; i++) {
      for (const c of SCRIPT.get(i) ?? []) { L.send(c); W.send(c); }
      L.advance(frameDt(i)); W.advance(frameDt(i)); fake.deliver();
    }
    expect(W.mode).toBe('worker');
    expect(firstDifference(fake.race.world!, W.world)).toBeNull();
    expect(state(W.world)).toBe(state(L.world));
    expect(W.faults).toBe(0);
  }, 300_000);

  it('a setup World numbered apart from the worker\'s: the race sails on it in the page instead, unbroken', () => {
    const a = race(), facts = new World(a.file, a.settings, a.seed, a.opts);
    (facts.boats[1] as unknown as Record<string, unknown>).extra = { made: 'by the page' }; // (an object the worker's World hasn't)
    let why = '';
    const fake = new FakeWorker(false), W = new WorkerHost(fake as unknown as Worker, a, false, w => { why = w; }, facts);
    W.send({ k: 'running', on: true });
    for (let i = 0; i < 120; i++) W.advance(1 / 60);
    expect(W.mode).toBe('local'); expect(why).toMatch(/numbered apart/);
    expect(W.view.t).toBeGreaterThan(-180 + 1.5); // (two seconds of race sailed, here)
  }, 300_000);

  it('rebuilt in the same worker (the setup\'s changes): the old race\'s answers dropped, the new race the same as in the page', () => {
    const fake = new FakeWorker(true), W = new WorkerHost(fake as unknown as Worker, race());
    W.send({ k: 'running', on: true });
    for (let i = 0; i < 40; i++) { W.advance(frameDt(i)); if (i % 2) fake.deliver(); }
    const old = W.ask({ k: 'moveHere', p: { x: 0, y: 0 }, name: 'nowhere' }); W.advance(1 / 60); // (asked of the old race, and in flight)
    // the setup changes: another fleet, wind and seed; the page's own facts World for it adopted as the mirror
    const b: WorldArgs = { file: ss2 as unknown as CourseFile, settings: S({ fleet: 4, windKt: 18, current: 'real' }), seed: 33, opts: {} };
    const facts = new World(b.file, b.settings, b.seed, b.opts);
    W.rebuild(b, facts);
    expect(W.view).toBe(facts);
    fake.deliver(); // (the old race's answers arrive now: dropped)
    const L = new LocalHost(new World(b.file, b.settings, b.seed, b.opts));
    for (let i = 0; i < 400; i++) {
      for (const c of SCRIPT.get(i) ?? []) { L.send(c); W.send(c); }
      L.advance(frameDt(i)); W.advance(frameDt(i)); fake.deliver();
    }
    expect(W.mode).toBe('worker');
    expect(state(fake.race.world!)).toBe(state(L.world));
    expect(firstDifference(fake.race.world!, W.world)).toBeNull();
    expect(W.faults).toBe(0);
    return old.then(r => expect(r).toBeUndefined()); // (the old race's question goes unanswered)
  }, 300_000);
});
