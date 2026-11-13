// Builds the visual-first tactical debrief still from a sim race's numbers (tactics2.json).
const fs = require('fs');
const [,, inp, out] = process.argv;
const D = JSON.parse(fs.readFileSync(inp, 'utf8'));
const med = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const CAUSE = { other: ['Boat speed & other', '#94abb7'], shifts: ['Shifts', '#56b4e9'], tide: ['Tide', '#1fbf8f'], laylines: ['Laylines', '#d98cc0'], clearAir: ['Clear air', '#e69f00'], manoeuvres: ['Tacks & gybes', '#f0e442'] };
const KIND = { beat: 'Beat', run: 'Run', reach: 'Reach' };
const CHOSEN = 'Varnish';
const rows = D.legs.map(L => {
  const you = L.boats.find(b => b.name === 'You'), others = L.boats.filter(b => b.name !== 'You');
  const mid = med(L.boats.map(b => b.dur)), best = L.boats.reduce((a, b) => b.dur < a.dur ? b : a), ch = L.boats.find(b => b.name === CHOSEN);
  const vsMid0 = you.dur - mid, named = Object.values(L.causes).reduce((a, v) => a + v, 0);
  const causes = { ...L.causes, ...(vsMid0 - named > 2 ? { other: Math.round(vsMid0 - named) } : {}) };
  const lost = Object.entries(causes).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const big = lost[0];
  const vsMid = Math.round(you.dur - mid);
  const words = { other: 'Slower through the water', shifts: 'Held headers too long', tide: 'Less tide than the fleet', laylines: 'Overstood the layline', clearAir: 'Sailed in dirty air', manoeuvres: 'Slow tacks' };
  const short = { other: 'speed', shifts: 'headers', tide: 'tide', laylines: 'the layline', clearAir: 'dirty air', manoeuvres: 'tacks' };
  const take = vsMid < 0 ? (big && big[1] >= 5 ? `Gained, but ${short[big[0]]} cost ${big[1]} s` : 'Good leg') : big && big[1] >= 2 ? words[big[0]] : 'Even with the fleet';
  return { L, you: you.dur, mid, best, ch, ideal: L.ideal, vsMid, lost, take, bigS: big ? big[1] : 0 };
});
const W = 560, X0 = 150, X1 = 520, rng = 60; // (seconds either side of the middle; beyond it, a dot sits at the edge with its value)
const sx = s => X0 + (X1 - X0) / 2 + (-Math.max(-rng, Math.min(rng, s)) / rng) * (X1 - X0) / 2; // faster (negative) to the right
const RH = 46;
const svgRows = rows.map((r, i) => {
  const y = 34 + i * RH, d = v => v - r.mid;
  const dot = (v, col, R, lab) => `<circle cx="${sx(d(v)).toFixed(1)}" cy="${y}" r="${R}" fill="${col}" stroke="#0c2534" stroke-width="1.5"><title>${lab}</title></circle>${Math.abs(d(v)) > rng ? `<text x="${(sx(d(v)) + (d(v) > 0 ? 10 : -10)).toFixed(1)}" y="${y + 4}" fill="${col}" font-size="10" text-anchor="${d(v) > 0 ? 'start' : 'end'}">${d(v) > 0 ? '−' : '+'}${Math.round(Math.abs(d(v)))} s</text>` : ''}`;
  const ideal = r.ideal ? d(r.ideal) : null;
  // the stacked bar of causes, under the row
  // (from the fleet's middle toward "slower", under your dot: the seconds you lost, by cause)
  let x = sx(0); const scale = (X1 - X0) / 2 / rng;
  const stack = r.lost.map(([k, v]) => { const wdt = Math.max(2, Math.min(v, Math.max(0, x - X0) / scale) * scale); x -= wdt; const s = `<rect x="${x.toFixed(1)}" y="${y + 9}" width="${wdt.toFixed(1)}" height="7" fill="${CAUSE[k][1]}"><title>${CAUSE[k][0]}: −${v} s</title></rect>`; x -= 1; return s; }).join('');
  return `<text x="8" y="${y + 4}" fill="#e9f2f5" font-size="12" font-weight="700">L${r.L.leg}</text><text x="30" y="${y + 4}" fill="#94abb7" font-size="11">${KIND[r.L.kind]} · ${r.L.name}</text>
  <line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="rgba(150,196,218,.18)"/>
  ${ideal != null ? `<path d="M${sx(ideal)} ${y - 6} l6 6 l-6 6 l-6 -6z" fill="none" stroke="#e9f2f5" stroke-width="1.5"><title>The ideal: ${Math.round(r.ideal)} s</title></path>${Math.abs(ideal) > rng ? `<text x="${sx(ideal) + (ideal > 0 ? 10 : -10)}" y="${y - 9}" fill="#e9f2f5" font-size="10" text-anchor="${ideal > 0 ? 'start' : 'end'}">+${Math.round(Math.abs(ideal))} s</text>` : ''}` : ''}
  ${dot(r.best.dur, '#ffb627', 5, `Best on the leg: ${r.best.name}`)}
  ${r.ch ? dot(r.ch.dur, '#1fbf8f', 5, CHOSEN) : ''}
  ${dot(r.you, '#ffffff', 7, 'You')}
  ${stack}`;
}).join('');
const H = 34 + rows.length * RH;
const axis = `<line x1="${sx(0)}" y1="16" x2="${sx(0)}" y2="${H - 10}" stroke="#94abb7" stroke-dasharray="3 3"/><text x="${sx(0)}" y="12" fill="#94abb7" font-size="10" text-anchor="middle">fleet's middle</text>
<text x="${X1}" y="12" fill="#94abb7" font-size="10" text-anchor="end">faster →</text><text x="${X0}" y="12" fill="#94abb7" font-size="10">← slower</text>
<text x="${sx(-rng/2)}" y="${H}" fill="#94abb7" font-size="10" text-anchor="middle">+${Math.round(rng/2)} s</text><text x="${sx(rng/2)}" y="${H}" fill="#94abb7" font-size="10" text-anchor="middle">−${Math.round(rng/2)} s</text>`;
const takeaways = rows.map(r => `<div class="tk"><b>L${r.L.leg}</b><span>${r.take}</span><em class="${r.vsMid > 0 ? 'lost' : r.vsMid < 0 ? 'won' : ''}">${r.vsMid > 0 ? '−' : r.vsMid < 0 ? '+' : '±'}${Math.abs(r.vsMid)} s</em></div>`).join('');
// whole race: three biggest causes over all legs
const tot = {}; rows.forEach(r => r.lost.forEach(([k, v]) => tot[k] = (tot[k] || 0) + v));
const top3 = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 3);
const raceWords = { other: 'Slower through the water', shifts: 'Headers held too long', tide: 'Sailed in less ebb', laylines: 'Overstood the laylines', clearAir: 'Time in dirty air', manoeuvres: 'Slow through the tacks' };
const youT = D.finish.find(b => b.name === 'You').t, fin = D.finish.filter(b => b.t).sort((a, b) => a.t - b.t), place = fin.findIndex(b => b.name === 'You') + 1;
const idealT = rows.reduce((a, r) => a + (r.ideal || 0), 0);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tactical debrief mock-up</title><style>
body{margin:0;background:#06101a;color:#e9f2f5;font:14px/1.45 system-ui,sans-serif;padding:24px}
.wrap{max-width:1180px;margin:0 auto}.panel{background:#0f2130;border:1px solid rgba(150,196,218,.2);border-radius:12px;padding:18px}
.eyebrow{font:600 11px/1 system-ui;letter-spacing:.16em;text-transform:uppercase;color:#ffb627;margin-bottom:10px}
.top{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.tile{background:#0c2534;border:1px solid rgba(150,196,218,.2);border-radius:10px;padding:12px}.tile b{display:block;font-size:22px}.tile span{color:#94abb7;font-size:12px}
.tile.lost b{color:#ff6a2a}
.grid{display:grid;grid-template-columns:${W}px 1fr;gap:20px}
.legend{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px}.chip{border:1px solid rgba(150,196,218,.3);border-radius:14px;padding:3px 10px;font-size:12px;display:flex;gap:6px;align-items:center}
.chip.off{opacity:.4}.chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
.tk{display:grid;grid-template-columns:34px 1fr 54px;gap:8px;align-items:center;height:${RH}px;border-bottom:1px solid rgba(150,196,218,.1)}
.tk b{color:#94abb7}.tk em{font-style:normal;text-align:right;font-weight:700}.tk em.lost{color:#ff6a2a}.tk em.won{color:#56b4e9}
.causes{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#94abb7;margin-top:8px}.causes i{display:inline-block;width:10px;height:7px;margin-right:4px}
a{color:#ffb627}
</style></head><body><div class="wrap">
<div class="eyebrow">Your race, debriefed · Tactics</div>
<div class="top">
 <div class="tile"><b>${place}${['th','st','nd','rd'][place]||'th'}</b><span>${mmss(youT)} · the ideal ${mmss(idealT)} (the planner's perfect boat)</span></div>
 ${top3.map(([k, v]) => `<div class="tile lost"><b>−${v} s</b><span>${raceWords[k]}</span></div>`).join('')}
</div>
<div class="panel"><div class="grid">
 <div>
  <div class="legend"><span class="chip"><i style="background:#fff"></i>You</span><span class="chip"><i style="background:#ffb627"></i>Best on each leg</span><span class="chip"><i style="border:1.5px solid #fff;border-radius:0;transform:rotate(45deg);width:7px;height:7px"></i>The ideal</span><span class="chip"><i style="background:#1fbf8f"></i>${CHOSEN} ▾</span><span class="chip off"><i style="background:#ff6a2a"></i>Red</span><span class="chip off"><i style="background:#3b8fe0"></i>Blue</span></div>
  <svg width="${W}" height="${H + 6}" viewBox="0 0 ${W} ${H + 6}">${axis}${svgRows}</svg>
  <div class="causes">Under each leg, your seconds lost by cause: ${Object.values(CAUSE).map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>
 </div>
 <div>
  <div style="height:22px"></div><div style="height:18px"></div>
  ${takeaways}
  <p style="color:#94abb7;font-size:12px;margin-top:14px">Hover a dot or a bar for the detail; click a leg to sail it in "Watch your race" with the chosen boat and the ideal track. <a href="#">How it's measured</a></p>
 </div>
</div></div>
<div class="panel" style="margin-top:16px;display:grid;grid-template-columns:420px 1fr;gap:20px;align-items:center">
 <svg viewBox="0 0 420 230" width="420" height="230" style="background:#0c2534;border-radius:8px">
  <text x="12" y="18" fill="#e9f2f5" font-size="11">WIND ↓</text><text x="408" y="18" fill="#94abb7" font-size="11" text-anchor="end">L8 · beat to the finish</text>
  <path d="M60 30 L360 30" stroke="#ffb627" stroke-dasharray="5 4"/><text x="210" y="24" fill="#ffb627" font-size="10" text-anchor="middle">finish line</text>
  <path d="M210 215 L120 150 L250 95 L170 40" stroke="#e9f2f5" stroke-width="2.5" fill="none"/>
  <path d="M215 215 L280 160 L190 110 L240 60 L205 32" stroke="#1fbf8f" stroke-width="2" stroke-dasharray="2 3" fill="none"/>
  <path d="M212 215 L160 180 L260 110 L215 32" stroke="#e9f2f5" stroke-width="1.5" stroke-dasharray="6 5" opacity=".55" fill="none"/>
  <path d="M120 150 L150 128" stroke="#56b4e9" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="150" r="8" fill="#56b4e9"/><text x="120" y="153.5" fill="#0c2534" font-size="10" text-anchor="middle" font-weight="700">1</text>
  <circle cx="250" cy="95" r="8" fill="#f0e442"/><text x="250" y="98.5" fill="#0c2534" font-size="10" text-anchor="middle" font-weight="700">2</text>
  <text x="300" y="168" fill="#1fbf8f" font-size="10">Varnish</text><text x="268" y="122" fill="#e9f2f5" font-size="10" opacity=".7">the ideal</text>
 </svg>
 <div><div class="eyebrow">In "Watch your race"</div><p style="margin:0 0 8px">Clicking a leg plays it with your track, the boat you chose (dotted) and the ideal track (dashed). The moments that cost you time are numbered on your track in their cause's colour: <b style="color:#56b4e9">1</b> held a header, <b style="color:#f0e442">2</b> a slow tack. The same chips choose who's shown.</p><p style="color:#94abb7;font-size:12px;margin:0">One takeaway per leg, at most about 8 words. The detail of each line shows on hover; "How it's measured" is a single link.</p></div>
</div>
<p style="color:#94abb7;font-size:12px">Mock-up for the owner. The numbers are from one sim race (Seaweed Soup course 2, 14 kt westerly, ebb, six boats). The chips are the player's choice of who to compare with: click a name to show or hide that boat. The ideal is the strategist's planned leg time.</p>
</div></body></html>`;
fs.writeFileSync(out, html);
console.log('ok', rows.map(r => `L${r.L.leg} you ${r.you} mid ${r.mid} best ${r.best.dur} ideal ${Math.round(r.ideal)} ${r.take} ${JSON.stringify(r.L.causes)}`).join('\n'));
