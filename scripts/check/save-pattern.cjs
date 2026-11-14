#!/usr/bin/env node
/**
 * Saving in the Yacht Club and the boat editor (the owner): changes are a draft until Save; Save gives a quick "Saved" and
 * goes back; leaving with changes unsaved asks "Save changes?", Save or Discard. In the dev server (npm run dev -- --port 5199).
 *   node scripts/check/save-pattern.cjs <out-dir>   (screenshots → out-dir/save-*.png; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(120000);
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  page.on('pageerror', e => errs.push(e.message));
  await page.routeWebSocket(/.*/, ws => ws.close()); // (no hot reload mid-run)
  await page.goto('http://localhost:5199/'); await page.waitForTimeout(3000);
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
  const hull0 = (await stored()).boats?.[0]?.hull?.upper;
  const pick = async () => page.evaluate(h => { const b = [...document.querySelectorAll('[data-act="upper"]')].find(x => x.dataset.v !== h); b.click(); return b.dataset.v; }, hull0);
  const newHull = await pick(); await page.waitForTimeout(800);
  if ((await stored()).boats?.[0]?.hull?.upper !== hull0) fail('the editor saved before Save');
  if (!(await has('#boatPanel [data-act="save"]'))) fail('no Save in the editor once changed');
  await click('#boatPanel [data-act="save"]'); await page.waitForTimeout(800); // (Save: kept, back)
  if ((await stored()).boats?.[0]?.hull?.upper !== newHull) fail('Save in the editor didn\'t keep her change');
  if (await page.evaluate(() => !document.getElementById('boatPanel').hidden)) fail('Save didn\'t close the editor');
  await page.screenshot({ path: out + '/save-boat-saved.png' });
  await click('[data-f="edit"]'); await page.waitForTimeout(2500);
  await page.evaluate(h => { [...document.querySelectorAll('[data-act="upper"]')].find(x => x.dataset.v === h).click(); }, hull0); await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  if (!(await has('#boatPanel [data-act="askSave"]'))) fail('leaving the editor unsaved (Esc) didn\'t ask');
  await page.screenshot({ path: out + '/save-boat-ask.png' });
  await click('#boatPanel [data-act="askDiscard"]'); await page.waitForTimeout(800);
  if ((await stored()).boats?.[0]?.hull?.upper !== newHull) fail('Discard in the editor changed what was saved');
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
