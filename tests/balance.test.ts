import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import type { Controls } from '../src/boat/controls';
import type { Boat } from '../src/boat/boat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { netDrive } from '../src/boat/balance';
import { takeLine } from '../src/boat/physics';
import { polar } from '../src/boat/polar';
import { KT } from '../src/core/math';
import { crewWords } from '../src/ui/crewWords';

/** Beat at `windKt` with the crew's settings, then (optionally) change the controls yourself and settle again. */
/** Sail her close-hauled; `full`: the crew held at full power (no depowering of their own), so one line's own effect shows. */
function beat(windKt: number, change?: (c: Controls) => void, full = !!change, secs = 20): Boat {
  const twa = beatAngle(windKt), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt });
  sail(b, secs, () => { b.h = 360 - twa; if (full) b.depower = 0; });
  if (change) {
    const base = JSON.parse(JSON.stringify(b.ctl));
    b.manualTrim = true; b.trimAll = true; b.ctl = base; change(b.ctl);
    sail(b, 12, () => { b.h = 360 - twa; if (full) b.depower = 0; });
  }
  return b;
}

describe('Heel from the forces on the sails', () => {
  it('heels more as the breeze builds, until the crew hold her at her best (hiking, then depowering)', () => {
    const h8 = beat(8).heelMag!, h14 = beat(14).heelMag!, h20 = beat(20).heelMag!;
    expect(h8).toBeLessThan(h14);
    expect(h14).toBeGreaterThan(10); expect(h14).toBeLessThan(20);
    expect(h14).toBeLessThan(h20);
    expect(h20).toBeGreaterThan(18); expect(h20).toBeLessThan(30);
    // held at full power she'd be well over (the righting moment from the ORC certificates)
    // (the crew depower only as far as is fastest; with the helm on the after deck, where it's narrower, about 0.3° less
    // between the two than with the helm at the tiller's end)
    expect(beat(20, undefined, true).heelMag!).toBeGreaterThan(h20 + 3.0); // (steady, 3.8°: this is 12 s in)
  });
  it('heels at once in a gust', () => {
    const b = beat(12), before = b.heelMag!;
    b.ww = { ...b.ww, kt: 18 }; // a puff
    sail(b, 1.5, () => { b.h = 360 - beatAngle(12); });
    expect(b.heelMag!).toBeGreaterThan(before + 3);
  });
  it('depowering stands her up once the crew are hiking flat out: backstay, outhaul and traveller down all reduce heel', () => {
    const base = beat(22, undefined, true).heelMag!;
    expect(beat(22, c => { c.backstay = 1; }).heelMag!).toBeLessThan(base);
    // (the outhaul's on its band already in 22 kt, North Sails: easing it heels her more)
    expect(beat(22, c => { c.outhaul = 0; }).heelMag!).toBeGreaterThan(base);
    expect(beat(22, c => { c.traveller = Math.min(1, c.traveller + 0.6); }).heelMag!).toBeLessThan(base - 4);
    expect(beat(22, c => { c.backstay = 0; c.outhaul = 0; }).heelMag!).toBeGreaterThan(base + 1); // fuller: more power, more heel
  });
  it('in a moderate breeze the crew hike to hold her; depowering lets them hike less', () => {
    const full = beat(16, undefined, true), flat = beat(16, c => { c.backstay = 1; c.outhaul = 1; });
    expect(full.crew!.mode).toBe('hike');
    expect(flat.crew!.hike).toBeLessThan(full.crew!.hike);
  });
  it('vang-sheeting: easing the main with the vang on keeps the leech closed while she comes upright', () => {
    // (the main eased on its sheet, the traveller centred: with the vang on, the leech stays closed)
    const on = beat(16, c => { c.vang = 1; c.traveller = 0; c.mainsheet = 0.35; }), off = beat(16, c => { c.vang = 0; c.traveller = 0; c.mainsheet = 0.35; });
    expect(on.heelMag!).toBeLessThan(beat(16, undefined, true).heelMag!);
    expect(on.shape.main.twist).toBeLessThan(off.shape.main.twist - 4);
  });
});

