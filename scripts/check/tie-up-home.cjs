#!/usr/bin/env node
/**
 * r239 (and r241, the tag bound home), end to end in the page: sailing home to her slip, the tie-up option appears (the owner, 18 Nov 2026: cruising home
 * to Josephine's slip at Gashouse Cove, "Lines ready / G" never appeared). Her home slip gashouse-cove:572, a cruise, Sail
 * home from the chart; then brought in slowly along her harbor's own way in (geo/marina.ts harborRoute), by hand: from
 * 35 m off her slip in, the hint by her ("G · lines ready") and the Crew panel's Lines-ready row are there; G there gets
 * her lines ready. Fails (exit 1) on any step or a page error. Needs the dev server (default :5173); runs the race in the
 * page's thread (?inproc) so it can place her.
 *
 *   node scripts/check/tie-up-home.cjs [<url>] [<out-dir>]   → coming-in.png in <out-dir> when given
 */
const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'http://localhost:5173/').replace(/\/?$/, '/'), URL = BASE + '?inproc', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } }), errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad.push(what); };
  await p.goto(URL); await p.waitForTimeout(5000);
  const json = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const boat = { ...s.boat, marina: 'gashouse-cove', slip: 'gashouse-cove:572' };
    Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'sail', sailFrom: 'cityfront', windKt: 6 }); return JSON.stringify(s); });
  await p.addInitScript(j => localStorage.setItem('fbsim-settings-v2', j), json);
  await p.goto(URL); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
  // (sent home, as the player does: M, the chart's Sail home)
  await p.keyboard.press('m'); await p.waitForTimeout(800);
  await p.evaluate(() => { const e = document.getElementById('bChartHome'); if (e) e.click(); else { window.__chartless = true; window.sim().sendHome(); } }); await p.waitForTimeout(2000); // (a build without it: sent home directly)
  check(await p.evaluate(() => window.sim().dest?.key === 'slip'), 'sent home: her slip the destination');
  // (r241: the destination's tag, bound for her own slip, says Home)
  const tag = await p.evaluate(() => [...document.querySelectorAll('.tag.mk')].map(e => e.textContent).filter(t => t));
  check(tag.includes('Home'), `r241: the destination's tag says Home (${JSON.stringify(tag.slice(0, 6))})`);
  // (her harbor's way in, from the page's own modules)
  const way = await p.evaluate(async () => {
    const M = await import('/src/geo/marina.ts'), s = M.slipById('gashouse-cove:572'), r = M.harborRoute(s);
    return { slip: { x: s.p.x, y: s.p.y, h: s.heading }, pts: [r.entry, ...r.path, r.approach].map(q => ({ x: q.x, y: q.y })) };
  });
  // (a point along the way in, d m off her slip, and the way's heading there)
  const along = d => { const w = way.pts, S = way.slip; for (let i = w.length - 1; i > 0; i--) { const a = w[i - 1], c = w[i], L = Math.hypot(c.x - a.x, c.y - a.y); for (let k = 0; k <= L; k += 0.5) { const q = { x: c.x + (a.x - c.x) * k / L, y: c.y + (a.y - c.y) * k / L }; if (Math.hypot(q.x - S.x, q.y - S.y) >= d) return { ...q, h: (Math.atan2(c.x - a.x, c.y - a.y) * 180 / Math.PI + 360) % 360 }; } } return { ...w[0], h: 0 }; };
  const place = (q, v) => p.evaluate(([q, v]) => { const w = window.sim(), u = w.user; w.pilot.mode = 'off';
    Object.assign(u, { docked: undefined, handled: undefined, x: q.x, y: q.y, h: q.h, v, vx: Math.sin(q.h * Math.PI / 180) * v, vy: Math.cos(q.h * Math.PI / 180) * v, turnRate: 0 }); }, [q, v]);
  const seen = () => p.evaluate(() => { const h = [...document.querySelectorAll('.khint')].find(e => !e.hidden); return { hint: h?.textContent ?? null, row: !document.getElementById('tpDockRow').hidden, mooring: !!window.sim().user.mooring }; });
  // (coming in: from 35 m off her slip to 12, slowly)
  for (const d of [35, 25, 18, 12]) {
    await place(along(d), 0.4); await p.waitForTimeout(900);
    const s = await seen();
    check(s.hint === 'G · lines ready' && s.row, `${d} m off her slip, along the way in at under a knot: the hint by her and the Lines-ready row (${JSON.stringify(s)})`);
    if (d === 18 && OUT) await p.screenshot({ path: `${OUT}/coming-in.png` });
  }
  // (G there: lines ready)
  await place(along(18), 0.4); await p.waitForTimeout(500);
  await p.keyboard.press('g'); await p.waitForTimeout(1200);
  const g = await seen();
  check(g.mooring, `G, 18 m off her slip: her lines ready (${JSON.stringify(g)})`);
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
