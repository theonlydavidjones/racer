import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OUTBOARD_PROP } from '../src/boat/outboardMount';
import { buildOutboard, syncOutboard, BOARD_DOWN, BOARD_UP, TILT_UP } from '../src/render/outboard';

/** Run the motor's drawing toward a state for t seconds. */
const run = (o: ReturnType<typeof buildOutboard>, m: Parameters<typeof syncOutboard>[1], t: number) => { for (let k = 0; k < t / 0.05; k++) syncOutboard(o, m, 0.05); };
const revs = (o: ReturnType<typeof buildOutboard>, m: Parameters<typeof syncOutboard>[1]) => { let n = 0; for (let k = 0; k < 20; k++) { const a = o.at.spin; syncOutboard(o, m, 0.001); n += ((o.at.spin - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; } return n / (2 * Math.PI) / 0.02; };

describe('the outboard as drawn follows the motor', () => {
  it('sails tilted up on the raised bracket, and is let down to motor (the board first, then the tilt)', () => {
    const o = buildOutboard(3.5);
    expect(o.at.tilt).toBeCloseTo(TILT_UP); expect(o.at.board).toBeCloseTo(BOARD_UP);
    const m = { down: true, running: false, gear: 'N' as const, throttle: 0 };
    syncOutboard(o, m, 0.5); expect(o.at.board).toBeLessThan(BOARD_UP); expect(o.at.tilt).toBeCloseTo(TILT_UP); // (the board goes first)
    run(o, m, 5); expect(o.at.board).toBeCloseTo(BOARD_DOWN); expect(o.at.tilt).toBeCloseTo(0);
    run(o, { ...m, down: false }, 5); expect(o.at.tilt).toBeCloseTo(TILT_UP); expect(o.at.board).toBeCloseTo(BOARD_UP);
  });
  it('the 2.5 swings round to push astern', () => {
    const o = buildOutboard(2.5); run(o, { down: true, running: true, gear: 'F', throttle: 0, swivel: true }, 3);
    expect(o.at.swivel).toBeCloseTo(Math.PI);
  });
  it('the prop turns only running in gear, faster with the throttle, the other way astern', () => {
    const o = buildOutboard(3.5), on = { down: true, running: true, gear: 'F' as const, throttle: 0 };
    expect(revs(o, { ...on, gear: 'N' })).toBeCloseTo(0); expect(revs(o, { ...on, running: false })).toBeCloseTo(0);
    const idle = revs(o, on), full = revs(o, { ...on, throttle: 1 });
    expect(full).toBeCloseTo(5500 / 60 / 2.15, 0); // (full throttle: 5,500 rpm through the 2.15:1 gearbox, boat/motor.ts)
    expect(idle).toBeGreaterThan(0); expect(idle).toBeLessThan(full / 3);
    expect(revs(o, { ...on, gear: 'R' })).toBeLessThan(0);
  });
  it('stowed, it is off the bracket and the bracket raised; lifted off at the end of stowing, set on at the start of shipping', () => {
    const o = buildOutboard(3.5), off = { down: false, running: false, gear: 'N' as const, throttle: 0 };
    run(o, { ...off, stowed: true }, 5); expect(o.tilt.visible).toBe(false); expect(o.at.board).toBeCloseTo(BOARD_UP);
    syncOutboard(o, { ...off, shifting: { to: 'stowed', left: 20 } }, 0.05); expect(o.tilt.visible).toBe(true); // (still on it, being unclamped)
    syncOutboard(o, { ...off, shifting: { to: 'stowed', left: 1 } }, 0.05); expect(o.tilt.visible).toBe(true); expect(o.tilt.position.y).toBeGreaterThan(o.tiltY); // (lifting off)
    syncOutboard(o, { ...off, shifting: { to: 'bracket', left: 20 } }, 0.05); expect(o.tilt.visible).toBe(false);
    syncOutboard(o, { ...off }, 0.05); expect(o.tilt.visible).toBe(true); expect(o.tilt.position.y).toBeCloseTo(o.tiltY);
    run(o, { ...off, down: true, stowed: true }, 5); expect(o.at.board).toBeCloseTo(BOARD_UP); // (stowed, nothing lets it down)
  });
  it('draws the prop, let down, where the physics has it (boat/outboardMount.ts)', () => {
    for (const hp of [2.5, 3.5, 6] as const) {
      const o = buildOutboard(hp); run(o, { down: true, running: false, gear: 'N', throttle: 0 }, 10);
      o.group.updateMatrixWorld(true); const p = o.prop.getWorldPosition(new THREE.Vector3()), want = OUTBOARD_PROP[hp];
      expect(Math.hypot(p.x - want.x, p.y - want.y, p.z - want.z)).toBeLessThan(0.01);
    }
  });
  it('costs a handful of draw calls (each moving part one mesh a material)', () => {
    let n = 0; buildOutboard(3.5).group.traverse(c => { if ((c as { isMesh?: boolean }).isMesh) n++; });
    expect(n).toBeLessThanOrEqual(10);
  });
});
