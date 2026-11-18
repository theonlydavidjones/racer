#!/usr/bin/env node
/**
 * Panel overflow/blank sweep. {race, cruise} x {8 kt, 25 kt} x {day, night}: in each, every panel, pop-up and hover help
 * the script can reach is opened and an in-page linter runs over the visible elements:
 *   spill   text spilling out of its box (scrollWidth > clientWidth, text outside its own box or off the screen)
 *   number  an unrounded number in visible text or attributes (\d+\.\d{3,})
 *   token   NaN / undefined / null / Infinity / [object in visible text or in data-help, title, aria-label
 *   empty   a control with no text, aria-label or title; a dangling "Slip in " / "Foo:" with nothing after it
 *   overlap text of two different elements drawn over each other (neither hidden behind a modal)
 * Each finding is listed with scenario, panel, selector, text and a screenshot (the hit outlined) in <out-dir>.
 * Needs the dev server on :5173 (npm run dev). One browser at a time.
 *
 *   node scripts/check/panel-sweep.cjs <out-dir> [scenario-filter, e.g. race-8kt-day]   → findings.json, *.png, a table
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const only = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const VW = 1440, VH = 900;
const URL = process.env.SWEEP_URL || 'http://localhost:5173/?inproc';

// in the page: the linter. Returns findings [{kind, sel, text, detail, rect}] and outlines them when asked.
const lint = (mark) => {
  const vw = innerWidth, vh = innerHeight, hits = [];
  const sel = e => { if (e.id) return '#' + e.id; const p = []; for (let n = e, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) { let s = n.tagName.toLowerCase(); if (n.id) { p.unshift('#' + n.id); break; } const c = String(n.className?.baseVal ?? n.className ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2); if (c.length) s += '.' + c.join('.'); p.unshift(s); } return p.join(' > '); };
  const vis = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || n.hidden) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh; };
  const occluded = e => { const r = e.getBoundingClientRect(), x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2)), t = document.elementFromPoint(x, y); return !!t && !e.contains(t) && !t.contains(e); };
  const own = e => [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const textRects = e => { const rs = []; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 1 && r.height > 1) rs.push(r); } return rs; };
  const add = (kind, e, detail) => { const r = e.getBoundingClientRect(); hits.push({ kind, sel: sel(e), text: (e.innerText || e.getAttribute?.('aria-label') || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 90), detail, rect: [r.left, r.top, r.width, r.height].map(Math.round) }); };
  const all = [...document.body.querySelectorAll('*')].filter(e => !['SCRIPT', 'STYLE', 'TEMPLATE', 'CANVAS', 'path', 'svg', 'g', 'circle', 'rect'].includes(e.tagName) && !e.closest('#__sweep, svg') && vis(e) && !occluded(e));
  const scrollable = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n; } return null; };
  const BAD = /\bNaN\b|\bundefined\b|\bnull\b|Infinity|\[object/;
  const NUM = /\d+\.\d{3,}/;
  const items = []; // (text-bearing elements, for the overlap check)
  for (const e of all) {
    const t = own(e), cs = getComputedStyle(e);
    // attributes that become tooltips or read-outs
    for (const a of ['data-help', 'title', 'aria-label', 'placeholder', 'alt']) { const v = e.getAttribute(a); if (!v) continue; if (BAD.test(v)) add('token', e, `${a}="${v.slice(0, 80)}"`); if (NUM.test(v)) add('number', e, `${a}="${v.slice(0, 80)}"`); if (/(Slip in|[A-Za-z]:)\s*$/.test(v)) add('empty', e, `${a} ends bare: "${v.slice(-40)}"`); }
    if (t) {
      if (BAD.test(t)) add('token', e, t.match(BAD)[0]);
      if (NUM.test(t)) add('number', e, t.match(NUM)[0]);
      if (/(^|\s)(Slip in|Berth|Home berth|Moored at|Leaving from|Heading to|To|From)\s*:?\s*$/.test(t) || /:\s*$/.test(t)) {
        add('empty', e, `label ends bare: "${t.slice(-40)}"`);
      }
      // text outside its own box, or off screen
      const rs = textRects(e), er = e.getBoundingClientRect(), sc = /(auto|scroll)/.test(cs.overflowX), ell = cs.textOverflow === 'ellipsis';
      if (!sc && !ell && cs.display !== 'inline' && er.width > 8) {
        if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') add('spill', e, `scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth} (clipped)`);
        else if (rs.some(r => r.right > er.right + 1.5 || r.left < er.left - 1.5) && cs.whiteSpace !== 'normal' && !scrollable(e)) add('spill', e, `text runs ${Math.round(Math.max(...rs.map(r => r.right - er.right), ...rs.map(r => er.left - r.left)))}px outside its box`);
        if (cs.overflowY !== 'visible' && !/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && !ell && !cs.webkitLineClamp) add('spill', e, `scrollHeight ${e.scrollHeight} > clientHeight ${e.clientHeight} (clipped)`);
      }
      if (rs.some(r => r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1)) { const sw = scrollable(e); if (!sw || sw.getBoundingClientRect().bottom > vh + 1) add('spill', e, 'text off the screen'); }
      // a parent box (button, pill, tile) the text pokes out of
      const p = e.parentElement;
      if (p && p !== document.body && /(hidden|clip)/.test(getComputedStyle(p).overflowX)) { const pr = p.getBoundingClientRect(); if (rs.some(r => r.right > pr.right + 1.5 || r.left < pr.left - 1.5) && !ell) add('spill', p, 'child text clipped by this box'); }
      if (e.innerText?.trim()) for (const r of rs) items.push({ e, r });
    }
    // controls with no name
    if (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || e.getAttribute('role') === 'button') {
      const named = (e.innerText || '').trim() || e.getAttribute('aria-label') || e.title || e.value || e.getAttribute('aria-labelledby') || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label') || e.querySelector('svg title') || (e.tagName === 'INPUT' && /^(range|color|checkbox|radio)$/.test(e.type) && e.parentElement?.innerText?.trim());
      if (!named && !(e.tagName === 'INPUT' && e.type === 'hidden')) add('empty', e, `${e.tagName.toLowerCase()} with no text, aria-label or title`);
    }
    // a label/value pair whose value is blank
    if (!t && e.children.length === 2 && e.children[0].innerText?.trim() && !e.children[1].innerText?.trim() && !e.children[1].querySelector('input,button,select,canvas,svg,img') && vis(e.children[1]) === false && false) add('empty', e, 'blank value');
  }
  // blank value cells: a visible label span followed by an empty sibling cell the same row (grid rows of "label | value")
  for (const e of all) { if (e.children.length >= 2 && /row|line|kv|stat|cell/i.test(String(e.className))) { const k = [...e.children]; k.forEach((c, i) => { if (i > 0 && !c.innerText?.trim() && !c.querySelector('input,button,select,canvas,svg,img,i,progress') && k[i - 1].innerText?.trim() && /^(SPAN|B|DIV|STRONG)$/.test(c.tagName) && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0 && !c.className.toString().match(/spacer|gap|fill|bar|dot|sw|tn-tr/)) add('empty', c, `blank value after "${k[i - 1].innerText.trim().slice(0, 30)}"`); }); } }
  // overlap: text drawn over other text, both really on top there
  const seen = new Set();
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x < 2 || y < 3 || y < 0.45 * Math.min(a.r.height, b.r.height) || x * y < 0.4 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) continue;
    const cx = Math.max(a.r.left, b.r.left) + x / 2, cy = Math.max(a.r.top, b.r.top) + y / 2, top = document.elementFromPoint(cx, cy);
    if (!top || !(a.e.contains(top) || b.e.contains(top))) continue; // (one is hidden behind something else)
    const k = sel(a.e) + '|' + sel(b.e); if (seen.has(k)) continue; seen.add(k);
    add('overlap', a.e, `over ${sel(b.e)} "${(b.e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)}" (${Math.round(x)}x${Math.round(y)}px)`);
  }
  if (mark) {
    const L = document.createElement('div'); L.id = '__sweep'; Object.assign(L.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 2147483647 });
    for (const h of hits) { const b = document.createElement('div'); Object.assign(b.style, { position: 'fixed', left: h.rect[0] + 'px', top: h.rect[1] + 'px', width: h.rect[2] + 'px', height: h.rect[3] + 'px', outline: '2px solid #ff2d55', boxSizing: 'border-box' }); L.appendChild(b); }
    document.body.appendChild(L);
  }
  return hits;
};

const unreached = [], findings = new Map(); // key -> finding with the scenarios it appeared in
let shotN = 0;

async function sweep(p, scenario, panel) {
  let hits = [];
  try { hits = await p.evaluate(lint, false); } catch (e) { unreached.push(`${scenario}/${panel}: linter threw ${e.message.slice(0, 80)}`); return; }
  const fresh = [];
  for (const h of hits) {
    const key = [h.kind, h.sel, h.text.replace(/\d+/g, '#'), h.detail.replace(/\d+/g, '#')].join('|');
    const f = findings.get(key);
    if (f) { if (!f.scenarios.includes(scenario)) f.scenarios.push(scenario); if (!f.panels.includes(panel)) f.panels.push(panel); } else { const nf = { ...h, scenarios: [scenario], panels: [panel], shot: null }; findings.set(key, nf); fresh.push(nf); }
  }
  console.log(`  ${scenario} / ${panel}: ${hits.length} hits, ${fresh.length} new`);
  if (fresh.length) {
    const file = `${out}/${String(++shotN).padStart(3, '0')}-${scenario}-${panel.replace(/[^a-z0-9]+/gi, '_')}.png`;
    try { await p.evaluate(lint, true); await p.screenshot({ path: file }); await p.evaluate(() => document.getElementById('__sweep')?.remove()); for (const f of fresh) f.shot = file; } catch { /* ignore */ }
  }
}

