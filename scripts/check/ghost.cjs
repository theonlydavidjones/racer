#!/usr/bin/env node
/**
 * Ghost races end to end, in the dev server (npm run dev -- --port 5199), with the race in the page's thread (?inproc) so
 * time can be sped up. Each step is checked as a sailor would see it:
 *   1. sails a race to the finish, with her on the AI's skipper;
 *   2. saves it to her logbook (Keep this race? → Save), which keeps her run as a ghost (replay/ghost.ts);
 *   3. Race → Run a past race: that race's row offers "Ghost: your best"; picks it and sails it again;
 *   4. the ghost boat is drawn, sits where its run had her at the race clock, and moves as the clock runs;
 *   5. with her sailing the race again, the where-next card shows "Ghost: N s ahead/behind" (or level).
 *
 *   node scripts/check/ghost.cjs <out-dir>   (a few minutes; screenshots → out-dir/ghost-*.png; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180000);
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(3000);
  await page.evaluate(() => localStorage.removeItem('fbsim-ghosts-v1')); // (no ghosts from an earlier check)
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);

  // 1. her race, sailed by the AI's skipper to the finish (fast: stepped here, the page's own loop held)
  const sailAI = () => page.evaluate(() => { const w = sim(), u = w.boats[0]; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; });
  await sailAI();
  let r;
  for (let k = 0; k < 130; k++) {
    r = await page.evaluate(() => { const w = sim(); for (let i = 0; i < 60 * 60; i++) { w.paused = true; w.step(1 / 60); if (w.boats[0].finished && w.t - w.boats[0].finishT > 5) break; } return [Math.round(w.t), w.boats[0].finished, w.boats[0].finishT]; });
    if ((r[1] && r[0] - r[2] > 5) || r[0] > 7200) break;
  }
  console.log('first race: t, finished, finishT', r);
  if (!r[1]) { fail('she never finished the first race (in two hours)'); await browser.close(); process.exit(1); }
  await page.evaluate(() => { const w = sim(); w.boats[0].isUser = true; w.boats[0].ai = null; if (w.boats[0].finished && w.userFinishT == null) w.userFinishT = w.boats[0].finishT; w.paused = false; }); // (she finished on the AI's skipper: her finish, as the race marks the user's)
  await page.waitForSelector('#results:not([hidden])', { timeout: 60000 }).catch(() => fail('the results never showed'));
  const frames = await page.evaluate(() => sim().track.length); console.log('track frames:', frames);

  // 2. saved to her logbook: her run kept as a ghost
  await page.click('#bSet2'); await page.waitForSelector('#keepAsk:not([hidden])');
  await page.click('#bKeep'); await page.waitForTimeout(800);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('fbsim-ghosts-v1') || '[]').map(g => ({ at: g.at, elapsed: g.elapsed, place: g.place, code: g.code, size: g.d.length })));
  console.log('ghosts kept:', JSON.stringify(kept));
  if (kept.length !== 1 || kept[0].elapsed == null) fail('her finished run wasn\'t kept as a ghost');

  // 3. Run a past race: the row's Ghost menu, "your best", then Sail it again
  await page.click('#setupBack'); await page.waitForTimeout(600);
  // (Past races sits in the Race menu, beside Create a race: the setup's back button can land on the start page)
  if (!await page.isVisible('#bPast')) { await page.click('[data-home="race"]'); await page.waitForTimeout(600); }
  await page.click('#bPast'); await page.waitForTimeout(600);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#pastRows .pastrow')][0]?.querySelector('select[data-ghost]') ? [...document.querySelector('#pastRows .pastrow select[data-ghost]').options].map(o => o.textContent) : null);
  console.log('Ghost menu:', JSON.stringify(opts));
  if (!opts || !/^Ghost: your best/.test(opts[0])) fail('no "Ghost: your best" in the past race\'s row');
  await page.screenshot({ path: out + '/ghost-past.png' });
  await page.evaluate(() => { const s = document.querySelector('#pastRows .pastrow select[data-ghost]'); s.selectedIndex = 0; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#pastRows [data-past="0"]'); await page.waitForTimeout(3000);

  // 4. the ghost: drawn, where its run had her at this moment, and moving with the clock
  const at = () => page.evaluate(() => { const w = sim(), g = __view.ghost; if (!g) return null; const p = g.mesh.grp.position;
    const pts = g.pts; let q = null; for (let i = 0; i + 1 < pts.length; i++) if (pts[i].t <= w.t && pts[i + 1].t >= w.t) { q = pts[i]; break; }
    return { t: +w.t.toFixed(1), visible: g.mesh.grp.visible, x: +p.x.toFixed(1), z: +p.z.toFixed(1), track: q && { t: q.t, x: +q.x.toFixed(1), y: +q.y.toFixed(1) } }; });
  const g0 = await at(); console.log('ghost now:', JSON.stringify(g0));
  if (!g0) fail('no ghost on the race sailed again');
  if (g0?.visible) fail('the ghost shows before its track begins (half a minute before the gun)');
  // sail on into the race with her on the AI's skipper again, at the page's own pace (so the scene and the card update)
  await sailAI();
  await page.evaluate(() => { const w = sim(); w.paused = true; while (w.t < 60) w.step(1 / 60); w.paused = false; });
  await page.waitForTimeout(2500);
  const g1 = await at(); console.log('ghost a minute after the gun:', JSON.stringify(g1));
  if (!g1?.visible) fail('the ghost isn\'t showing after the gun');
  // (the scene's x is the chart's x; its z is the chart's −y: within a boat's length of where its track has it)
  if (g1?.track && Math.hypot(g1.x - g1.track.x, -g1.z - g1.track.y) > 15) fail(`the ghost is drawn ${Math.hypot(g1.x - g1.track.x, -g1.z - g1.track.y).toFixed(0)} m from its track`);
  await page.evaluate(() => { const w = sim(); w.paused = true; while (w.t < 240) w.step(1 / 60); w.paused = false; });
  await page.waitForTimeout(2500);
  const g2 = await at(); console.log('ghost four minutes after the gun:', JSON.stringify(g2));
  if (g1 && g2 && Math.hypot(g2.x - g1.x, g2.z - g1.z) < 50) fail('the ghost hasn\'t moved with the clock');
  if (g2?.track && Math.hypot(g2.x - g2.track.x, -g2.z - g2.track.y) > 15) fail('the ghost isn\'t on its track');

  // 5. the pacing line, inside the where-next card
  const note = await page.evaluate(() => { const e = document.getElementById('ghostNote'); return { hidden: e.hidden, text: e.textContent, inCard: !!e.closest('#nextCard') }; });
  console.log('the where-next card:', JSON.stringify(note));
  if (note.hidden || !/^Ghost: (\d+ s (ahead|behind)|level with you)$/.test(note.text)) fail(`no "Ghost: N s ahead/behind" line (${note.text || 'hidden'})`);
  if (!note.inCard) fail('the ghost\'s line isn\'t inside the where-next card');
  await page.evaluate(() => __look(Math.PI * 0.75, 0.25, 60));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out + '/ghost-race.png' });

  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
