import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../src/settings';
import { newBoat } from '../src/boat/spec';
import { World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { FLEET } from '../src/boat/boat';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); },
  clear: () => store.clear(), key: () => null, length: 0
};
const KEY = 'fbsim-settings-v2';

describe('your boats: saved, named, chosen', () => {
  beforeEach(() => store.clear());

  it('a fresh start has one boat, Josephine, and sails her', () => {
    const s = loadSettings();
    expect(s.boats.map(b => b.name)).toEqual(['JOSEPHINE']);
    expect(s.boat).toBe(s.boats[0]);
  });

  it('older saves carry over: a single boat, or just a burgee', () => {
    store.set(KEY, JSON.stringify({ burgee: 'ggyc' }));
    expect(loadSettings().boat.club).toBe('ggyc'); // her burgee was her club
    store.set(KEY, JSON.stringify({ boats: [{ id: 'a', name: 'A', flags: { burgee: 'ryc', ensign: 'den', special: 'vice' } }], boatId: 'a' }));
    expect(loadSettings().boat.club).toBe('ryc'); expect(loadSettings().boat.skipper).toBe('you');
    store.set(KEY, JSON.stringify({ boat: { name: 'SKOL', hull: { material: 'wood' } } }));
    const s = loadSettings();
    expect(s.boats.length).toBe(1); expect(s.boat.name).toBe('SKOL'); expect(s.boat.hull.material).toBe('wood');
  });

  it('several boats save and load, and the one you chose is the one you sail', () => {
    const s = loadSettings();
    const b = newBoat('Skol'); b.hull.upper = '#1f2c4f';
    s.boats.push(b); s.boat = b; s.boatId = b.id; saveSettings(s);
    const t = loadSettings();
    expect(t.boats.map(x => x.name)).toEqual(['JOSEPHINE', 'SKOL']);
    expect(t.boat.name).toBe('SKOL'); expect(t.boat.hull.upper).toBe('#1f2c4f');
    expect(t.boat).toBe(t.boats[1]); // the same object: edits to the boat you sail change the saved one
  });

  it('a copy is a separate boat; deleting one leaves the rest', () => {
    const s = loadSettings(), copy = newBoat('JOSEPHINE 2', s.boat);
    expect(copy.id).not.toBe(s.boat.id);
    copy.perf.cleanedWeeks = 5; expect(s.boat.perf.cleanedWeeks).toBe(0);
    s.boats.push(copy); s.boats = s.boats.filter(x => x.id !== s.boat.id); s.boat = s.boats[0]; s.boatId = s.boat.id; saveSettings(s);
    expect(loadSettings().boats.map(b => b.name)).toEqual(['JOSEPHINE 2']);
  });

  it('your fleet: race against your own saved boats (as you set them up) and the club boats you pick', () => {
    const s = loadSettings(), rival = newBoat('Skol'); rival.hull.upper = '#1f2c4f'; rival.perf.cleanedWeeks = 6; rival.perf.mainAge = 'old';
    s.boats.push(rival); s.opponents = [rival.id, 'stock:2']; s.fleet = 2; saveSettings(s);
    const t = loadSettings();
    expect(t.opponents).toEqual([rival.id, 'stock:2']);
    const w = new World(COURSES[0], { ...t, windKt: 12, current: 'slack', tideDate: '2026-11-14' }, 1);
    expect(w.boats.length).toBe(3);
    const r = w.boats[1], blue = w.boats[2];
    expect(r.name).toBe('Skol'); expect(r.hullColor).toBe('#1f2c4f'); expect(r.ai).not.toBeNull();
    expect(r.cond?.fouling.slime).toBeGreaterThan(0); // she races with her dirty bottom
    expect(blue.name).toBe(FLEET[2].name); expect(blue.hullColor).toBe(FLEET[2].hull); expect(blue.spec).toBeUndefined();
  });

  it('the boat you sail can\'t also be an opponent; deleted boats drop out of the fleet', () => {
    const s = loadSettings(), b = newBoat('Skol');
    s.boats.push(b); s.opponents = [b.id, s.boat.id, 'stock:1', 'nonsense']; saveSettings(s);
    expect(loadSettings().opponents).toEqual([b.id, 'stock:1']);
  });
});
