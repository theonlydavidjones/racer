// The page's side of the race (sim/host.ts, sim/commands.ts; docs/CAPACITY.md step 2): the host's frame loop and its
// commands must sail the race exactly as the page's own code did when it wrote to the World directly. Each scenario is
// run twice from the same seed, once through LocalHost (frames of uneven length, the speed changed, commands sent) and
// once by the page's old code (its accumulator and its direct writes, copied here as they were), and every boat's full
// state is compared to the last bit along the way.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { LocalHost } from '../src/sim/host';
import type { Command } from '../src/sim/commands';
import type { Boat } from '../src/boat/boat';
import { allToCrew, moveLazyCar, takeLine } from '../src/boat/physics';
import { wantJumpers } from '../src/boat/condition';
import { adjust as pilotAdjust, engage as pilotEngage, standby as pilotStandby, tack as pilotTack } from '../src/boat/autopilot';

/** The page's old code for each command: the writes app.ts and the sail controls band made before step 2. */
function oldWay(w: World, c: Command): void {
  const u: Boat = w.user;
  switch (c.k) {
    case 'helm': u.steer = c.steer; u.luff = c.luff; u.ctlCmd = c.ctl; u.sheetCmd.main = c.ctl.mainsheet ?? 0; u.sheetCmd.jib = c.ctl.jibsheet ?? 0; return;
    case 'handsOff': u.steer = 0; u.luff = false; u.sheetCmd.main = u.sheetCmd.jib = 0; return;
    case 'tiller': u.tiller = Math.max(-1, Math.min(1, c.v)); if (u.lashed != null) u.lashed = u.tiller; return;
    case 'lash': if (c.on) u.lashed = u.tiller; else u.lashed = null; return;
    case 'line': takeLine(u, c.key, c.mine); return;
    case 'allToCrew': allToCrew(u); return;
    case 'lazyCar': takeLine(u, 'car'); moveLazyCar(u, c.fore, c.ins); return;
    case 'ctlTarget': (u.ctlTarget ??= {})[c.key] = c.v; takeLine(u, c.key); return;
    case 'ctlTargetClear': for (const k of c.keys) if (u.ctlTarget) delete u.ctlTarget[k]; return;
    case 'jumpers': wantJumpers(u, c.turns); return;
    case 'crewPlace': { // (setPlace and the fore–aft buttons: the crew's place object changed in place)
      const cr = u.crew!;
      if (!c.place) { cr.place = undefined; return; }
      const pl = cr.place ?? { across: null, fore: null }; pl.across = c.place.across; pl.fore = c.place.fore; cr.place = pl; return;
    }
    case 'pole': u.poleWant = !u.poleWant; u.poleMine = true; return; // (a toggle: the scenarios send the toggled value)
    case 'ensign': u.ensignStruck = !u.ensignStruck; return;
    case 'lights': u.lightsOff = !u.lightsOff; return;
    case 'sail': w.setSail(c.sail, c.up); return;
    case 'pilot':
      if (c.op === 'engage') pilotEngage(u, w.pilot, c.mode); else if (c.op === 'standby') pilotStandby(w.pilot);
      else if (c.op === 'tack') pilotTack(u, w.pilot); else pilotAdjust(u, w.pilot, c.d);
      return;
    case 'hail': w.userHail(); return;
    case 'dest': w.setDest(c.p, c.name); return;
    case 'pause': w.paused = c.on; return;
    case 'running': w.running = c.on; return;
    case 'shown': if (c.finishShown != null) w.finishShown = c.finishShown; if (c.logged != null) w.logged = c.logged; return;
    case 'penalty': { const fouler = w.boats.find(x => x.id === c.boat)!; w.assignPenalty(fouler); return; } // (the page held the Boat itself)
    case 'logNote': w.log!.note(c.note); return;
    case 'speed': w.speed = c.v; return;
    case 'settings': if (c.patch.chartPal) w.settings.chartPal = c.patch.chartPal; if (c.patch.mapLayers) w.settings.mapLayers = c.patch.mapLayers; return;
    default: throw new Error('not in the scenarios: ' + c.k);
  }
}

/** Every boat's whole state, to the last bit (the AI's and the crew's too), and the race's clock and wind. */
function state(w: World): string {
  return JSON.stringify({ t: w.t, steps: w.steps, wind: w.wind, pilot: w.pilot, dest: w.dest, running: w.running, paused: w.paused, speed: w.speed,
    logged: w.logged, finishShown: w.finishShown, chartPal: w.settings.chartPal, layers: w.settings.mapLayers, pairs: w.pairs,
    log: w.log ? w.log.moments(w).length : null, boats: w.boats.map(b => ({ ...b, ai: b.ai ? { ...b.ai } : null })) },
    (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
}

/** The page's frames: uneven, as a browser's are (16.7 ms, with now and then a slow one, up to the 50 ms cap). */
const frameDt = (i: number) => [1 / 60, 1 / 60, 0.0171, 1 / 60, 0.033, 1 / 60, 0.016, 0.05][i % 8];

/** Run a scenario both ways: commands at given frames; returns the two runs' states, sampled every 30 frames. */
function both(make: () => World, script: Map<number, Command[]>, frames: number): [string[], string[]] {
  // through the host
  const a: string[] = [], h = new LocalHost(make());
  for (let i = 0; i < frames; i++) {
    for (const c of script.get(i) ?? []) h.send(c);
    if (h.world.running && !h.world.paused) h.frame(frameDt(i));
    if (i % 30 === 0) a.push(state(h.world));
  }
  // the page's old way: its own accumulator and its writes
  const b: string[] = [], w = make(); let acc = 0;
  for (let i = 0; i < frames; i++) {
    for (const c of script.get(i) ?? []) oldWay(w, c);
    if (w.running && !w.paused) {
      acc += frameDt(i) * w.speed;
      while (acc >= DT) { w.step(DT); acc -= DT; if (w.paused) { acc = 0; break; } }
    }
    if (i % 30 === 0) b.push(state(w));
  }
  return [a, b];
}

const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, tideDate: '2026-11-14', ...o }) as Settings;
const at = (list: [number, Command][]) => { const m = new Map<number, Command[]>(); for (const [i, c] of list) (m.get(i) ?? m.set(i, []).get(i)!).push(c); return m; };

