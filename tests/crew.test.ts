import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt, startTack } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, hikeArm, newCrew, sitArm, type CrewPlace, type CrewSpec } from '../src/boat/crewPhys';
import { bestTrim, mct } from '../src/boat/hullTrim';
import { moveLazyCar } from '../src/boat/physics';
import { KT } from '../src/core/math';
import type { Boat } from '../src/boat/boat';

const crewOf = (skill: number, n = 2): CrewSpec => ({ helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.slice(0, n).map(p => ({ ...p, skill })) });
/** Sail steadily at `twa` (deg, starboard tack) in `W` kt with this crew (and where you've put them); averages over the last 40%. */
function steady(W: number, twa: number, o: { place?: CrewPlace; skill?: number; n?: number; secs?: number } = {}) {
  const secs = o.secs ?? 60, b = testBoat({ heading: 360 - twa, kt: 3, windKt: W });
  b.crew = newCrew(crewOf(o.skill ?? 0.6, o.n ?? 2), 'S'); if (o.place) b.crew.place = o.place;
  let v = 0, helm = 0, n = 0;
  sail(b, secs, t => { b.h = 360 - twa; if (t > secs * 0.6) { v += kt(b); helm += b.helmNeed ?? 0; n++; } });
  return { v: v / n, helm: helm / n, b };
}

describe('Hiking a Folkboat, by the class rules', () => {
  it('legs inboard of the sheer upwind (CR 13.20): hiking reaches about 0.3 m past sitting on the rail, not a dinghy hike', () => {
    const p = { h: 1.75, w: 78 };
    expect(sitArm(p)).toBeGreaterThan(0.7); expect(sitArm(p)).toBeLessThan(0.9);
    expect(hikeArm(p)).toBeGreaterThan(1.25); expect(hikeArm(p)).toBeLessThan(1.45);
    expect(hikeArm({ h: 1.95, w: 78 })).toBeGreaterThan(hikeArm(p)); // taller reaches further
  });
  it('hiking tires them: after minutes on the rail they lean out less, and recover sitting in', () => {
    const twa = beatAngle(22), b = testBoat({ heading: 360 - twa, kt: 5, windKt: 22 });
    sail(b, 5, () => { b.h = 360 - twa; b.depower = 0; });
    const fresh = Math.max(...b.crew!.people.slice(1).map(p => p.x));
    sail(b, 420, () => { b.h = 360 - twa; b.depower = 0; });
    const tired = b.crew!.people.slice(1);
    expect(Math.max(...tired.map(p => p.fatigue))).toBeGreaterThan(0.3);
    expect(Math.max(...tired.map(p => p.x))).toBeLessThan(fresh - 0.03);
    b.ww = { ...b.ww, kt: 8 }; sail(b, 240, () => { b.h = 360 - beatAngle(8); });
    expect(Math.max(...b.crew!.people.slice(1).map(p => p.fatigue))).toBeLessThan(0.15);
  });
});

