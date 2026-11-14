import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail, startTack, courseHeading } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew, type CrewPlace } from '../src/boat/crewPhys';
import { buildCrew, ground, syncCrew, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { SLIPS } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { n360 } from '../src/core/math';

/** Points along every bone of a figure (the boat's frame): the hips to the knees and feet, the shoulders to the hands, the spine, the head. */
function bones(f: Figure, step = 0.25): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0));
  const out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += step) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { const hip = w(l.root), knee = w(l.mid), ankle = w(l.mid, -BONE.shin); seg(`thigh${i}`, hip, knee); seg(`shin${i}`, knee, ankle); });
  f.arm.forEach((a, i) => { const sh = w(a.root), el = w(a.mid), wr = w(a.mid, -BONE.fore); seg(`upper${i}`, sh, el); seg(`fore${i}`, el, wr); });
  seg('spine', w(f.root), w(f.head)); out.push({ name: 'head', p: w(f.head, 0.12) });
  return out;
}
/** Anything of a person below the surface under it (a little allowance for the bone's own thickness), inside the hull. */
function through(cr: Crew, label: string, bad: string[]): void {
  for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, i) => [`crew${i + 1}`, f] as const)] as const) {
    if (!f.root.visible) continue;
    // (the helm every 2 cm or so along each bone: a shin through the coaming, only a few centimetres thick, isn't
    // stepped over. The crew at a quarter bone for now: at 2 cm their moves along the deck show grazes of 3–8 cm to
    // be worked through, a follow-up)
    for (const { name, p } of bones(f, 0.05)) {
      if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02) continue; // (outboard: hiking out over the side)
      const g = ground(p.x, p.z);
      if (p.y < g - 0.025) bad.push(`${label}: ${who} ${name} ${(g - p.y).toFixed(2)} m into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    }
  }
}

/**
 * Elbows the right way: an elbow points back or out, away from the way the torso faces, never forward of the line from
 * the shoulder to the wrist (the owner: "these arms are backwards. poor guy", the forward hand at the cabin top's lines,
 * both forearms pointing back past his body).
 */
function elbows(cr: Crew, label: string, bad: string[]): void {
  for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, i) => [`crew${i + 1}`, f] as const)] as const) {
    if (!f.root.visible) continue;
    f.root.updateMatrixWorld(true);
    const w = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    // (forward: the way they face, level, by their heading: a crouch pitches the torso over, and an elbow hanging straight
    // down isn't forward of anything)
    const fw = w(f.root, 0, 0, -1).sub(w(f.root)).setY(0);
    f.arm.forEach((a, i) => {
      const sh = w(a.root), el = w(a.mid), wr = w(a.mid, 0, -BONE.fore), line = wr.clone().sub(sh), t = el.clone().sub(sh).dot(line) / line.lengthSq();
      const off = el.clone().sub(sh.clone().addScaledVector(line, t)), ahead = off.dot(fw) / fw.length();
      if (ahead > 0.06) bad.push(`${label}: ${who} arm${i} elbow ${ahead.toFixed(2)} m forward of its shoulder-to-wrist line`);
    });
  }
}

function run(o: { kt: number; twa?: number; place?: CrewPlace; tack?: boolean; secs?: number; n?: number; pole?: boolean }, label: string): string[] {
  const twa = o.twa ?? beatAngle(o.kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: o.kt });
  const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, o.n ?? 2) };
  b.crew = newCrew(spec, 'S'); if (o.place) b.crew.place = o.place;
  const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [];
  let hold = true;
  sail(b, 20, () => { b.h = courseHeading(b, 360 - twa); }); // (her course at that angle)
  const frames = (secs: number) => { for (let i = 0; i < secs * 30; i++) { sail(b, 1 / 30, () => { if (hold && b.turnTarget == null) b.h = courseHeading(b, 360 - twa); }); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking); through(cr, `${label} ${i}`, bad); elbows(cr, `${label} ${i}`, bad); } };
  frames(3);
  if (o.tack) { hold = false; startTack(b); frames(o.secs ?? 14); }
  else if (o.pole) { b.poleWant = true; frames(o.secs ?? 30); } // (the pole goes out, and they go forward)
  return bad;
}

describe('The crew never pass through the boat (render/crew.ts)', () => {
  const cases: [string, Parameters<typeof run>[0]][] = [
    ['light air, to leeward', { kt: 4 }], ['Mid: on the cockpit sole', { kt: 8, place: { across: 'mid', fore: null } }],
    ['Lee, placed', { kt: 8, place: { across: 'lee', fore: null } }], ['Up, a breeze', { kt: 12 }], ['hiking', { kt: 20 }],
    ['forward, light air', { kt: 6, place: { across: null, fore: 'fwd' } }], ['aft', { kt: 12, place: { across: null, fore: 'aft' } }],
    ['a tack in light air', { kt: 5, tack: true }], ['a tack in a breeze', { kt: 14, tack: true }], ['a tack hiking', { kt: 20, tack: true }],
    ['downwind, light', { kt: 6, twa: 160 }], ['downwind, breeze', { kt: 16, twa: 165 }], ['a gybe', { kt: 12, twa: 160, tack: true }],
    ['pole out on a light-air run: up on the foredeck, and the trip there', { kt: 7, twa: 172, pole: true, secs: 40 }],
    ['two aboard, a tack', { kt: 12, tack: true, n: 1 }], ['alone, a tack', { kt: 10, tack: true, n: 0 }], ['alone, light air', { kt: 4, n: 0 }],
  ];
  for (const [name, o] of cases) it(name, () => { const bad = run(o, name); expect(bad.slice(0, 8)).toEqual([]); }, 180_000); // (every 2 cm of every bone of every figure: some seconds a case)
  // (the forward hand at the cabin top's lines, held there, on both tacks: kneeling at the cockpit's forward end, and from
  // the side deck for the lines worked from either side; where the owner saw the arms bent backwards)
  for (const tack of ['S', 'P'] as const) for (const arm of [0.3, 0.65]) it(`at the cabin top's lines, ${tack === 'S' ? 'starboard' : 'port'} tack, ${arm > 0.55 ? 'from the side deck' : 'kneeling'}`, () => {
    const twa = beatAngle(12), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: 12 }); b.tack = tack;
    b.crew = newCrew(DEFAULT_CREW, tack);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [];
    sail(b, 10);
    // (put there, as the physics puts them for a cabin-top line: crewWork.ts PIANO's station, at its after end)
    const w = tack === 'S' ? 1 : -1;
    for (let i = 0; i < 6 * 30; i++) {
      sail(b, 1 / 30);
      const f = b.crew.people[2]; f.pose = 'piano'; f.x = arm * w; f.z = 0.85; f.goal = { x: f.x, z: f.z }; f.lean = 0;
      syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
      if (i > 60) { through(cr, `piano ${i}`, bad); elbows(cr, `piano ${i}`, bad); }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  }, 180_000); // (every 2 cm of every bone of every figure: some seconds a case)
});

