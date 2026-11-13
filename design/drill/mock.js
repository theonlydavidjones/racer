// Mock-up for the owner (not built): Drill as its own start-page section (the owner, 13 Nov 2026: "practice should be
// in its own start page section, not in race. and let's call it 'drill'"). Run in the dev page with the tightened race
// setup open: it takes that setup's own boat-and-crew row, its when row, the conditions strip and the graph (the same
// tiles, the same numbers), and lays out the three drills, each with its few settings and Go. window.__drillPage()
// shows it; window.__drillHome() shows the start page with the Drill card.
(() => {
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    #drillMock .panel{max-width:1100px;gap:16px}
    #drillMock .dgrid{display:grid;grid-template-columns:1.25fr 1fr;gap:20px;align-items:start}
    #drillMock .dlist{display:flex;flex-direction:column;gap:12px}
    #drillMock .dcard{display:grid;grid-template-columns:64px 1fr auto;column-gap:16px;row-gap:10px;align-items:center;padding:14px 16px;border:1px solid var(--rule);border-radius:12px;background:var(--ink)}
    #drillMock .dcard .dic{width:56px;height:56px;border-radius:12px;background:#123b52;display:grid;place-items:center}
    #drillMock .dcard .dsets{grid-column:2 / -1;display:flex;gap:10px;flex-wrap:wrap}
    #drillMock .dcard .seg{flex:0 1 auto}
    #drillMock .dcard .seg button{padding:7px 12px}
    #drillMock .dgo{background:var(--accent);color:#1a1205;border:0;border-radius:8px;padding:10px 18px;font:700 14px/1 var(--f-inst);letter-spacing:.1em;text-transform:uppercase}
    #drillMock .dside{display:flex;flex-direction:column;gap:12px}
    #drillMock .dside .srow{border:1px solid var(--rule);border-radius:12px;background:var(--ink)}
    #drillMock .dside .srow-head{display:grid;grid-template-columns:72px 1fr auto;align-items:center;column-gap:14px;padding:12px 14px}
    #drillMock .dside .srow-lead{display:flex;justify-content:center}
    #drillMock .dside .srow-main{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    #drillMock .dside .srow-go{color:var(--accent);font:600 13px/1 var(--f-inst)}
    #drillMock .dside .tg{width:100%;border-radius:8px}
    #drillMock .ghost.sm{padding:8px 10px;font-size:12px}
    #home .modes.four{grid-template-columns:repeat(4,minmax(0,1fr))}
  `;
  document.head.appendChild(css);
  const icon = {
    start: '<svg viewBox="0 0 40 30" width="40" height="30"><line x1="4" y1="22" x2="36" y2="22" stroke="#ffb627" stroke-width="2.6"/><rect x="2" y="12" width="5" height="10" fill="#e8eef2"/><circle cx="36" cy="22" r="3" fill="#ff8a2a"/><path d="M20 4 l4 9 h-8 z" fill="#9fd3ea"/></svg>',
    tacks: '<svg viewBox="0 0 40 30" width="40" height="30" fill="none" stroke="#9fd3ea" stroke-width="2.2" stroke-linecap="round"><path d="M6 26 L14 6 L22 26 L30 6"/><path d="M30 6 l-1 6 M30 6 l-5 3" /></svg>',
    marks: '<svg viewBox="0 0 40 30" width="40" height="30" fill="none"><circle cx="24" cy="14" r="4" fill="#ffb627"/><path d="M6 26 Q8 8 24 6 Q36 6 34 18 Q32 26 20 26" stroke="#9fd3ea" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"/></svg>'
  };
  const seg = (opts, on) => `<div class="seg">${opts.map(o => `<button type="button" aria-pressed="${o === on}">${o}</button>`).join('')}</div>`;
  const card = (ic, title, line, sets) => `<div class="dcard"><span class="dic">${ic}</span><span class="t-text"><span class="t-h">${title}</span><span class="t-s">${line}</span></span><button type="button" class="dgo">Go</button>${sets ? `<div class="dsets">${sets}</div>` : ''}</div>`;
  const grab = id => { const r = $(id); return r ? `<div class="srow">${r.querySelector('.srow-head').outerHTML}</div>` : ''; };
  const graph = (() => { try { return `<img class="tg" src="${$('tideGraph').toDataURL()}" alt="">`; } catch { return ''; } })();
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'drillMock'; ov.hidden = true;
  ov.innerHTML = `<div class="panel wide">
    <button type="button" class="linkbtn back">‹ Start page</button>
    <h1>Drill</h1>
    <div class="dgrid">
      <div class="dlist">
        ${card(icon.start, 'The start', 'The last minutes to the gun, then a debrief and a replay: on the line, on time, at speed.', `${seg(['1 min', '2 min', '3 min'], '2 min')}${seg(['Alone', 'With the fleet'], 'Alone')}`)}
        ${card(icon.tacks, 'Tacks and gybes', "Alone in open water, in this day's wind and sea: each one scored against a good crew's, with what to change.", '')}
        ${card(icon.marks, 'Mark roundings', 'Round the practice marks: the approach, the turn and away, each one scored.', '')}
      </div>
      <div class="dside">
        ${grab('row-boat')}
        ${grab('row-when')}
        <div class="condhead"><span>Conditions</span><b>real</b></div>
        ${$('condStrip').outerHTML.replace('id="condStrip"', '')}
        ${graph}
        <button class="ghost sm" type="button">Change the conditions…</button>
      </div>
    </div></div>`;
  document.body.appendChild(ov);
  window.__drillPage = () => { for (const id of ['home', 'setup', 'raceChoose']) $(id).hidden = true; ov.hidden = false; };
  window.__drillHome = () => {
    ov.hidden = true; $('setup').hidden = true;
    const modes = document.querySelector('#home .modes');
    if (!modes.querySelector('[data-mock="drill"]')) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'modecard'; c.dataset.mock = 'drill';
      c.innerHTML = '<b>Drill</b><span>The start, tacks and gybes, mark roundings</span>';
      modes.insertBefore(c, modes.querySelector('[data-home="fleet"]')); modes.classList.add('four');
      const race = modes.querySelector('[data-home="race"] span'); if (race) race.textContent = 'Create a race, or sail a past one';
    }
    $('home').hidden = false;
  };
})();
