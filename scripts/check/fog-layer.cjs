/**
 * What the chart's Fog layer draws in clear, hazy and foggy conditions (the owner, 20 Nov 2026: "does the fog layer not
 * work?"): the full chart with only Fog on, for a clear observed day, a hazy one, a foggy one, a forecast day, and a clear
 * day with thick fog set in the conditions. A still of each, and the caption's box against the field array, the Day|Dusk
 * toggle and the Layers panel. Needs the dev server.   node scripts/check/fog-layer.cjs <url> <out-dir> [width height]
 */
const { chromium } = require('playwright');
const [url, out, W, H] = [process.argv[2] || 'http://localhost:5173/', process.argv[3] || '.', +process.argv[4] || 1280, +process.argv[5] || 720];
const CASES = [
  ['clear', { tideDate: '2026-11-19', fog: 'real' }],            // observed at Pier 17: 10 km, the sensor's cap
  ['hazy', { tideDate: '2021-01-02', fog: 'real' }],             // observed: about 3 km at noon
  ['foggy', { tideDate: '2026-11-09', fog: 'real' }],            // observed: 220 m at noon
  ['forecast', { tideDate: '2026-11-20', fog: 'real' }],         // NWS grid: 16 km
  ['clear-set-thick', { tideDate: '2026-11-19', fog: 2 }]        // clear record, thick fog set in the conditions
];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const bad = [];
  for (const [name, set] of CASES) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); p.setDefaultTimeout(180000);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(s => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, s, { tideTime: '12:00', mapLayers: { wind: false, current: false, sea: false, fog: true } }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); }, set);
    await p.goto(url); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1000);
    await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1000);
    await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
    await p.screenshot({ path: `${out}/fog-${name}-${W}-scene.png` }); // (the 3D scene, for the pair)
    await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(3500);
    await p.screenshot({ path: `${out}/fog-${name}-${W}.png` });
    const r = await p.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map(Math.round); };
      const h = window.__hud;
      const c = document.getElementById('chartC').getBoundingClientRect(), f = h?.fogCaption; // (the caption's box is in canvas pixels)
      return { cap: f ? { text: f.text, rect: [f.rect[0] + c.left, f.rect[1] + c.top, f.rect[2] + c.left, f.rect[3] + c.top].map(Math.round) } : null, field: box('#chartField'), pal: box('#chartPal'), layers: box('#chartLayersPanel'), plan: box('#chartPlan') };
    });
    const hit = (a, c) => a && c && a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3];
    const cap = r.cap && r.cap.rect, over = cap ? ['field', 'pal', 'layers', 'plan'].filter(k => hit(cap, r[k])) : [];
    console.log(`${name} ${W}: caption ${JSON.stringify(r.cap)} overlaps ${over.join(',') || 'nothing'}`, errs.join('|') || ''); if (over.length) bad.push(name);
    await p.close();
  }
  await b.close(); process.exit(bad.length ? 1 : 0);
})();
