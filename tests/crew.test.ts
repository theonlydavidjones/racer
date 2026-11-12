import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt, startTack, courseHeading } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, hikeArm, newCrew, sitArm, type CrewPlace, type CrewSpec } from '../src/boat/crewPhys';
import { bestTrim, heelWetted, heelWettedFactor, mct } from '../src/boat/hullTrim';
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
    // (fresh: once they've settled where they hike, aft in a breeze where the deck's narrower, half a minute in)
    sail(b, 30, () => { b.h = 360 - twa; b.depower = 0; });
    const fresh = Math.max(...b.crew!.people.slice(1).map(p => p.x));
    sail(b, 395, () => { b.h = 360 - twa; b.depower = 0; });
    const tired = b.crew!.people.slice(1);
    expect(Math.max(...tired.map(p => p.fatigue))).toBeGreaterThan(0.3);
    expect(Math.max(...tired.map(p => p.x))).toBeLessThan(fresh - 0.03);
    b.ww = { ...b.ww, kt: 8 }; sail(b, 240, () => { b.h = 360 - beatAngle(8); });
    expect(Math.max(...b.crew!.people.slice(1).map(p => p.fatigue))).toBeLessThan(0.15);
  });
});

describe('A tired crew', () => {
  it('still counts as hiking flat out when tired (their own reach), so they keep her depowered, not easing it off', () => {
    const twa = beatAngle(20), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 20 }); b.crew = newCrew(crewOf(0.6), 'S');
    sail(b, 60, () => { b.h = 360 - twa; }); const fresh = { dep: b.depower!, heel: b.heelMag! };
    sail(b, 600, () => { b.h = 360 - twa; });
    expect(Math.max(...b.crew!.people.slice(1).map(p => p.fatigue))).toBeGreaterThan(0.5);
    expect(b.crew!.allOut).toBe(true);
    expect(b.depower!).toBeGreaterThanOrEqual(fresh.dep - 0.02);
    expect(b.heelMag!).toBeLessThan(fresh.heel + 1.5);
  }, 30000);
});

