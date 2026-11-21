// tiller UI mock-ups, round 3 (stills only): A3 the true-scale plan built into the sail band, D2 the real boat as the
// gauge with the chase camera tipped down a little. Same real geometry as round 2 (render/hull.ts tillerAxis, halfBeam,
// cockpitHalf, deckY; boat/balance.ts HARD_OVER 46.5, RUDDER_STALL 40).
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2];
const G = JSON.parse(fs.readFileSync('/tmp/claude-0/ti/geom.json', 'utf8'));
const HARD = G.HARD_OVER, STALL = G.RUDDER_STALL, PITCH = -0.25;
const SC = [
  { name: '12kt-port', kt: 12, hdg: 319, v: 3.0, e: -3.0, pull: 1, wh: 3, light: false, kick: false },
  { name: '12kt-stbd', kt: 12, hdg: 231, v: 3.0, e: 3.5, pull: -1, wh: 3.5, light: false, kick: false },
  { name: '22kt', kt: 22, hdg: 319, v: 3.3, e: -11, pull: 1, wh: 11, light: false, kick: true }
];
const tone = wh => wh >= 2 && wh <= 5 ? '#3fd0c0' : wh > 8 ? '#ffb627' : '#e9f2f5';
const GOLD = '#ffb627';
const row = e => { const a = -Math.max(-HARD, Math.min(HARD, e)), i = Math.round((a + HARD) / 0.5); return G.table[Math.max(0, Math.min(G.table.length - 1, i))]; };
const K = 38, Z0 = 2.68, Z1 = 4.12, XM = 0.74; // px per m: the tiller's 1.2 m is 46 px
const W = Math.round(2 * XM * K), H = Math.round((Z1 - Z0) * K);
const X = x => (XM + x) * K, Y = z => (z - Z0) * K, f = n => n.toFixed(1);
function planSvg(s) {
  const zs = G.deck.filter(d => d.z >= 2.8 && d.z <= 3.82);
  const side = sg => zs.map(d => `${f(X(sg * d.hb))},${f(Y(d.z))}`).join(' ');
  const tr = zs[zs.length - 1].hb;
  const path = (a0, a1) => { const o = []; for (let e = a0; e <= a1 + 1e-9; e += 1) { const r = row(e); o.push(`${f(X(r.ex))},${f(Y(r.ez))}`); } return o.join(' '); };
  const r0 = row(s.e), root = [X(r0.rx), Y(r0.rz)], end = [X(r0.ex), Y(r0.ez)];
  const e1 = s.e + s.pull * Math.max(3, s.wh * 2.2);
  const wedge = `<polygon points="${f(root[0])},${f(root[1])} ${path(Math.min(s.e, e1), Math.max(s.e, e1))}" fill="${tone(s.wh)}" opacity="${s.light ? .35 : .6}"/>`;
  const ghosts = s.kick ? [-3, 3].map(d => { const g = row(s.e + d); return `<line x1="${f(X(g.rx))}" y1="${f(Y(g.rz))}" x2="${f(X(g.ex))}" y2="${f(Y(g.ez))}" stroke="#fff" stroke-width="2" opacity=".3" stroke-linecap="round"/>`; }).join('') : '';
  const line = s.light
    ? `<line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#0a141c" stroke-width="1.3" stroke-linecap="round"/>`
    : `<line x1="${f(root[0])}" y1="${f(root[1])}" x2="${f(end[0])}" y2="${f(end[1])}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
  const stop = [row(-HARD), row(HARD)], c0 = row(0);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <polyline points="${side(-1)}" fill="none" stroke="#e9f2f5" stroke-opacity=".4" stroke-width="1.2"/><polyline points="${side(1)}" fill="none" stroke="#e9f2f5" stroke-opacity=".4" stroke-width="1.2"/>
  <line x1="${f(X(-tr))}" y1="${f(Y(3.82))}" x2="${f(X(tr))}" y2="${f(Y(3.82))}" stroke="#e9f2f5" stroke-opacity=".5" stroke-width="1.4"/>
  <line x1="${f(X(-.55))}" y1="${f(Y(G.cockpitAftZ))}" x2="${f(X(.55))}" y2="${f(Y(G.cockpitAftZ))}" stroke="#e9f2f5" stroke-opacity=".55" stroke-width="1.6"/>
  <polyline points="${path(-HARD, HARD)}" fill="none" stroke="#e9f2f5" stroke-opacity=".3" stroke-width="1" stroke-dasharray="2 2"/>
  <polyline points="${path(-HARD, -STALL)}" fill="none" stroke="${GOLD}" stroke-width="4"/><polyline points="${path(STALL, HARD)}" fill="none" stroke="${GOLD}" stroke-width="4"/>
  ${stop.map(r => `<circle cx="${f(X(r.ex))}" cy="${f(Y(r.ez))}" r="1.8" fill="#0a141c" stroke="${GOLD}" stroke-width="1"/>`).join('')}
  <line x1="${f(X(c0.ex))}" y1="${f(Y(c0.ez) - 3)}" x2="${f(X(c0.ex))}" y2="${f(Y(c0.ez) + 3)}" stroke="#fff" stroke-width="1.2" opacity=".7"/>
  ${wedge}${ghosts}${line}<circle cx="${f(root[0])}" cy="${f(root[1])}" r="2.8" fill="#e9f2f5" stroke="#0a141c" stroke-width="1"/>
  <text x="2" y="${H - 3}" font-family="Saira Semi Condensed, sans-serif" font-weight="700" font-size="11" fill="${tone(s.wh)}">${Math.round(s.wh)}°</text></svg>`;
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
    const mx = Math.round(1400 * (0.5 + (s.e / 30) / (46.5 / 30) * 0.5 * 0.5));
    await p.mouse.move(mx, 580); await p.keyboard.press('t'); await p.mouse.move(mx + 1, 580); await p.waitForTimeout(6000);
    const base = `${out}/${s.name}`;
    await p.screenshot({ path: `${base}-today.png` });
    await p.addStyleTag({ content: '#tillerGuide{display:none!important}.sb-tillerslot{visibility:hidden!important}' });
    const band = await p.evaluate(() => { const e = document.querySelector('.sailband'), q = e.getBoundingClientRect(), cs = getComputedStyle(e); return { left: q.left, top: q.top, w: q.width, bg: cs.backgroundColor, bd: cs.borderTopColor, bdw: cs.borderTopWidth }; });
    const tab = (bottom, bg, bd) => `<div id="mockA3" style="position:fixed;left:${band.left + band.w / 2}px;top:${bottom - H - 6}px;transform:translateX(-50%);z-index:60;pointer-events:none;padding:4px 6px 2px;background:${bg};border:1px solid ${bd};border-bottom:0;border-radius:9px 9px 0 0">${planSvg(s)}</div>`;
    const inject = html => p.evaluate(h => { document.getElementById('mockA3')?.remove(); document.body.insertAdjacentHTML('beforeend', h); }, html);
    await inject(tab(band.top + 1, band.bg, band.bd)); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-A3-band-open.png` });
    await p.addStyleTag({ content: '.sailband{visibility:hidden!important}' });
    await inject(tab(860, band.bg, band.bd)); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-A3-band-away.png` });
    await p.evaluate(() => document.getElementById('mockA3')?.remove());
    await p.addStyleTag({ content: '.sailband{visibility:visible!important}' });
    // D2: the chase camera tipped down (look pitch), the real tiller above the band; tape where its end rests at the centre and the stall
    const tapesSvg = () => p.evaluate(([G, STALL]) => {
      const v = __view, grp = v.userMesh.grp, cam = v.camera, P = grp.position.constructor;
      const rowAt = e => { const a = -e, i = Math.round((a + 46.5) / 0.5); return G.table[Math.max(0, Math.min(G.table.length - 1, i))]; };
      const scr = (x, y, z) => { const q = grp.localToWorld(new P(x, y, z)).project(cam); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; };
      const polys = [];
      for (const [e, kind] of [[0, 'c'], [STALL, 's'], [-STALL, 's']]) {
        const r = rowAt(e), dx = r.ex - r.rx, dz = r.ez - r.rz, n = Math.hypot(dx, dz), ux = dx / n, uz = dz / n, px = -uz, pz = ux, hl = 0.17, hw = 0.022, y = r.dy + 0.004;
        polys.push([kind, [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, b]) => scr(r.ex + ux * a + px * b, y, r.ez + uz * a + pz * b))]);
      }
      return `<svg width="1400" height="860" style="position:fixed;left:0;top:0">${polys.map(([k, pts]) => `<polygon points="${pts.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${k === 's' ? '#ffb627' : '#fff'}" stroke="#0a141c" stroke-width="1" stroke-opacity=".6"/>`).join('')}</svg>`;
    }, [G, STALL]);
    const putD = async file => { await p.waitForTimeout(3500); const svg = await tapesSvg(); await p.evaluate(h => { document.getElementById('mockD')?.remove(); const d = document.createElement('div'); d.id = 'mockD'; d.style.cssText = 'position:fixed;inset:0;z-index:60;pointer-events:none'; d.innerHTML = h; document.body.appendChild(d); }, svg); await p.waitForTimeout(400); await p.screenshot({ path: file }); };
    await p.evaluate(p0 => __look(0, p0), PITCH); await putD(`${base}-D2.png`);
    if (s.name === '22kt') { await p.evaluate(() => { __look(0, 0); }); await p.keyboard.press('3'); await putD(`${base}-D2-overhead.png`); }
    await p.close();
  }
  await b.close();
})();
