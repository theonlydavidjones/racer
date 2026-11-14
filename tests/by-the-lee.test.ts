import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import type { Boat } from '../src/boat/boat';
import { tackTarget } from '../src/boat/physics';
import { adjust, engage, newPilot, pilotStep } from '../src/boat/autopilot';

/**
 * Sailing by the lee, and the gybe the wind makes (physics.ts boomStep; the owner, 14 Nov 2026: the main holds 15 to
 * 20° by the lee before the wind gets behind it and it jibes, as a real boat's does; the crash from the physics, not a
 * timer). The wind is from north; she runs south. Flat water, the player's boat, her helm held (so nobody means a gybe).
 * b.boom is + to starboard; by the RRS definitions her tack is her mainsail's side by the lee (tack-definition.test).
 */
const held = (b: Boat, h: number) => { b.h = ((h % 360) + 360) % 360; b.turnRate = 0; b.desired = b.h; };
const byBoom = (b: Boat) => (b.boom < 0 ? 'S' : 'P');
function running(kt: number, change?: (b: Boat) => void) {
  const b = testBoat({ heading: 170, kt: 4, windKt: kt }); b.isUser = true; change?.(b);
  sail(b, 30, () => held(b, 170));
  return b;
}
/** Turned slowly on round her stern, a degree every two seconds: where the wind took the main, and how it went across. */
function taken(b: Boat) {
  const r = { lee: NaN, apparent: NaN, out: NaN, secs: NaN, fastest: 0, wrong: 0 }; let t0 = NaN;
  sail(b, 160, t => {
    if (b.crashT != null) return;
    held(b, 180 + Math.min(75, t * 0.5));
    if (Math.abs(b.boom) >= 1 && byBoom(b) !== b.tack) r.wrong++;
    if (b.boomFree != null) { if (isNaN(t0)) { t0 = t; r.lee = b.h - 180; r.apparent = 180 - Math.abs(b.arel); r.out = Math.abs(b.boom); } r.fastest = Math.max(r.fastest, Math.abs(b.boomFree)); r.secs = t - t0; }
  });
  return r;
}

describe('the main by the lee', () => {
  it('20° by the lee she holds it, for a minute, at 6, 12, 20 and 25 kt: the boom where it lay, her tack her mainsail\'s', () => {
    for (const kt of [6, 12, 20, 25]) {
      const b = running(kt); expect(b.tack).toBe('P'); expect(b.boom).toBeGreaterThan(60);
      sail(b, 60, t => held(b, 180 + Math.min(20, t)));
      expect(b.rel, `${kt} kt: the wind over her starboard quarter, her main's own side`).toBeGreaterThan(0);
      expect(b.tack, `${kt} kt`).toBe('P'); expect(b.boom).toBeGreaterThan(60); expect(b.boomFree).toBeUndefined(); expect(b.crashT).toBeUndefined();
    }
  }, 60_000);
  it('further round, the wind gets behind the leech and takes it: 20 to 32° by the lee in flat water, when the apparent wind is inside the boom\'s line by the sail\'s fullness', () => {
    for (const kt of [6, 12, 20, 25]) {
      const b = running(kt), hook = 2 * Math.atan(2 * b.shape.main.depth) * 180 / Math.PI, r = taken(b);
      expect(r.lee, `${kt} kt`).toBeGreaterThan(20); expect(r.lee, `${kt} kt`).toBeLessThan(32);
      expect(Math.abs(r.apparent - (r.out - hook)), `${kt} kt: apparent ${r.apparent.toFixed(0)}°, the boom at ${r.out.toFixed(0)}° less the leech's ${hook.toFixed(0)}°`).toBeLessThan(4); // (b.arel is the masthead's wind; the sails', a few degrees less round, is what takes it)
      expect(b.crashT, `${kt} kt: it went right across`).toBeDefined(); expect(b.tack).toBe('S'); expect(b.boom).toBeLessThan(-40);
      expect(r.wrong, 'steps on one tack with her main on the other side').toBe(0);
      expect(r.secs, `${kt} kt: once the leech has backed it goes, in seconds`).toBeLessThan(kt < 10 ? 8 : 3.5);
    }
  }, 60_000);
  it('the crash is the wind\'s: quicker and harder the more of it, the boom\'s end at over 10 m/s in 25 kt', () => {
    const a = taken(running(8)), c = taken(running(25));
    expect(c.secs).toBeLessThan(a.secs * 0.6); expect(c.fastest).toBeGreaterThan(a.fastest * 2);
    expect(c.fastest * Math.PI / 180 * 3.3).toBeGreaterThan(10); expect(a.fastest * Math.PI / 180 * 3.3).toBeLessThan(8);
  });
  it('fetched up on its sheet, the boom\'s swing slews her toward the wind she\'s now on', () => {
    const b = running(20); let kick = NaN;
    sail(b, 160, t => { if (b.crashT != null) { if (isNaN(kick)) kick = b.turnRate ?? 0; return; } held(b, 180 + Math.min(75, t * 0.5)); });
    // (the boom swung to port, she's on starboard, the wind over her starboard quarter: her bow to starboard, +)
    expect(kick).toBeGreaterThan(0.3); expect(kick).toBeLessThan(5);
  });
  it('the wind back on her main\'s side just as the leech backs: it fills again, no jibe', () => {
    const b = running(6); let freed = false, at = NaN;
    // (walked round until the wind takes the leech, then put straight back before her run at once: in 6 kt the boom has barely started)
    sail(b, 120, t => { if (!freed) { held(b, 180 + Math.min(60, t * 0.5)); if (b.boomFree != null) { freed = true; at = t; } } else held(b, 170); });
    expect(freed).toBe(true); expect(at).toBeGreaterThan(40);
    expect(b.tack).toBe('P'); expect(b.boom).toBeGreaterThan(60); expect(b.crashT).toBeUndefined(); expect(b.boomFree).toBeUndefined(); expect(b.gybeTo).toBeUndefined();
  });
  it('the jibe key by the lee: her crew hand the main across once, her heading held; not a turn back and two jibes', () => {
    const b = running(12);
    sail(b, 40, t => held(b, 180 + Math.min(18, t)));
    expect(b.tack).toBe('P'); expect(b.boom).toBeGreaterThan(60);
    const h0 = b.h, t0 = tackTarget(b); b.turnDir = t0.dir; b.turnTarget = t0.target;
    let crossings = 0, side = Math.sign(b.boom);
    sail(b, 8, () => { b.turnRate = 0; b.desired = b.h; if (Math.sign(b.boom) !== side && Math.abs(b.boom) > 1) { crossings++; side = Math.sign(b.boom); } });
    expect(t0.target).toBeCloseTo(h0, 6);
    expect(crossings).toBe(1); expect(b.tack).toBe('S'); expect(b.boom).toBeLessThan(-40); expect(b.crashT).toBeUndefined();
    expect(Math.abs(((b.h - h0 + 540) % 360) - 180)).toBeLessThan(3);
  });
});

