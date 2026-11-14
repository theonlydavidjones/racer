#!/usr/bin/env node
/**
 * Smoke test of the built artifact (artifact/folkboat-racing-sim.html) in headless Chromium: opens the Fleet and a boat
 * page, starts a race, and reports any page errors. three.js is served from node_modules in place of jsDelivr.
 * Twice (docs/CAPACITY.md, "One copy of the sim's code"): loaded from the file, its chunks load as modules from blob URLs
 * and the race sails in its worker; then served with a content security policy that refuses blob: scripts, as a host
 * might, its start-up script falls back to one inline module and the race sails in the page.
 *
 *   npm run build:artifact && node scripts/check/smoke.cjs [out-dir]   (about 3 minutes; screenshots → out-dir/smoke-blob.png, smoke-fallback.png)
 */
const { chromium } = require('playwright');
const path = require('path');
const root = path.resolve(__dirname, '../..'), out = process.argv[2] || root;
async function run(browser, way) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  // the headless software renderer draws a frame in a second or two with the full scene, so clicks get room to settle
  page.setDefaultTimeout(120000);
  // (with blob: refused, the browser's own report of the refusal is expected: the start-up script's test import)
  // (and the worker's refusal, which the page reports as it falls back to sailing in its own thread)
  const expected = m => way === 'fallback' && /blob:|Content Security Policy|The race's worker failed; it sails on in the page/i.test(m);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !expected(m.text())) errs.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => {
    const f = path.basename(new URL(r.request().url()).pathname);
    r.fulfill({ path: path.join(root, 'node_modules/three/build', f), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const file = path.join(root, 'artifact/folkboat-racing-sim.html');
  if (way === 'blob') await page.goto('file://' + file);
  else {
    // a host that allows inline scripts and jsDelivr but not blob: (no blob modules, no blob worker)
    await page.route('https://smoke.test/**', r => r.fulfill({ path: file, contentType: 'text/html', headers: { 'content-security-policy': "script-src 'unsafe-inline' https://cdn.jsdelivr.net; worker-src 'none'" } }));
    await page.goto('https://smoke.test/folkboat-racing-sim.html');
  }
  await page.waitForFunction(() => document.documentElement.dataset.simLoad, null, { timeout: 60000 }).catch(() => {});
  const load = await page.evaluate(() => document.documentElement.dataset.simLoad); console.log(`[${way}] the sim's code loaded by:`, load);
  if (load !== way) errs.push(`the sim's code loaded by ${load}, not ${way}`);
  await page.waitForTimeout(1500);
  await page.click('[data-home="fleet"]'); await page.waitForTimeout(800);
  // each boat card's picture has the boat in it (ROADMAP 8t: they once framed an empty sea). Her sails and hull stand out
  // from the sea and sky on their row; an empty picture has none (measured: about 3% of a card with her, 0 without)
  await page.waitForFunction(() => { const im = [...document.querySelectorAll('img[data-thumb]')]; return im.length && im.every(i => i.complete && i.src.startsWith('data:')); }, null, { timeout: 120000 }).catch(() => {});
  const cards = await page.evaluate(() => [...document.querySelectorAll('img[data-thumb]')].map(im => {
    if (!im.src.startsWith('data:') || !im.naturalWidth) return -1; // (no picture: no WebGL)
    const c = document.createElement('canvas'), w = c.width = im.naturalWidth, h = c.height = im.naturalHeight, g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data; let n = 0;
    for (let y = 0; y < h; y++) {
      const row = []; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; row.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]); }
      const med = [...row].sort((a, b) => a - b)[w >> 1]; for (const v of row) if (v - med > 60) n++;
    }
    return n / (w * h);
  }));
  console.log(`[${way}] boat cards: the boat's share of each picture`, cards.map(f => f.toFixed(3)).join(' '));
  if (cards.some(f => f >= 0 && f < 0.005)) errs.push(`a boat card's picture has no boat in it (${cards.map(f => f.toFixed(3)).join(' ')})`);
  await page.click('.fcard'); await page.waitForTimeout(1500);
  console.log(`[${way}] boat page`, await page.isVisible('#fleetBoat'));
  await page.click('[data-f="toList"]'); await page.waitForTimeout(300); await page.click('[data-f="back"]'); await page.waitForTimeout(800);
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, `smoke-${way}.png`) });
  const clock = () => page.evaluate(() => document.getElementById('clock').textContent);
  console.log(`[${way}]`, await page.evaluate(() => ['clock', 'spd', 'linebox'].map(i => document.getElementById(i).textContent).join(' | ')));
  // (the race sails in its worker: sim/host.ts WorkerHost; 'local' means in the page, as it must when blob: is refused)
  // (the windex names her point of sail: ROADMAP 8j)
  const pos = await page.evaluate(() => document.querySelector('#sailBand .sb-pos')?.textContent ?? ''); console.log(`[${way}] point of sail:`, pos || '(none)');
  if (!pos) errs.push('no point of sail in the band\'s windex');
  const mode = await page.evaluate(() => document.documentElement.dataset.sim); console.log(`[${way}] the race sails in:`, mode);
  if (mode !== (way === 'blob' ? 'worker' : 'local')) errs.push(`the race sails in ${mode}`);
  await page.evaluate(() => { document.getElementById('bFast').click(); document.getElementById('bFast').click(); });
  if (way === 'blob') {
    // (sailing on at 4× until the mirror has been checked against the race a few times: sim/sync.ts checkOf, every 20 frames)
    await page.waitForFunction(() => Number(document.documentElement.dataset.syncChecks) >= 3, null, { timeout: 240000 }).catch(() => errs.push('the mirror was never checked'));
    console.log(`[${way}] the mirror's checks made:`, await page.evaluate(() => document.documentElement.dataset.syncChecks));
    const faults = await page.evaluate(() => document.documentElement.dataset.syncFaults); console.log(`[${way}] the mirror's checks failed:`, faults); if (faults !== '0') errs.push(`the page's mirror differs from the race (${faults} checks failed)`);
  } else {
    // (no mirror in the page's own thread: the race's clock must run on)
    const c0 = await clock(); await page.waitForTimeout(8000); const c1 = await clock();
    console.log(`[${way}] the clock: ${c0} → ${c1}`); if (c0 === c1) errs.push(`the race's clock stood still (${c0})`);
  }
  await page.close();
  return errs.map(e => `[${way}] ${e}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [...await run(browser, 'blob'), ...await run(browser, 'fallback')];
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
