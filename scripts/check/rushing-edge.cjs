#!/usr/bin/env node
/**
 * "Rushing water" at the map's edge (the owner; ROADMAP 8l, its fourth return): a still boat at the west edge, 14 km
 * from the Bay's origin, the course's mean wind turned 3 degrees: the ripples by her must stay where they lie (they
 * were swept 209 m past her in the next second, turned about the origin). Two stills, before the turn and a second
 * after, and the distance the ripples moved at the boat; fails over 1 m. Needs the dev server (npm run dev).
 *
 *   node scripts/check/rushing-edge.cjs <out-dir> [url] [tag]
 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', url = process.argv[3] || 'http://localhost:5173/?inproc', tag = process.argv[4] || 'edge';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); p.setDefaultTimeout(180000);
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { windKind: 'west', windKt: 18, current: 'slack', sailFrom: 'gate', sailTo: '' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); } catch {} });
  await p.clock.install();
  await p.goto(url);
  for (let k = 0; k < 80; k++) { await new Promise(r => setTimeout(r, 500)); await p.clock.runFor(100); if (await p.evaluate(() => typeof window.sim === 'function' && !!document.querySelector('[data-home="cruise"]'))) break; }
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await new Promise(r => setTimeout(r, 1500)); await p.clock.runFor(300);
  await p.evaluate(() => document.querySelector('#bGo').click());
  for (let k = 0; k < 60; k++) { await new Promise(r => setTimeout(r, 500)); await p.clock.runFor(100); if (await p.evaluate(() => !!sim() && sim().t > 0)) break; }
  // out to the map's west edge, lying still; the camera looking down on the water beside her
  const info = await p.evaluate(() => { const w = sim(), u = w.user; w.moveHere({ x: -14200, y: 0 }, 'here'); return { x: u.x, y: u.y, wind: w.wind, base: w.windModel.base }; });
  console.log(tag, JSON.stringify(info));
  const hold = () => p.evaluate(() => { const u = sim().user; u.x = -14200; u.y = 0; u.v = 0; u.vx = 0; u.vy = 0; if (u.rig) { u.rig.main = 0; u.rig.jib = 0; u.rig.mainUp = false; u.rig.jibUp = false; } });
  const frames = async n => { for (let k = 0; k < n; k++) { await hold(); await p.clock.fastForward(50); await p.evaluate(() => new Promise(r => setTimeout(r, 0))); } };
  await p.evaluate(() => window.__look(0.6, -0.45, 30)); await p.addStyleTag({ content: 'body > *:not(#gl) { visibility: hidden !important; }' });
  const rip = () => p.evaluate(() => { const t = window.__view.wtex, u = sim().user, x = (u.x + 60000) / 120000 - t.center.x, y = (u.y + 60000) / 120000 - t.center.y, c = Math.cos(t.rotation), s = Math.sin(t.rotation); return { x: (t.repeat.x * (c * x + s * y) + t.center.x + t.offset.x) * 30, y: (t.repeat.y * (-s * x + c * y) + t.center.y + t.offset.y) * 30 }; });
  await frames(40);
  await p.screenshot({ path: `${out}/${tag}-1-before-the-turn.png` }); const r0 = await rip();
  // the course's mean wind turns 3 degrees (as a sea-breeze afternoon's does in a few minutes): one second later
  await p.evaluate(() => { const w = sim(); w.windModel.base += 3; });
  await frames(20);
  await p.screenshot({ path: `${out}/${tag}-2-one-second-after.png` }); const r1 = await rip(), moved = Math.hypot(r1.x - r0.x, r1.y - r0.y); console.log(tag, 'ripples at the boat moved', moved.toFixed(2), 'm in one second (20 frames)');
  console.log(tag, JSON.stringify(await p.evaluate(() => { const w = sim(), u = w.user; return { x: u.x, y: u.y, v: u.v, t: w.t, base: w.windModel.base }; })));
  await b.close();
  if (moved > 1) { console.log('ERRORS: the ripples rushed past a still boat at the map edge'); process.exit(1); }
  console.log('ERRORS: none');
})();