/** The fastest any point of anyone moved in one frame (m/s), and how much they moved at all, over `frames`. */
function motion(o: { kt: number; twa?: number; tack?: boolean; puff?: number }, secs: number) {
  const twa = o.twa ?? beatAngle(o.kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: o.kt });
  b.crew = newCrew(DEFAULT_CREW, 'S');
  const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), dt = 1 / 30;
  let hold = true;
  sail(b, 20, () => { b.h = courseHeading(b, 360 - twa); }); // (her course at that angle)
  const step = () => { sail(b, dt, () => { if (hold && b.turnTarget == null) b.h = courseHeading(b, 360 - twa); }); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, dt, false, undefined, b.heel, b.tacking); };
  for (let i = 0; i < 60; i++) step();
  if (o.tack) { hold = false; startTack(b); }
  if (o.puff) b.ww = { ...b.ww, kt: o.puff };
  const pts = () => [cr.helm, ...cr.crew].flatMap((f, w) => bones(f).map(q => ({ n: `${w ? 'crew' + w : 'helm'} ${q.name}`, p: q.p })));
  let prev = pts(), fastest = 0, total = 0, where = '';
  for (let i = 0; i < secs * 30; i++) {
    step(); const now = pts();
    now.forEach((p, j) => { const d = p.p.distanceTo(prev[j].p); if (d / dt > fastest) { fastest = d / dt; where = `${p.n} at frame ${i}`; } total += d; });
    prev = now;
  }
  return { fastest, total, where };
}