describe('Where the weight goes, and what she does', () => {
  it('light air: a good crew sits to leeward and heels her; a novice sits in the middle', () => {
    const good = steady(4, beatAngle(4)), novice = steady(4, beatAngle(4), { skill: 0.1 });
    expect(good.b.crew!.mode).toBe('leeward'); expect(good.b.heelMag!).toBeGreaterThan(4);
    expect(novice.b.crew!.arm).toBeGreaterThan(good.b.crew!.arm + 0.15);
  });
  it('in a drifter, heeling her to leeward lets gravity hold the sails in shape: no slower than sitting up to windward', () => {
    const lee = steady(3, beatAngle(3), { place: { across: 'lee', fore: null } }), up = steady(3, beatAngle(3), { place: { across: 'up', fore: null } });
    expect(lee.b.heelMag!).toBeGreaterThan(up.b.heelMag! + 3);
    expect(lee.v).toBeGreaterThan(up.v);
  });
  it('fore and aft: forward pays in light air (the transom clear), and trims her by the bow', () => {
    const fwd = steady(6, beatAngle(6), { place: { across: null, fore: 'fwd' } }), aft = steady(6, beatAngle(6), { place: { across: null, fore: 'aft' } });
    expect(fwd.b.crew!.trim).toBeGreaterThan(aft.b.crew!.trim + 0.02);
    expect(fwd.v).toBeGreaterThan(aft.v * 1.003);
  });
  it('the best trim moves aft as she speeds up (wave-making grows with the bow down)', () => {
    expect(bestTrim(1.2)).toBeGreaterThan(0.03);
    expect(bestTrim(3.2)).toBeLessThan(bestTrim(1.2) - 0.02);
    // two crew moving a metre forward trim her a few centimetres
    const cm = 150 / mct();
    expect(cm).toBeGreaterThan(3); expect(cm).toBeLessThan(10);
  });
  it('bow-down trim adds a little weather helm (the keel bites further forward)', () => {
    const fwd = steady(6, beatAngle(6), { place: { across: null, fore: 'fwd' } }), aft = steady(6, beatAngle(6), { place: { across: null, fore: 'aft' } });
    expect(fwd.helm).toBeGreaterThan(aft.helm);
  });
  it('you can place the crew: hiked out in a moderate breeze she stands up; to leeward she heels', () => {
    const auto = steady(10, beatAngle(10)), hike = steady(10, beatAngle(10), { place: { across: 'hike', fore: null } }), lee = steady(10, beatAngle(10), { place: { across: 'lee', fore: null } });
    expect(hike.b.crew!.arm).toBeGreaterThan(auto.b.crew!.arm + 0.2);
    expect(hike.b.heelMag!).toBeLessThan(auto.b.heelMag! - 1);
    expect(lee.b.heelMag!).toBeGreaterThan(auto.b.heelMag! + 5);
  });
  it('with no wind in the sails and the crew up to windward, she heels to windward', () => {
    const b = testBoat({ heading: 318, kt: 2, windKt: 10 }); b.luff = true; b.crew = newCrew(crewOf(0.6), 'S'); b.crew.place = { across: 'hike', fore: null };
    sail(b, 10, () => { b.h = 318; });
    expect(b.heelMag!).toBeLessThan(-1);
  });
});

describe('Roll tacking (RRS 42.3(b))', () => {
  function tack(skill: number) {
    const W = 10, twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: W }); b.crew = newCrew(crewOf(skill), 'S');
    sail(b, 40); const v0 = kt(b); startTack(b);
    let rolled = false, vAfter = 0, done = -1;
    sail(b, 15, t => { if (b.crew!.roll) rolled = true; if (b.turnTarget == null && done < 0) done = t; if (done >= 0 && t < done + 3) vAfter = Math.max(vAfter, kt(b)); });
    return { b, v0, rolled, vAfter, end: kt(b) };
  }
  it('a skilled crew holds the old high side through the wind, then crosses and flattens her; a novice just crosses, late', () => {
    expect(tack(0.9).rolled).toBe(true);
    expect(tack(0.2).rolled).toBe(false);
  });
  it('the flatten after the tack lasts as long onto either tack (it ends once she is upright)', () => {
    const flatten = (tack: 'S' | 'P') => {
      const W = 10, twa = beatAngle(W), hd = tack === 'S' ? 360 - twa : twa, b = testBoat({ heading: hd, kt: 4.5, windKt: W });
      b.crew = newCrew(crewOf(0.9), tack); sail(b, 30); startTack(b);
      let t = 0; sail(b, 15, () => { if (b.crew!.roll?.phase === 'flatten') t += 1 / 60; });
      return t;
    };
    const s = flatten('S'), p = flatten('P');
    expect(s).toBeGreaterThan(0.5); expect(p).toBeGreaterThan(0.5); expect(Math.abs(s - p)).toBeLessThan(0.3);
  });
  it('in a 2-tonne keelboat it is worth little either way, and never makes her faster than she was before it', () => {
    // (the model has the roll's push on the rig (physics.ts rigSway); the help it gives steering her through the wind,
    // heeled, with less rudder, isn't modelled yet: ROADMAP)
    const good = tack(0.9), novice = tack(0.2);
    expect(good.end).toBeGreaterThanOrEqual(novice.end * 0.985);
    expect(good.vAfter).toBeLessThan(good.v0);
  });
});

