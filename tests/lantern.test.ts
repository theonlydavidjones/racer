import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LANTERN_DROP, LANTERN_PIVOT, makeLanternSwing, swingLantern } from '../src/render/cabinInterior';

/** The cabin lantern's swing: a damped pendulum on its chain, hung from a shackle that moves with the hull. */
const hull = () => new THREE.Group();
const angleOff = (s: ReturnType<typeof makeLanternSwing>) => new THREE.Vector3(0, -1, 0).applyQuaternion(s.arm.quaternion).angleTo(new THREE.Vector3(0, -1, 0)) / Math.PI * 180;

describe('cabin lantern', () => {
  it('hangs plumb in still water', () => {
    const g = hull(), s = makeLanternSwing(new THREE.Group()), at = new THREE.Vector3();
    for (let i = 0; i < 300; i++) { g.updateMatrix(); swingLantern(s, g, 1 / 60, at); }
    expect(angleOff(s)).toBeLessThan(0.1);
    expect(at.distanceTo(LANTERN_PIVOT.clone().add(new THREE.Vector3(0, -LANTERN_DROP, 0)))).toBeLessThan(1e-3);
  });

  it('heeled steadily, it settles plumb in the world: off the boat\'s centreline by the heel', () => {
    const g = hull(), s = makeLanternSwing(new THREE.Group()), at = new THREE.Vector3();
    for (let i = 0; i < 60 * 40; i++) { g.rotation.z = Math.min(1, i / 60) * 20 * Math.PI / 180; g.updateMatrix(); swingLantern(s, g, 1 / 60, at); }
    expect(angleOff(s)).toBeGreaterThan(19.5); expect(angleOff(s)).toBeLessThan(20.5);
    // its middle straight below the shackle, in the world
    const pw = LANTERN_PIVOT.clone().applyMatrix4(g.matrix), lw = at.clone().applyMatrix4(g.matrix);
    expect(Math.abs(lw.x - pw.x)).toBeLessThan(1e-3);
  });

  it('swings with a pendulum\'s period, 2π√(ℓ/g), and dies away slowly', () => {
    const g = hull(), s = makeLanternSwing(new THREE.Group()), at = new THREE.Vector3();
    g.updateMatrix(); swingLantern(s, g, 0, at);
    // a small push sideways
    s.v.set(0.1, 0, 0);
    const xs: number[] = [], dt = 1 / 240;
    for (let i = 0; i < 240 * 12; i++) { swingLantern(s, g, dt, at); xs.push(at.x); }
    const ups: number[] = []; for (let i = 1; i < xs.length; i++) if (xs[i - 1] < 0 && xs[i] >= 0) ups.push(i * dt);
    const T = (ups[ups.length - 1] - ups[0]) / (ups.length - 1);
    expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(LANTERN_DROP / 9.81), 1);
    const amp = (a: number, b: number) => Math.max(...xs.slice(a * 240, b * 240).map(Math.abs));
    const r = amp(10, 12) / amp(0, 2);
    expect(r).toBeLessThan(0.4); expect(r).toBeGreaterThan(0.1); // light damping: about a sixth left after 10 s
  });

  it('a jump (a restart) starts it hanging still again', () => {
    const g = hull(), s = makeLanternSwing(new THREE.Group()), at = new THREE.Vector3();
    g.updateMatrix(); swingLantern(s, g, 1 / 60, at); s.v.set(1, 0, 0);
    g.position.set(500, 0, 0); g.updateMatrix(); swingLantern(s, g, 1 / 60, at);
    expect(angleOff(s)).toBeLessThan(0.1);
  });
});