describe('Where the weight goes, and what she does', () => {
  it('light air: a good crew sits to leeward and heels her; a novice sits in the middle', () => {
    const good = steady(4, beatAngle(4)), novice = steady(4, beatAngle(4), { skill: 0.1 });
    expect(good.b.crew!.mode).toBe('leeward'); expect(good.b.heelMag!).toBeGreaterThan(4);
    expect(novice.b.crew!.arm).toBeGreaterThan(good.b.crew!.arm + 0.15);
  });
  it('in a drifter, heeling her to leeward lets gravity hold the sails in shape: no slower than sitting up to windward', () => {
    // (an expert crew, so both set her up alike: a club crew's backstay steps a little differently between the two, which
    // is worth more than the sails' shape here; physics review. Why sitting near upright does about as well as heeling her
    // in a drifter is a question for the model on its own)
    const lee = steady(3, beatAngle(3), { place: { across: 'lee', fore: null }, skill: 0.9 }), up = steady(3, beatAngle(3), { place: { across: 'up', fore: null }, skill: 0.9 });
    expect(lee.b.heelMag!).toBeGreaterThan(up.b.heelMag! + 3);
    expect(lee.v).toBeGreaterThan(up.v);
  });
  it('fore and aft: forward pays in light air (the transom clear), and trims her by the bow', () => {
    const fwd = steady(6, beatAngle(6), { place: { across: null, fore: 'fwd' } }), aft = steady(6, beatAngle(6), { place: { across: null, fore: 'aft' } });
    expect(fwd.b.crew!.trim).toBeGreaterThan(aft.b.crew!.trim + 0.02);
    // (a little: the wetted surface from the hull's sections falls about 0.04% a centimetre by the bow, hullTrim.ts)
    expect(fwd.v).toBeGreaterThan(aft.v);
  });
  it('heeling her 5–10° hardly changes her wetted area (the Delft series regression, for a narrow deep hull): the low side in light air pays through the sails', () => {
    expect(Math.abs(heelWetted(5))).toBeLessThan(0.01); expect(Math.abs(heelWetted(10))).toBeLessThan(0.01);
    expect(Math.abs(heelWettedFactor(1, 8, 0) - 1)).toBeLessThan(0.002);
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
  it('in light air too: sitting to leeward before the tack, they move up onto the old high side so she rolls through it', () => {
    const range = (skill: number) => {
      const W = 4, twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 2.5, windKt: W }); b.crew = newCrew(crewOf(skill), 'S');
      sail(b, 40); startTack(b); let lo = 0, hi = 0, v0 = kt(b), vMax = 0;
      sail(b, 20, () => { lo = Math.min(lo, b.heel ?? 0); hi = Math.max(hi, b.heel ?? 0); vMax = Math.max(vMax, kt(b)); });
      return { roll: hi - lo, v0, vMax };
    };
    const good = range(0.9), novice = range(0.2);
    expect(good.roll).toBeGreaterThan(novice.roll + 4);
    expect(good.vMax).toBeLessThanOrEqual(good.v0 + 0.01); // never faster than before the tack (RRS 42.3(b))
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
  const lines = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'traveller'] as const;
  it('alone, the helm works one control line at a time; three aboard work several at once', () => {
    const most = (n: number) => {
      const twa = beatAngle(18), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 18 }); b.crew = newCrew(crewOf(0.6, n), 'S');
      sail(b, 0.5); // (set up before she sails)
      // then the lines knocked off, so there's work to do
      // (and the traveller right up, which the main trimmer plays: with three aboard the middle crew, alongside the others)
      Object.assign(b.ctl, { backstay: 0, vang: 0, cunningham: 0, outhaul: 0, traveller: -1 });
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
  it('sailing alone, the helm going forward to move it leaves the tiller: she rounds up on her weather helm meanwhile', () => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 12 }) as Boat; b.isUser = true;
    b.crew = newCrew(crewOf(0.6, 0), 'S');
    sail(b, 20, () => { b.h = 360 - twa; }); b.tiller = 0;
    moveLazyCar(b, 2, 0);
    let away = false, twaMin = 99;
    sail(b, 25, () => { if (b.crew!.people[0].z < 0.5) { away = true; twaMin = Math.min(twaMin, b.twa); } });
    expect(away).toBe(true);
    expect(twaMin).toBeLessThan(twa - 5);
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

describe('Placing the crew yourself: off auto until you give it back (owner, 11 Nov 2026)', () => {
  const PIANO = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham'];
  it('told to hike, they stay hiked through puffs, lulls, a tack and minutes on end; Auto gives it back', () => {
    const W = 12, b = testBoat({ heading: 360 - beatAngle(W), kt: 4.5, windKt: W });
    b.crew = newCrew(crewOf(0.6), 'S'); sail(b, 20);
    b.crew.place = { across: 'hike', fore: null };
    const c = b.crew, bad: string[] = []; let trips = 0;
    // every second, outside the tack itself: still yours, everyone free out on the rail, nobody off at the cabin top
    const check = (when: string) => {
      if (c.place?.across !== 'hike') bad.push(`${when}: place lost`);
      c.people.forEach((p, i) => {
        if (p.job?.station && PIANO.includes(p.job.line) && !p.job.big) bad.push(`${when}: #${i} left the rail for the ${p.job.line}`);
        if (p.job?.big) trips++;
        if (i > 0 && !p.job && c.tgt![i].pose !== 'hike' && !['piano', 'winch', 'car', 'mast'].includes(c.tgt![i].pose)) bad.push(`${when}: #${i} ${c.tgt![i].pose}`); // (a job just done: the plan catches up within 0.05 s)
      });
    };
    const leg = (secs: number, kt: number, label: string) => { b.ww.kt = kt; sail(b, secs, t => { if (t > 5 && Math.abs(t % 1) < 1 / 120) check(`${label} ${t.toFixed(0)}s`); }); };
    leg(30, W, 'steady'); leg(30, 18, 'puff'); leg(30, 6, 'lull');
    b.ww.kt = W; startTack(b); sail(b, 15); expect(b.tack).toBe('P');
    leg(120, W, 'after the tack');
    expect(bad).toEqual([]);
    // (a big change of wind may take the bow hand in for the Cunningham or downhaul, briefly: seconds, not the minutes)
    expect(trips).toBeLessThan(30);
    // the weight is on the new windward side (port), as far out as they reach
    expect(c.side).toBe('P'); expect(c.mode).toBe('hike');
    // Auto: in a drifter a good crew goes back to their own call (to leeward or the middle, not hiking)
    b.ww.kt = 3; c.place = undefined; sail(b, 20);
    expect(c.place).toBeUndefined(); expect(c.mode).not.toBe('hike');
  });
  it('placed, they still shape the sails: the vang goes on as she bears away, and she is as fast as on auto after a lull', () => {
    const run = (place?: CrewPlace) => {
      const b = testBoat({ heading: 360 - beatAngle(20), kt: 5, windKt: 20 }); b.crew = newCrew(crewOf(0.6), 'S'); if (place) b.crew.place = place;
      sail(b, 60); b.ww.kt = 7; let v = 0, n = 0; sail(b, 90, t => { if (t > 60) { v += kt(b); n++; } });
      const lull = v / n; b.ww.kt = 14; b.h = 360 - 150; sail(b, 60, () => { b.h = 360 - 150; });
      return { lull, vang: b.ctl.vang, outhaul: b.ctl.outhaul };
    };
    const auto = run(), placed = run({ across: 'hike', fore: null });
    // placed after a spell on auto in a breeze (the luff pulled on), then a lull: the luff tension still comes off
    const later = (place?: CrewPlace) => {
      const b = testBoat({ heading: 360 - beatAngle(20), kt: 5, windKt: 20 }); b.crew = newCrew(crewOf(0.6), 'S');
      sail(b, 60); if (place) b.crew.place = place; b.ww.kt = 7; let v = 0, n = 0; sail(b, 90, t => { if (t > 60) { v += kt(b); n++; } });
      return v / n;
    };
    expect(later({ across: 'hike', fore: null })).toBeGreaterThan(later() * 0.985);
    expect(placed.lull).toBeGreaterThan(auto.lull * 0.985);
    expect(Math.abs(placed.vang - auto.vang)).toBeLessThan(0.15);
    expect(Math.abs(placed.outhaul - auto.outhaul)).toBeLessThan(0.15);
  });
  it('to leeward in a breeze, they stay there (auto would have them up to windward) until you tap Auto', () => {
    const W = 14, b = testBoat({ heading: 360 - beatAngle(W), kt: 5, windKt: W });
    b.crew = newCrew(crewOf(0.6), 'S'); b.crew.place = { across: 'lee', fore: null };
    sail(b, 60); expect(b.crew.mode).toBe('leeward'); expect(b.crew.place?.across).toBe('lee');
    b.crew.place = undefined; sail(b, 20); expect(['hike', 'windward']).toContain(b.crew.mode);
  });
});

describe('How often the crew move (crewPhys.ts HOLD)', () => {
  /** Ten minutes upwind in a puffy breeze (10 kt, ±2 kt over half a minute, flickering ±0.7 kt every few seconds): how many times each crew member sets off for a new place. */
  let lastTrips: number[] = [];
  function moves(windKt: number): number[] {
    const twa = beatAngle(windKt), b = testBoat({ heading: 360 - twa, kt: 4, windKt }); b.crew = newCrew(crewOf(0.6), 'S');
    sail(b, 30, () => { b.h = courseHeading(b, 360 - twa); });
    const h = b.h, last = b.crew.people.map(p => ({ ...p.goal! })), n = last.map(() => 0), trips = last.map(() => 0); // (then held: her leeway at the mean wind)
    sail(b, 600, t => {
      b.h = h; b.ww = { ...b.ww, kt: windKt + 2 * Math.sin(t * 2 * Math.PI / 30) + 0.7 * Math.sin(t * 2 * Math.PI / 4.3) };
      // (setting off for a seat, or back to one from a job; a trip out to a line at the cabin top is the puff being
      // trimmed for, not the flicker, and is counted on its own)
      b.crew!.people.forEach((p, i) => { if (p.goal && Math.hypot(p.goal.x - last[i].x, p.goal.z - last[i].z) > 0.1) { if (p.job?.station) trips[i]++; else n[i]++; last[i] = { ...p.goal }; } });
    });
    lastTrips = trips.slice(1);
    return n.slice(1);
  }
  it('they sit still through the flicker and move on the real puffs and lulls', () => {
    // in 10 kt they're up on the windward deck whatever the puffs do: they stay there, but for a hike as a puff hits
    for (const m of moves(10)) expect(m).toBeLessThan(20);
    // in 7 kt the same ±2 kt takes her from light air (weight to leeward) to a breeze (up to windward) every half minute:
    // out on the puff and in on the lull (a step more at most), not every flicker (twenty cycles: under four moves a cycle; without the dead
    // band it was over 700)
    for (const m of moves(7)) expect(m).toBeLessThan(80);
    // (and the lines aren't hunted: a trip out to them once a puff-and-lull cycle at most, the outhaul set for the wind
    // there is, not back and forth within one; 18 in the twenty cycles as it stands, each about half a second, kneeling
    // at the cockpit's forward end)
    for (const t of lastTrips) expect(t).toBeLessThanOrEqual(20);
  }, 30000);
});

describe('The dead band answers what matters (physics review)', () => {
  const puffy = (W: number) => (t: number) => W + 2 * Math.sin(t * 2 * Math.PI / 30) + 0.7 * Math.sin(t * 2 * Math.PI / 4.3);
  it("the forward hand isn't parked at the cabin top in a puffy breeze: the lines are set for the wind there is", () => {
    for (const W of [7, 12, 18]) {
      const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4, windKt: W }); b.crew = newCrew(crewOf(0.6), 'S');
      const wind = puffy(W); let at = 0, n = 0;
      sail(b, 300, t => { b.h = 360 - twa; b.ww = { ...b.ww, kt: wind(t) }; if (t > 30) { n++; if (b.crew!.people[2].pose === 'piano') at++; } });
      expect(at / n).toBeLessThan(0.35); // (before the dead band: 26–40% of the time, and up to 91% with a naive one)
    }
  }, 60000);
  it('they hike out as a strong puff hits, not seconds later', () => {
    const twa = beatAngle(8), b = testBoat({ heading: 360 - twa, kt: 4, windKt: 8 }); b.crew = newCrew(crewOf(0.6), 'S');
    sail(b, 40, () => { b.h = 360 - twa; });
    b.ww = { ...b.ww, kt: 18 };
    sail(b, 2.5, () => { b.h = 360 - twa; });
    expect(b.crew.hike).toBeGreaterThan(0.5);
  });
  it('after a roll tack in a moderate breeze they settle to sitting on the new side within a few seconds', () => {
    const b = testBoat({ heading: 360 - beatAngle(9), kt: 4.5, windKt: 9 }); b.crew = newCrew(crewOf(0.7), 'S');
    sail(b, 30, () => { b.h = 360 - beatAngle(9); });
    startTack(b); let t0 = -1;
    sail(b, 25, t => { if (t0 < 0 && !b.crew!.roll && b.tack === 'P' && !b.tacking) t0 = t; if (t0 > 0 && t > t0 + 8) return true; });
    for (const p of b.crew.people.slice(1)) expect(p.lean).toBeLessThan(0.3);
  });
});

describe('A puff with someone away at a job (physics review)', () => {
  it('the rest still hike out as it hits', () => {
    const twa = beatAngle(8), b = testBoat({ heading: 360 - twa, kt: 4, windKt: 8 }); b.crew = newCrew(crewOf(0.6), 'S');
    sail(b, 40, () => { b.h = 360 - twa; });
    // the forward hand off at the cabin top (a job that keeps them there)
    const fwd = b.crew.people[2]; fwd.job = { line: 'pole', reach: 0, work: 1, station: { arm: 0.3, z: 0.85, pose: 'piano' } };
    b.ww = { ...b.ww, kt: 18 };
    sail(b, 2.5, () => { b.h = 360 - twa; b.crew!.people[2].job = fwd.job; });
    expect(b.crew.people[1].lean).toBeGreaterThan(0.5);
    expect(b.crew.people[0].lean).toBeGreaterThan(0.3);
  });
});

describe('The crew\'s places fore and aft and the trim the polar is sailed within', () => {
  it('hullTrim.ts TRIM.reach is the trim a standard crew gives her from crewPhys.ts Z\'s forward and aft ends of the cockpit', async () => {
    const { TRIM, trimFromMoment } = await import('../src/boat/hullTrim');
    const { DEFAULT_CREW, stationZ } = await import('../src/boat/crewPhys');
    const ref = [1.2, 1.8], at = (f: number, deck = false) => trimFromMoment(DEFAULT_CREW.crew.reduce((m, p, j) => m + p.w * (ref[j] - stationZ(j, 2, f, deck)), 0));
    expect(TRIM.reach[0]).toBeCloseTo(at(0), 3); expect(TRIM.reach[1]).toBeCloseTo(at(1), 3);
    // (out on the side deck, aft of the jib winch, the forward end is short of the benches': hullTrim.ts's note)
    expect(at(1, true)).toBeCloseTo(-0.0221, 3);
  });
});
