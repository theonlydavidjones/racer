// Learn to sail, the training mode: stills drawn over the real page (dev server, ?inproc), lesson 4 in detail.
const { chromium } = require('playwright');
const out = process.argv[2], url = process.argv[3] || 'http://localhost:5197/?inproc';
const TEAL = '#2fd4c4', AMBER = '#ffb35c', GREEN = '#3fd197';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(180000);
  await page.goto(url); await page.waitForTimeout(4000);
  await page.click('[data-home="drill"]'); await page.waitForTimeout(800); await page.click('#bLessons'); await page.waitForTimeout(1000);
  await page.click('[data-lesson="points"]'); await page.waitForTimeout(3000);
  await page.keyboard.press('y'); await page.waitForTimeout(400);
  const sail = (sec, rel) => page.evaluate(([n, rel]) => { const w = window.sim(), from = w.windModel.base; for (let i = 0; i < n; i++) { if (rel != null && w.pilot) w.pilot.course = (from + rel + 360) % 360; w.step(1 / 60); } return { twa: w.user.twa, arel: w.user.arel, tws: w.user.ww.kt, bsp: w.user.v, step: w.lesson.step }; }, [Math.round(sec * 60), rel]);
  // overlays: everything drawn in one layer, cleared per still
  const draw = async (o) => { if (o.line != null) { await page.evaluate(([c, p]) => { const L = window.sim().lesson; L.cue = c; L.progress = p; }, [o.line, o.done ? 1 : (o.p ?? 0)]); await page.waitForTimeout(900); } return page.evaluate(([o, C]) => {
    document.getElementById('mk')?.remove(); document.querySelectorAll('.mkw').forEach(e => e.remove());
    if (!document.getElementById('mkcss')) { const st = document.createElement('style'); st.id = 'mkcss'; st.textContent = '#coachTip::after{transition:none!important} body.mkdone #coachTip{color:#3fd197!important} body.mkdone #coachTip::after{background:#3fd197!important;width:100%!important}'; document.head.appendChild(st); }
    document.body.classList.toggle('mkdone', !!o.done);
    { let st = document.getElementById('mkp'); if (!st) { st = document.createElement('style'); st.id = 'mkp'; document.head.appendChild(st); } st.textContent = o.done || o.line == null ? '' : `body.inLesson #coachTip::after{width:${(o.p ?? 0) * 100}%!important}`; }
    const L = document.createElement('div'); L.id = 'mk'; L.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50'; document.body.appendChild(L);
    const tip = document.getElementById('coachTip');
    if (o.line != null) { tip.className = 'on ' + (o.done ? 'done' : 'fix'); tip.style.setProperty('--p', String(o.p ?? 0)); }
    // the steps, five dots at the line's right end (1 of 5 … done ones green)
    if (o.dots) { const r = tip.getBoundingClientRect(), d = document.createElement('div'); d.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 37}px;top:${r.bottom + 7}px;display:flex;gap:6px`;
      for (let i = 0; i < 5; i++) { const s = document.createElement('span'); s.style.cssText = `width:10px;height:10px;border-radius:50%;border:2px solid ${i < o.dots.done ? C.GREEN : i === o.dots.done ? C.AMBER : 'rgba(150,196,218,.5)'};background:${i < o.dots.done ? C.GREEN : 'transparent'}`; d.appendChild(s); } L.appendChild(d); }
    // the windex: the target band (teal) on its rim, ◆ at its middle, the point word green/amber, a way-to arc when stuck
    const svg = document.querySelector('.sb-wx svg');
    if (svg && o.inBand != null) { const pos = svg.querySelector('.sb-pos'); if (pos) pos.style.fill = o.inBand ? C.GREEN : C.AMBER; }
    if (o.band && svg) {
      const P = (deg, r) => [70 + Math.sin(deg * Math.PI / 180) * r, 70 - Math.cos(deg * Math.PI / 180) * r];
      const arc = (a, b, r) => { const [x1, y1] = P(a, r), [x2, y2] = P(b, r); return `M${x1} ${y1} A${r} ${r} 0 0 ${b > a ? 1 : 0} ${x2} ${y2}`; };
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'mkw');
      const [lo, hi] = o.band, mid = (lo + hi) / 2, [dx, dy] = P(mid, 62);
      g.innerHTML = `<path d="${arc(lo, hi, 62)}" stroke="${C.TEAL}" stroke-width="13" fill="none" opacity=".95"/>` +
        `<rect x="${dx - 5}" y="${dy - 5}" width="10" height="10" fill="${C.TEAL}" stroke="#08141e" stroke-width="1.5" transform="rotate(45 ${dx} ${dy})"/>` +
        (o.way != null ? `<path d="${arc(o.way, mid, 50)}" stroke="${C.TEAL}" stroke-width="2.5" fill="none" stroke-dasharray="4 4" opacity=".9"/>` : '') +
        (o.ring != null ? `<circle cx="70" cy="70" r="68" fill="none" stroke="${C.AMBER}" stroke-width="4" stroke-dasharray="${(o.ring * 427).toFixed(0)} 427" transform="rotate(-90 70 70)"/>` : '');
      svg.appendChild(g);
      const pos = svg.querySelector('.sb-pos'); if (pos) pos.style.fill = o.inBand ? C.GREEN : C.AMBER;
    }
    // the heading tape: the headings that put her in the target band (true wind), teal, a ◆ at the middle; when stuck,
    // a dashed teal way from her heading to it
    if (o.tape) { const w = window.sim(), u = w.user, from = u.ww.from, sg = u.tack === 'S' ? 1 : -1, cv = document.getElementById('compassTape'), r = cv.getBoundingClientRect();
      const pxd = (r.width - 12) / 100, wrap = a => ((a + 540) % 360) - 180, X = h => r.left + r.width / 2 + wrap(h - u.h) * pxd;
      const a = X(from - sg * o.tape[0]), b = X(from - sg * o.tape[1]), x0 = Math.max(r.left, Math.min(a, b)), x1 = Math.min(r.right, Math.max(a, b));
      const d = document.createElement('div'); d.style.cssText = `position:fixed;left:${x0}px;top:${r.top - 2}px;width:${Math.max(3, x1 - x0)}px;height:${r.height + 4}px;background:rgba(47,212,196,.35);border-top:4px solid ${C.TEAL};border-radius:3px`; L.appendChild(d);
      const m = (a + b) / 2; if (m > r.left && m < r.right) { const k = document.createElement('div'); k.style.cssText = `position:fixed;left:${m - 6}px;top:${r.top - 9}px;width:12px;height:12px;background:${C.TEAL};transform:rotate(45deg);border:1.5px solid #08141e`; L.appendChild(k); }
      else { const k = document.createElement('div'); k.textContent = m <= r.left ? '◀◆' : '◆▶'; k.style.cssText = `position:fixed;left:${m <= r.left ? r.left + 2 : r.right - 30}px;top:${r.top - 2}px;font:700 14px sans-serif;color:${C.TEAL}`; L.appendChild(k); }
      if (o.way) { const cx = r.left + r.width / 2, e = document.createElement('div'), lo = Math.min(cx, Math.max(r.left, Math.min(m, r.right))), hi = Math.max(cx, Math.max(r.left, Math.min(m, r.right)));
        e.style.cssText = `position:fixed;left:${lo}px;top:${r.top + r.height / 2}px;width:${hi - lo}px;border-top:3px dashed ${C.TEAL}`; L.appendChild(e); } }
    // a ring round something to use (the help when stuck)
    if (o.ringSel) { const e = document.querySelector(o.ringSel); if (e) { const r = e.getBoundingClientRect(), d = document.createElement('div'); d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid ${C.AMBER};border-radius:${o.ringRound ? '50%' : '10px'};box-shadow:0 0 0 6px rgba(255,179,92,.25)`; L.appendChild(d); } }
    // a small label by the ring (a few words at most)
    if (o.tag) { const d = document.createElement('div'); d.textContent = o.tag.t; d.style.cssText = `position:fixed;left:${o.tag.x}px;top:${o.tag.y}px;font:700 13px/1.2 "Saira Semi Condensed",sans-serif;color:${o.tag.c || C.AMBER};background:rgba(8,20,30,.85);padding:4px 8px;border-radius:6px`; L.appendChild(d); }
    // the start card: what the lesson teaches, one line and a picture
    if (o.card) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(4,12,18,.55);pointer-events:none';
      d.innerHTML = `<div style="width:520px;background:var(--pod-solid,#0e2130);border:1px solid rgba(150,196,218,.35);border-radius:14px;padding:22px 26px;font-family:var(--f-body,sans-serif);color:#e9f2f5">
        <div style="font:700 11px/1 var(--f-inst,sans-serif);letter-spacing:.12em;color:#94abb7">LESSON 4 OF 12 · LEARN TO SAIL</div>
        <div style="font:700 26px/1.2 var(--f-body,sans-serif);margin:6px 0 4px">Points of sail</div>
        <div style="font:500 15px/1.35 var(--f-body,sans-serif);color:#cfe0e8">Sail each angle to the wind, close-hauled to a run.</div>
        ${o.card}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><span style="font:600 12px var(--f-inst,sans-serif);color:#94abb7">About 5 min · Speed ½× while you learn</span>
        <span style="font:700 14px var(--f-body,sans-serif);background:${C.AMBER};color:#1a1205;padding:8px 20px;border-radius:8px">Go ▸</span></div></div>`; L.appendChild(d); }
  }, [o, { TEAL, AMBER, GREEN }]); };
  // a picture of the five points round the wind, the first lit
  const pic = (() => {
    const cx = 130, cy = 120, P = (deg, r) => [cx + Math.sin(deg * Math.PI / 180) * r, cy - Math.cos(deg * Math.PI / 180) * r];
    const pts = [[45, 'Close-hauled'], [65, 'Close reach'], [90, 'Beam reach'], [135, 'Broad reach'], [178, 'Run']];
    let s = `<svg viewBox="0 0 400 250" width="460" style="display:block;margin:10px auto 0"><path d="M${cx} ${cy} L${P(-42, 70).join(' ')} A70 70 0 0 1 ${P(42, 70).join(' ')} Z" fill="#c8463a" opacity=".35"/>` +
      `<text x="${cx}" y="16" text-anchor="middle" fill="#94abb7" font-size="12" font-weight="700">WIND ▼</text><text x="${cx}" y="${cy - 30}" text-anchor="middle" fill="#e9a29a" font-size="10">no-go</text>`;
    pts.forEach(([d, t], i) => { const [x, y] = P(d, 88), lit = i === 0, [lx, ly] = d > 170 ? [x, y + 30] : [x + 22, y + 4];
      s += `<g transform="translate(${x} ${y}) rotate(${d})"><path d="M0 -12 C4 -4 4 4 3 11 L-3 11 C-4 4 -4 -4 0 -12Z" fill="${lit ? TEAL : '#e9f2f5'}" opacity="${lit ? 1 : .8}"/></g>` +
        `<text x="${lx}" y="${ly}" text-anchor="${d > 170 ? 'middle' : 'start'}" fill="${lit ? TEAL : '#cfe0e8'}" font-size="13" font-weight="${lit ? 700 : 500}">${i + 1} ${t}</text>`; });
    return s + `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#e9f2f5"/></svg>`;
  })();
  const awaOf = (twa, tws, bsp) => Math.atan2(tws * Math.sin(twa * Math.PI / 180), tws * Math.cos(twa * Math.PI / 180) + bsp / 0.5144) * 180 / Math.PI;
  const bandFor = (s, lo, hi) => { const sg = s.arel >= 0 ? 1 : -1; return [sg * awaOf(lo, s.tws, s.bsp), sg * awaOf(hi, s.tws, s.bsp)].sort((a, b) => a - b); };
  // 1. the start
  let s = await sail(8, 95);
  await draw({ card: pic }); await page.screenshot({ path: out + '/1-start.jpg', quality: 85 });
  // 2. what to do: beam reach now, the close-hauled band teal on the windex
  s = await sail(14, 82);
  let b = bandFor(s, 38, 49);
  await draw({ line: 'Head up to close-hauled', p: 0, dots: { done: 0 }, tape: [38, 49], band: null, inBand: false }); await page.screenshot({ path: out + '/2-do.jpg', quality: 85 });
  // 3. in the band, holding: the fill along the line's foot, a ring round the windex filling with it
  s = await sail(25, 44);
  b = bandFor(s, 38, 49);
  await draw({ line: 'Close-hauled: hold it, jib luff telltales streaming', p: .6, dots: { done: 0 }, tape: [38, 49], band: null, inBand: true }); await page.screenshot({ path: out + '/3-hold.jpg', quality: 85 });
  // 4. stuck (20 s and no nearer): the way to the band dashed on the windex, the tiller pilot's head ringed
  s = await sail(14, 82);
  b = bandFor(s, 38, 49);
  const vane = (s.arel >= 0 ? 1 : -1) * Math.abs(awaOf(s.twa, s.tws, s.bsp));
  await draw({ line: 'Head up to close-hauled', p: 0, dots: { done: 0 }, tape: [38, 49], band: null, inBand: false, way: true, ringSel: '#pilot', tag: { t: (await page.evaluate(() => window.sim().user.tack)) === 'P' ? '−10: up toward the wind' : '+10: up toward the wind', x: 250, y: 815 } });
  await page.screenshot({ path: out + '/4-stuck.jpg', quality: 85 });
  // 5. passed: green ✓, the dot filled, a moment, then the next band
  s = await sail(25, 44);
  b = bandFor(s, 38, 49);
  await draw({ line: 'Close-hauled ✓', p: 1, done: true, dots: { done: 1 }, tape: [56, 75], band: null, inBand: true }); await page.screenshot({ path: out + '/5-pass.jpg', quality: 85 });
  await browser.close();
})();
