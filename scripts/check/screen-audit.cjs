#!/usr/bin/env node
/**
 * Everything on the game surface, numbered on screenshots: the noise audit (ROADMAP 8b, "an audit for that kind of noise
 * throughout"). A race before and after the gun, the race in the next camera view, and a cruise under way; each element
 * outlined and numbered, and listed with its id, class and text in elements.json. Also checks that nothing covers a
 * control: every button and input on the surface must be what's on top at its center (an invisible strip over the
 * sail band's lowest row was the worry, 14 November: it has pointer-events none). Needs the dev server on :5173.
 *
 *   node scripts/check/screen-audit.cjs <out-dir>   → race-prestart.png, race-racing.png, race-racing-view.png,
 *                                                     cruise-underway.png (and -plain.png without the numbers), elements.json
 * Exits 1 if a control is covered.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const VW = 1440, VH = 900;

// in the page: the visible units on the surface, descending into anything covering most of the screen and into the
// HUD's own containers (each tile its own unit); numbered boxes drawn over them
const collect = () => {
  const vw = innerWidth, vh = innerHeight, units = [];
  const SPLIT = new Set(['hud', 'hudRight', 'appBar', 'leftCol', 'controls', 'viewBar', 'sailBand', 'labels']);
  const vis = e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh; };
  const walk = (e, depth) => {
    for (const c of e.children) {
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(c.tagName)) continue;
      if (c.tagName === 'CANVAS' && c.getBoundingClientRect().width * c.getBoundingClientRect().height > 0.5 * vw * vh) continue; // (the 3D view itself)
      if (!vis(c)) continue;
      const r = c.getBoundingClientRect(), big = r.width * r.height > 0.3 * vw * vh, hasVisKids = [...c.children].some(vis);
      if ((big || SPLIT.has(c.id)) && hasVisKids && depth < 6) { walk(c, depth + 1); continue; }
      if (big && !hasVisKids && !c.innerText?.trim()) continue; // (an empty layer)
      units.push({ el: c, r });
    }
  };
  walk(document.body, 0);
  const layer = document.createElement('div'); layer.id = '__audit'; Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 2147483647 });
  document.body.appendChild(layer);
  const list = units.map(({ el, r }, i) => {
    const box = document.createElement('div'); Object.assign(box.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', outline: '2px solid #ff2d55', boxSizing: 'border-box' });
    const tag = document.createElement('div'); tag.textContent = i + 1; Object.assign(tag.style, { position: 'fixed', left: Math.max(0, r.left - 2) + 'px', top: Math.max(0, r.top - 2) + 'px', background: '#ff2d55', color: '#fff', font: 'bold 13px/16px sans-serif', padding: '0 4px', borderRadius: '3px' });
    layer.append(box, tag);
    const cs = getComputedStyle(el);
    return { n: i + 1, id: el.id, cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 60), tag: el.tagName, pointerEvents: cs.pointerEvents, text: (el.innerText || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 160), rect: [r.left, r.top, r.width, r.height].map(Math.round) };
  });
  // every control on the surface: is it what a click at its center reaches?
  const covered = [];
  for (const c of document.querySelectorAll('button, input, select, [role=button], [role=slider], [role=tab]')) {
    if (!vis(c) || c.closest('#__audit') || c.closest('[hidden]')) continue;
    const q = c.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    layer.style.display = 'none'; const top = document.elementFromPoint(x, y); layer.style.display = '';
    if (top && top !== c && !c.contains(top) && !top.contains(c)) covered.push({ control: c.id || String(c.className).slice(0, 30) || c.textContent.trim().slice(0, 30), at: [Math.round(x), Math.round(y)], by: top.id || String(top.className?.baseVal ?? top.className).slice(0, 40) || top.tagName });
  }
  return { list, covered };
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [], report = {}, allCovered = [];
  const run = async (name, settings, start, steps) => {
    const p = await b.newPage({ viewport: { width: VW, height: VH } }); p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    await p.addInitScript(s => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, s); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); }, settings);
    await p.goto('http://localhost:5173/'); await p.waitForTimeout(6000);
    await start(p);
    for (const [label, ms, act] of steps) {
      if (act) await act(p);
      await p.waitForTimeout(ms);
      await p.screenshot({ path: `${out}/${name}-${label}-plain.png` });
      const { list, covered } = await p.evaluate(collect);
      await p.screenshot({ path: `${out}/${name}-${label}.png` });
      await p.evaluate(() => document.getElementById('__audit')?.remove());
      report[`${name}-${label}`] = { elements: list, covered };
      for (const c of covered) allCovered.push({ shot: `${name}-${label}`, ...c });
      console.log(`${name}-${label}: ${list.length} elements, ${covered.length} controls covered`);
    }
    await p.close();
  };
  const ck = (p, q) => p.evaluate(s => document.querySelector(s).click(), q);
  // (headless, software GL runs the race slowly: the dev handle's host sends it 20× to the gun, then back to 1×)
  await run('race', { mode: 'race', seq: 1 }, async p => {
    await ck(p, '[data-home="race"]'); await p.waitForTimeout(800); await ck(p, '[data-home="create"]'); await p.waitForTimeout(3000); await ck(p, '#bGo');
  }, [['prestart', 15000],
    ['racing', 5000, async p => {
      await p.evaluate(() => __host().send({ k: 'speed', v: 20 }));
      for (let i = 0; i < 120; i++) { await p.waitForTimeout(1000); if (!/START IN/.test(await p.evaluate(() => document.querySelector('.pod.clock')?.innerText || 'START IN'))) break; }
      await p.waitForTimeout(8000); await p.evaluate(() => __host().send({ k: 'speed', v: 1 }));
    }],
    ['racing-view', 4000, p => ck(p, '#bView')]]);
  await run('cruise', { mode: 'sail', sailFrom: 'crissy', sailTo: 'pier39' }, async p => {
    await ck(p, '[data-home="cruise"]'); await p.waitForTimeout(3000); await ck(p, '#bGo');
  }, [['underway', 20000]]);
  fs.writeFileSync(`${out}/elements.json`, JSON.stringify(report, null, 1));
  if (allCovered.length) console.log('COVERED CONTROLS:\n' + allCovered.map(c => `  ${c.shot}: ${c.control} at ${c.at} under ${c.by}`).join('\n'));
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(allCovered.length || errs.length ? 1 : 0);
})();
