#!/usr/bin/env node
/**
 * How long a map layer takes to switch (the owner, 15 Nov 2026: "toggling between current and waves in cruise planner
 * takes forever, and the moving lines redraw themselves in weird ways"). In the cruise planner ("Plan on the big chart")
 * and then the full chart on a cruise, each chip of the field picker is clicked in turn, back and forth, and timed from
 * the click to the first frame the chart shows the change; the click's own work (what it holds the page up for: on a
 * real graphics card, about the whole of it); and the longest gap between frames over the second after it (a stall).
 * (Headless, a cruise's frames take a second or more with the 3D scene behind the chart: there, "shown" is the
 * software renderer's, and the click's work is the measure. The planner draws no scene.) Works on the dev server or the built page (the path of artifact/folkboat-racing-sim.html).
 *
 *   node scripts/check/layer-toggle.cjs [<url> | <built page's path>] [--max <ms>]   → the times; fails (exit 1) if any switch's work is over <ms> (or never shows)
 */
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2), mi = args.indexOf('--max'), MAX = mi >= 0 ? +args[mi + 1] : Infinity;
const TARGET = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--max') || 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  p.setDefaultTimeout(180000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', sailTo: 'angel', windKind: 'west', windKt: 14, tideDate: '2026-07-11', tideTime: '15:00', sea: 'real' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  // (a built page, as a file: loaded as smoke.cjs loads it, three.js served from node_modules in place of jsDelivr)
  if (!/^https?:/.test(TARGET)) await p.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => r.fulfill({ path: path.join(__dirname, '../../node_modules/three/build', path.basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await p.goto(/^https?:/.test(TARGET) ? TARGET : 'file://' + path.resolve(TARGET)); await p.waitForTimeout(8000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(4000);
  // (timed in the page: from the click to the first frame whose picture differs, and the longest frame gap after it)
  const time = (canvas, sel) => p.evaluate(async ([canvas, sel]) => {
    const c = document.getElementById(canvas), fx = canvas === 'planC' ? document.getElementById('planFx') : document.getElementById('chartFx');
    const small = document.createElement('canvas'); small.width = 96; small.height = 60; const g = small.getContext('2d', { willReadFrequently: true });
    const snap = () => { g.clearRect(0, 0, 96, 60); g.drawImage(c, 0, 0, 96, 60); const d = g.getImageData(0, 0, 96, 60).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 3 * d[i + 1] + 7 * d[i + 2]) | 0; return h; };
    const raf = () => new Promise(r => requestAnimationFrame(r));
    // (clicked after a pause: headless, the 3D scene's last frame can hold the GPU, and a canvas drawn right after it waits)
    await raf(); await raf(); const before = snap(); await new Promise(r => setTimeout(r, 1500)); const t0 = performance.now();
    document.querySelector(sel).click(); const work = performance.now() - t0;
    let shown = null, last = t0, gap = 0;
    while (performance.now() - t0 < 6000) {
      await raf(); const t = performance.now(); gap = Math.max(gap, t - last); last = t;
      if (shown == null && snap() !== before) shown = t - t0;
      if (shown != null && t - t0 > shown + 1000) break;
    }
    return { work: Math.round(work), shown: shown == null ? null : Math.round(shown), stall: Math.round(gap) };
  }, [canvas, sel]);
  const seq = ['current', 'sea', 'current', 'sea', 'wind', 'current', 'wind', 'sea', 'off', 'current'];
  const rows = [], over = [];
  const run = async (label, canvas, pick) => {
    for (const f of seq) {
      const r = await time(canvas, `${pick} [data-field="${f}"]`);
      rows.push(`${label} → ${f}: the click's work ${r.work} ms, shown in ${r.shown ?? 'never'} ms, longest frame ${r.stall} ms`);
      if (r.shown == null || r.work > MAX) over.push(`${label} → ${f}`);
      await p.waitForTimeout(400);
    }
  };
  await p.evaluate(() => document.getElementById('bPlanOpen').click()); await p.waitForTimeout(3000);
  await run('planner', 'planC', '#planField');
  await p.evaluate(() => document.getElementById('planDone')?.click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(10000);
  await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(3000);
  await run('chart', 'chartC', '#chartField');
  console.log(rows.join('\n'));
  for (const label of ['planner', 'chart']) {
    const of = re => rows.filter(r => r.startsWith(label)).map(r => +(r.match(re) || [0, NaN])[1]).filter(Number.isFinite).sort((a, b) => a - b);
    const w = of(/work (\d+)/), s = of(/shown in (\d+)/), med = a => a.length ? a[a.length >> 1] : 'never';
    console.log(`${label}: the click's work median ${med(w)} ms, worst ${w[w.length - 1] ?? '-'} ms; shown median ${med(s)} ms, worst ${s[s.length - 1] ?? 'never'} ms`);
  }
  console.log('ERRORS:', [...new Set(errs)].join('; ') || 'none');
  await b.close();
  if (over.length || errs.length) { console.log(`OVER ${MAX} ms: ${over.join(', ')}`); process.exit(1); }
})();
