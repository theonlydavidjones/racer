#!/usr/bin/env node
/**
 * The first run, as a new player meets it (docs/FTUE-PLAN.md). In an empty browser profile:
 *  1. the start page shows at once, marked as loading (aria-busy, its cards dimmed and not taking clicks), so nobody
 *     clicks a card that can't answer yet;
 *  2. the loading mark clears (within 90 s, software graphics allowed for), and then a click on a card answers at
 *     once: Cruise opens its setup;
 *  3. behind it, a quiet cruise: her alone, no fleet, start line or clock (dev server), and again on coming back to it
 *     from a race's setup, which still sets up its race;
 *  4. the boat a new player is given is their own: not JOSEPHINE, USA 122 (the owner's).
 * Fails (exit 1) on any of these, or on a page error. Needs the dev server (default :5173).
 *
 *   node scripts/check/ftue.cjs [<url>] [<out-dir>]   → stills in <out-dir> when given
 *   node scripts/check/ftue.cjs file://$PWD/artifact/folkboat-racing-sim.html   (the built page)
 */
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); // (a fresh context: no saves)
  const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  const errs = [], bad = [];
  // (the built page takes three.js from jsDelivr: served here from node_modules, as smoke.cjs does)
  await p.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => r.fulfill({ path: path.join(__dirname, '../../node_modules/three/build', path.basename(new globalThis.URL(r.request().url()).pathname)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  p.on('pageerror', e => errs.push(e.message));
  const ok = (cond, label) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) bad.push(label); };
  const shot = async n => { if (OUT) await p.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }).catch(() => {}); };
  // (recorded in the page from the first moment, so a busy main thread can't hide what the player saw)
  await p.addInitScript(() => {
    const t0 = performance.now(), rec = window.__ftue = { shown: null, busyAtShow: null, styled: null, ready: null };
    const look = () => {
      const h = document.getElementById('home'); if (!h) return;
      const busy = h.getAttribute('aria-busy') === 'true', c = h.querySelector('[data-home="cruise"]');
      if (rec.shown == null && !h.hidden) { rec.shown = performance.now() - t0; rec.busyAtShow = busy; }
      // (once the page's styles are in: the cards as the player sees them)
      if (rec.styled == null && c && getComputedStyle(c).borderTopLeftRadius === '10px') { const cs = getComputedStyle(c); rec.styled = { t: performance.now() - t0, busy, pointer: cs.pointerEvents, opacity: +cs.opacity }; }
      if (rec.shown != null && rec.ready == null && !busy) rec.ready = performance.now() - t0;
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'hidden'] });
    document.addEventListener('DOMContentLoaded', look); const iv = setInterval(() => { look(); if (rec.ready != null) clearInterval(iv); }, 20);
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__ftue && window.__ftue.shown != null && window.__ftue.styled != null, null, { timeout: 60000 });
  const R = await p.evaluate(() => window.__ftue), st = R.styled;
  await shot('ftue-01-loading');
  ok(R.busyAtShow, `the start page shows marked as loading (shown at ${Math.round(R.shown)} ms)`);
  ok(st.busy && st.pointer === 'none' && st.opacity < 0.8, `while loading, its cards are drawn dimmed and take no clicks (styled at ${Math.round(st.t)} ms: busy ${st.busy}, pointer-events ${st.pointer}, opacity ${st.opacity})`);
  const ready = await p.waitForFunction(() => window.__ftue.ready, null, { timeout: 90000 }).then(h => h.jsonValue()).catch(() => null);
  // (the readouts behind it, four frames on: a cruise's, not a race's "Start in 3:00", nor held up by a first frame's
  // negative time step)
  const labAtReady = ready == null ? '' : await p.evaluate(() => new Promise(res => { let n = 0; const f = () => (++n >= 4 ? res(document.getElementById('clockLab').textContent) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  ok(ready != null, `the loading mark clears${ready != null ? ` (at ${(ready / 1000).toFixed(1)} s)` : ' (not within 90 s)'}`);
  await shot('ftue-02-ready');
  if (ready != null) {
    const t = Date.now();
    // the scene behind the start page: a quiet cruise, her alone (no fleet, start line or clock); the dev server's handle
    // (__w, the page's World) only, so not on the built page
    const scene = () => p.evaluate(() => window.__w ? { freeSail: window.__w().freeSail, boats: window.__w().boats.length } : null);
    const quiet = s => s && s.freeSail && s.boats === 1;
    const s0 = await scene();
    if (s0) {
      ok(quiet(s0), `behind the start page, a quiet cruise: her alone (${JSON.stringify(s0)})`);
      ok(labAtReady === 'Sailing', `its clock reads as a cruise's within four frames of the page being ready (${labAtReady})`);
      const go = sel => p.evaluate(sel => { const e = [...document.querySelectorAll(sel)].find(e => e.offsetParent); if (e) e.click(); }, sel);
      await go('#home [data-home="race"]'); await go('[data-home="create"]'); await p.waitForTimeout(1500);
      const s1 = await scene();
      ok(s1 && !s1.freeSail && s1.boats > 1, `Create a race still sets up the race, fleet and all (${JSON.stringify(s1)})`);
      await go('#setupBack'); await go('#raceBack'); await p.waitForTimeout(1500);
      const s2 = await scene(), back = await p.evaluate(() => !document.getElementById('home').hidden);
      ok(back && quiet(s2), `back on the start page, the quiet cruise again (${JSON.stringify(s2)})`);
      await shot('ftue-02b-home-again');
    } else console.log('(the scene behind the start page: checked on the dev server only)');
    // (the click dispatched as the browser would: with software graphics a frame takes seconds here, too slow for a
    // mouse click's own checks; on a real GPU the page answers at once)
    await p.evaluate(() => document.querySelector('#home [data-home="cruise"]').click());
    const opened = await p.evaluate(() => !document.getElementById('setup').hidden);
    ok(opened, `once ready, a click on Cruise opens its setup${opened ? ` (${Date.now() - t} ms)` : ''}`);
    await shot('ftue-03-cruise');
    const boat = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || 'null'); return s?.boat ? `${s.boat.name}, ${s.boat.sails.country} ${s.boat.sails.number}` : document.querySelector('#setup')?.innerText.match(/USA\s*\d+\s*\n?\s*[A-Z ]+/)?.[0] ?? ''; });
    ok(boat && !/JOSEPHINE|\b122\b/.test(boat), `a new player's boat is their own, not the owner's (${boat || 'not found'})`);
  }
  ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
  await b.close();
  console.log(bad.length ? `\n${bad.length} failed` : '\nall ok');
  process.exit(bad.length ? 1 : 0);
})();
