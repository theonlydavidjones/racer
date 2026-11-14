#!/usr/bin/env node
/**
 * The boat editor's clicks, timed (ROADMAP 8v, the owner: "each click takes several full seconds"): the built page in
 * headless Chromium, her editor opened from the Yacht Club, then one click of each kind (a paint swatch, the forehatch,
 * the cockpit, the time she's shown at), each timed from the click to the end of the work it starts on the page's
 * thread: the handler and everything it queues, up to the next frame's start (the frame's own drawing, slow in the
 * software renderer, is the GPU's work on a real machine and isn't counted). Fails if any click's handler passes the
 * budget: 150 ms here by default, the owner's 50 ms a click on a real machine (headless, the software renderer sharing
 * the cores, runs about 3× a laptop's time). A look-only change restyles her where she lies (app.ts lookOnly: only her
 * mesh built again) and the time of day moves the showroom's clock; the work they hand on, once the race has taken the
 * change, is timed by the page itself (performance.measure 'editor: …') and counted here.
 *   npm run build:artifact && node scripts/check/editor-perf.cjs [out-dir] [--budget=ms] [--profile]
 */
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const root = path.join(__dirname, '../..'), out = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || '.';
const budget = +(process.argv.find(a => a.startsWith('--budget='))?.slice(9) ?? 150), profile = process.argv.includes('--profile');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => r.fulfill({ path: path.join(root, 'node_modules/three/build', path.basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('file://' + path.join(root, 'artifact/folkboat-racing-sim.html'));
  await page.waitForFunction(() => document.documentElement.dataset.simLoad, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  await click('[data-home="fleet"]'); await page.waitForTimeout(1500);
  await click('[data-f="tab"][data-v="boats"]'); await page.waitForTimeout(600);
  await click('.fcard'); await page.waitForTimeout(3000);
  // the page's own work for one action: the handler's synchronous time, and the long tasks after it (the frames among them)
  const cdp = await page.context().newCDPSession(page);
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); }
  const timed = async (name, act) => {
    if (profile) await cdp.send('Profiler.start');
    const r = await page.evaluate(async src => {
      // the handler's own time, then the tasks it set off (timers, microtasks, idle callbacks) until two quiet frames
      const t0 = performance.now(); (0, eval)(src); const sync = performance.now() - t0;
      let work = 0; const lt = new PerformanceObserver(l => { for (const e of l.getEntries()) work += e.duration; }); lt.observe({ type: 'longtask', buffered: false });
      await new Promise(r => setTimeout(r, 1500)); lt.disconnect();
      // (the work the click hands on, once the race has taken it: the restyled boat's mesh, or the new hour's light,
      // measured by the page itself, app.ts)
      const later = performance.getEntriesByType('measure').filter(e => e.name.startsWith('editor:') && e.startTime >= t0).reduce((a, e) => a + e.duration, 0);
      performance.clearMeasures();
      return { sync: sync + later, handler: sync, later, after: work };
    }, act);
    let prof = null; if (profile) { prof = (await cdp.send('Profiler.stop')).profile; fs.writeFileSync(path.join(out, `editor-${name}.cpuprofile`), JSON.stringify(prof)); }
    await page.screenshot({ path: path.join(out, `editor-${name}.png`) });
    console.log(`${name}: ${r.sync.toFixed(0)} ms (${r.handler.toFixed(0)} in the click's handler, ${r.later.toFixed(0)} once the race took it); long tasks after it ${r.after.toFixed(0)} ms (frames included)`);
    return { name, ...r };
  };
  const res = [];
  res.push(await timed('open', `document.querySelector('[data-f="edit"]').click()`)); await page.waitForTimeout(2000);
  // (the editor's groups fold, 8i: open Deck and cabin, timed, as a click of its own; then Hull and its Topsides picker)
  res.push(await timed('group', `document.querySelector('#boatPanel [data-act="grp"][data-v="deck"]').click()`)); await page.waitForTimeout(800);
  await click('#boatPanel [data-act="grp"][data-v="hull"]'); await page.waitForTimeout(800);
  await click('#boatPanel [data-act="pick"][data-v="upper"]'); await page.waitForTimeout(800);
  res.push(await timed('hatch', `(() => { const b = [...document.querySelectorAll('#boatPanel [data-act="hatch"]')].find(x => x.getAttribute('aria-pressed') !== 'true'); b.click(); })()`));
  res.push(await timed('paint', `(() => { const b = [...document.querySelectorAll('#boatPanel .be-picker[data-key="upper"] [data-cp="preset"]')].find(x => !x.classList.contains('on')); b.click(); })()`));
  res.push(await timed('cockpit', `(() => { const b = [...document.querySelectorAll('#boatPanel [data-act="cockpit"]')].find(x => x.getAttribute('aria-pressed') !== 'true'); b?.click(); })()`));
  res.push(await timed('time', `(() => { const e = document.getElementById('showTime'); e.value = String((+e.value + 180) % 1440); e.dispatchEvent(new Event('change', { bubbles: true })); })()`));
  const over = res.filter(r => r.sync > budget);
  for (const r of over) console.log(`FAIL: ${r.name} took ${r.sync.toFixed(0)} ms of the page's work (budget ${budget} ms)`);
  if (errs.length) console.log('page errors:', errs.slice(0, 3));
  await browser.close(); process.exit(over.length || errs.length ? 1 : 0);
})();
