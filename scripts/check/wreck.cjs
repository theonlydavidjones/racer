#!/usr/bin/env node
/**
 * Wrecks in the page (docs/WRECK-PROPOSAL.md, the owner's answers): a cruise, set onto West Harbor's breakwater at 2 m/s.
 * The statement of how and where, then a tow: the Keep prompt, her logbook entry ("towed in"), her laid-up date, the
 * Yacht Club showing it, and a second cast off refused while she's laid up. Then, from fresh, Carry on: she sails on.
 * Needs the dev server: npm run dev -- --port 5173 (the race in the page's thread, ?inproc).
 *   node scripts/check/wreck.cjs <out-dir>   (screenshots → out-dir/wreck-*.png; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon) => ({ x: (lon - LON0) * MLON, y: (lat - LAT0) * MLAT });
// (from 37.8098 N 122.4410 W due south, the first land is West Harbor's breakwater, 176 m on: tests/wrecks.test.ts)
const from = LL(37.8098, -122.4410), at = { x: from.x, y: from.y - 176 + 2 + 3.82 };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  const open = async () => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } }); p.setDefaultTimeout(120000);
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { if (sessionStorage.getItem('wreck-init')) return; sessionStorage.setItem('wreck-init', '1'); localStorage.removeItem('fbsim-logbook-v1'); const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', windKind: 'west', windKt: 2, current: 'slack' }); for (const b of s.boats ?? []) delete b.laidUpUntil; localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
    await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(4000);
    return p;
  };
  const castOff = async p => { await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2500); await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000); };
  const setOn = async p => {
    await p.evaluate(([x, y]) => { const u = sim().user; Object.assign(u, { docked: undefined, x, y, h: 180, v: 2, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null }); u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; }, [at.x, at.y]);
    await p.waitForSelector('#wreckAsk:not([hidden])', { timeout: 120000 }).catch(() => fail('no wreck statement'));
    await p.waitForFunction(() => document.getElementById('wreckWhat').textContent.length > 0);
  };

  // a tow
  let p = await open(); await castOff(p); await setOn(p);
  const what = await p.evaluate(() => document.getElementById('wreckWhat').textContent);
  console.log('statement:', what); if (!/^Hit the breakwater at 3\.\d kn, at West Harbor/.test(what)) fail(`statement: ${what}`);
  await p.screenshot({ path: `${out}/wreck-statement.png` });
  await p.click('#bWreckTow'); await p.waitForSelector('#keepAsk:not([hidden])');
  const keep = await p.evaluate(() => document.getElementById('keepWhat').textContent);
  console.log('keep:', keep); if (!/wrecked \(hit the breakwater .*\), towed in/.test(keep)) fail(`keep: ${keep}`);
  await p.click('#bKeep'); await p.waitForTimeout(800);
  const st = await p.evaluate(() => { const log = JSON.parse(localStorage.getItem('fbsim-logbook-v1') || '[]'), s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const b = (s.boats ?? []).find(x => x.id === s.boatId); return { last: log[log.length - 1], laid: b?.laidUpUntil }; });
  console.log('logbook:', JSON.stringify(st.last && { wreck: st.last.wreck, towed: st.last.towed }), 'laid up until', st.laid);
  if (!st.last?.wreck || !st.last?.towed) fail('logbook entry lacks the wreck or the tow'); if (!st.laid) fail('not laid up');
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(1000);
  const club = await p.evaluate(() => document.body.innerText.includes('laid up')); if (!club) fail('the Yacht Club doesn\'t show her laid up');
  await p.screenshot({ path: `${out}/wreck-club.png` });
  await p.evaluate(() => document.getElementById('bHomeFromClub')?.click()); await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(4000);
  await castOff(p);
  const refused = await p.evaluate(() => document.getElementById('msgRecent')?.textContent ?? '');
  console.log('second cast off:', refused.slice(0, 120)); if (!/laid up for repairs/.test(refused)) fail('a laid-up boat was taken out');
  await p.close();

  // carry on
  p = await open(); await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); for (const b of s.boats ?? []) delete b.laidUpUntil; localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }); await p.reload(); await p.waitForTimeout(4000);
  await castOff(p); await setOn(p);
  await p.click('#bWreckOn'); await p.waitForTimeout(500);
  const on = await p.evaluate(() => { const u = sim().user; u.h = 0; u.v = 1; return new Promise(r => setTimeout(() => r({ carry: sim().user.wrecked?.carryOn, moving: Math.hypot(sim().user.vx, sim().user.vy) }), 3000)); });
  console.log('carry on:', JSON.stringify(on)); if (!on.carry || !(on.moving > 0.05)) fail('carry on: she didn\'t sail on');
  await p.close();

  console.log('ERRORS:', errs.join('; ') || 'none');
  await browser.close(); process.exit(errs.length ? 1 : 0);
})();
