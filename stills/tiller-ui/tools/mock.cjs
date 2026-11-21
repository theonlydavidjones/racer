// tiller UI mock-ups: stills only, nothing ships. The real page (?inproc), the world set on a beat, the tiller held,
// today's guide shown; then each direction drawn over the same frame (the guide hidden).
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2];
const HARD = 46.5, STALL = 40; // boat/balance.ts HARD_OVER, RUDDER_STALL (deg of rudder)
const SC = [
  { name: '12kt-port', kt: 12, hdg: 319, v: 3.0, ang: -3.0, pull: 1, wh: 3, light: false, kick: false },
  { name: '12kt-stbd', kt: 12, hdg: 231, v: 3.0, ang: 3.5, pull: -1, wh: 3.5, light: false, kick: false },
  { name: '22kt', kt: 22, hdg: 319, v: 3.3, ang: -11, pull: 1, wh: 11, light: false, kick: true },
  { name: '4kt', kt: 4, hdg: 319, v: 1.4, ang: -0.5, pull: 1, wh: 0.5, light: true, kick: false },
  // C: the 22 kt beat as a sequence (a puff loads the tiller; let go and she rounds up; the stall goes light)
  { name: 'C1-puff-held', kt: 22, hdg: 319, v: 3.3, ang: -13, pull: 1, wh: 13, light: false, kick: true, hand: true, only: 'C' },
  { name: 'C2-let-go', kt: 22, hdg: 296, v: 2.0, ang: 14, pull: 1, wh: 13, light: false, kick: true, hand: false, only: 'C' },
  { name: 'C3-stall-light', kt: 22, hdg: 319, v: 3.0, ang: -44, pull: 1, wh: 13, light: true, kick: true, hand: true, only: 'C' }
];
const tone = wh => wh >= 2 && wh <= 5 ? '#3fd0c0' : wh > 8 ? '#ffb627' : '#e9f2f5'; // ui/weatherHelm.ts WH_BALANCED, WH_TOO_MUCH
const GOLD = '#ffb627';
const rad = d => d * Math.PI / 180;
// A: the arc, seen from behind, pivoting at the bottom (50 px tall)
function arcSvg(s) {
  const W = 176, H = 58, cx = 88, cy = 52, R = 44;
  const P = (a, r) => [cx + Math.sin(rad(a)) * r, cy - Math.cos(rad(a)) * r];
  const arc = (a0, a1, r) => { const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const k = HARD / 46.5 * 1; // 1 deg of rudder = 1 deg on the arc (the arc's ends are hard over)
  const tl = P(s.ang, 41), wedgeW = Math.max(3, s.wh * 2.2), wa0 = s.ang, wa1 = s.ang + s.pull * wedgeW;
  const wp = (a, r) => P(a, r).map(v => v.toFixed(1)).join(' ');
  const wedge = `<path d="M${cx} ${cy} L${wp(wa0, 43)} A43 43 0 0 ${wa1 > wa0 ? 1 : 0} ${wp(wa1, 43)} Z" fill="${tone(s.wh)}" opacity="${s.light ? .35 : .55}"/>`;
  const ghost = s.kick ? [-3, 3].map(d => { const g = P(s.ang + d, 41); return `<line x1="${cx}" y1="${cy}" x2="${g[0].toFixed(1)}" y2="${g[1].toFixed(1)}" stroke="#fff" stroke-width="2" opacity=".28" stroke-linecap="round"/>`; }).join('') : '';
  const line = s.light
    ? `<line x1="${cx}" y1="${cy}" x2="${tl[0].toFixed(1)}" y2="${tl[1].toFixed(1)}" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".9"/><line x1="${cx}" y1="${cy}" x2="${tl[0].toFixed(1)}" y2="${tl[1].toFixed(1)}" stroke="#0a141c" stroke-width="1.3" stroke-linecap="round"/>`
    : `<line x1="${cx}" y1="${cy}" x2="${tl[0].toFixed(1)}" y2="${tl[1].toFixed(1)}" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>`;
  const stallOn = Math.abs(s.ang) >= STALL;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="9" fill="rgba(9,22,33,.88)" stroke="rgba(255,255,255,.14)"/><path d="${arc(-HARD, HARD, R)}" fill="none" stroke="#e9f2f5" stroke-opacity=".5" stroke-width="2.5"/>
  <path d="${arc(-HARD, -STALL, R)}" fill="none" stroke="${GOLD}" stroke-width="6" opacity="${stallOn && s.ang < 0 ? 1 : .8}"/><path d="${arc(STALL, HARD, R)}" fill="none" stroke="${GOLD}" stroke-width="6" opacity="${stallOn && s.ang > 0 ? 1 : .8}"/>
  <line x1="${cx}" y1="${cy - R - 4}" x2="${cx}" y2="${cy - R + 3}" stroke="#e9f2f5" stroke-opacity=".6" stroke-width="2"/>${wedge}${ghost}${line}<circle cx="${cx}" cy="${cy}" r="3.2" fill="#e9f2f5"/>
  ${s.hand ? `<circle cx="${tl[0].toFixed(1)}" cy="${tl[1].toFixed(1)}" r="5.5" fill="none" stroke="#fff" stroke-width="1.6"/>` : ''}</svg>`;
}
// B: the cursor, a small tiller-head mark with a pull arrow, hollow when light, ghosts in waves; a faint centre tick
function cursorSvg(s) {
  const W = 56, H = 56, cx = 28, cy = 48, L = 34, a = s.ang * 0.9; // (the mark tilts with the tiller)
  const tip = [cx + Math.sin(rad(a)) * L, cy - Math.cos(rad(a)) * L];
  const body = s.light
    ? `<line x1="${cx}" y1="${cy}" x2="${tip[0]}" y2="${tip[1]}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="${cx}" y1="${cy}" x2="${tip[0]}" y2="${tip[1]}" stroke="#0a141c" stroke-width="2.2" stroke-linecap="round"/>`
    : `<line x1="${cx}" y1="${cy}" x2="${tip[0]}" y2="${tip[1]}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
  const ghost = s.kick ? [-9, 9].map(d => { const g = [cx + Math.sin(rad(a + d)) * L, cy - Math.cos(rad(a + d)) * L]; return `<line x1="${cx}" y1="${cy}" x2="${g[0]}" y2="${g[1]}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".25"/>`; }).join('') : '';
  const al = 6 + Math.min(14, s.wh * 1.4), ay = tip[1] + 6, ax = tip[0];
  const arrow = `<path d="M${ax} ${ay} h${s.pull * al} M${ax + s.pull * al} ${ay} l${-s.pull * 5} -4 M${ax + s.pull * al} ${ay} l${-s.pull * 5} 4" fill="none" stroke="${tone(s.wh)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="${s.light ? .5 : 1}"/>`;
  const halo = `<line x1="${cx}" y1="${cy}" x2="${tip[0]}" y2="${tip[1]}" stroke="#0a141c" stroke-width="9" stroke-linecap="round" opacity=".7"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${halo}${ghost}${body}<circle cx="${cx}" cy="${cy}" r="4" fill="${s.light ? 'none' : '#fff'}" stroke="#fff" stroke-width="2"/>${arrow}</svg>`;
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shots = {};
  for (const s of SC) {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.setDefaultTimeout(180000);
    await p.addInitScript(kt => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, { mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: kt, current: 'real', weatherHelm: true }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); }, s.kt);
    await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2500);
    await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
    const r = await p.evaluate(([hdg, v]) => { const w = sim(), u = w.user; w.paused = false; u.heading = hdg; u.v = v; for (let i = 0; i < 60 * 6; i++) w.step(1 / 60); return { hdg: Math.round(u.heading), v: +u.v.toFixed(2), heel: Math.round(u.heel ?? 0), kt: +w.wind.kt.toFixed(1) }; }, [s.hdg, s.v]);
    console.log(s.name, JSON.stringify(r));
    await p.mouse.move(700, 580); await p.keyboard.press('t'); await p.waitForTimeout(5000);
    const base = `${out}/${s.name}`;
    shots[s.name] = {};
    if (!s.only) { await p.screenshot({ path: `${base}-today.png` }); shots[s.name].today = `${base}-today.png`; }
    // the guide away; the band's own tiller bar out of the way of the arc
    await p.addStyleTag({ content: '#tillerGuide{display:none!important}.sb-tillerslot{visibility:hidden!important}' });
    const put = async (id, html, x, y) => p.evaluate(([id, html, x, y]) => { document.getElementById(id)?.remove(); const d = document.createElement('div'); d.id = id; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:60;pointer-events:none;transform:translateX(-50%)`; d.innerHTML = html; document.body.appendChild(d); }, [id, html, x, y]);
    const slot = await p.evaluate(() => { const q = document.querySelector('.sb-tillerslot').getBoundingClientRect(); return [q.left + q.width / 2, q.bottom]; });
    if (!s.only || s.only === 'C') { await put('mockA', arcSvg(s), slot[0], slot[1] - 56 + 2); await p.waitForTimeout(500); await p.screenshot({ path: `${base}-A.png` }); shots[s.name].A = `${base}-A.png`; }
    if (!s.only) {
      await p.evaluate(() => document.getElementById('mockA')?.remove());
      await put('mockB', cursorSvg(s), 700 + s.ang * 5, 560);
      await put('mockTick', '<svg width="4" height="14"><rect x="1" y="0" width="2" height="14" fill="#fff" opacity=".45"/></svg>', 700, 590);
      await p.waitForTimeout(500); await p.screenshot({ path: `${base}-B.png` }); shots[s.name].B = `${base}-B.png`;
    }
    await p.close();
  }
  fs.writeFileSync(`${out}/shots.json`, JSON.stringify(shots, null, 1));
  await b.close();
})();
