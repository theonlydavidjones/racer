// r297 mock: the bottom-left Coach card, options. Stills over the real page (dev server :5199, ?inproc), 1920×1080;
// the mock cards are drawn in the page in place of #trimPanel's head (the sail controls band below is untouched).
const { chromium } = require('playwright');
const out = process.argv[2];
const SITU = { msg: "Keep clear of Green. You're on port, they're on starboard.", rule: 'Rule 10' };
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const open = async (mode) => {
    const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(180000); page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('m')) { sessionStorage.setItem('m', '1'); localStorage.setItem('fbsim-settings-v2', JSON.stringify({ current: 'slack', windKind: 'west', windKt: 12, drillSolo: false, drillFrom: 180 })); } } catch { /* */ } });
    await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(4000);
    if (mode === 'race') { await page.click('[data-home="drill"]', { force: true }); await page.waitForTimeout(800); await page.click('#bDrill', { force: true }); }
    else { await page.click('[data-home="cruise"]', { force: true }); await page.waitForTimeout(1200); await page.click('#bGo', { force: true }); }
    await page.waitForTimeout(4000);
    await page.evaluate(() => { const w = window.sim(); for (let i = 0; i < 60 * 40; i++) w.step(1 / 60); });
    await page.waitForTimeout(1500);
    return page;
  };
  const css = `
    .mk{position:fixed;left:16px;width:260px;box-sizing:border-box;background:var(--pod);border:1px solid var(--rule);border-radius:8px;padding:9px 12px 10px;color:var(--text);z-index:40;cursor:pointer}
    .mk-head{display:flex;justify-content:space-between;align-items:center;font:600 10px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
    .mk-head .chev{font-size:13px;letter-spacing:0;color:var(--muted)}
    .mk-row{display:flex;align-items:center;gap:9px;font:600 13px/1.3 var(--f-body);padding:4px 0}
    .mk-row + .mk-row{border-top:1px solid var(--rule)}
    .mk-ico{flex:0 0 auto;min-width:34px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font:700 10px/1 var(--f-inst);letter-spacing:.06em}
    .mk-ico.rule{background:#ff5d4c;color:#14202c} .mk-ico.trim{background:rgba(255,182,39,.16);color:var(--accent);border:1px solid rgba(255,182,39,.5)}
    .mk-ico.tac{background:rgba(58,209,193,.14);color:#3ad1c1;border:1px solid rgba(58,209,193,.5)}
    .mk-sec{font:600 9.5px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:9px 0 5px}
    .mk-pills{display:flex;gap:6px;flex-wrap:wrap}
    .mk-pill{font:600 12px/1 var(--f-body);padding:5px 8px;border-radius:12px;background:var(--ink);border:1px solid var(--rule)}
    .mk-pill b{color:var(--row)} .mk-pill b.warn{color:var(--accent)}
    .mk-line{display:grid;grid-template-columns:72px 1fr;gap:8px;font:500 12.5px/1.3 var(--f-body);padding:3px 0}
    .mk-line span:first-child{color:var(--muted);font-weight:600}
    .mk-situ{position:fixed;left:16px;width:260px;box-sizing:border-box;background:rgba(80,14,10,.88);border:1px solid #ff5d4c;border-radius:8px;padding:8px 12px;display:flex;gap:10px;align-items:center;z-index:40}
    .mk-situ .m{flex:1;font:700 13.5px/1.25 var(--f-body)} .mk-situ .r{font:700 11px/1 var(--f-inst);letter-spacing:.08em;text-transform:uppercase;color:#ffb3aa}
    .mk-tag{position:fixed;right:16px;bottom:16px;z-index:60;font:700 13px/1 var(--f-inst);letter-spacing:.08em;background:#ffb627;color:#14202c;padding:6px 10px;border-radius:6px}`;
  // the mock card(s), bottom-aligned where the Coach card's head is; the real panel's head, hint and button hidden
  const mock = (page, html, tag) => page.evaluate(([html, css, tag]) => {
    if (!document.getElementById('mkcss')) { const s = document.createElement('style'); s.id = 'mkcss'; s.textContent = css; document.head.appendChild(s); }
    document.querySelectorAll('.mk,.mk-situ,.mk-tag').forEach(e => e.remove());
    const tp = document.getElementById('trimPanel'), r = tp.getBoundingClientRect();
    const hide = document.createElement('style'); hide.className = 'mk'; hide.textContent = '#trimPanel{visibility:hidden} #leftCol #situ{display:none!important} #coachTip{display:none!important}';
    document.head.appendChild(hide);
    const wrap = document.createElement('div'); wrap.innerHTML = html; const els = [...wrap.children];
    let bottom = innerHeight - r.bottom; // (the stack grows up from the panel's foot)
    for (const e of els.reverse()) { e.style.bottom = bottom + 'px'; document.body.appendChild(e); bottom += e.getBoundingClientRect().height + 8; }
    const t = document.createElement('div'); t.className = 'mk-tag'; t.textContent = tag; document.body.appendChild(t);
  }, [html, css, tag]);
  const trimLine = (page) => page.evaluate(() => (document.getElementById('tpHint')?.textContent || 'Trim’s set. Ease to slow, trim to go').replace(/^Pre-start:\s*/, '').split(/[.;]\s/)[0]);

  // —— race
  let page = await open('race');
  await page.evaluate((S) => { const f = () => { const s = document.getElementById('situ'); if (s) { s.hidden = false; document.getElementById('situMsg').textContent = S.msg; document.getElementById('situRule').textContent = S.rule; } requestAnimationFrame(f); }; f(); }, SITU);
  await page.evaluate(() => window.__look(150, 8)); await page.waitForTimeout(1500);
  await page.evaluate(() => { const t = document.createElement('div'); t.className = 'mk-tag'; t.textContent = 'TODAY'; t.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;font:700 13px/1 sans-serif;background:#ffb627;color:#14202c;padding:6px 10px;border-radius:6px'; document.body.appendChild(t); });
  await page.screenshot({ path: `${out}/0-today-race.jpg`, quality: 88 });
  const tl = '3.1 kt: ease to slow, trim to go';
  // A: one Coach card, the situation merged in as its racing line; two lines by priority
  await mock(page, `<div class="mk"><div class="mk-head"><span>Strategist</span><span class="chev">▸</span></div>
    <div class="mk-row"><span class="mk-ico rule">R10</span><span>Port: keep clear of USA 110</span></div>
    <div class="mk-row"><span class="mk-ico trim">TRIM</span><span>${tl}</span></div></div>`, 'A · ONE CARD, TWO LINES');
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/A-race.jpg`, quality: 88 });
  // A, no rules situation: the racing line is the next most pertinent (the start, here)
  await mock(page, `<div class="mk"><div class="mk-head"><span>Strategist</span><span class="chev">▸</span></div>
    <div class="mk-row"><span class="mk-ico tac">START</span><span>Burn 20 s, then go for the line</span></div>
    <div class="mk-row"><span class="mk-ico trim">TRIM</span><span>${tl}</span></div></div>`, 'A · NO RULES SITUATION');
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/A-race-quiet.jpg`, quality: 88 });
  // B: the situation stays its own red card above (an alert, only while there is one); Coach below, its racing line tactics
  await mock(page, `<div class="mk-situ"><span class="m">Port: keep clear of USA 110</span><span class="r">Rule 10</span></div>
    <div class="mk"><div class="mk-head"><span>Strategist</span><span class="chev">▸</span></div>
    <div class="mk-row"><span class="mk-ico tac">START</span><span>Burn 20 s, then go for the line</span></div>
    <div class="mk-row"><span class="mk-ico trim">TRIM</span><span>${tl}</span></div></div>`, 'B · ALERT ABOVE, COACH BELOW');
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/B-race.jpg`, quality: 88 });
  // the expanded view (either option): the card grows up in place; racing on top, then the sails, the crew, the lines
  await mock(page, `<div class="mk"><div class="mk-head"><span>Strategist</span><span class="chev">▾</span></div>
    <div class="mk-sec">Racing</div>
    <div class="mk-row"><span class="mk-ico rule">R10</span><span>Port: keep clear of USA 110</span></div>
    <div class="mk-row"><span class="mk-ico tac">START</span><span>Burn 20 s, then go for the line</span></div>
    <div class="mk-sec">Sails</div>
    <div class="mk-pills"><span class="mk-pill">Main <b>good</b></span><span class="mk-pill">Jib <b class="warn">luffing</b></span><span class="mk-pill">Heel <b>11°</b></span><span class="mk-pill">Helm <b>neutral</b></span><span class="mk-pill">Crew <b>amidships</b></span></div>
    <div class="mk-sec">Lines</div>
    <div class="mk-line"><span>Jib sheet</span><span>Ease to slow, trim to go</span></div>
    <div class="mk-line"><span>Mainsheet</span><span>Eased: leech telltales flying</span></div>
    <div class="mk-line"><span>Backstay</span><span>Off: power for the light air</span></div>
    <div class="mk-line"><span>Outhaul</span><span>Eased: full foot</span></div></div>`, 'EXPANDED (CLICK THE CARD)');
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/X-expanded.jpg`, quality: 88 });
  await page.close();

  // —— cruise
  page = await open('cruise');
  await page.evaluate(() => { const t = document.createElement('div'); t.textContent = 'TODAY'; t.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;font:700 13px/1 sans-serif;background:#ffb627;color:#14202c;padding:6px 10px;border-radius:6px'; document.body.appendChild(t); });
  await page.screenshot({ path: `${out}/0-today-cruise.jpg`, quality: 88 });
  const tc = 'Trim\u2019s right: 5.1 kt, target 4.8';
  await mock(page, `<div class="mk"><div class="mk-head"><span>Trim coach</span><span class="chev">▸</span></div>
    <div class="mk-row"><span class="mk-ico trim">TRIM</span><span>${tc}</span></div>
    <div class="mk-row"><span class="mk-ico trim">TRIM</span><span>Vang on a little in the puffs</span></div></div>`, 'CRUISE · TRIM COACH');
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/C-cruise.jpg`, quality: 88 });
  console.log('trim lines:', tl, '|', tc, '\nerrors', errs);
  await b.close();
})();