describe('The figures are where the crew are (render/crew.ts)', () => {
  // (settled after a tack, each figure sits where the physics has that person, give or take the thwart's gap the seats
  // snap round: not left at a place along the deck that was theirs a moment ago, as one was, sat down and stood up
  // again at the seat aft of the thwart for seconds while she was hiking forward of it)
  for (const kt of [14, 20]) it(`after a tack in ${kt} kt`, () => {
    const twa = beatAngle(kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: kt });
    const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, 2) };
    b.crew = newCrew(spec, 'S');
    const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
    let hold = true;
    sail(b, 20, () => { b.h = courseHeading(b, 360 - twa); });
    const step = () => { sail(b, 1 / 30, () => { if (hold && b.turnTarget == null) b.h = courseHeading(b, 360 - twa); }); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking); };
    for (let i = 0; i < 90; i++) step();
    hold = false; startTack(b);
    const still = cr.crew.map(() => 0), bad: string[] = [];
    for (let i = 0; i < 16 * 30; i++) {
      const before = b.crew!.people.map(p => p.z); step();
      b.crew!.people.slice(1).forEach((p, j) => {
        still[j] = ['sit', 'hike', 'lee'].includes(p.pose) && Math.abs(p.z - before[j + 1]) < 1e-3 ? still[j] + 1 : 0;
        if (still[j] > 4 * 30 && Math.abs(cr.crew[j].root.position.z - p.z) > 0.45) bad.push(`frame ${i}: crew${j + 1} drawn at ${cr.crew[j].root.position.z.toFixed(2)}, is at ${p.z.toFixed(2)}`);
      });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 180_000);
});

describe('The crew move like people (render/crew.ts)', () => {
  it('sitting in a steady breeze, they sit still: no jitter', () => {
    const m = motion({ kt: 12 }, 20);
    expect(m.total / 20 / 60).toBeLessThan(0.002); // (under 2 mm a second for any point, on average)
  });
  // (a knee or a hand in a quick step or reach goes about 5 m/s at most (an estimate); faster than that, at 30 frames a
  // second, is a part jumping from place to place)
  for (const [name, o] of [['a tack', { kt: 10, tack: true }], ['a gybe', { kt: 12, twa: 160, tack: true }], ['a puff', { kt: 8, puff: 18 }], ['a lull', { kt: 18, puff: 8 }]] as const)
    it(`${name}: nothing jumps (no limb faster than a person moves)`, () => { const m = motion(o, 15); expect(m.fastest, m.where).toBeLessThan(5.5); });
});