describe('The keel and the heel, by the same balance everywhere', () => {
  it("the keel's induced drag is for the force square to her centre plane (ORC VPP Documentation 2022, §3, eq. 6.33), so heeling her doesn't lighten it", () => {
    // the same sail forces at 15°, 22° and 30° of heel: the keel answers the same push along its own heeled span
    // (ORC's MHSD), so the drag, and what's left to push her along, are the same (past 15°, where ORC's
    // nearly-upright multiplier, Fig. 6.8, has gone)
    const f = { main: { heel: 700, drive: 260 }, jib: { heel: 300, drive: 140 } };
    const at = (h: number) => netDrive(f, h, 2.5);
    expect(at(22)).toBeCloseTo(at(15), 6);
    expect(at(30)).toBeCloseTo(at(15), 6);
    expect(at(15)).toBeLessThan(400); // (and it is a drag: less than the sails' 400 N of drive)
  });
  it('off the wind she heels as far as the balance of moments says, with no step at a broad reach', () => {
    // the crew held in the middle, so only the sails' force heels her: it eases smoothly as she bears away
    const heelAt = (twa: number) => {
      const b = testBoat({ heading: 360 - twa, kt: polar(28, twa, 'jib') / KT, windKt: 28 });
      b.crew = newCrew(DEFAULT_CREW, 'S'); b.crew.place = { across: 'mid', fore: null };
      sail(b, 40, () => { b.h = 360 - twa; });
      return { heel: b.heelMag!, eq: b.heelEqLast! };
    };
    const a = heelAt(118), c = heelAt(122);
    expect(Math.abs(a.heel - c.heel)).toBeLessThan(2);
    expect(Math.abs(c.heel - c.eq)).toBeLessThan(1);
  });
});

describe('Helm balance (weather helm)', () => {
  it('a little weather helm in a moderate breeze, more as she heels', () => {
    const h12 = beat(12).helmNeed!, h20 = beat(20, undefined, true).helmNeed!; // (20 kt held at full power: heeled)
    expect(h12).toBeGreaterThan(0.5); expect(h12).toBeLessThan(4);
    expect(h20).toBeGreaterThan(h12 + 2);
  });
  it('easing the boom past its best angle (traveller down, sheet eased) and the backstay on take weather helm off; easing the main further can give lee helm', () => {
    const base = beat(16, undefined, true).helmNeed!;
    // (the traveller down and the sheet eased, as the name says: dropped on its own, the crew sheets in to keep the boom
    // where they want it, so it doesn't ease the boom)
    expect(beat(16, c => { c.traveller = 1; c.mainsheet = Math.min(1, c.mainsheet + 0.12); }).helmNeed!).toBeLessThan(base - 2);
    expect(beat(16, c => { c.backstay = 1; }).helmNeed!).toBeLessThan(base);
    // (eased until it's luffing hard: the main's flogging slows her too, physics.ts sailFlog)
    expect(beat(16, c => { c.mainsheet += 0.25; }).helmNeed!).toBeLessThan(0);
  });
  it('let go of the tiller with weather helm and she rounds up into the wind', () => {
    const b = beat(16), twa0 = b.twa;
    (b as Boat & { handsOff?: boolean }).handsOff = true; b.tiller = 0;
    sail(b, 5);
    expect(b.twa).toBeLessThan(twa0 - 5);
  });
  it('carrying a lot of helm is slower than sailing balanced', () => {
    // the crew's own trim, once they've worked through the depowering steps (one job at a time): they take the helm off her
    // (in 22 kt, where depowering pays: up to about 18 kt the fastest is near full power, physics.ts powerFactor)
    const balanced = beat(22, undefined, false, 60);
    const loaded = beat(22, undefined, true, 60); // held at full power: heeled, a lot of weather helm
    expect(loaded.helmNeed!).toBeGreaterThan(balanced.helmNeed! + 2);
    expect(loaded.v).toBeLessThan(balanced.v);
  });
});

const EXPERT = { helm: { ...DEFAULT_CREW.helm, skill: 0.9 }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill: 0.9 })) };
const crewOf = (skill: number, h = 1.75) => ({ helm: { ...DEFAULT_CREW.helm, skill }, crew: [{ h, w: 78, skill }, { h: 1.72, w: 72, skill }] });

