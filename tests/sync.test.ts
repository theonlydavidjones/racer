// The page's copy of the race (sim/sync.ts; docs/CAPACITY.md step 3): a mirror World, never stepped, fed what changed
// after each frame's steps, must be the real World over again: every member, to the last bit, with its objects keeping
// the same identities (a boat stays the same boat; one object reached two ways is one object), and every question the
// page asks it (the current, the wind, the sea, the marks, right of way, laylines, the strategist, the debriefs) must
// come out the same as asked of the real World. The packets go through a structured clone, as they will through a
// worker's postMessage.
import { describe, expect, it } from 'vitest';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { SyncMirror, SyncSource } from '../src/sim/sync';
import { firstDifference } from './helpers/worlds';
import { applyCommand } from '../src/sim/commands';
import { laylinesFor } from '../src/sim/laylines';
import { startDebrief } from '../src/sim/startDebrief';
import { passageNow, passagePlan } from '../src/sim/navigator';
import { raceBrief } from '../src/sim/strategist';


/** The page's questions, asked of a World: everything it reads through SimView's methods and the analyses it runs. */
function questions(w: World, heavy: boolean): string {
  const pts = [{ x: 0, y: 0 }, { x: 800, y: -400 }, { x: -1500, y: 900 }, { x: 2500, y: 2500 }, ...w.boats.map(b => ({ x: b.x + 30, y: b.y - 20 }))];
  const out: unknown[] = [];
  for (const p of pts) out.push(w.currentAt(p), w.currentAt(p, true), w.windHere(p), w.seaHere(p), w.fieldAt(p), w.fieldExtra(p), w.puffs.at(p), w.lineD(p));
  for (const b of w.boats) {
    out.push(w.nextMark(b)?.name ?? null, w.racing(b), laylinesFor(w, b)); // (not windHere(b, b): it notes the shadow on the boat, and the page never asks it)
    for (const o of w.boats) if (o !== b) out.push(w.rights(b, o).kc.id, w.rights(b, o).rule, w.pairRecord(b, o) ?? null, w.canPassOn(b, o)?.id ?? null);
  }
  const h = w.hailOption(); out.push(h ? [h.kind, h.to.id, h.words] : null);
  if (heavy) {
    out.push(w.log ? [w.log.moments(w), w.log.findings(w)] : null);
    if (w.t > 30) out.push(startDebrief(w));
    if (w.freeSail) out.push(passageNow(w), passagePlan(w)); else if (w.t < 0) out.push(raceBrief(w));
  }
  return JSON.stringify(out, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : typeof v === 'object' && v && 'isUser' in v ? `boat ${(v as { id: number }).id}` : v));
}

/** Sail a World and its mirror together: the real one steps (n steps a frame, as at different speeds); the mirror is fed. */
function sailBoth(make: () => World, frames: number, stepsOf: (i: number) => number, every: number, poke?: (w: World, i: number) => void): number {
  const A = make(), M = make(), src = new SyncSource(A), mirror = new SyncMirror(M);
  let events = 0;
  for (let i = 0; i < frames; i++) {
    poke?.(A, i);
    for (let s = stepsOf(i); s > 0; s--) A.step(DT);
    // (the race's events go with the packet: the page gets them with its own boats in them)
    const evA = A.drainEvents(), evM = mirror.apply(structuredClone(src.capture(evA))) as typeof evA;
    expect(evM.length).toBe(evA.length);
    evA.forEach((e, k) => {
      const m = evM[k]; expect(m.type).toBe(e.type);
      if (e.type === 'incident' && m.type === 'incident') { expect(m.a).toBe(M.boats[e.a.id]); expect(m.b).toBe(M.boats[e.b.id]); expect(m.incident.fouler).toBe(M.boats[e.incident.fouler.id]); expect(m.frames.length).toBe(e.frames.length); }
      else expect(JSON.stringify(m)).toBe(JSON.stringify(e));
    });
    events += evA.length;
    if (i % every === 0 || i === frames - 1) {
      const d = firstDifference(A, M); expect(d, `frame ${i}, t ${A.t.toFixed(1)}`).toBeNull();
      expect(questions(M, i % (every * 5) === 0), `the questions at frame ${i}`).toBe(questions(A, i % (every * 5) === 0));
    }
  }
  return events;
}

const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, tideDate: '2026-11-14', ...o }) as Settings;

describe('the mirror World is the real one over again', () => {
  it('a race of eight in 22 kt, through the start, at 1× and 4×', () => {
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    const events = sailBoth(() => new World(ss10 as unknown as CourseFile, S({ windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }), 3),
      1500, i => (i < 400 ? 1 : i % 9 === 0 ? 12 : 4), 50);
    expect(events).toBeGreaterThan(0); // (horns and messages at least: the events did go through)
  }, 900_000);

  it('a cruise with a destination, the user at the helm through commands', () => {
    sailBoth(() => new World(COURSES[0], S({ mode: 'sail', windKind: 'west', windKt: 14, sailFrom: 'cityfront', sailTo: '', current: 'real' }), 4, { freeSail: true }),
      900, () => 4, 60, (w, i) => {
        if (i === 10) applyCommand(w, { k: 'dest', p: { x: 2000, y: 1500 }, name: 'Off somewhere' });
        if (i === 200) applyCommand(w, { k: 'tiller', v: 0.5 });
        if (i === 260) applyCommand(w, { k: 'tiller', v: 0 });
        if (i === 400) applyCommand(w, { k: 'sail', sail: 'jib', up: false });
        if (i === 600) applyCommand(w, { k: 'ctlTarget', key: 'vang', v: 0.6 });
      });
  }, 900_000);

  it('paddling with the boom crutch in a calm, and a contact (the paddle state and lastHitT go across)', () => {
    sailBoth(() => new World(COURSES[0], S({ mode: 'sail', windKind: 'west', windKt: 1, sailFrom: 'cityfront', sailTo: '', current: 'slack' }), 5, { freeSail: true }),
      400, () => 4, 40, (w, i) => {
        if (i === 5) applyCommand(w, { k: 'paddle', side: 'P' });
        if (i === 120) applyCommand(w, { k: 'paddle', side: 'S', back: true });
        if (i === 200) w.user.lastHitT = w.t; // (as a contact would set it)
        if (i === 300) applyCommand(w, { k: 'paddle', side: null });
      });
  }, 300_000);
});
