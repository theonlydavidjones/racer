// Mock-up for the owner (not built): the race setup, tightened. The owner, 13 Nov 2026: "the boat illustrations are
// unnecessary. Better would be a kind of avatar with sail number and maybe name underneath? this whole setup is super
// cluttered and hard to look at. let's tighten it up." One visual language: every boat (yours and the fleet's) and
// every crew member is the same avatar, a rounded tile in the boat's hull colour (a member's: the club's) with the sail
// number (or initials) big inside and the name small underneath. Four rows on one grid, one type scale; the conditions
// as one strip over the graph; Start prominent. Built in the dev page from the real setup and the race it prepared,
// with the members' real names from the Yacht Club. window.__tfold(key) opens one row (or none).
(async () => {
  const $ = id => document.getElementById(id);
  const w = window.__w();
  const { burgeeCanvas } = await import('/src/render/burgees.ts');
  const { loadSettings } = await import('/src/settings.ts');
  const S = loadSettings();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cond = Object.fromEntries([...document.querySelectorAll('#condSum dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent ?? '']));
  const pressed = el => el?.querySelector('[aria-pressed="true"]');

  // ---------- the one avatar ----------
  // (the number or initials in black or white, whichever reads on the colour)
  const ink = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return '#fff'; const n = parseInt(m[1], 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#13202b' : '#fff'; };
  const toHex = c => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('') : c; };
  const av = (big, name, colour, o = {}) => `<span class="t-av${o.on ? ' on' : ''}${o.dim ? ' dim' : ''}${o.round ? ' round' : ''}"><span class="t-tile" style="background:${colour};color:${ink(colour)}${o.ring ? `;box-shadow:inset 0 0 0 3px ${o.ring}` : ''}">${o.country ? `<i class="t-ctry">${esc(o.country)}</i>` : ''}${esc(big)}</span><small>${esc(name)}</small></span>`;
  const empty = label => `<span class="t-av round"><span class="t-tile t-add">–</span><small>${esc(label)}</small></span>`;
  const add = (label) => `<span class="t-av"><span class="t-tile t-add">+</span><small>${esc(label)}</small></span>`;
  const num = no => String(no).replace(/^[A-Z]{2,3}\s+/, ''), ctry = no => (String(no).match(/^([A-Z]{2,3})\s+/) || [])[1] ?? ''; // (the number big, its country small over it)
  const initials = n => n === 'You' ? 'YOU' : n.trim().split(/\s+/).map(x => /^\d+$/.test(x) ? x : x[0]).join('').slice(0, 3).toUpperCase();
  const CLUB = '#24467a'; // (the members' tiles: the club's blue)

  // ---------- the values ----------
  const host = pressed($('hostSeg'))?.dataset.host;
  const burgee = host === 'ggyc' ? (() => { const c = burgeeCanvas('ggyc'); return c ? `<img class="t-burgee" src="${c.toDataURL()}" alt="Golden Gate YC">` : ''; })() : '';
  const courseSel = $('courseSel'), courseText = courseSel.options[courseSel.selectedIndex]?.text ?? '';
  const nm = (courseText.match(/([\d.]+)\s*nm/) || [])[1] ?? '', courseNo = (courseText.match(/Course\s*\d+/) || ['Course'])[0];
  const seq = S.seq ?? 3, prep = S.prepFlag ?? 'P', turns = S.penaltyTurns ?? 2;
  const opps = [...document.querySelectorAll('#oppList .opp[data-opp]')].map(o => ({ on: o.getAttribute('aria-pressed') === 'true', name: o.querySelector('span')?.textContent ?? '', no: o.querySelector('small')?.textContent ?? '', hull: toHex(o.querySelector('i')?.style.background ?? '#888'), ring: toHex((o.querySelector('i')?.style.boxShadow.match(/(rgb[^)]*\)|#[0-9a-f]+)/i) || [])[1] ?? '') }));
  const seats = $('crewRows'), seat = i => { const s = seats.querySelector(`select[data-seat="${i}"]`); return s && s.value ? s.options[s.selectedIndex].text : ''; };
  const members = [...(seats.querySelector('select[data-seat="0"]')?.options ?? [])].filter(o => o.value).map(o => o.text);
  const kg = (($('crewSum')?.textContent ?? '').match(/([\d,]+)\s*lb/) || [])[1] ?? '';
  const fromSlip = S.raceFrom === 'slip';
  const day = new Date(w.raceDate + 'T12:00'), dateStr = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = S.tideTime || '12:00';
  const windM = (cond.Wind || '').match(/(\d+)\s*kt from (\d+)°\s*\((\w+)\)/) || [], windKt = windM[1] ?? Math.round(w.wind.kt), windFrom = Number(windM[2] ?? w.wind.from), windPt = windM[3] ?? '';
  const curM = (cond.Current || '').match(/(Flood|Ebb|Slack)\s*([\d.]+)?/) || [], curKind = curM[1] ?? '', curKt = curM[2] ?? w.cur.kt.toFixed(1);
  const seaM = (cond.Sea || '').match(/([\d.]+)\s*ft,\s*([\d.]+)\s*s/) || [];
  const sunSet = ((cond.Sun || '').match(/sets ([\d:]+)/) || [])[1] ?? '';
  const arrow = (to, col) => `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true"><circle r="11" fill="none" stroke="#2e4a5e"/><g transform="rotate(${to})"><line y1="7" y2="-5" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/><path d="M0 -9 L4 -3 L-4 -3 Z" fill="${col}"/></g></svg>`;

  // the course from above, north up: the line in amber, the legs, the marks
  const courseSvg = (W, H) => {
    const C = w.C, pts = [C.committee, C.pin, ...C.marks.map(m => m.p)].filter(Boolean), pad = 8;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min((W - 2 * pad) / Math.max(1, maxX - minX), (H - 2 * pad) / Math.max(1, maxY - minY)), ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
    const X = p => (ox + (p.x - minX) * k).toFixed(1), Y = p => (H - oy - (p.y - minY) * k).toFixed(1);
    const mid = C.committee && C.pin ? { x: (C.committee.x + C.pin.x) / 2, y: (C.committee.y + C.pin.y) / 2 } : C.marks[0].p;
    const path = [mid, ...C.marks.filter(m => m.type !== 'finish').map(m => m.p), mid].map((p, i) => `${i ? 'L' : 'M'}${X(p)} ${Y(p)}`).join(' ');
    return `<svg class="t-course" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><rect width="${W}" height="${H}" rx="8" fill="#123b52"/>
      <path d="${path}" fill="none" stroke="#9fd3ea" stroke-width="1.4" stroke-dasharray="3 3"/>
      ${C.committee && C.pin ? `<line x1="${X(C.committee)}" y1="${Y(C.committee)}" x2="${X(C.pin)}" y2="${Y(C.pin)}" stroke="#ffb627" stroke-width="2.2"/>` : ''}
      ${C.marks.map(m => `<circle cx="${X(m.p)}" cy="${Y(m.p)}" r="3" fill="#ffb627"/>`).join('')}</svg>`;
  };

  // ---------- the page ----------
  const css = document.createElement('style');
  css.textContent = `
    #setup .panel{gap:18px}
    #setup .steps{gap:12px}
    #setup .t-row{display:grid;grid-template-columns:96px 1fr auto;align-items:center;column-gap:18px;padding:14px 16px;border:1px solid var(--rule);border-radius:12px;background:var(--ink);cursor:pointer}
    #setup .t-row:hover{border-color:rgba(255,182,39,.5)}
    #setup .t-row.open{border-color:var(--accent);cursor:default}
    #setup .t-row>.t-lead{display:flex;align-items:center;justify-content:center}
    #setup .t-row>.t-main{display:flex;align-items:center;gap:14px;min-width:0;flex-wrap:wrap}
    #setup .t-row>.t-go{color:var(--accent);font:600 13px/1 var(--f-inst);letter-spacing:.04em;white-space:nowrap}
    #setup .t-row>.t-body{grid-column:1 / -1;margin-top:14px;padding-top:14px;border-top:1px solid var(--rule);display:none}
    #setup .t-row.open>.t-body{display:block}
    #setup .t-h{font:700 15px/1.2 var(--f-inst);letter-spacing:.02em;color:var(--text)}
    #setup .t-s{font:500 13px/1.35 var(--f-inst);color:var(--muted)}
    #setup .t-text{display:flex;flex-direction:column;gap:3px}
    #setup .t-burgee{height:34px;width:auto;box-shadow:0 1px 2px rgba(0,0,0,.5)}
    #setup .t-av{display:inline-flex;flex-direction:column;align-items:center;gap:5px;width:58px}
    #setup .t-tile{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font:700 15px/1 var(--f-inst);letter-spacing:.01em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
    #setup .t-av.round .t-tile{border-radius:50%}
    #setup .t-av small{font:600 11px/1.15 var(--f-inst);color:var(--muted);text-align:center;max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #setup .t-av.on .t-tile{outline:2px solid var(--accent);outline-offset:2px}
    #setup .t-av.dim{opacity:.35}
    #setup .t-tile{position:relative;line-height:1}
    #setup .t-ctry{position:absolute;top:6px;left:0;right:0;text-align:center;font:700 8.5px/1 var(--f-inst);font-style:normal;letter-spacing:.1em;opacity:.8}
    #setup .t-tile:has(.t-ctry){padding-top:9px;box-sizing:border-box}
    #setup .t-add{background:transparent;border:1.5px dashed #5f7a8c;color:#9fb3c2;box-shadow:none;font-size:18px}
    #setup .t-sep{width:1px;align-self:stretch;background:var(--rule);margin:0 2px}
    #setup .t-group{display:flex;gap:6px;align-items:flex-start}
    #setup .t-pickrow{display:grid;grid-template-columns:96px 1fr;column-gap:18px;align-items:center;margin-top:12px}
    #setup .t-pickrow:first-child{margin-top:0}
    #setup .t-lab{font:600 11px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:right}
    #setup .steps>.step{display:none}
    /* the right column: the day in one strip over the graph; the secondary buttons small; Start big */
    #setSide{gap:12px}
    #setSide #condSum,#setSide #tideNote{display:none}
    #setSide .t-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    #setSide .t-strip>div{display:flex;align-items:center;gap:8px;background:var(--ink);border:1px solid var(--rule);border-radius:10px;padding:8px 10px}
    #setSide .t-strip b{font:700 17px/1 var(--f-inst)}
    #setSide .t-strip small{display:block;font:600 11px/1.2 var(--f-inst);color:var(--muted);margin-top:2px}
    #setSide #bCond{padding:8px 10px;font-size:12px}
    #setSide .gobtns .ghost{padding:8px 10px;font-size:12px}
    #setSide #bGo{padding:18px;font-size:18px}
  `;
  document.head.appendChild(css);
  const steps = document.querySelector('#setup .steps');
  const rows = [
    { key: 'course', lead: burgee || '<span class="t-s">No club</span>', main: () => `${courseSvg(92, 52)}<span class="t-text"><span class="t-h">${esc(courseNo)} · ${esc(nm)} nm</span><span class="t-s">${seq}-min sequence · ${esc(prep === 'black' ? 'black' : prep)} flag · ${turns === 1 ? 'one turn' : 'two turns'}</span></span>`,
      body: () => '<p class="t-s">(Today\'s host, course and sailing instructions, as now: picked with the same avatars where they\'re boats or people.)</p>' },
    { key: 'fleet', lead: '<span class="t-lab">Racing</span>', main: () => `<span class="t-group">${opps.filter(o => o.on).map(o => av(num(o.no), o.name, o.hull, { ring: o.ring, country: ctry(o.no) })).join('')}${add('Add')}</span>`,
      body: () => `<div class="t-pickrow"><span class="t-lab">Club boats</span><span class="t-group">${opps.map(o => av(num(o.no), o.name, o.hull, { ring: o.ring, on: o.on, dim: !o.on, country: ctry(o.no) })).join('')}${add('Another')}</span></div>` },
    { key: 'boat', lead: av(String(S.boat.sails.number), S.boat.name || 'Unnamed', S.boat.hull.upper, { on: true, country: S.boat.sails.country }), main: () => `<span class="t-group">${av('YOU', 'Helm', '#ffb627', { round: true })}${seat(0) ? av(initials(seat(0)), seat(0), CLUB, { round: true }) : empty('Main')}${seat(1) ? av(initials(seat(1)), seat(1), CLUB, { round: true }) : empty('Jib')}</span><span class="t-text"><span class="t-s">${esc(kg)} lb aboard</span><span class="t-s">${fromSlip ? 'From her slip' : 'Starts at the line'}</span></span>`,
      body: () => `
        <div class="t-pickrow"><span class="t-lab">Boat</span><span class="t-group">${S.boats.map(b => av(String(b.sails.number), b.name || 'Unnamed', b.hull.upper, { on: b.id === S.boat.id, country: b.sails.country })).join('')}${add('Yacht Club')}</span></div>
        <div class="t-pickrow"><span class="t-lab">Main</span><span class="t-group">${members.map(n => av(initials(n), n, CLUB, { round: true, on: n === seat(0), dim: n !== seat(0) && n === seat(1) })).join('')}${empty('Nobody')}</span></div>
        <div class="t-pickrow"><span class="t-lab">Jib · pole</span><span class="t-group">${members.map(n => av(initials(n), n, CLUB, { round: true, on: n === seat(1), dim: n !== seat(1) && n === seat(0) })).join('')}${empty('Nobody')}</span></div>` },
    { key: 'when', lead: `<span class="t-tile" style="background:#f3f1ea;color:#13202b;width:46px;height:46px;flex-direction:column;display:flex;justify-content:center;font-size:17px">${day.getDate()}<small style="font:700 9px/1 var(--f-inst);letter-spacing:.1em">${day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></span>`,
      main: () => `<span class="t-text"><span class="t-h">${esc(dateStr)} · gun at ${esc(time)}</span><span class="t-s">Sunset ${esc(sunSet)}</span></span>`, body: () => '' }
  ];
  const made = rows.map(r => {
    const row = document.createElement('section'); row.className = 't-row ' + r.key;
    row.innerHTML = `<span class="t-lead">${r.lead}</span><span class="t-main">${r.main()}</span><span class="t-go">${r.key === 'when' ? 'Change' : 'Change ▾'}</span><div class="t-body">${r.body()}</div>`;
    steps.appendChild(row);
    row.querySelector('.t-go').onclick = () => window.__tfold(row.classList.contains('open') ? null : r.key);
    return { r, row };
  });
  window.__tfold = key => { for (const { r, row } of made) { const on = r.key === key; row.classList.toggle('open', on); if (r.key !== 'when') row.querySelector('.t-go').textContent = on ? 'Done ▴' : 'Change ▾'; } };
  const strip = document.createElement('div'); strip.className = 't-strip';
  strip.innerHTML = `
    <div title="${esc(cond.Wind)}">${arrow((windFrom + 180) % 360, '#7ee0a5')}<span><b>${esc(windKt)} kt</b><small>from ${esc(windPt)}</small></span></div>
    <div title="${esc(cond.Current)}">${arrow(Math.round(w.cur.set), '#6fb7ff')}<span><b>${esc(curKt)} kt</b><small>${esc(curKind.toLowerCase())}</small></span></div>
    <div title="${esc(cond.Sea)}"><svg viewBox="0 0 24 16" width="22" height="16" aria-hidden="true"><path d="M1 10 q3 -5 6 0 t6 0 t6 0" fill="none" stroke="#9fd3ea" stroke-width="2"/></svg><span><b>${esc(seaM[1] ?? '')} ft</b><small>${esc(seaM[2] ?? '')} s swell</small></span></div>
    <div title="${esc(cond.Sun)}"><svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true"><circle r="5" fill="#ffcf5a"/>${[...Array(8)].map((_, i) => `<line y1="-8" y2="-11" stroke="#ffcf5a" stroke-width="1.6" transform="rotate(${i * 45})"/>`).join('')}</svg><span><b>${esc(sunSet)}</b><small>sunset</small></span></div>`;
  $('condSum').after(strip);
})();
