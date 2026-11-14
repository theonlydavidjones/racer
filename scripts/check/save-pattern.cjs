#!/usr/bin/env node
/**
 * Saving in the Yacht Club and the boat editor (the owner): changes are a draft until Save; Save gives a quick "Saved" and
 * goes back; leaving with changes unsaved asks "Save changes?", Save or Discard. In the dev server (npm run dev -- --port 5199).
 *   node scripts/check/save-pattern.cjs <out-dir> [page-url]   (screenshots → out-dir/save-*.png; exits 1 on a failure)
 * With a page URL (e.g. file:///…/artifact/folkboat-racing-sim.html) it checks the built page instead. It also opens the
 * editor on every boat (her sail number and home country shown: 8u) and sets a new boat's country (her ensign follows).
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(120000);
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  page.on('pageerror', e => errs.push(e.message));
  await page.routeWebSocket(/.*/, ws => ws.close()); // (no hot reload mid-run)
  // (the page: the dev server by default; or the built page, e.g. file:///…/artifact/folkboat-racing-sim.html)
  // (the built page loads three.js from jsDelivr: served here from node_modules, as smoke.cjs does)
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => r.fulfill({ path: require('path').join(__dirname, '../../node_modules/three/build', require('path').basename(new URL(r.request().url()).pathname)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(process.argv[3] || 'http://localhost:5199/'); await page.waitForTimeout(process.argv[3] ? 8000 : 3000);
  // (the owner's other boats beside Josephine, as they're named and numbered: each opened in the editor below)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); if (!s.boats?.length) return;
    for (const [id, name, country, number] of [['chk-ni', 'NO INHERITANCE', 'GBR', '1655'], ['chk-cv', 'CAVIARO', 'RSA', '100'], ['chk-st', 'SAILOR TWIFT', 'USA', '225']])
      if (!s.boats.some(b => b.id === id)) { const b = structuredClone(s.boats[0]); Object.assign(b, { id, name }); b.sails = { ...b.sails, country, number }; delete b.slip; s.boats.push(b); }
    localStorage.setItem('fbsim-settings-v2', JSON.stringify(s));
  });
  await page.reload(); await page.waitForTimeout(process.argv[3] ? 8000 : 3000);
  const click = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  const has = sel => page.evaluate(s => !!document.querySelector(s), sel);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'));
  const members = () => page.evaluate(() => JSON.parse(localStorage.getItem('fbsim-members') || '[]'));
  // 1. a member's page: change their weight, leave, asked, Discard: unchanged; change, Save: kept, back to the members
  await click('[data-home="fleet"]'); await page.waitForTimeout(1200);
  await click('[data-f="tab"][data-v="members"]'); await page.waitForTimeout(500);
  const id = await page.evaluate(() => document.querySelector('[data-f="member"]:not([data-v="you"])')?.dataset.v ?? document.querySelector('[data-f="member"]').dataset.v);
  await page.evaluate(i => document.querySelector(`[data-f="member"][data-v="${i}"]`).click(), id); await page.waitForTimeout(500);
  const w0 = (await members()).find(m => m.id === id)?.w;
  const setW = async lb => { await page.evaluate(v => { const e = document.querySelector('[data-m="w"]'); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); }, lb); await page.waitForTimeout(300); };
  await setW(201);
  if (!(await has('[data-f="msave"]'))) fail('no Save on the member page once changed');
  if (Math.abs(((await members()).find(m => m.id === id)?.w ?? 0) - w0) > 1e-9) fail('the member was saved before Save');
  await click('[data-f="mback"]'); await page.waitForTimeout(400);
  if (!(await has('[data-f="askSave"]'))) fail('leaving the member page unsaved didn\'t ask');
  await page.screenshot({ path: out + '/save-member-ask.png' });
  await click('[data-f="askDiscard"]'); await page.waitForTimeout(400);
  if (await has('[data-f="mback"]')) fail('Discard didn\'t go back to the members');
  if (Math.abs(((await members()).find(m => m.id === id)?.w ?? 0) - w0) > 1e-9) fail('Discard kept the change');
  await page.evaluate(i => document.querySelector(`[data-f="member"][data-v="${i}"]`).click(), id); await page.waitForTimeout(400);
  await setW(202);
  // (Save, and read the quick "Saved" at once: it shows for a second and a half)
  const sv = await page.evaluate(() => { document.querySelector('[data-f="msave"]').click(); return document.querySelector('.gsaved.on')?.textContent ?? ''; });
  await page.waitForTimeout(300);
  const w2 = (await members()).find(m => m.id === id)?.w;
  if (!(Math.abs(w2 - 202 * 0.4536) < 0.5)) fail(`Save didn't keep the weight (${w2})`);
  if (await has('[data-f="mback"]')) fail('Save didn\'t go back to the members');
  if (!/Saved/.test(sv)) fail('no "Saved" after Save');
  await page.screenshot({ path: out + '/save-member-saved.png' });
  // 2. the boat editor: change her topsides, Done: asked; Discard: back as she was; change, Save: kept, back to her page
  await click('[data-f="tab"][data-v="boats"]'); await page.waitForTimeout(400);
  await click('.fcard'); await page.waitForTimeout(2000);
  await click('[data-f="edit"]'); await page.waitForTimeout(2500);
  // (8u: her sail number and home country are there to change, in Particulars; a stray .row2 rule once hid them)
  // (8i: the editor's groups fold; Her holds them, opened by its Change)
  const openGrp = g => page.evaluate(g => { if (!document.querySelector(`#boatPanel .be-grp.open[data-grp="${g}"]`)) document.querySelector(`#boatPanel [data-act="grp"][data-v="${g}"]`)?.click(); }, g);
  const shown = async () => { await openGrp('her'); await page.waitForTimeout(300); return page.evaluate(() => ['country', 'number'].every(k => { const e = document.querySelector(`#boatPanel [data-k="${k}"]`); return !!e && e.getBoundingClientRect().width > 0; })); };
  if (!(await shown())) fail('the editor hides her sail number or home country');
  const hull0 = (await stored()).boats?.[0]?.hull?.upper;
  // (her topsides, by the one color picker: Hull's Change, the Topsides button, a preset)
  const topsides = async h => { await openGrp('hull'); await page.waitForTimeout(300);
    if (!(await has('#boatPanel .be-picker[data-key="upper"]'))) { await click('#boatPanel [data-act="pick"][data-v="upper"]'); await page.waitForTimeout(300); }
    return page.evaluate(h => { const b = [...document.querySelectorAll('#boatPanel .be-picker[data-key="upper"] [data-cp="preset"]')].find(x => h ? x.dataset.v === h : x.dataset.v.toLowerCase() !== (window.__hull0 ?? '').toLowerCase()); b.click(); return b.dataset.v; }, h); };
  await page.evaluate(h => { window.__hull0 = h; }, hull0);
  const pick = async () => topsides(null);
  const newHull = await pick(); await page.waitForTimeout(800);
  if ((await stored()).boats?.[0]?.hull?.upper !== hull0) fail('the editor saved before Save');
  if (!(await has('#boatPanel [data-act="save"]'))) fail('no Save in the editor once changed');
  await click('#boatPanel [data-act="save"]'); await page.waitForTimeout(800); // (Save: kept, back)
  if ((await stored()).boats?.[0]?.hull?.upper !== newHull) fail('Save in the editor didn\'t keep her change');
  if (await page.evaluate(() => !document.getElementById('boatPanel').hidden)) fail('Save didn\'t close the editor');
  await page.screenshot({ path: out + '/save-boat-saved.png' });
  await click('[data-f="edit"]'); await page.waitForTimeout(2500);
  await topsides(hull0); await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  if (!(await has('#boatPanel [data-act="askSave"]'))) fail('leaving the editor unsaved (Esc) didn\'t ask');
  await page.screenshot({ path: out + '/save-boat-ask.png' });
  await click('#boatPanel [data-act="askDiscard"]'); await page.waitForTimeout(800);
  if ((await stored()).boats?.[0]?.hull?.upper !== newHull) fail('Discard in the editor changed what was saved');
  // 3. a new boat: the editor opens on her, her sail number and home country there to set (8u)
  if (await page.evaluate(() => !document.getElementById('boatPanel').hidden)) { await click('#boatPanel [data-act="done"]'); await page.waitForTimeout(800); }
  await click('[data-f="tab"][data-v="boats"]'); await page.waitForTimeout(400);
  await click('[data-f="new"]'); await page.waitForTimeout(2500);
  if (await page.evaluate(() => document.getElementById('boatPanel').hidden)) await click('[data-f="edit"]').catch(() => {}), await page.waitForTimeout(2500);
  if (!(await shown())) fail('a new boat\'s editor hides her sail number or home country');
  await page.screenshot({ path: out + '/save-boat-new.png' });
  // 4. her home country sets her ensign: the new boat to GBR, saved; her card's ensign isn't the American one any more
  const usa = await page.evaluate(() => document.querySelector('.fcard .fflag')?.title ?? '');
  await page.evaluate(() => { const e = document.querySelector('#boatPanel [data-k="country"]'); e.value = 'GBR'; e.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(800);
  await click('#boatPanel [data-act="save"]'); await page.waitForTimeout(1000);
  if (await page.evaluate(() => !document.getElementById('boatPanel').hidden)) await click('#boatPanel [data-act="done"]').catch(() => {});
  await click('[data-f="tab"][data-v="boats"]'); await page.waitForTimeout(600);
  const gbr = await page.evaluate(() => [...document.querySelectorAll('.fcard')].find(c => /NEW BOAT/i.test(c.textContent))?.querySelector('.fflag')?.title ?? '');
  console.log('ensign:', usa, '→', gbr);
  if (!gbr || gbr === usa) fail(`her ensign didn't follow her country (${usa} → ${gbr})`);
  // 5. every boat of yours: the editor shows her sail number and home country (8u: the owner's boats, and the new one)
  const n = await page.evaluate(() => document.querySelectorAll('.fcard').length);
  for (let i = 0; i < n; i++) {
    await click('[data-f="tab"][data-v="boats"]'); await page.waitForTimeout(500);
    await page.evaluate(k => document.querySelectorAll('.fcard')[k].click(), i); await page.waitForTimeout(1500);
    await click('[data-f="edit"]'); await page.waitForTimeout(2000);
    await openGrp('her'); await page.waitForTimeout(300);
    const who = await page.evaluate(() => { const c = document.querySelector('#boatPanel [data-k="country"]'), no = document.querySelector('#boatPanel [data-k="number"]'), nm = document.querySelector('#boatPanel [data-k="name"]'); return `${nm?.value} ${c?.value} ${no?.value}`; });
    const ok = await shown(); console.log(`editor: ${who}: ${ok ? 'sail number and country shown' : 'HIDDEN'}`);
    if (!ok) fail(`the editor hides ${who}'s sail number or home country`);
    await click('#boatPanel [data-act="done"]').catch(() => {}); await page.waitForTimeout(800);
  }
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
