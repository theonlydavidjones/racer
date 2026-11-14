#!/usr/bin/env node
/**
 * The tiller pilot engages, and every refusal says why on its button (the owner, v188: "autopilot is failing. it worked
 * at the start of my cruise, and now the button won't engage"). On a cruise in the race's worker, as the page runs:
 * engage, take the tiller, engage again, the Y key, a click on the water, a tack and standby from the pilot's panel;
 * then each refusal (paused, stopped, Nav with nowhere to go) must put its word on the button and its line in Messages.
 * Needs the dev server (default :5173).
 *
 *   node scripts/check/pilot-engage.cjs [<url>]    → fails (exit 1) on a step that doesn't do what it should
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'alcatraz', sailTo: 'crissy', windKind: 'west', windKt: 12, tideDate: '2026-07-11', tideTime: '15:00' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto(URL); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(8000);
  const state = () => p.evaluate(() => { const w = sim(), c = document.getElementById('bPilot');
    return { mode: w.pilot.mode, v: +w.user.v.toFixed(2), chip: c.hidden ? null : c.querySelector('.w').textContent, msg: document.getElementById('msgRecent').innerText.split('\n').slice(0, 2).join(' | ') }; });
  const step = async (label, act, want) => {
    await act(); await p.waitForTimeout(1500);
    const s = await state(), ok = want(s);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(s)}`); if (!ok) bad.push(label);
  };
  const chip = async () => { const r = await p.evaluate(() => { const c = document.getElementById('bPilot').getBoundingClientRect(); return [c.x + c.width / 2, c.y + c.height / 2]; }); await p.mouse.click(r[0], r[1]); };
  const send = c => p.evaluate(c => __host().send(c), c);
  await step('engage with the button', chip, s => s.mode === 'auto');
  await step('take the tiller (T)', () => p.keyboard.press('t'), s => s.mode === 'off');
  await step('let go (T)', () => p.keyboard.press('t'), s => s.mode === 'off' && s.chip === 'Autopilot');
  await step('engage again', chip, s => s.mode === 'auto');
  await step('a click on the water takes the tiller', () => p.mouse.click(700, 500), s => s.mode === 'off');
  await step('and lets it go', () => p.mouse.click(700, 500), s => s.mode === 'off');
  await step('engage a third time', chip, s => s.mode === 'auto');
  await step('Y: standby', () => p.keyboard.press('y'), s => s.mode === 'off');
  await step('Y: engage', () => p.keyboard.press('y'), s => s.mode === 'auto');
  await step('tack from the panel', () => p.evaluate(() => document.querySelector('#pilot [data-pa="tack"]').click()), s => s.mode === 'auto');
  await step('standby from the panel', () => p.evaluate(() => document.querySelector('#pilot [data-pa="off"]').click()), s => s.mode === 'off');
  await step('engage after the tack', chip, s => s.mode === 'auto');
  // the refusals: each says why, on the button and in Messages
  await step('standby', () => p.keyboard.press('y'), s => s.mode === 'off');
  // (paused, the pilot isn't engaged: the pause screen's open, and a key under it doesn't sneak the pilot on)
  await step('paused (the pause screen): not engaged', async () => { await p.evaluate(() => document.getElementById('bPause').click()); await p.waitForTimeout(800); await p.keyboard.press('y'); },
    s => s.mode === 'off');
  await step('paused by a question (the page paused under no screen): refused, and says so', async () => {
    await p.evaluate(() => { document.getElementById('bResume').click(); }); await p.waitForTimeout(1500);
    await p.evaluate(() => { const w = __w(); w.paused = true; }); await p.keyboard.press('y');
  }, s => s.mode === 'off' && s.chip === 'Paused' && /paused/i.test(s.msg));
  await step('resumed: engages', async () => { await p.evaluate(() => { __w().paused = false; }); await p.waitForTimeout(3500); await chip(); }, s => s.mode === 'auto');
  await step('stopped (moved, so no way on): refused, and says so', async () => {
    await p.keyboard.press('y'); await p.waitForTimeout(500);
    const u = await p.evaluate(() => { const u = sim().user; return { x: u.x + 300, y: u.y }; });
    await p.evaluate(async q => __host().ask({ k: 'moveHere', p: q, name: 'here' }), u); await p.waitForTimeout(300); await chip();
  }, s => s.mode === 'off' && s.chip === 'Needs way on' && /Get her sailing first/.test(s.msg));
  await p.waitForTimeout(3500);
  await step('the word goes after 3 s', async () => {}, s => s.chip === 'Autopilot');
  // Nav with nowhere to go (a cruise with no destination): refused, and says so
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); s.sailTo = ''; localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); s.sailTo = ''; localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto(URL); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(8000);
  await step('engage (no destination)', chip, s => s.mode === 'auto');
  await step('Nav with nowhere to go: refused, and says so', () => p.evaluate(() => document.querySelector('#pilot [data-pm="nav"]').click()),
    s => s.mode === 'auto' && /Nav needs somewhere to go/.test(s.msg));
  console.log('ERRORS:', [...new Set(errs)].join('; ') || 'none');
  await b.close();
  if (bad.length || errs.length) { console.log(`FAILED: ${bad.join('; ')}`); process.exit(1); }
  console.log('all good');
})();