describe('the page through the host sails as it did writing to the World', () => {
  it('a race: the helm, the sheets and lines, the band, the crew, the pole, a hail, pause and speed', () => {
    const make = () => { const w = new World(ss2 as unknown as CourseFile, S({ fleet: 3, current: 'real' }), 21); w.running = true; return w; };
    const script = at([
      [5, { k: 'speed', v: 4 }],
      [20, { k: 'helm', steer: 1, luff: false, ctl: { mainsheet: -1 } }], [60, { k: 'helm', steer: 0, luff: false, ctl: {} }],
      [70, { k: 'tiller', v: 0.4 }], [90, { k: 'lash', on: true }], [95, { k: 'tiller', v: -0.2 }], [120, { k: 'lash', on: false }], [121, { k: 'tiller', v: 0 }],
      [130, { k: 'line', key: 'vang', mine: true }], [131, { k: 'ctlTarget', key: 'vang', v: 0.7 }], [150, { k: 'ctlTargetClear', keys: ['vang'] }],
      [160, { k: 'ctlTarget', key: 'outhaul', v: 0.3 }], [161, { k: 'lazyCar', fore: 1, ins: -1 }], [170, { k: 'jumpers', turns: 2.5 }],
      [180, { k: 'crewPlace', place: { across: 'hike', fore: null } }], [200, { k: 'crewPlace', place: { across: 'hike', fore: 'fwd' } }], [230, { k: 'crewPlace', place: null }],
      [240, { k: 'pole', want: true }], [300, { k: 'pole', want: false }],
      [310, { k: 'hail' }], [320, { k: 'handsOff' }], [330, { k: 'pause', on: true }], [340, { k: 'pause', on: false }],
      [350, { k: 'speed', v: 2 }], [360, { k: 'helm', steer: -1, luff: true, ctl: { jibsheet: 1 } }], [400, { k: 'helm', steer: 0, luff: false, ctl: {} }],
      [410, { k: 'allToCrew' }], [420, { k: 'settings', patch: { chartPal: 'dusk' } }], [430, { k: 'speed', v: 1 }],
      [440, { k: 'ctlTarget', key: 'jibsheet', v: 0.2 }], [460, { k: 'ctlTargetClear', keys: ['jibsheet', 'jibsheetW'] }],
      [470, { k: 'settings', patch: { mapLayers: { wind: true } } }], [480, { k: 'shown', logged: true }], [485, { k: 'shown', finishShown: true }],
      [490, { k: 'logNote', note: { key: 'rule', t0: 10, t1: 20, x: 0, y: 0, lost: 0, text: 'a test incident', ref: 0 } }],
      [600, { k: 'penalty', boat: 2 }], [610, { k: 'penalty', boat: 0 }], [800, { k: 'running', on: false }], [820, { k: 'running', on: true }]
    ]);
    const [a, b] = both(make, script, 900);
    const k = a.findIndex((x, i) => x !== b[i]);
    expect(k, `the runs part at frame ${k * 30}`).toBe(-1);
    // (and the commands did something: without them the race goes otherwise)
    const [none] = both(make, new Map(), 900);
    expect(none[none.length - 1]).not.toBe(a[a.length - 1]);
    expect(a.length).toBe(30);
  }, 300_000);

  it('a cruise: the halyards, the pilot, the lights and ensign, a destination', () => {
    const make = () => { const w = new World(COURSES[0], S({ mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'slack' }), 4, { freeSail: true }); w.running = true; return w; };
    const script = at([
      [10, { k: 'speed', v: 4 }], [20, { k: 'sail', sail: 'jib', up: false }], [80, { k: 'sail', sail: 'jib', up: true }],
      [150, { k: 'pilot', op: 'engage', mode: 'auto' }], [170, { k: 'pilot', op: 'adjust', d: 10 }], [200, { k: 'pilot', op: 'tack' }],
      [260, { k: 'pilot', op: 'engage', mode: 'wind' }], [280, { k: 'pilot', op: 'adjust', d: -5 }], [320, { k: 'pilot', op: 'standby' }],
      [330, { k: 'lights', off: true }], [335, { k: 'ensign', struck: true }],
      [340, { k: 'dest', p: { x: 2000, y: 1500 }, name: 'Off somewhere' }], [350, { k: 'pilot', op: 'engage', mode: 'nav' }], [500, { k: 'pilot', op: 'standby' }],
      [510, { k: 'tiller', v: 0.3 }], [530, { k: 'tiller', v: 0 }]
    ]);
    const [a, b] = both(make, script, 700);
    const k = a.findIndex((x, i) => x !== b[i]);
    expect(k, `the runs part at frame ${k * 30}`).toBe(-1);
    // (and the commands did something: without them the race goes otherwise)
    const [none] = both(make, new Map(), 700);
    expect(none[none.length - 1]).not.toBe(a[a.length - 1]);
  }, 300_000);
});
