#!/usr/bin/env node
/**
 * Sail home on the chart M opens (the v208 playtest, 18 Nov 2026: it lived only in the Passage plan, behind the chart's
 * Plan link, shown once the plan was in): her home slip Josephine's, a cruise under way, M at once (while the navigator's
 * still working out the passage), the chart's Sail home there and live; clicked, the chart closes and her slip's the
 * destination. Fails (exit 1) on any step or a page error. Needs the dev server (default :5173).
 *
 *   node scripts/check/chart-home.cjs [<url>] [<out-dir>]   → chart.png in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } }), errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad.push(what); };
  // (her settings as the page saves them, then her home slip, and a cruise from the Cityfront)
  await p.goto(URL); await p.waitForTimeout(5000);
  const json = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const boat = { ...s.boat, marina: 'gashouse-cove', slip: 'gashouse-cove:572' };
    Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'sail', sailFrom: 'cityfront' }); return JSON.stringify(s); });
  await p.addInitScript(j => localStorage.setItem('fbsim-settings-v2', j), json);
  await p.goto(URL); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
  await p.keyboard.press('m'); await p.waitForTimeout(800);
  const btn = await p.evaluate(() => { const e = document.getElementById('bChartHome'); return { chart: !document.getElementById('chart').hidden, shown: !!e && !e.hidden && e.offsetWidth > 0, dim: e?.classList.contains('dim'), title: e?.title, plan: !document.getElementById('chartPlan').hidden }; });
  check(btn.chart && btn.shown && !btn.dim, `Sail home on the chart, live (${JSON.stringify(btn)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/chart.png` });
  await p.evaluate(() => document.getElementById('bChartHome').click()); await p.waitForTimeout(2500);
  const done = await p.evaluate(() => ({ chart: !document.getElementById('chart').hidden, dest: window.__w().dest?.key ?? null }));
  check(!done.chart && done.dest === 'slip', `clicked: the chart closed, her slip the destination (${JSON.stringify(done)})`);
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