describe('Everyone sits on something (render/crew.ts)', () => {
  /** How far each seated person's pelvis is off what they're sitting on (m): the seat, the deck or its edge, the coaming. */
  function gaps(o: { kt: number; twa?: number; place?: CrewPlace; puffy?: boolean }, secs = 40): { worst: number; where: string } {
    const twa = o.twa ?? beatAngle(o.kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: o.kt });
    b.crew = newCrew(DEFAULT_CREW, 'S'); if (o.place) b.crew.place = o.place;
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), dt = 1 / 30;
    sail(b, 20, () => { b.h = courseHeading(b, 360 - twa); }); // (her course at that angle)
    const h0 = b.h; let worst = 0, where = '';
    for (let i = 0; i < secs * 30; i++) {
      sail(b, dt, t => { b.h = h0; if (o.puffy) b.ww = { ...b.ww, kt: o.kt + 3 * Math.sin((i * dt + t) * 2 * Math.PI / 12) }; });
      syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, dt, false, undefined, b.heel, b.tacking);
      if (i < 30) continue;
      [cr.helm, ...cr.crew].forEach((f, w) => {
        const p = b.crew!.people[w];
        // (kneeling in the middle of the cockpit is on a knee, not the pelvis: the clipping checks cover it; walking along
        // the side deck or settling into the place they've walked to, they're not seated yet)
        if (!['sit', 'hike', 'lee', 'helm'].includes(p.pose) || f.going || f.tack || f.walked || (w > 0 && Math.abs(p.x) < 0.3)) return;
        f.root.updateMatrixWorld(true);
        const hip = f.root.getWorldPosition(new THREE.Vector3()), e = halfBeam(uAtZ(hip.z));
        // (stepping from one seat to another, over the coaming, the pelvis is up for a moment: settled ones only)
        const was = (f as Figure & { _was?: THREE.Vector3 })._was; (f as Figure & { _was?: THREE.Vector3 })._was = hip.clone();
        if (!was || was.distanceTo(hip) > 0.01) return;
        // (the pelvis sits about 9 cm, scaled, above what's under it; a hiker's is over the deck's edge)
        const under = ground(Math.sign(hip.x) * Math.min(Math.abs(hip.x), e - 0.01), hip.z) + 0.09 * f.scale;
        const g = Math.abs(hip.y - under);
        if (g > worst) { worst = g; where = `${w ? 'crew' + w : 'helm'} ${p.pose} frame ${i} hip (${hip.x.toFixed(2)}, ${hip.y.toFixed(2)}, ${hip.z.toFixed(2)}) seat ${under.toFixed(2)}`; }
      });
    }
    return { worst, where };
  }
  for (const [name, o] of [['a breeze', { kt: 12 }], ['hiking', { kt: 20 }], ['hiking in puffs', { kt: 17, puffy: true }], ['light air', { kt: 4 }], ['told to hike', { kt: 12, place: { across: 'hike', fore: null } }]] as const)
    it(`${name}: no pelvis more than 5 cm off its seat`, () => { const g = gaps(o); expect(g.worst, g.where).toBeLessThan(0.05); });
});

describe('Two crew keep to themselves (render/crew.ts)', () => {
  it('kneeling side by side in the middle of the cockpit they don\'t pass through each other; in a gybe they brush for a moment at most', () => {
    // (light air, deep downwind, both crew in the middle: on main before this they overlapped in every frame)
    const twa = 160, b = testBoat({ heading: 360 - twa, kt: 4, windKt: 12 });
    b.crew = newCrew(DEFAULT_CREW, 'S');
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1); let hold = true;
    sail(b, 20, () => { b.h = 360 - twa; });
    const step = () => { sail(b, 1 / 30, () => { if (hold && b.turnTarget == null) b.h = 360 - twa; }); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking); };
    const touching = () => { const A = bones(cr.crew[0]), B = bones(cr.crew[1]); return A.some(a => B.some(q => a.p.distanceTo(q.p) < 0.06)); };
    let steady = 0, gybe = 0;
    for (let i = 0; i < 60; i++) { step(); if (touching()) steady++; }
    hold = false; startTack(b);
    for (let i = 0; i < 450; i++) { step(); if (touching()) gybe++; }
    expect(steady).toBe(0);
    expect(gybe).toBeLessThan(60); // (two seconds, as they change sides)
  });
});

