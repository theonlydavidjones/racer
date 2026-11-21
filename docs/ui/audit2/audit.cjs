/**
 * The UI audit (21 Nov 2026): the pause screen, the Season tab and every Yacht Club tab, at 1280×800 and 1920×1080.
 * A still of each, and what the scan finds: stray separators (a dot at the start or end of a line, two in a row),
 * text clipped by its box (scrollWidth over clientWidth), and visible things past the window's edge.
 *   node docs/ui/audit2/audit.cjs <out-dir>        (the dev server on :5199)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const SCAN = () => {
  const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.width > 1 && r.height > 1 && !e.closest('[hidden]') && !e.closest('details:not([open])'); };
  const sel = e => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : ''; const p = e.parentElement; const pid = p?.id ? '#' + p.id : (p && typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\s+/)[0] : ''); return (pid ? pid + ' > ' : '') + s + (c ? '.' + c : ''); };
  const seps = [], clipped = [], edge = [];
  const W = innerWidth, H = innerHeight;
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || ['SCRIPT', 'STYLE', 'OPTION', 'CANVAS', 'SVG', 'NOSCRIPT', 'path', 'g', 'rect', 'circle'].includes(e.tagName)) continue;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, ' ');
    if (own.trim() && (/^\s*[·•,;]\s|\s[·•]\s*$|[·•]\s*[·•]|\s,\s|,\s*,/.test(own) || /^\s*[·•]/.test(own.trim()) || /[·•]\s*$/.test(own.trim()))) seps.push({ el: sel(e), text: own.trim().slice(0, 100) });
    const c = getComputedStyle(e);
    if (own.trim() && e.scrollWidth > e.clientWidth + 2 && (c.overflowX === 'hidden' || c.textOverflow === 'ellipsis' || c.overflowX === 'clip') && e.clientWidth > 0) clipped.push({ el: sel(e), cw: e.clientWidth, sw: e.scrollWidth, text: own.trim().slice(0, 80) });
    const r = e.getBoundingClientRect();
    if (own.trim() && (r.right > W + 2 || r.bottom > H + 2 && c.position === 'fixed' || r.left < -2)) edge.push({ el: sel(e), r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], text: own.trim().slice(0, 60) });
  }
  return { seps, clipped, edge };
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const rep = {}, errs = [];
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    const tag = `${w}x${h}`;
    const fresh = async name => { const p = await b.newPage({ viewport: { width: w, height: h } }); p.setDefaultTimeout(240000); p.on('pageerror', e => errs.push(`${tag} ${name}: ${e.message}`)); await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(4500); return p; };
    const snap = async (p, name) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${tag}-${name}.png` }); rep[`${tag}-${name}`] = await p.evaluate(SCAN); const r = rep[`${tag}-${name}`]; console.log(tag, name, 'seps', r.seps.length, 'clipped', r.clipped.length, 'edge', r.edge.length); };
    const home = async (p, v) => { await p.evaluate(v => document.querySelector(`[data-home="${v}"]`)?.click(), v); await p.waitForTimeout(1800); };
    let p = await fresh('season'); await home(p, 'race'); await home(p, 'season'); await snap(p, 'season'); await p.close();
    p = await fresh('club'); await home(p, 'fleet');
    const tabs = await p.evaluate(() => [...document.querySelectorAll('[data-f="tab"]')].map(b => b.dataset.v));
    for (const t of tabs) { await p.evaluate(t => document.querySelector(`[data-f="tab"][data-v="${t}"]`)?.click(), t); await p.waitForTimeout(1500); await snap(p, `club-${t}`); }
    await p.close();
    p = await fresh('game'); await home(p, 'race'); await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1200); await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
    await p.evaluate(() => document.getElementById('bPause').click()); await snap(p, 'pause'); await p.close();
  }
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(rep, null, 1));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close(); console.log('DONE');
})();