describe('The crew', () => {
  it('sit to leeward in light air, to windward in a moderate breeze, and hike only when she needs it', () => {
    // (4 kt: with the ORC certificates' stability the sails alone heel her nearly to the crew's 6° by 5 kt, so there
    // they sit only a few centimetres to leeward of the centreline)
    expect(beat(4).crew!.mode).toBe('leeward');
    expect(['windward', 'centre']).toContain(beat(10).crew!.mode);
    expect(beat(20).crew!.mode).toBe('hike');
  });
  it('go right up on the foredeck as the pole goes out on a run (one astride the bow, one between the mast and the forestay), in light and moderate air', () => {
    for (const W of [6, 8, 10]) {
      const b = testBoat({ heading: 195, kt: 4, windKt: W }); b.poleWant = true; b.crew = newCrew(EXPERT, 'S');
      let at = -1;
      sail(b, 40, t => { b.h = 195; if (at < 0 && b.crew?.people[2]?.pose === 'bow') at = t; });
      // (straight there as the pole is set, not after a stop at the mast)
      expect(at).toBeGreaterThan(0); expect(at).toBeLessThan(15);
      expect(b.crew!.mode).toBe('foredeck');
      const [, mid, bow] = b.crew!.people;
      expect(bow.pose).toBe('bow'); expect(bow.z).toBeLessThan(-3);
      expect(mid.pose).toBe('fore'); expect(mid.z).toBeLessThan(-1.5);
      expect(b.crew!.trim).toBeGreaterThan(0); // trimmed by the bow
      // the pole stowed: nothing to do up there, so back aft
      b.poleWant = false; sail(b, 30, () => { b.h = 195; });
      expect(b.crew!.people.every(p => p.pose !== 'bow' && p.pose !== 'fore')).toBe(true);
    }
  });
  it('but in a breeze, with the pole out, they stay aft to keep her bow up', () => {
    for (const W of [14, 18]) {
      const b = testBoat({ heading: 195, kt: 5, windKt: W }); b.poleWant = true;
      let wentFwd = false;
      sail(b, 60, () => { b.h = 195; if (b.crew?.people.some(p => p.pose === 'bow' || p.pose === 'fore')) wentFwd = true; });
      expect(wentFwd).toBe(false);
      expect(b.crew!.people.every(p => p.z > 0.5)).toBe(true);
    }
  });
  it("in a gusty breeze near where it stops paying they don't walk up and down the deck with every puff and lull", () => {
    // (11 kt mean, puffs to 13 and lulls to 9 every 40 s: the layout is for the wind over the last minute)
    const b = testBoat({ heading: 195, kt: 4, windKt: 11 }); b.poleWant = true;
    let moves = 0, was = '';
    sail(b, 300, t => {
      b.h = 195; b.ww = { ...b.ww, kt: 11 + 2 * Math.sin(2 * Math.PI * t / 40) };
      const fwd = b.crew?.people.some(p => p.pose === 'bow') ? 'f' : 'a';
      if (t > 20 && fwd !== was) moves++;
      was = fwd;
    });
    expect(moves).toBeLessThanOrEqual(1);
  });
  it('follow best practice as well as their skill lets them: an expert boat at once, a club boat a little late, a novice boat mostly not at all', () => {
    const run = (spec: ReturnType<typeof crewOf>, W = 8, secs = 90) => {
      const b = testBoat({ heading: 195, kt: 4, windKt: W }); b.poleWant = true; b.crew = newCrew(spec, 'S');
      let at = -1; sail(b, secs, t => { b.h = 195; if (at < 0 && (b.crew!.layout ?? 'cockpit') !== 'cockpit') at = t; });
      return { at, layout: b.crew!.layout, why: b.crew!.poleWhy, words: crewWords(b) };
    };
    const ex = run(crewOf(0.9));
    expect(ex.layout).toBe('foredeck'); expect(ex.at).toBeLessThan(15); expect(ex.words).toMatch(/foredeck.*pole out in 8 kt/);
    // (several club and novice boats: each boat's habits are its own, but the same every time)
    const hs = [1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0];
    const club = hs.map(h => run(crewOf(0.6, h))), nov = hs.map(h => run(crewOf(0.25, h)));
    // (the owner: club racers go "when conditions make sense, but slower than experts")
    for (const r of club) { expect(r.layout).toBe('foredeck'); expect(r.at).toBeGreaterThan(ex.at + 5); }
    expect(nov.filter(r => r.layout === 'cockpit').length).toBeGreaterThanOrEqual(3);
    for (const r of nov) if (r.layout === 'cockpit') expect(r.words).toMatch(/staying in the cockpit/);
    expect(run(crewOf(0.6, 1.7))).toEqual(club[2]);
    // ("and sometimes make the mistake of going when the conditions are wrong"): a knot or so past where it pays, some
    // club boats go up while an expert one stays aft, and the line says it's a misjudgement
    expect(run(crewOf(0.9), 12, 60).layout).toBe('cockpit');
    const windy = hs.map(h => run(crewOf(0.6, h), 12, 60)), wrong = windy.filter(r => r.layout === 'foredeck');
    expect(wrong.length).toBeGreaterThan(0); expect(wrong.length).toBeLessThan(windy.length);
    for (const r of wrong) expect(r.words).toMatch(/misjudgement/);
    // (and it "shifts with the skipper's experience": an expert skipper with a novice crew make a club boat's call)
    const mixed = { helm: { ...DEFAULT_CREW.helm, skill: 0.9 }, crew: [{ h: 1.75, w: 78, skill: 0.25 }, { h: 1.72, w: 72, skill: 0.25 }] };
    expect(run(mixed).layout).toBe('foredeck');
  });
  it('go up on the foredeck when you send them there, and say so', () => {
    const b = testBoat({ heading: 195, kt: 4, windKt: 16 }); b.crew = newCrew(crewOf(0.6), 'S'); b.crew.place = { across: null, fore: 'deck' };
    sail(b, 20, () => { b.h = 195; });
    expect(b.crew!.layout).toBe('foredeck'); expect(b.crew!.people[2].pose).toBe('bow');
    expect(crewWords(b)).toMatch(/^You: up on the foredeck/);
  });
  it('say why they stay aft in a breeze with the pole out', () => {
    const b = testBoat({ heading: 195, kt: 5, windKt: 20 }); b.poleWant = true; b.crew = newCrew(EXPERT, 'S');
    sail(b, 30, () => { b.h = 195; });
    expect(crewWords(b)).toMatch(/^Auto: staying aft in 2\d kt to keep the bow up/);
  });
  it('sailing alone in a breeze she goes slower than with two crew: she heels more, or has to be depowered more', () => {
    const two = beat(20), solo = testBoat({ heading: 360 - beatAngle(20), kt: 4.5, windKt: 20 });
    solo.crew = newCrew({ ...DEFAULT_CREW, crew: [] }, 'S');
    sail(solo, 30, () => { solo.h = 360 - beatAngle(20); });
    expect(solo.heelMag! > two.heelMag! + 3 || (solo.depower ?? 0) > (two.depower ?? 0) + 0.1).toBe(true);
    expect(solo.v).toBeLessThan(two.v);
  });
});

