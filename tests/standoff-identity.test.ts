// The stand-off places after racing's called off are shared out by which boat she is, never by who's steering (ai.ts
// standOffOrder; FTUE's finding, the Coordinator 21 Nov 2026). Filtered by !isUser, the player's boat sailed on the AI's
// skipper (scripts/check/ghost.cjs sets her isUser false and gives her an AI) joined the list at its head and moved every
// AI boat's place along by one.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { standOffOrder } from '../src/ai/ai';

function calledOff(onAI: boolean) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], windKind: 'west', windKt: 12 } as never, 7);
  while (w.t < 30) w.step(DT);
  w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
  if (onAI) { const u = w.user; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; } // (as ghost.cjs does)
  const ai = w.boats.filter(b => b !== w.user);
  while (!ai.every(b => b.ai!.home) && w.t < 400) w.step(DT);
  return { w, at: ai.map(b => b.ai!.home!.at) };
}

describe('the stand-off places, shared out by identity', () => {
  it('the AI boats keep their places whether or not the player\'s boat is sailing on the AI', () => {
    const plain = calledOff(false), onAI = calledOff(true);
    expect(onAI.at).toEqual(plain.at);
    const keys = new Set(plain.at.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
    expect(keys.size, 'each her own place').toBe(plain.at.length);
  }, 300_000);
  it('the order: every AI boat by id, then the player\'s boat, whatever her flag says', () => {
    const { w } = calledOff(true);
    const order = standOffOrder(w);
    expect(order[order.length - 1]).toBe(w.user);
    expect(order.slice(0, -1).map(b => b.id)).toEqual(w.boats.filter(b => b !== w.user).map(b => b.id));
  }, 300_000);
});