describe('Crew work: one job at a time, at their pace (2d)', () => {
  const lines = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham'] as const;
  it('alone, the helm works one control line at a time; three aboard work several at once', () => {
    const most = (n: number) => {
      const twa = beatAngle(18), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 18 }); b.crew = newCrew(crewOf(0.6, n), 'S');
      sail(b, 0.5); // (set up before she sails)
      // then the lines knocked off, so there's work to do
      Object.assign(b.ctl, { backstay: 0, vang: 0, cunningham: 0, outhaul: 0 });
      let prev = { ...b.ctl }, top = 0;
      sail(b, 40, () => { b.h = 360 - twa; const moving = lines.filter(k => Math.abs(b.ctl[k] - prev[k]) > 1e-6).length; top = Math.max(top, moving); prev = { ...b.ctl }; });
      return top;
    };
    expect(most(0)).toBe(1);
    expect(most(2)).toBeGreaterThan(1);
  });
  it('a skilled crew sets the pole faster than a novice', () => {
    const poleTime = (skill: number) => {
      const b = testBoat({ heading: 190, kt: 4, windKt: 10 }); b.crew = newCrew(crewOf(skill), 'S'); sail(b, 5, () => { b.h = 190; });
      b.poleWant = true; return sail(b, 30, () => { b.h = 190; return b.pole === 'set'; });
    };
    expect(poleTime(0.95)).toBeLessThan(poleTime(0.2) * 0.75);
  });
  it('no one starts on a control line in the middle of a tack', () => {
    const twa = beatAngle(14), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 14 }); sail(b, 30); startTack(b);
    let bad = false;
    sail(b, 8, () => { if (b.tacking) for (const p of b.crew!.people) if (p.job && !['jibsheet', 'mainsheet', 'jibsheetW'].includes(p.job.line) && p.job.reach > 0) bad = true; });
    expect(bad).toBe(false);
  });
});

describe('The jib cars: rarely moved', () => {
  it('in a steady breeze the crew moves the lazy car at most once in five minutes, and never the loaded one', () => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 12 });
    sail(b, 2); const loaded = { ...b.ctl.car.P };
    let moves = 0, last = JSON.stringify(b.ctl.car.S);
    sail(b, 300, () => { b.h = 360 - twa; const now = JSON.stringify(b.ctl.car.S); if (now !== last) { moves++; last = now; } });
    expect(moves).toBeLessThanOrEqual(1);
    expect(b.ctl.car.P).toEqual(loaded);
  });
  it('moving it takes someone out of the cockpit, forward to the cabin top: their weight goes with them', () => {
    const twa = beatAngle(10), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 10 }) as Boat;
    sail(b, 20, () => { b.h = 360 - twa; }); const trim0 = b.crew!.trim;
    moveLazyCar(b, 2, 0);
    let fwd = 99, trimMax = -1;
    sail(b, 25, () => { b.h = 360 - twa; fwd = Math.min(fwd, ...b.crew!.people.map(p => p.z)); trimMax = Math.max(trimMax, b.crew!.trim); });
    expect(fwd).toBeLessThan(0); // out of the cockpit, on the cabin top's side deck aft of the mast
    expect(trimMax).toBeGreaterThan(trim0 + 0.02); // bow down while they're there
    expect(b.carCmd).toBeNull();
    void KT;
  });
});