/**
 * No backwards arms, in whatever they're doing (the owner, twice, 13 and 14 Nov: "still have backwards arms", the crew's
 * forearms pointing back past their bodies, fists behind them). Every figure, every frame of a race's start with its
 * tacks on both tacks, cruises close-hauled, reaching and running, and at the dock:
 * - no elbow forward of the line from the shoulder to the wrist (as elbows()), once they're in a pose and still in it
 *   half a second on, not walking: an elbow swinging round as the hands go from one place to the next (up on the cabin
 *   top's lines to the knees) passes forward for a tenth of a second, which isn't this (a follow-up);
 * - no hand more than 0.2 m behind its shoulder, in the torso's own frame. The main hand tacking the main had their hands
 *   on the mainsheet at the thwart behind them while facing forward, 0.31 m behind the shoulder: reached through the
 *   elbow. A hiker's hand on the rail beside the hip, leaning out, is up to 0.16.
 */
describe('No backwards arms anywhere (render/crew.ts)', () => {
  function watch(label: string, w: World, b: World['boats'][number], secs: number, bad: string[]): void {
    const cr = buildCrew(b.crew!.spec.helm, b.crew!.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1); new THREE.Group().add(cr.group);
    const end = w.t + secs, held = [0, 1, 2].map(() => ({ pose: '', t: w.t }));
    while (w.t < end) {
      w.step(DT); syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, DT, false, undefined, b.heel, b.tacking);
      const at = `${label} t ${w.t.toFixed(2)}`;
      [['helm', cr.helm], ...cr.crew.map((f, i) => [`crew${i + 1}`, f] as const)].forEach(([who, f], k) => {
        const fig = f as Figure; if (!fig.root.visible) return; fig.root.updateMatrixWorld(true);
        const pose = b.crew!.people[k].pose; if (pose !== held[k].pose || fig.going || fig.route) { held[k] = { pose, t: w.t }; }
        const settled = w.t - held[k].t > 0.5;
        const wv = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0)), fw = fig.root.localToWorld(new THREE.Vector3(0, 0, -1)).sub(wv(fig.root)).setY(0);
        const tq = fig.torso.getWorldQuaternion(new THREE.Quaternion()).invert();
        fig.arm.forEach((a, i) => {
          const sh = wv(a.root), el = wv(a.mid), wr = wv(a.mid, -BONE.fore);
          const rel = wr.clone().sub(sh).applyQuaternion(tq);
          if (rel.z > 0.2) bad.push(`${at}: ${who} ${pose} arm${i} hand ${rel.z.toFixed(2)} m behind its shoulder`);
          const line = wr.clone().sub(sh), t = el.clone().sub(sh).dot(line) / line.lengthSq(), off = el.clone().sub(sh.clone().addScaledVector(line, t)), ahead = off.dot(fw) / fw.length();
          if (settled && ahead > 0.06 && -off.y < ahead) bad.push(`${at}: ${who} ${pose} arm${i} elbow ${ahead.toFixed(2)} m forward of its shoulder-to-wrist line`);
        });
      });
    }
  }
  it('racing (the start and its tacks, 16 kt), cruising (close-hauled, a reach, a run, 12 kt), at the dock', () => {
    const bad: string[] = [];
    { const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 16, tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0, mode: 'race', fleet: 2, opponents: ['stock:1', 'stock:2'] } as Settings;
      const w = new World(COURSES[0], S, 3, {}); watch('race', w, w.boats.find(x => !x.isUser)!, 130, bad); } // (tacks on starboard and port before the gun)
    for (const twa of [45, 90, 150]) {
      const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
      const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user, p = LL(37.835, -122.40); u.x = p.x; u.y = p.y;
      w.step(DT); u.h = n360(u.ww.from + twa); u.v = 2.5; engage(u, w.pilot, 'auto'); watch(`cruise ${twa}`, w, u, 40, bad);
    }
    { const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
      const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
      const w = new World(COURSES[0], S, 1, { freeSail: true }); watch('dock', w, w.user, 15, bad); }
    expect(bad.slice(0, 8)).toEqual([]);
  }, 300_000);
});