const click = (p, q) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, q);
const shown = (p, q) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; for (let n = e; n; n = n.parentElement) if (n.hidden || getComputedStyle(n).display === 'none') return false; return true; }, q);

// close whatever is open, by each one's own close control (Escape only for the chart: on the surface it opens Pause)
const closeAll = async p => {
  for (let i = 0; i < 5; i++) {
    const left = await p.evaluate(() => {
      const open = q => { const e = document.querySelector(q); if (!e) return false; for (let n = e; n; n = n.parentElement) if (n.hidden || getComputedStyle(n).display === 'none') return false; return true; };
      for (const [q, c] of [['#motorAsk', '#bMotorNo'], ['#homeAsk', '#bHomeNo'], ['#leaveAsk', '#bLeaveNo'], ['#flagIndex', '#bFlagIndexX'], ['#keysView', '#bKeysClose'], ['#condDlg', '#bCondClose'], ['#pause', '#bResume'], ['#courseView', '#bCvClose'], ['#navView', '#bNavClose'], ['#coachPanel', '#bCoachX'], ['#crewPop', '#bCrew'], ['#toolsTray', '#bTools'], ['#trimNotes', '#bCoachX']])
        if (open(q)) { document.querySelector(c)?.click(); return q; }
      if (open('#plan')) { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return '#plan'; }
      if (open('#boatPanel')) { const e = [...document.querySelectorAll('#boatPanel button')].find(b => /^(done|close|back|×)/i.test(b.innerText.trim())); e?.click(); return '#boatPanel'; }
      return '';
    });
    if (!left) return; await p.waitForTimeout(500);
  }
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const mode of ['race', 'cruise']) for (const kt of [8, 25]) for (const tod of ['day', 'night']) {
    const sc = `${mode}-${kt}kt-${tod}`; if (only && !sc.includes(only)) continue;
    console.log(sc);
    const p = await b.newPage({ viewport: { width: VW, height: VH } }); p.on('pageerror', e => errs.push(`${sc}: ${e.message}`));
    // wind speed is settings.windKt (the conditions screen's Wind speed slider); the day is tideDate + the gun's/leaving time tideTime (sunset ~17:00 in November)
    const S = { mode: mode === 'race' ? 'race' : 'sail', seq: 1, windKt: kt, windKind: 'west', tideDate: '2026-11-21', tideTime: tod === 'day' ? '13:00' : '22:00', ...(mode === 'cruise' ? { sailFrom: 'crissy', sailTo: 'pier39' } : {}) };
    await p.addInitScript(s => { if (sessionStorage.getItem('__swept')) return; sessionStorage.setItem('__swept', '1'); const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, s); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); }, S);
    try {
      await p.goto(URL); await p.waitForTimeout(5000);
      await sweep(p, sc, 'home');
      // settings / keys
      if (await click(p, '#bKeys0')) { await p.waitForTimeout(500); await sweep(p, sc, 'keys-settings'); await click(p, '#bKeysClose'); await p.waitForTimeout(300); }
      // the mode's setup: each accordion row opened in turn (the Boat tile with its Yacht Club link is in a row)
      await click(p, `[data-home="${mode}"]`); await p.waitForTimeout(800);
      if (mode === 'race') { await sweep(p, sc, 'race-menu'); await click(p, '[data-home="create"]'); await p.waitForTimeout(3000); } else await p.waitForTimeout(2500);
      await sweep(p, sc, 'setup');
      const rows = await p.evaluate(() => [...document.querySelectorAll('#setup .srow')].filter(r => r.offsetParent).map(r => r.dataset.row || r.id));
      for (const r of rows) {
        await p.evaluate(id => { const e = document.querySelector(`#setup .srow[data-row="${id}"] .srow-head`) || document.querySelector(`#${id} .srow-head`); e?.click(); }, r);
        await p.waitForTimeout(700); await sweep(p, sc, `setup-row:${r}`);
        if (r === 'boat' && await shown(p, '#bBoat')) {
          await click(p, '#bBoat'); await p.waitForTimeout(1500); await sweep(p, sc, 'boat-panel');
          const names = await p.evaluate(() => [...document.querySelectorAll('#boatPanel button, #boatPanel [role=tab], #boatPanel summary')].filter(e => e.offsetParent && !/delete|remove|discard|sell|scrap|done|close|back/i.test(e.innerText + e.title + (e.getAttribute('aria-label') || ''))).map(e => (e.innerText || e.title || e.getAttribute('aria-label') || '').trim().slice(0, 40)));
          const seen = new Set();
          for (const nm of names.slice(0, 40)) {
            if (seen.has(nm)) continue; seen.add(nm);
            const ok = await p.evaluate(t => { const e = [...document.querySelectorAll('#boatPanel button, #boatPanel [role=tab], #boatPanel summary')].find(x => x.offsetParent && (x.innerText || x.title || x.getAttribute('aria-label') || '').trim().slice(0, 40) === t); if (!e) return false; e.click(); return true; }, nm);
            if (ok) { await p.waitForTimeout(500); await sweep(p, sc, `boat-panel:${nm || 'icon'}`); }
            if (!(await shown(p, '#boatPanel'))) break;
          }
          await closeAll(p);
          if (!(await shown(p, '#setup'))) { unreached.push(`${sc}/setup: not back after the boat panel`); }
        }
      }
      for (const [id, name] of [['#bCond', 'conditions'], ['#bPreview', 'course-and-strategist']]) {
        if (!(await shown(p, id))) { unreached.push(`${sc}/${name}: ${id} not shown`); continue; }
        await click(p, id); await p.waitForTimeout(1500); await sweep(p, sc, name); await closeAll(p);
        if (name === 'course-and-strategist' && await shown(p, '#courseView')) await click(p, '#bCvClose'); await p.waitForTimeout(400);
      }
      // go
      await click(p, '#bGo'); await p.waitForTimeout(mode === 'race' ? 9000 : 12000);
      await closeAll(p);
      await sweep(p, sc, mode === 'race' ? 'prestart' : 'underway');
      // the sail band: hover each help-bearing control so the Coach card shows its help
      const seenHelp = new Set();
      for (let i = 0; i < 40; i++) {
        const box = await p.evaluate(n => { const els = [...document.querySelectorAll('[data-help]')].filter(e => e.getBoundingClientRect().width > 0 && e.offsetParent); const e = els[n]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: e.getAttribute('data-help').slice(0, 24) }; }, i);
        if (!box) { if (i === 0) unreached.push(`${sc}/band-hover: no [data-help] controls visible`); break; }
        if (seenHelp.has(box.h)) continue; seenHelp.add(box.h);
        await p.mouse.move(box.x, box.y); await p.waitForTimeout(300); await sweep(p, sc, `band-hover:${box.h.replace(/[^a-z0-9]+/gi, '_')}`);
      }
      await p.mouse.move(700, 300); await p.waitForTimeout(300);
      // Coach card, the band's tabs, the crew pop-up, view, next card, flags, tools
      for (const [q, name] of [['#bCoach', 'coach'], ['.sb-all', 'band-all-lines'], ['.sb-pole', 'band-pole'], ['#tpMore', 'sail-controls-fold'], ['.sb-motor .mo-n', 'band-motor'], ['.sb-hail', 'band-hail'], ['#bCrew', 'crew-pop'], ['#bView', 'view-next'], ['#bCourse', 'course-nav-button'], ['#nextCard', 'next-card'], ['#sigPanel', 'flag-index'], ['#bTools', 'tools-tray'], ['#bBand', 'band-toggle'], ['#bPilot', 'pilot'], ['#bOrient', 'orient'], ['#msgLog .ml-all', 'messages-all']]) {
        await closeAll(p);
        if (!(await shown(p, q))) { unreached.push(`${sc}/${name}: ${q} not shown`); continue; }
        await click(p, q); await p.waitForTimeout(1200); await sweep(p, sc, name);
        if (q === '#bView' || q === '#tpMore' || q === '#bBand' || q === '#bOrient') await click(p, q); // (toggles: put back)
      }
      await closeAll(p);
      // the inset map -> the chart, its Layers; N the navigator (cruise), M the course (race)
      const mr = await p.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await p.mouse.click(mr[0], mr[1]); await p.waitForTimeout(1800);
      if (await shown(p, '#plan')) {
        await sweep(p, sc, 'chart');
        if (await click(p, '#bChartLayers')) { await p.waitForTimeout(500); await sweep(p, sc, 'chart-layers'); await click(p, '#bChartLayers'); }
        await closeAll(p);
      } else unreached.push(`${sc}/chart: clicking the inset did not open #plan`);
      await p.keyboard.press('KeyM'); await p.waitForTimeout(1500);
      if (await shown(p, '#courseView')) { await sweep(p, sc, 'course-view-M'); await closeAll(p); } else if (await shown(p, '#navView')) { await sweep(p, sc, 'navigator-M'); await closeAll(p); } else unreached.push(`${sc}/course-or-navigator: M opened neither`);
      if (mode === 'race') {
        await p.evaluate(() => __host().send({ k: 'speed', v: 20 }));
        for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); if (!/START IN/.test(await p.evaluate(() => document.querySelector('.pod.clock')?.innerText || 'START IN'))) break; }
        await p.waitForTimeout(6000); await p.evaluate(() => __host().send({ k: 'speed', v: 1 }));
        await sweep(p, sc, 'racing');
        if (await shown(p, '#nextCard')) { await click(p, '#nextCard'); await p.waitForTimeout(1200); await sweep(p, sc, 'racing-course'); await closeAll(p); }
      } else await sweep(p, sc, 'underway-later');
      // pause screen, its Keys and Conditions, the leave question
      await click(p, '#bPause'); await p.waitForTimeout(800);
      if (await shown(p, '#pause')) {
        await sweep(p, sc, 'pause');
        if (await click(p, '#bKeys2')) { await p.waitForTimeout(500); await sweep(p, sc, 'keys-from-pause'); await click(p, '#bKeysClose'); await p.waitForTimeout(400); }
        if (await click(p, '#bPauseCond')) { await p.waitForTimeout(700); await sweep(p, sc, 'pause-conditions'); await click(p, '#bCondClose'); await p.waitForTimeout(400); }
        await closeAll(p);
      } else unreached.push(`${sc}/pause: did not open`);
      await click(p, '#bExit'); await p.waitForTimeout(500); if (await shown(p, '#leaveAsk')) { await sweep(p, sc, 'leave-ask'); await closeAll(p); }
      unreached.push(`${sc}/results: needs a finished race (not sailed here)`);
    } catch (e) { unreached.push(`${sc}: aborted: ${e.message.slice(0, 120)}`); }
    await p.close();
  }
  await b.close();
  const list = [...findings.values()];
  fs.writeFileSync(`${out}/findings.json`, JSON.stringify({ findings: list, unreached, errors: errs }, null, 1));
  console.log(`\n${list.length} distinct findings\nkind | where | selector | text | detail | scenarios | shot`);
  for (const f of list) console.log([f.kind, f.panels.slice(0, 3).join(','), f.sel, JSON.stringify(f.text.slice(0, 50)), f.detail, f.scenarios.length + ' sc', f.shot].join(' | '));
  console.log('\nNOT REACHED:\n' + unreached.join('\n')); console.log('PAGE ERRORS:', errs.join('; ') || 'none');
})();
