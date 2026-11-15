// 8za mock: finding the favored end yourself. Stills over the real page (dev server :5199, ?inproc), overlays drawn in the
// page by projecting sim points through the camera (__view.camera; P3: sim x,y,z → three x, z, −y).
const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { window.__mock8za = true; try { localStorage.setItem('fbsim-settings-v2', JSON.stringify({ current: 'slack', windKind: 'west', windKt: 12, drillSolo: true, drillFrom: 120 })); } catch { /* */ } });
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(4000);
  await page.click('[data-home="drill"]', { force: true }); await page.waitForTimeout(800);
  await page.click('#bDrill', { force: true }); await page.waitForTimeout(3000);
  // the panel before a call: no "favored", the question and the two ends instead
  await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = `
      .m8-ask{display:flex;align-items:center;gap:6px;margin-top:6px;font:600 10.5px/1 var(--f-inst);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
      .m8-ask button{padding:4px 9px;border-radius:6px;border:1px solid var(--rule);background:var(--ink);color:var(--text);font:inherit;cursor:pointer}
      .m8-ask button.on{border-color:var(--accent);color:var(--accent)}
      #m8svg{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:25}
      #m8svg text{font:700 15px var(--f-inst);paint-order:stroke;stroke:rgba(9,22,33,.85);stroke-width:4px}
      .m8-call{display:flex;align-items:center;gap:12px;margin:0 0 8px -18px;list-style:none;font-size:15px}
      .m8-call b{color:var(--row)} .m8-dots{margin-left:auto;color:var(--muted);font-size:12px;letter-spacing:2px}`;
    document.head.appendChild(st);
    window.__m8 = { pick: null };
    const fix = () => {
      const lb = document.getElementById('linebox');
      if (lb && !lb.querySelector('.m8-ask')) {
        const pick = window.__m8.pick, w = window.sim(), C = w.C;
        // (the buttons in the sketch's own order: the end drawn on the left first)
        const xs = [...document.querySelectorAll('#ncSketch text')].map(t => ({ t: t.textContent, x: +t.getAttribute('x') || 0 }));
        const xOf = (lab) => (xs.find(o => o.t.replace(/\s*★/, '').trim() && lab.toUpperCase().startsWith(o.t.replace(/\s*★/, '').trim().toUpperCase())) ?? { x: 0 }).x;
        const ends = [['pin', C.pinLabel], ['committee', C.committeeLabel]].sort((a, b) => xOf(a[1]) - xOf(b[1]));
        lb.innerHTML = `<div class="m8-ask">Which end? <button class="${pick === ends[0][0] ? 'on' : ''}">◀ ${ends[0][1]}</button><button class="${pick === ends[1][0] ? 'on' : ''}">${ends[1][1]} ▶</button></div>`;
      }
      if (document.getElementById('drill').hidden) for (const t of document.querySelectorAll('#ncSketch text, #ncSketch rect, #ncSketch circle')) {
        if (t.tagName === 'text' && t.textContent.includes('★')) { t.textContent = t.textContent.replace(/\s*★/g, ''); t.setAttribute('fill', '#94abb7'); }
        if (t.tagName !== 'text' && t.getAttribute('fill') === '#ffb627') t.setAttribute('fill', '#e9f2f5'); // (neither end marked till the gun)
      }
      requestAnimationFrame(fix);
    };
    fix();
  });
  // the read on the water: she's head to wind 40 m below the line's middle; her bow's line (amber) against the line's square
  // (white, dashed), the angle between them, toward the end that's favored
  const info = await page.evaluate(() => {
    const w = window.sim(), u = w.user, C = w.C, N = w.N;
    while (w.t < -70) w.step(1 / 60);
    const mid = { x: (C.pin.x + C.committee.x) / 2, y: (C.pin.y + C.committee.y) / 2 }, from = u.ww.from;
    u.x = mid.x - N.x * 40; u.y = mid.y - N.y * 40; u.h = from; u.vx = 0; u.vy = 0; u.v = 0.2;
    for (let i = 0; i < 30; i++) { u.h = from; w.step(1 / 60); }
    w.paused = true;
    const sq = (Math.atan2(N.x, N.y) * 180 / Math.PI + 360) % 360, off = ((from - sq + 540) % 360) - 180;
    // toward which end: the bow turned from the square toward the pin or the committee boat
    const L = { x: C.committee.x - C.pin.x, y: C.committee.y - C.pin.y }, b = { x: Math.sin(from * Math.PI / 180), y: Math.cos(from * Math.PI / 180) };
    const toward = b.x * L.x + b.y * L.y > 0 ? 'committee' : 'pin';
    return { from: Math.round(from), sq: Math.round(sq), off: Math.round(off), toward, pin: C.pinLabel, rc: C.committeeLabel };
  });
  console.log('read', info);
  await page.keyboard.press('3'); for (let i = 0; i < 6; i++) await page.keyboard.press('-'); await page.waitForTimeout(2500);
  await page.evaluate((info) => {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.id = 'm8svg'; document.body.appendChild(svg);
    const proj = (x, y, z = 0.5) => { const cam = window.__view.camera; cam.updateMatrixWorld(); const V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
      const p = [x, z, -y, 1], v = [0, 1, 2, 3].map(r => V[r] * p[0] + V[4 + r] * p[1] + V[8 + r] * p[2] + V[12 + r] * p[3]), c = [0, 1, 2, 3].map(r => P[r] * v[0] + P[4 + r] * v[1] + P[8 + r] * v[2] + P[12 + r] * v[3]);
      return { x: (c[0] / c[3] + 1) / 2 * innerWidth, y: (1 - c[1] / c[3]) / 2 * innerHeight }; };
    const draw = () => {
      const w = window.sim(), u = w.user, R = 95, d = (h) => ({ x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) });
      const o = proj(u.x, u.y), bow = d(info.from), sq = d(info.sq), A = proj(u.x + bow.x * R, u.y + bow.y * R), S = proj(u.x + sq.x * R, u.y + sq.y * R);
      const arc = []; for (let i = 0; i <= 12; i++) { const h = info.sq + info.off * i / 12, q = d(h), p = proj(u.x + q.x * R * 0.7, u.y + q.y * R * 0.7); arc.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
      const mid = d(info.sq + info.off / 2), M = proj(u.x + mid.x * R * 0.82, u.y + mid.y * R * 0.82);
      svg.innerHTML = `<line x1="${o.x}" y1="${o.y}" x2="${S.x}" y2="${S.y}" stroke="#fff" stroke-width="2.5" stroke-dasharray="9 7"/>`
        + `<line x1="${o.x}" y1="${o.y}" x2="${A.x}" y2="${A.y}" stroke="#ffb627" stroke-width="3.5"/>`
        + `<polyline points="${arc.join(' ')}" fill="none" stroke="#ffb627" stroke-width="2"/>`
        + `<text x="${M.x}" y="${M.y}" fill="#ffb627" text-anchor="middle">${Math.abs(info.off)}°</text>`
        + (() => { const C = w.C, mid = { x: (C.pin.x + C.committee.x) / 2, y: (C.pin.y + C.committee.y) / 2 };
            const inside = (p) => p.x > 70 && p.x < innerWidth - 300 && p.y > 140 && p.y < innerHeight - 280;
            // each end's name where the line leaves the view (an arrow along it), or at the end itself if it's in view
            const tag = (E, name, ring) => { let lo = 0, hi = 1; if (inside(proj(E.x, E.y))) lo = 1; else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; inside(proj(mid.x + (E.x - mid.x) * m, mid.y + (E.y - mid.y) * m)) ? lo = m : hi = m; }
              const p = proj(mid.x + (E.x - mid.x) * lo, mid.y + (E.y - mid.y) * lo), q = proj(mid.x + (E.x - mid.x) * (lo - 0.02), mid.y + (E.y - mid.y) * (lo - 0.02)), a = Math.atan2(p.y - q.y, p.x - q.x) * 180 / Math.PI;
              const mark = lo >= 1 ? (ring ? `<circle cx="${p.x}" cy="${p.y}" r="7" fill="none" stroke="#fff" stroke-width="2.5"/>` : `<rect x="${p.x - 6}" y="${p.y - 6}" width="12" height="12" fill="#fff"/>`)
                : `<path d="M0,-9 L16,0 L0,9 z" fill="#fff" transform="translate(${p.x},${p.y}) rotate(${a})"/>`;
              return mark + `<text x="${p.x + 16}" y="${p.y + 5}" fill="#fff">${name}</text>`; };
            return tag(C.pin, info.pin, true) + tag(C.committee, info.rc, false); })();
      requestAnimationFrame(draw);
    };
    draw();
  }, info);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/8za-1-read.jpg`, quality: 88 });
  // the call: she picks the end in the panel (or a key); the answer stays hidden till the gun
  await page.evaluate((info) => { window.__m8.pick = info.toward; document.querySelector('#linebox .m8-ask')?.remove(); document.getElementById('m8svg').remove(); }, info);
  await page.keyboard.press('2'); await page.waitForTimeout(400);
  await page.evaluate(() => { const w = window.sim(); w.paused = false; for (let i = 0; i < 60 * 25; i++) w.step(1 / 60); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/8za-2-called.jpg`, quality: 88 });
  // the debrief scores the call: right or wrong, by how much, and the picture of why
  await page.evaluate(() => { const w = window.sim(); for (let i = 0; i < 60 * 110 && document.getElementById('drill').hidden; i++) w.step(1 / 60); });
  await page.waitForTimeout(2500);
  await page.evaluate((info) => {
    const end = info.toward === 'pin' ? info.pin : info.rc, bias = Math.abs(info.off), tip = info.toward === 'pin' ? -1 : 1;
    // a tiny picture: the line, the square (dashed), the wind (amber) leaning toward the favored end by the bias
    const a = bias * Math.PI / 180, wx = 22 + tip * Math.sin(a) * 16, wy = 22 - Math.cos(a) * 16;
    const pic = `<svg width="88" height="52" viewBox="0 0 44 26"><line x1="4" y1="22" x2="40" y2="22" stroke="#9fb0bd" stroke-width="1.6"/><circle cx="4" cy="22" r="2.2" fill="none" stroke="#9fb0bd"/><rect x="38" y="19.5" width="4" height="5" fill="#9fb0bd"/><line x1="22" y1="22" x2="22" y2="5" stroke="#fff" stroke-dasharray="2.5 2" stroke-width="1.2"/><line x1="22" y1="22" x2="${wx.toFixed(1)}" y2="${wy.toFixed(1)}" stroke="#ffb627" stroke-width="2"/></svg>`;
    const li = document.createElement('li'); li.className = 'm8-call';
    li.innerHTML = `${pic}<span>Your call: <b>${end} ✓</b> · favored ${bias}°</span><span class="m8-dots" title="The read's drawn on the water for your first three calls">●●○</span>`;
    for (const x of document.querySelectorAll('#dTips li')) if (/Wrong end/.test(x.textContent)) x.remove();
    document.getElementById('dTips').prepend(li);
  }, info);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/8za-3-debrief.jpg`, quality: 88 });
  console.log('errors', errs); await b.close();
})();
