#!/usr/bin/env node
/**
 * The performance budget in the browser (ROADMAP "Performance review"): for the key views, the renderer's draw calls,
 * triangles and shader programs, and the JavaScript time per frame by part (the sim's steps, the 3D scene's update and
 * draw submission, the rest: labels, HUD, maps); then the GPU memory and the JS heap over repeated races, which mustn't
 * climb. Needs the dev server (npm run dev) on :5173 (it uses the dev-only handles sim(), __view, __renderer, __cam).
 *
 *   node scripts/check/perf.cjs [out-dir]     → the table, and out-dir/perf_<view>.png; exits 1 if over the budget
 *
 * Headless Chromium here draws with SwiftShader (software GL), a few seconds a frame, so its frame times mean nothing
 * for a laptop's GPU: the GPU side is judged by the counts, the CPU side by the JS time, which the software GL doesn't
 * add to (three.js only queues the GL calls).
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
// The budget, per view (a desktop laptop's integrated GPU holds 60 fps to about 2,000 draw calls and 2 million
// triangles in a scene like this one; the JS for a frame, sim included, must leave most of the 16.7 ms to the browser).
const BUDGET = { calls: 2000, tris: 2.0e6, programs: 80, jsMs: 8 };
// (night views: the free camera, sim coords; the times as night.cjs)
const VIEWS = [
  { name: 'start_chase', mode: 2 },
  { name: 'start_cockpit', mode: 1 },
  { name: 'overhead_out', mode: 3, zoomOut: 40 },
  { name: 'course_map', mode: 2, map: true },
  { name: 'night_east_span', night: true, cam: [LL(37.8070, -122.3520, 4), LL(37.8125, -122.3590, 80)] },
  { name: 'night_start', night: true, cam: [LL(37.8118, -122.4510, 2.5), LL(37.7980, -122.3900, 60)] },
  { name: 'night_bridge_whole', night: true, cam: [LL(37.8140, -122.3990, 5), LL(37.7980, -122.3740, 70)] },
];
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  p.setDefaultTimeout(180000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // time every animation-frame callback (the whole frame's JS)
  await p.addInitScript(() => {
    // (the callbacks for one frame share its timestamp: summed per frame, the page's and this script's alike)
    const raf = window.requestAnimationFrame.bind(window); window.__frames = new Map();
    window.requestAnimationFrame = cb => raf(t => { const t0 = performance.now(); cb(t); window.__frames.set(t, (window.__frames.get(t) || 0) + performance.now() - t0); });
  });
  // the worst fleet: seven opponents (the most there can be), on a windy day, with the ships
  // the same race each run (the seed, the wildlife, the fleet's colours all come from Math.random): a fixed sequence
  await p.addInitScript(() => { let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await p.addInitScript(() => { if (!localStorage.getItem('fbsim-settings-v2')) localStorage.setItem('fbsim-settings-v2', JSON.stringify({ opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], windDay: 2, traffic: 1 })); });
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  // the sim's steps and the scene's update/draw, timed inside the frame
  await p.evaluate(() => {
    const w = window.sim(), v = window.__view, acc = window.__acc = { step: 0, render: 0 };
    const st = w.step.bind(w); w.step = dt => { const t0 = performance.now(); st(dt); acc.step += performance.now() - t0; };
    const rd = v.render.bind(v); v.render = (...a) => { const t0 = performance.now(); rd(...a); acc.render += performance.now() - t0; };
  });
  const measure = async (n = 6) => p.evaluate(n => new Promise(res => {
    let k = 0, acc; const f = () => {
      // (the first frame starts the count: the sum runs over the n − 1 whole frames after it)
      if (k++ === 0) { acc = window.__acc; acc.step = 0; acc.render = 0; window.__frames.clear(); return requestAnimationFrame(f); }
      if (k < n) return requestAnimationFrame(f);
      const fr = [...window.__frames.values()], tot = fr.reduce((a, x) => a + x, 0) / fr.length, info = window.__renderer.info;
      res({ js: tot, step: acc.step / fr.length, render: acc.render / fr.length, calls: info.render.calls, tris: info.render.triangles, programs: info.programs.length, geo: info.memory.geometries, tex: info.memory.textures });
    }; requestAnimationFrame(f);
  }), n);
  const setNight = on => p.evaluate(on => { const w = window.sim(); if (!window.__gun0) window.__gun0 = w.gunUtc;
    if (!on) { w.gunUtc = window.__gun0; return; }
    const d = new Date(window.__gun0 * 60000), loc = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })), off = d.getTime() - loc.getTime();
    loc.setHours(20, 30, 0, 0); w.gunUtc = (loc.getTime() + off) / 60000 - w.t / 60; }, on);
  const rows = []; let over = false;
  console.log('view                 calls      tris  progs  geo  tex   JS ms/frame (sim + scene + rest)');
  const only = (process.env.PERF_ONLY || '').split(',').filter(Boolean);
  for (const V of VIEWS) {
    if (only.length && !only.includes(V.name)) continue;
    await p.evaluate(() => { window.__cam = undefined; }); await setNight(!!V.night);
    if (V.mode) await p.keyboard.press(String(V.mode === 3 ? 3 : V.mode === 1 ? 1 : 2));
    if (V.zoomOut) { await p.keyboard.down('-'); await p.waitForTimeout(V.zoomOut * 100); await p.keyboard.up('-'); }
    if (V.cam) await p.evaluate(c => { window.__cam = { pos: c[0], at: c[1] }; }, V.cam);
    if (V.map) await p.keyboard.press('m');
    await p.waitForTimeout(3000);
    let cdp = null;
    if (process.env.PERF_PROFILE === V.name) { cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
    const r = await measure(cdp ? 12 : 6);
    if (cdp) { const { profile } = await cdp.send('Profiler.stop'); require('fs').writeFileSync(`${out}/perf_${V.name}.cpuprofile`, JSON.stringify(profile)); }
    await p.screenshot({ path: `${out}/perf_${V.name}.png` });
    if (V.map) await p.keyboard.press('m');
    const bad = r.calls > BUDGET.calls || r.tris > BUDGET.tris || r.programs > BUDGET.programs || r.js > BUDGET.jsMs;
    over ||= bad; rows.push({ view: V.name, ...r });
    console.log(`${V.name.padEnd(19)} ${String(r.calls).padStart(6)} ${String(r.tris).padStart(9)} ${String(r.programs).padStart(6)} ${String(r.geo).padStart(4)} ${String(r.tex).padStart(4)}   ${r.js.toFixed(1).padStart(5)} (${r.step.toFixed(1)} + ${r.render.toFixed(1)} + ${(r.js - r.step - r.render).toFixed(1)})${bad ? '  OVER BUDGET' : ''}`);
  }
  await p.evaluate(() => { window.__cam = undefined; }); await setNight(false);
  // a long session: race after race (the setup's "start" each time); the GPU's geometries and textures and the JS heap
  // must come back to the same level, not climb with every race
  // (the GPU holds only what's been drawn, so its count follows the view: a leak is more geometries on the GPU than the
  // scene still has, the old races' left behind)
  const mem = () => p.evaluate(() => { if (window.gc) window.gc(); const i = window.__renderer.info.memory, g = new Set();
    window.__view.scene.traverse(o => { if (o.geometry) g.add(o.geometry); });
    return { geo: i.geometries, scene: g.size, tex: i.textures, heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : NaN }; });
  const seen = [];
  for (let k = 0; k < (only.length ? 0 : 6); k++) {
    await p.evaluate(() => { document.getElementById('bAgain').click(); }); await p.waitForTimeout(2500);
    await measure(2); seen.push(await mem());
  }
  if (seen.length) {
    console.log('race after race (GPU geometries / in the scene, textures, heap MB):', seen.map(m => `${m.geo}/${m.scene} ${m.tex} ${m.heap.toFixed(0)}`).join(' · '));
    const extra = Math.max(...seen.map(m => m.geo - m.scene)), growT = seen[seen.length - 1].tex - seen[1].tex, growH = seen[seen.length - 1].heap - seen[1].heap;
    if (extra > 50 || growT > 4 || growH > 30) { over = true; console.log(`LEAK: ${extra} geometries on the GPU beyond the scene's, textures +${growT}, heap +${growH.toFixed(0)} MB over ${seen.length - 2} races`); }
  }
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
  process.exit(over || errs.length ? 1 : 0);
})();
