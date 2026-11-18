// Coming home to her slip, the tie-up control is there at each stage (the owner, 18 Nov 2026: cruising home to Josephine's
// slip, "Lines ready / G" never appeared: it lived only in the Crew panel, and G in her slip's fairway said "no free
// berth here"). From outside the harbor in: the hint by her, and G, at each stage.
import { describe, expect, it } from 'vitest';
import { harborRoute, slipById } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { dockHint } from '../src/ui/dockHint';
import type { SimView } from '../src/sim/host';

describe('coming home to her slip, the tie-up', () => {
  it('outside the harbor: neither; in her slip\'s fairway and turning in, slow: the hint and G (lines ready); fast: no hint; lines ready: the hint gone', () => {
    const s = slipById('gashouse-cove:572')!, r = harborRoute(s)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, windDir: 270, mode: 'sail', sailFrom: 'cityfront', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let i = 0; i < 30; i++) w.step(DT);
    (w as unknown as { running: boolean }).running = true; // (under way, as the page has it once she's sailing)
    expect(w.cruising).toBe(true); expect(w.dest?.key).toBe('slip');
    const v = (x: number) => ({ vx: Math.sin(s.heading * Math.PI / 180) * x, vy: Math.cos(s.heading * Math.PI / 180) * x });
    const at = (p: { x: number; y: number }, speed = 0.4) => { Object.assign(u, { docked: undefined, handled: undefined, mooring: undefined, x: p.x, y: p.y, h: s.heading, v: speed, ...v(speed) }); w.drainEvents(); };
    const hint = () => dockHint(w as unknown as SimView, 'G');
    const lines = () => { const ok = w.linesReady(); const msg = w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg)[0]; u.mooring = undefined; return { ok, msg }; };
    // (outside, off the mouth: no berth to come in to)
    at(r.mouth); expect(hint()).toBeNull(); expect(lines().ok).toBe(false);
    // (in the fairway, 40 m and 20 m off her slip, the fairway square off it, and turning in)
    // (along the way in, harborRoute's own fairway: the points 35 to 20 m off her slip; the fairway square off it; and turning in)
    const f = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) }, way = [r.entry, ...r.path, r.approach];
    const along = (d: number) => { for (let i = way.length - 1; i > 0; i--) { const a = way[i - 1], c = way[i], L = Math.hypot(c.x - a.x, c.y - a.y); for (let k = 0; k <= L; k += 0.5) { const q = { x: c.x + (a.x - c.x) * k / L, y: c.y + (a.y - c.y) * k / L }; if (Math.hypot(q.x - s.p.x, q.y - s.p.y) >= d) return q; } } return way[0]; };
    for (const [name, p] of [['35 m off, in the fairway', along(35)], ['20 m off, in the fairway', along(20)], ['off her slip', r.approach], ['turning in', { x: s.p.x - f.x * 9, y: s.p.y - f.y * 9 }]] as const) {
      at(p);
      expect(hint(), name).toBe('G · lines ready'); expect(lines(), name).toMatchObject({ ok: true });
      at(p, 2.5); expect(hint(), `${name}, at 5 kt`).toBeNull(); // (still under way: not coming in yet)
    }
    // (lines ready: the hint's done its job, and the crew's own cue takes over: render/labels.ts)
    at(r.approach); expect(w.linesReady()).toBe(true); expect(hint()).toBeNull();
  });
});
