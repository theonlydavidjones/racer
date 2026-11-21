/**
 * The in-race audit's capture (r-audit, 21 Nov 2026): sails a whole race (the user's boat on the AI's skipper, as
 * scripts/check/season.cjs does) and a cruise on the dev page, stopping at set moments for a still and the page's own
 * checks: truncated text, overlapping pieces of the HUD, wordy text, UK spellings, mixed words, long hover titles.
 *   node docs/ui/in-race/audit.cjs <out-dir>      (the dev server on :5199)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const CHECK = () => {
  const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.width > 1 && r.height > 1 && !e.closest('[hidden]'); };
  const sel = e => e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? e.tagName.toLowerCase() + '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase());
  const res = { truncated: [], overlaps: [], wordy: [], uk: [], mixed: {}, titles: [], pods: [] };
  const all = [...document.querySelectorAll('body *')].filter(vis);
  for (const e of all) {
    const c = getComputedStyle(e);
    if (e.children.length === 0 && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1) && (c.textOverflow === 'ellipsis' || c.overflow === 'hidden')) res.truncated.push({ el: sel(e), text: e.textContent.trim().slice(0, 80), shown: e.clientWidth, needs: e.scrollWidth });
    if (e.children.length === 0) { const t = e.textContent.trim(); if (t.length > 110 && !e.closest('canvas')) res.wordy.push({ el: sel(e), n: t.length, text: t.slice(0, 90) }); }
    if (e.hasAttribute('title') && e.getAttribute('title').length > 110) res.titles.push({ el: sel(e), n: e.getAttribute('title').length, text: e.getAttribute('title').slice(0, 80) });
  }
  const text = document.body.innerText;
  const UK = /\b(colour\w*|centre\w*|metre\w*|harbour\w*|favour\w*|manoeuvr\w*|grey\w*|programme|organis\w*|realis\w*|travell\w*|gybe\w*|licence|practise\w*|neighbour\w*|behaviour\w*|defence|offence|analys(e|ed|ing))\b/gi;
  res.uk = [...new Set((text.match(UK) || []).map(s => s.toLowerCase()))];
  for (const w of ['stbd', 'starboard', 'port', 'jibe', 'tack']) res.mixed[w] = (text.match(new RegExp('\\b' + w + '\\b', 'gi')) || []).length;
  // overlaps among the game surface's own pieces (not the canvases and full-screen layers)
  const PIECES = ['#hud', '#leftCol', '#nextCard', '#sigPanel', '#coachPanel', '#msgLog', '#viewBar', '#map', '#compassBar', '#navStrip', '.sailband', '#controls', '#helmBar', '#pilot', '#toast', '#crewPop', '#dial', '#tillerGuide .tg-wh', '#tillerGuide'];
  const boxes = PIECES.map(s => [s, document.querySelector(s)]).filter(([s, e]) => e && vis(e)).map(([s, e]) => [s, e.getBoundingClientRect()]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i][1], b = boxes[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) res.overlaps.push(boxes[i][0] + ' × ' + boxes[j][0]); }
  res.offscreen = boxes.filter(([s, r]) => r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1).map(([s]) => s);
  res.pods = [...document.querySelectorAll('#hud .pod')].filter(vis).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; });
  res.visibleText = text.split('\n').map(s => s.trim()).filter(s => s.length > 3).slice(0, 400);
  return res;
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const rep = {}, errs = [];
  const open = async (name, init) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(240000);
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    if (init) await p.addInitScript(init);
    await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(5000);
    return p;
  };
  const snap = async (p, name, fn) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/${name}.png` }); rep[name] = await p.evaluate(CHECK); console.log(name, 'overlaps', rep[name].overlaps.join(', ') || '-', '| truncated', rep[name].truncated.length, '| wordy', rep[name].wordy.length, '| uk', rep[name].uk.join(',') || '-'); };
  // ---- the race (Course 2 default, the whole fleet), sailed by the AI's skipper
  let p = await open('race');
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
  await snap(p, 'race-01-prestart');
  const adv = async (sec, stopFn) => p.evaluate(([sec, stopFn]) => { const w = sim(); w.paused = true; const f = stopFn ? new Function('w', 'return ' + stopFn) : null; for (let i = 0; i < sec * 60; i++) { w.step(1 / 60); if (f && f(w)) break; } w.paused = false; return Math.round(w.t); }, [sec, stopFn]);
  await p.evaluate(() => { const w = sim(), u = w.user; window.__ai = structuredClone(w.boats[1].ai); window.__user = u; });
  const sail = on => p.evaluate(on => { const w = sim(), u = w.user || window.__user; if (on) { u.ai = structuredClone(window.__ai); u.isUser = false; } else { u.ai = null; u.isUser = true; } }, on);
  await adv(200); await snap(p, 'race-02-one-minute-to-go');
  await sail(true); await adv(75); await sail(false); await snap(p, 'race-03-just-started');
  await sail(true); await adv(240); await sail(false); await snap(p, 'race-04-beating');
  await sail(true); const near = await adv(1800, 'w.user && w.nextMark(w.user) && Math.hypot(w.user.x - w.nextMark(w.user).p.x, w.user.y - w.nextMark(w.user).p.y) < 160'); await sail(false); await snap(p, 'race-05-near-the-mark');
  await sail(true); await adv(30); await sail(false); await snap(p, 'race-06-rounding');
  await sail(true); await adv(240); await sail(false); await snap(p, 'race-07-next-leg');
  await sail(true); await adv(3000, 'w.user.finished'); await sail(false); await snap(p, 'race-08-finished-or-late');
  await p.close();
  // ---- a cruise: out of the slip, sailing, the chart, the navigator
  p = await open('cruise', () => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, { mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', windKind: 'west', windKt: 12 }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); });
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  await snap(p, 'cruise-01-setup');
  await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
  await snap(p, 'cruise-02-start');
  await p.evaluate(() => { const w = sim(), u = w.user; w.paused = false; u.heading = 80; u.v = 3; for (let i = 0; i < 60 * 20; i++) w.step(1 / 60); });
  await snap(p, 'cruise-03-sailing');
  await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(3500); await snap(p, 'cruise-04-chart');
  await p.evaluate(() => document.getElementById('bChartClose').click()); await p.waitForTimeout(800);
  await p.keyboard.press('m'); await p.waitForTimeout(3000); await snap(p, 'cruise-05-navigator');
  await p.close();
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(rep, null, 1));
  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})();
