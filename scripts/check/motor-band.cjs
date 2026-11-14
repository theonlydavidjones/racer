#!/usr/bin/env node
/**
 * Her outboard from the band's Motor tab, each by one click with the mouse, as a sailor would (the owner, v193: "the motor
 * controls block view of the hull. and the buttons are glitching. I can't get it to tilt down"). On the built page
 * (artifact/folkboat-racing-sim.html), the race in its worker, on a cruise in a near calm with her outboard on its
 * bracket: tilt it down, start it, ahead, the throttle to 50%, and she gathers way ahead; then neutral, astern (she
 * slows), stop, and tilt it up. Each click must show in the tab and in the race. Also: the tab sits in the band, not over
 * her hull, and nothing on the tab is rewritten while nothing changes.
 *
 *   npm run build:artifact && node scripts/check/motor-band.cjs [out-dir]   → exit 1 on a step that doesn't do what it should
 */
const { chromium } = require('playwright');
const path = require('path');
const root = path.join(__dirname, '../..'), out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.setDefaultTimeout(120000);
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  // three.js from node_modules in place of jsDelivr (as smoke.cjs)
  await p.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => {
    const f = r.request().url().split('/build/')[1];
    r.fulfill({ path: path.join(root, 'node_modules/three/build', f), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const file = 'file://' + path.join(root, 'artifact/folkboat-racing-sim.html');
  // her settings as the page saves them, then her outboard on its bracket, a cruise, a near calm
  await p.goto(file); await p.waitForTimeout(5000);
  const json = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}');
    const boat = { ...s.boat, perf: { ...s.boat.perf, outboard: 'bracket', outboardHp: 3.5 } };
    Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'sail', sailFrom: 'alcatraz', sailTo: 'crissy', windKind: 'west', windKt: 1, traffic: 0, tideDate: '2026-07-11', tideTime: '13:30' });
    return JSON.stringify(s);
  });
  await p.addInitScript(j => localStorage.setItem('fbsim-settings-v2', j), json);
  await p.goto(file); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(8000);
  // the sails struck (the halyard keys), so it's the motor that drives her (if they're still up, she's sailing: the motor's
  // push then shows as a gain on her speed under sail, 0.3 kt or more)
  await p.keyboard.press('u'); await p.keyboard.press('j');

  const tab = () => p.evaluate(() => {
    const t = document.querySelector('.sb-motor'), q = k => t.querySelector(`[data-mo="${k}"]`), shown = e => !!e && !e.hidden && !e.closest('[hidden]');
    return { shown: shown(t), tilt: q('tilt').textContent, start: shown(q('start')) ? q('start').textContent : null,
      gear: ['F', 'N', 'R'].find(k => q(k).getAttribute('aria-pressed') === 'true') ?? null, thr: t.querySelector('.mo-thr').textContent,
      kt: +document.getElementById('spd').textContent };
  });
  const click = async k => {
    const r = await p.evaluate(k => { const e = document.querySelector(`.sb-motor [data-mo="${k}"]`); if (!e || e.closest('[hidden]') || e.hidden) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === e]; }, k);
    if (!r) { bad.push(`${k}: the button isn't shown`); return; }
    if (!r[2]) bad.push(`${k}: something covers the button`);
    // a person's click: over it, pressed for a moment, let go
    await p.mouse.move(r[0], r[1]); await p.waitForTimeout(150); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up();
  };
  // (each step waits for its answer, up to 90 s: headless, with software GL, the page can run at a frame a second, and
  // the race answers a command on its next step)
  const step = async (label, act, want) => {
    await act();
    const t0 = Date.now(); let s; do { await p.waitForTimeout(500); s = await tab(); } while (!want(s) && Date.now() - t0 < 90000);
    const ok = want(s);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(s)}`); if (!ok) bad.push(label);
    return s;
  };
  const until = async (f, ms) => { const t0 = Date.now(); let s; do { await p.waitForTimeout(1000); s = await tab(); } while (!f(s) && Date.now() - t0 < ms); return s; };

  console.log('frames a second:', await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res((n / 3).toFixed(1)); }; requestAnimationFrame(f); })));
  const still = await until(s => s.kt < 0.5, 240000); console.log('sails down, her way off:', still.kt, 'kt');
  await step('the tab, tilted up', async () => {}, s => s.shown && s.tilt === 'Down' && s.start === null);
  // in the band, not over her hull: the tab's top no higher than the band's own top edge, less a tab's height
  { const g = await p.evaluate(() => { const t = document.querySelector('.sb-motor').getBoundingClientRect(), bd = document.getElementById('sailBand').getBoundingClientRect(); return { tab: t.top, band: bd.top }; });
    const ok = g.tab >= g.band - 30; console.log(`${ok ? 'ok  ' : 'FAIL'} on the band's edge: ${JSON.stringify(g)}`); if (!ok) bad.push('the tab is over the scene'); }
  await step('Down: tilted into the water', () => click('tilt'), s => s.tilt === 'Up' && s.start === 'Start' && s.gear === 'N');
  await step('Start: the cord pulled, and it runs', () => click('start'), s => s.start === 'Stop');
  await step('F: ahead', () => click('F'), s => s.gear === 'F');
  for (let i = 0; i < 5; i++) { await click('more'); await p.waitForTimeout(300); }
  const ahead = await step('+ five times: 50%', async () => {}, s => s.thr === '50%');
  const going = await until(s => s.kt >= ahead.kt + 0.3, 240000);
  { const ok = going.kt >= ahead.kt + 0.3; console.log(`${ok ? 'ok  ' : 'FAIL'} she gathers way ahead: ${ahead.kt} → ${going.kt} kt`); if (!ok) bad.push('she didn\'t move ahead under the motor'); }
  // nothing on the tab rewritten while nothing changes (a write a frame under the pointer can eat a click)
  { const n = await p.evaluate(() => new Promise(res => { let n = 0; const o = new MutationObserver(l => { n += l.length; }); o.observe(document.querySelector('.sb-motor'), { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { o.disconnect(); res(n); }, 2000); }));
    const ok = n === 0; console.log(`${ok ? 'ok  ' : 'FAIL'} the tab still: ${n} changes in 2 s`); if (!ok) bad.push('the tab is rewritten while nothing changes'); }
  await step('N: neutral', () => click('N'), s => s.gear === 'N');
  await step('R: astern', () => click('R'), s => s.gear === 'R');
  const slowing = await until(s => s.kt < going.kt - 0.3, 240000);
  { const ok = slowing.kt < going.kt - 0.3; console.log(`${ok ? 'ok  ' : 'FAIL'} astern, she slows: ${going.kt} → ${slowing.kt} kt`); if (!ok) bad.push('astern didn\'t slow her'); }
  await step('Stop', () => click('start'), s => s.start === 'Start' && s.gear === 'N');
  await step('Up: tilted clear of the water', () => click('tilt'), s => s.tilt === 'Down' && s.start === null);
  // a quick double click on the tilt is one tilt, not down-and-up-again before the race has answered
  await step('a double click on Down: down once', async () => { await click('tilt'); await p.waitForTimeout(60); await click('tilt'); await p.waitForTimeout(8000); }, s => s.tilt === 'Up');
  await p.screenshot({ path: `${out}/motor-band.png` });
  console.log('page errors:', errs.join(' / ') || 'none');
  if (errs.length) bad.push('page errors');
  console.log(bad.length ? `FAILED: ${bad.join('; ')}` : 'motor-band: ok');
  await b.close(); process.exit(bad.length ? 1 : 0);
})();
