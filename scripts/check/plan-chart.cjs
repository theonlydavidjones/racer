#!/usr/bin/env node
/**
 * The cruise planner (ui/planChart.ts): open it from the cruise setup, drag the destination across the water, drag the
 * start onto land (refused), tap to place, Done, and back in the setup with both set. Needs the dev server on :5173.
 *
 *   node scripts/check/plan-chart.cjs <out-dir>   → plan-open.png, plan-drag.png, plan-land.png, plan-moved.png, setup-after.png
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const LAT0 = 37.81053, LON0 = -122.44332, M = 111320, MLON = M * Math.cos(LAT0 * Math.PI / 180);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', mapLayers: { current: true, wind: false } }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById('bPlanOpen').click()); await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/plan-open.png` });
  // where the pins are on the screen (the planner's own transform)
  const pins = await p.evaluate(() => { const w = sim(), c = document.getElementById('planC').getBoundingClientRect(); return { c: [c.left, c.top, c.width, c.height], from: [w.user.x, w.user.y], to: w.dest ? [w.dest.p.x, w.dest.p.y] : null }; });
  const scr = async q => p.evaluate(q => { const pc = window.__plan; return pc ? pc.px(q) : null; }, q);
  const toPx = async q => { const s = await p.evaluate(q => { const pl = window.__plan; const r = pl.c.getBoundingClientRect(); return [r.left + r.width / 2 + (q.x - pl.cx) * pl.scale, r.top + r.height / 2 - (q.y - pl.cy) * pl.scale]; }, q); return s; };
  const LL = (lat, lon) => ({ x: (lon - LON0) * MLON, y: (lat - LAT0) * M });
  // drag the destination to the water off Sausalito's south, a spot of its own
  const a = await toPx({ x: pins.to[0], y: pins.to[1] }), b2 = await toPx(LL(37.8420, -122.4560));
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, { steps: 8 }); await p.mouse.move(b2[0], b2[1], { steps: 8 }); await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/plan-drag.png` });
  await p.mouse.up(); await p.waitForTimeout(2500);
  // drag the start onto the land of the Presidio: refused, the start stays
  const f0 = await p.evaluate(() => [sim().user.x, sim().user.y]);
  const s0 = await toPx({ x: f0[0], y: f0[1] }), land = await toPx(LL(37.7990, -122.4560));
  await p.mouse.move(s0[0], s0[1]); await p.mouse.down(); await p.mouse.move(land[0], land[1], { steps: 10 }); await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/plan-land.png` });
  await p.mouse.up(); await p.waitForTimeout(2000);
  const f1 = await p.evaluate(() => [sim().user.x, sim().user.y]);
  const sf = await p.evaluate(() => JSON.parse(localStorage.getItem('fbsim-settings-v2')).sailFrom);
  console.log('start refused on land:', sf === 'cityfront', '(from', sf + ')', 'moved', Math.hypot(f1[0] - f0[0], f1[1] - f0[1]).toFixed(1), 'm');
  // drag the start out to the water off Crissy Field
  const s1 = await toPx({ x: f1[0], y: f1[1] }), crissy = await toPx(LL(37.8095, -122.4630));
  await p.mouse.move(s1[0], s1[1]); await p.mouse.down(); await p.mouse.move(crissy[0], crissy[1], { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(2500);
  await p.mouse.move(700, 300); await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/plan-moved.png` });
  const set = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2')); return [s.sailFrom, s.sailTo]; });
  console.log('settings now:', set.join(' → '));
  await p.evaluate(() => document.getElementById('bPlanDone').click()); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/setup-after.png` });
  console.log('setup reads:', await p.evaluate(() => document.getElementById('setupPins').textContent));
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
})();
