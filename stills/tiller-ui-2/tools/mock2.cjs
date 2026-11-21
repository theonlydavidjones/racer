// tiller UI mock-ups, round 2 (stills only, nothing ships): A2 the arc in plan view at true scale and angle, D the boat as
// the gauge (tape marks on the real after deck). Geometry from the sim's own boat: render/hull.ts tillerAxis/halfBeam/
// cockpitHalf/deckY (TILLER.len 1.2 m, the pin at the rudder head), boat/balance.ts HARD_OVER 46.5 and RUDDER_STALL 40.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2];
const G = JSON.parse(fs.readFileSync('/tmp/claude-0/ti/geom.json', 'utf8'));
const HARD = G.HARD_OVER, STALL = G.RUDDER_STALL;
const SC = [
  { name: '12kt-port', kt: 12, hdg: 319, v: 3.0, e: -3.0, pull: 1, wh: 3, light: false, kick: false },
  { name: '12kt-stbd', kt: 12, hdg: 231, v: 3.0, e: 3.5, pull: -1, wh: 3.5, light: false, kick: false },
  { name: '22kt', kt: 22, hdg: 319, v: 3.3, e: -11, pull: 1, wh: 11, light: false, kick: true }
];
const tone = wh => wh >= 2 && wh <= 5 ? '#3fd0c0' : wh > 8 ? '#ffb627' : '#e9f2f5'; // ui/weatherHelm.ts
const GOLD = '#ffb627';
// the real tiller's end (and its pin) for an end angle e (deg, + toward starboard); the table is by tillerAxis, a = -e
const row = e => { const a = -Math.max(-HARD, Math.min(HARD, e)), i = Math.round((a + HARD) / 0.5); return G.table[Math.max(0, Math.min(G.table.length - 1, i))]; };
const K = 92, Z0 = 2.35, Z1 = 4.2, XM = 1.0; // px per m; the plan from z 2.35 (in the cockpit) to 4.2 (past the transom); x ±1 m
const W = Math.round(2 * XM * K), H = Math.round((Z1 - Z0) * K);
const X = x => (XM + x) * K, Y = z => (z - Z0) * K;
const f = n => n.toFixed(1);
function planSvg(s, panel) {
  const hb = z => { const d = G.deck.find(q => q.z >= z - 1e-6) || G.deck[G.deck.length - 1]; return d.hb; };
  const zs = G.deck.filter(d => d.z >= Z0 && d.z <= 3.82);
  const sheerR = zs.map(d => `${f(X(d.hb))},${f(Y(d.z))}`), sheerL = zs.map(d => `${f(X(-d.hb))},${f(Y(d.z))}`);
  const deckPoly = `${zs.filter(d => d.z >= G.cockpitAftZ).map(d => `${f(X(d.hb))},${f(Y(d.z))}`).join(' ')} ${zs.filter(d => d.z >= G.cockpitAftZ).reverse().map(d => `${f(X(-d.hb))},${f(Y(d.z))}`).join(' ')}`;
  const cp = zs.filter(d => d.ch != null), cockpit = `${cp.map(d => `${f(X(d.ch))},${f(Y(d.z))}`).join(' ')} ${cp.slice().reverse().map(d => `${f(X(-d.ch))},${f(Y(d.z))}`).join(' ')}`;
  const tz = G.transomZ, tr = hb(tz), azc = G.cockpitAftZ;
  const pathPts = (a0, a1) => { const o = []; for (let e = a0; e <= a1 + 1e-9; e += 0.5) { const r = row(e); o.push(`${f(X(r.ex))},${f(Y(r.ez))}`); } return o.join(' '); };
  const r0 = row(s.e), root = [X(r0.rx), Y(r0.rz)], end = [X(r0.ex), Y(r0.ez)];
  const wedgeW = Math.max(3, s.wh * 2.2), e1 = s.e + s.pull * wedgeW;
  const wedge = `<polygon points="${f(root[0])},${f(root[1])} ${pathPts(Math.min(s.e, e1), Math.max(s.e, e1))}" fill="${tone(s.wh)}" opacity="${s.light ? .3 : .5}"/>`;
  const ghosts = s.kick ? [-3, 3].map(d => { const g = row(s.e + d); return `<line x1="${f(X(g.rx))}" y1="${f(Y(g.rz))}" x2="${f(X(g.ex))}" y2="${f(Y(g.ez))}" stroke="#fff" stroke-width="3" opacity=".28" stroke-linecap="round"/>`; }).join('') : '';
  const line = s.light
    ? `<line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#0a141c" stroke-width="2.2" stroke-linecap="round"/>`
    : `<line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#fff" stroke-width="4.6" stroke-linecap="round"/>`;
  const c0 = row(0), stop = [row(-HARD), row(HARD)];
  const bg = panel ? `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="rgba(9,22,33,.86)" stroke="rgba(255,255,255,.14)"/>` : '';
  const halo = panel ? '' : 'paint-order="stroke" stroke="#0a141c" stroke-opacity=".55"';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}
  <polygon points="${deckPoly}" fill="#c9a36a" opacity="${panel ? .22 : .30}"/>
  <polygon points="${cockpit}" fill="#0a141c" opacity="${panel ? .55 : .35}"/>
  <polyline points="${sheerL.join(' ')} ${f(X(-tr))},${f(Y(tz))} ${f(X(tr))},${f(Y(tz))} ${sheerR.slice().reverse().join(' ')}" fill="none" stroke="#e9f2f5" stroke-opacity=".75" stroke-width="2.2" stroke-linejoin="round"/>
  <line x1="${f(X(-cp[cp.length - 1].ch))}" y1="${f(Y(azc))}" x2="${f(X(cp[cp.length - 1].ch))}" y2="${f(Y(azc))}" stroke="#e9f2f5" stroke-opacity=".75" stroke-width="2.6"/>
  <polyline points="${pathPts(-HARD, HARD)}" fill="none" stroke="#e9f2f5" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="3 3"/>
  <polyline points="${pathPts(-HARD, -STALL)}" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="butt"/><polyline points="${pathPts(STALL, HARD)}" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="butt"/>
  <line x1="${f(X(c0.ex))}" y1="${f(Y(c0.ez) - 6)}" x2="${f(X(c0.ex))}" y2="${f(Y(c0.ez) + 6)}" stroke="#fff" stroke-width="2" opacity=".8"/>
  ${stop.map(r => `<circle cx="${f(X(r.ex))}" cy="${f(Y(r.ez))}" r="3" fill="#0a141c" stroke="${GOLD}" stroke-width="1.5"/>`).join('')}
  ${wedge}${ghosts}${line}<circle cx="${f(root[0])}" cy="${f(root[1])}" r="4.2" fill="#e9f2f5" stroke="#0a141c" stroke-width="1.2"/></svg>`;
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const s of SC) {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.setDefaultTimeout(180000);
    await p.addInitScript(kt => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, { mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: kt, current: 'real', weatherHelm: true }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); }, s.kt);
    await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2500);
    await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
    await p.evaluate(([hdg, v]) => { const w = sim(), u = w.user; w.paused = false; u.heading = hdg; u.v = v; for (let i = 0; i < 60 * 6; i++) w.step(1 / 60); }, [s.hdg, s.v]);
    // the tiller held at the weather-helm angle (the real tiller in the scene follows): the cursor where that angle is
    const mx = Math.round(1400 * (0.5 + (s.e / 30) / (46.5 / 30) * 0.5 * 0.5)); // app.ts: 50% + tiller/HELM_MAX × TILLER_SPAN
    await p.mouse.move(mx, 580); await p.keyboard.press('t'); await p.mouse.move(mx + 1, 580); await p.waitForTimeout(6000);
    const base = `${out}/${s.name}`;
    await p.screenshot({ path: `${base}-today.png` });
    await p.addStyleTag({ content: '#tillerGuide{display:none!important}.sb-tillerslot{visibility:hidden!important}' });
    const slot = await p.evaluate(() => { const q = document.querySelector('.sb-tillerslot').getBoundingClientRect(); return [q.left + q.width / 2, q.bottom]; });
    const put = (id, html, x, y, tx = '-50%') => p.evaluate(([id, html, x, y, tx]) => { document.getElementById(id)?.remove(); const d = document.createElement('div'); d.id = id; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:60;pointer-events:none;transform:translateX(${tx})`; d.innerHTML = html; document.body.appendChild(d); }, [id, html, x, y, tx]);
    await put('mockA2', planSvg(s, true), slot[0], slot[1] - H + 2); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-A2-panel.png` });
    await put('mockA2', planSvg(s, false), slot[0], slot[1] - H + 2); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-A2-bare.png` });
    await p.evaluate(() => document.getElementById('mockA2')?.remove());
    // D: tape on the real after deck, picked out where the tiller's end comes to rest at the centre and at the stall
    const tapes = await p.evaluate(([G, STALL]) => {
      const v = __view, grp = v.userMesh.grp, cam = v.camera, P = grp.position.constructor;
      const rowAt = e => { const a = -e, i = Math.round((a + 46.5) / 0.5); return G.table[Math.max(0, Math.min(G.table.length - 1, i))]; };
      const scr = (x, y, z) => { const q = grp.localToWorld(new P(x, y, z)).project(cam); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; };
      const out = [];
      for (const [e, kind] of [[0, 'centre'], [STALL, 'stall'], [-STALL, 'stall']]) {
        const r = rowAt(e), dx = r.ex - r.rx, dz = r.ez - r.rz, n = Math.hypot(dx, dz), ux = dx / n, uz = dz / n, px = -uz, pz = ux; // along the tiller, across it
        const hl = 0.17, hw = 0.022, y = r.dy + 0.004, c = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, bb]) => scr(r.ex + ux * a + px * bb, y, r.ez + uz * a + pz * bb));
        out.push({ kind, pts: c });
      }
      return out;
    }, [G, STALL]);
    const svg = `<svg width="1400" height="860" style="position:fixed;left:0;top:0">${tapes.map(t => `<polygon points="${t.pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${t.kind === 'stall' ? GOLD : '#fff'}" stroke="#0a141c" stroke-width="1" stroke-opacity=".6"/>`).join('')}</svg>`;
    await p.evaluate(h => { document.getElementById('mockD')?.remove(); const d = document.createElement('div'); d.id = 'mockD'; d.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none'; d.innerHTML = h; document.body.appendChild(d); }, svg);
    await p.waitForTimeout(500); await p.screenshot({ path: `${base}-D.png` });
    await p.addStyleTag({ content: '.sailband{visibility:hidden!important}' }); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-D-bandaway.png` });
    console.log(s.name, 'tapes', JSON.stringify(tapes.map(t => t.pts[0].map(Math.round))));
    await p.close();
  }
  await b.close();
})();