describe('a gybe that\'s meant', () => {
  // (the owner's ruling, 14 Nov 2026: the jibe key or a called turn; a steering key HELD as her stern passes the wind; not a
  // tap; the tiller in your hand is literal)
  const free = (b: Boat) => { (b as Boat & { handsOff?: boolean }).handsOff = true; };
  it('the jibe key from a run: her crew hand the main across as her stern passes the wind, no crash', () => {
    const b = running(12), t0 = tackTarget(b); b.turnDir = t0.dir; b.turnTarget = t0.target;
    sail(b, 15);
    expect(b.tack).toBe('S'); expect(b.boom).toBeLessThan(-40); expect(b.crashT).toBeUndefined();
  });
  it('a steering key held down as her stern passes the wind: meant, handed across within a few degrees, no crash', () => {
    const b = running(12); let across = NaN;
    sail(b, 12, t => { b.steer = t < 8 ? 1 : 0; if (isNaN(across) && b.boom < 0) across = b.h - 180; });
    expect(b.tack).toBe('S'); expect(b.crashT).toBeUndefined(); expect(across).toBeGreaterThan(3); expect(across).toBeLessThan(20);
  });
  it('taps of a steering key, nudging her 15° by the lee: not meant, the main stays where it lies', () => {
    const b = running(12); free(b);
    // (a fifth of a second every two seconds, until she's 15° by the lee; then left alone)
    sail(b, 90, t => { const by = b.h - 180; b.steer = by < 15 && t % 2 < 0.2 ? 1 : 0; b.tiller = 0; if (by >= 15) { b.h = 195; b.turnRate = 0; } });
    expect(b.h - 180).toBeGreaterThan(12); expect(b.tack).toBe('P'); expect(b.boom).toBeGreaterThan(60); expect(b.crashT).toBeUndefined();
  });
  it('steered slowly through by the tiller in your hand: literal, nobody jibes the main, and the wind takes it', () => {
    const b = running(12); free(b); let rate = 0, n = 0;
    sail(b, 150, () => { if (b.crashT != null) return; b.steer = 0; b.tiller = -0.04; rate += b.turnRate ?? 0; n++; });
    expect(rate / n).toBeGreaterThan(0.2); expect(rate / n).toBeLessThan(2); // (a slow, steady turn to starboard)
    expect(b.crashT).toBeDefined(); expect(b.tack).toBe('S');
  });
  it('the tiller pilot turned 30° across her stern: its turn is a called one, her crew jibe the main, no crash', () => {
    const b = running(12) as Boat & { handsOff?: boolean }, p = newPilot(); let across = 0, side = Math.sign(b.boom);
    engage(b, p, 'auto'); adjust(b, p, 30); b.handsOff = true; b.pilotSteers = true;
    sail(b, 40, t => { pilotStep(b, p, null, t, 1 / 60); if (Math.sign(b.boom) !== side && Math.abs(b.boom) > 1) { across++; side = Math.sign(b.boom); } });
    expect(Math.abs(((b.h - 200 + 540) % 360) - 180)).toBeLessThan(5); // (on her new course, 20° past dead astern on the other jibe)
    expect(b.tack).toBe('S'); expect(across).toBe(1); expect(b.crashT).toBeUndefined();
  });
  it('an AI boat doesn\'t sail by the lee: past 4° her crew gybe at once, as before', () => {
    const b = testBoat({ heading: 170, kt: 4, windKt: 12 }); b.isUser = false; sail(b, 30, () => held(b, 170));
    sail(b, 30, t => held(b, 170 + Math.min(20, t)));
    expect(b.tack).toBe('S'); expect(b.boom).toBeLessThan(-40); expect(b.crashT).toBeUndefined();
  });
});
