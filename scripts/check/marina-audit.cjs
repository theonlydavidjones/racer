// The marina audit's page run (docs/marinas/marina-audit.md): for each harbor with slips, her home slip there, a cruise from it; in the slip, pushed off,
// coming in along the harbor's way in (the hint, the tag), G, and in to her berth. Stills in OUT; a JSON line per harbor.
const { chromium } = require('playwright');
const URL = (process.env.BASE || 'http://localhost:5173/').replace(/\/?$/, '/') + '?inproc', OUT = process.argv[2];
const HOMES = process.argv.slice(3); // e.g. west-harbor:405 gashouse-cove:406 ...  (BASE=<dev server url>)
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const home of HOMES) {
    const H = home.split(':')[0], tag = H;
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }), errs = [], rec = { harbor: H, slip: home };
    p.on('pageerror', e => errs.push(e.message));
    try {
      await p.goto(URL); await p.waitForTimeout(4000);
      const json = await p.evaluate(h => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const boat = { ...s.boat, marina: h.split(':')[0], slip: h };
        Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'sail', sailFrom: 'slip', sailTo: '', windKt: 8, windKind: 'west' }); return JSON.stringify(s); }, home);
      await p.addInitScript(j => localStorage.setItem('fbsim-settings-v2', j), json);
      await p.goto(URL); await p.waitForTimeout(4500);
      await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2500);
      await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(5000);
      await p.evaluate(() => { const w = window.sim(); window.__toasts = []; const d = w.drainEvents.bind(w); w.drainEvents = () => { const e = d(); for (const x of e) if (x.type === 'toast') window.__toasts.push(x.msg); return e; }; });
      rec.start = await p.evaluate(() => { const u = window.sim().user; return { docked: !!u.docked, x: Math.round(u.x), y: Math.round(u.y) }; });
      await p.evaluate(() => window.__look(0, 0)); await p.waitForTimeout(1200);
      await p.screenshot({ path: `${OUT}/${tag}-1-slip.png` });
      // push off
      rec.pushBtn = await p.evaluate(() => { const e = document.getElementById('bPushOff'); return !!e && !e.hidden; });
      if (rec.pushBtn) await p.evaluate(() => document.getElementById('bPushOff').click());
      await p.waitForTimeout(20000);
      rec.pushed = await p.evaluate(() => { const u = window.sim().user; return { docked: !!u.docked, held: !!u.handled, v: +Math.hypot(u.vx, u.vy).toFixed(2), wrecked: !!u.wrecked }; });
      await p.evaluate(() => window.__look(0, 0)); await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/${tag}-2-pushed.png` });
      // coming in: sent home, then along her harbor's way in
      await p.evaluate(() => window.sim().sendHome());
      const way = await p.evaluate(async h => { const M = await import('/src/geo/marina.ts'), s = M.slipById(h), r = M.harborRoute(s);
        return { slip: { x: s.p.x, y: s.p.y, h: s.heading }, pts: [r.entry, ...r.path, r.approach].map(q => ({ x: q.x, y: q.y })) }; }, home);
      const along = d => { const w = way.pts, S = way.slip; for (let i = w.length - 1; i > 0; i--) { const a = w[i - 1], c = w[i], L = Math.hypot(c.x - a.x, c.y - a.y); for (let k = 0; k <= L; k += 0.5) { const q = { x: c.x + (a.x - c.x) * k / L, y: c.y + (a.y - c.y) * k / L }; if (Math.hypot(q.x - S.x, q.y - S.y) >= d) return { ...q, h: (Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI + 360) % 360 }; } } return { ...w[0], h: 0 }; };
      const place = (q, v) => p.evaluate(([q, v]) => { const w = window.sim(), u = w.user; w.pilot.mode = 'off';
        Object.assign(u, { docked: undefined, handled: undefined, mooring: undefined, x: q.x, y: q.y, h: q.h, v, vx: Math.sin(q.h * Math.PI / 180) * v, vy: Math.cos(q.h * Math.PI / 180) * v, turnRate: 0 }); }, [q, v]);
      const seen = () => p.evaluate(() => { const h = [...document.querySelectorAll('.khint')].find(e => !e.hidden); const w = window.sim(), u = w.user; return { why: { sp: +Math.hypot(u.vx, u.vy).toFixed(2), free: w.freeBerthsNear(u).map(s => s.id).slice(0, 2), m: !!u.mooring, hd: !!u.handled, dk: !!u.docked, other: [...document.querySelectorAll('.tag.cue')].filter(e => !e.hidden).map(e => e.textContent) }, hint: h?.textContent ?? null, row: !document.getElementById('tpDockRow').hidden, tag: [...document.querySelectorAll('.tag.mk')].map(e => e.textContent).filter(Boolean) }; });
      rec.in = {};
      for (const d of [45, 30, 18]) { await place(along(d), 0.4); await p.waitForTimeout(1500); rec.in[d] = await seen(); if (d === 18) { await p.evaluate(() => window.__look(0, 0)); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${tag}-3-coming-in.png` }); } }
      // in to her berth: straight in from 9 m off at a slow walk, lines ready
      await p.evaluate(() => { const w = window.sim(), u = w.user, s = w.homeSlip, r = s.heading * Math.PI / 180; w.pilot.mode = 'off';
        Object.assign(u, { docked: undefined, handled: undefined, mooring: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null, vx: Math.sin(r) * 0.4, vy: Math.cos(r) * 0.4 });
        u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; });
      await p.keyboard.press('g'); await p.waitForTimeout(500);
      rec.g = await p.evaluate(() => ({ mooring: window.sim().user.mooring?.phase ?? null, berth: window.sim().user.mooring?.berth ?? null }));
      for (let i = 0; i < 20 && !(await p.evaluate(() => !!window.sim().user.docked)); i++) await p.waitForTimeout(1000);
      rec.end = await p.evaluate(() => { const w = window.sim(), u = w.user, s = w.homeSlip; return { docked: !!u.docked, phase: u.mooring?.phase ?? null, off: +Math.hypot(u.x - s.p.x, u.y - s.p.y).toFixed(1), wrecked: !!u.wrecked }; });
      await p.evaluate(() => window.__look(0, 0)); await p.waitForTimeout(800);
      await p.screenshot({ path: `${OUT}/${tag}-4-berthed.png` });
      rec.toasts = await p.evaluate(() => window.__toasts);
    } catch (e) { rec.fail = String(e).slice(0, 200); }
    rec.errs = errs; console.log(JSON.stringify(rec)); await p.close();
  }
  await b.close();
})();