describe('Sailing a little below the beat angle', () => {
  it("costs what the polar's pinching curve says (ORC's VMG peak), not more: the sails flog only as far as they luff", () => {
    for (const W of [8, 14, 20]) {
      const beat = beatAngle(W), vmg = (off: number) => {
        const twa = beat - off, b = testBoat({ heading: 360 - twa, kt: polar(W, beat, 'jib') / KT, windKt: W });
        let s = 0, n = 0; sail(b, 60, t => { b.h = 360 - twa; if (t > 40) { s += b.v; n++; } });
        return s / n * Math.cos(twa * Math.PI / 180);
      };
      const v0 = vmg(0);
      expect(vmg(1) / v0).toBeGreaterThan(0.995);
      expect(vmg(2) / v0).toBeGreaterThan(0.99);
    }
  });
  it('but pinching ten degrees too high is a big loss, and inside the no-go zone she stops', () => {
    const W = 14, beat = beatAngle(W), vb = polar(W, beat, 'jib');
    const at = (twa: number, secs: number) => { const b = testBoat({ heading: 360 - twa, kt: vb / KT, windKt: W }); sail(b, secs, () => { b.h = 360 - twa; }); return b.v; };
    expect(at(30, 150) * Math.cos(30 * Math.PI / 180) / (vb * Math.cos(beat * Math.PI / 180))).toBeLessThan(0.75);
    expect(at(22, 40)).toBeLessThan(0.1); // (from full speed, in 40 s)
  });
});

describe('Who holds the sheet', () => {
  it('taking the mainsheet where the crew had it, in a breeze, changes nothing', () => {
    const W = 26, twa = beatAngle(W), run = (mine: boolean) => {
      const b = testBoat({ heading: 360 - twa, kt: 5, windKt: W }); sail(b, 40, () => { b.h = 360 - twa; });
      if (mine) takeLine(b, 'mainsheet');
      sail(b, 30, () => { b.h = 360 - twa; });
      return b.v;
    };
    expect(run(true)).toBeCloseTo(run(false), 2);
  });
});
