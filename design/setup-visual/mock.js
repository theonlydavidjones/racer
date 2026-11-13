// Mock-up for the owner (not built into the game): the race setup visual-first. The owner, 13 Nov 2026: "It's not easy
// enough to parse at a glance. It's using copy where we should be using visuals. We need avatars or initials for crew."
// Built in the dev page from the real setup and the race it prepared (window.__w), with the game's own pictures (the
// club's burgee, the signal flags) and its fleet's colours; boats by country and sail number beside the name (the
// owner's rule). window.__vfold(key) opens one group (or none). Run with the race setup open.
(async () => {
  const $ = id => document.getElementById(id);
  const w = window.__w();
  const { burgeeCanvas } = await import('/src/render/burgees.ts');
  const { signalCanvas } = await import('/src/render/flags.ts');
  const { loadSettings } = await import('/src/settings.ts');
  const S = loadSettings();
  const pressed = el => el?.querySelector('[aria-pressed="true"]');
  const cond = Object.fromEntries([...document.querySelectorAll('#condSum dt')].map(dt => [dt.textContent, dt.nextElementSibling?.textContent ?? '']));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const sailNo = b => `${b.sails.country ? b.sails.country + ' ' : ''}${b.sails.number}`;

  // ---------- pictures ----------
  // the course from above, north up: the line, the legs mark to mark, the marks (amber: rounding marks; side ringed)
  const courseSvg = (wpx, hpx) => {
    const C = w.C, pts = [C.committee, C.pin, ...C.marks.map(m => m.p)].filter(Boolean);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), pad = 14;
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min((wpx - 2 * pad) / Math.max(1, maxX - minX), (hpx - 2 * pad) / Math.max(1, maxY - minY));
    const ox = (wpx - (maxX - minX) * k) / 2, oy = (hpx - (maxY - minY) * k) / 2;
    const X = p => (ox + (p.x - minX) * k).toFixed(1), Y = p => (hpx - oy - (p.y - minY) * k).toFixed(1);
    const mid = C.committee && C.pin ? { x: (C.committee.x + C.pin.x) / 2, y: (C.committee.y + C.pin.y) / 2 } : C.marks[0].p;
    const path = [mid, ...C.marks.filter(m => m.type !== 'finish').map(m => m.p), mid].map((p, i) => `${i ? 'L' : 'M'}${X(p)} ${Y(p)}`).join(' ');
    const seen = new Set(), marks = C.marks.filter(m => { const key = Math.round(m.p.x) + ',' + Math.round(m.p.y); if (seen.has(key)) return false; seen.add(key); return true; });
    return `<svg class="v-course" viewBox="0 0 ${wpx} ${hpx}" width="${wpx}" height="${hpx}" aria-hidden="true">
      <rect width="${wpx}" height="${hpx}" rx="8" fill="#123b52"/>
      <path d="${path}" fill="none" stroke="#9fd3ea" stroke-width="1.6" stroke-dasharray="4 3" opacity=".85"/>
      ${C.committee && C.pin ? `<line x1="${X(C.committee)}" y1="${Y(C.committee)}" x2="${X(C.pin)}" y2="${Y(C.pin)}" stroke="#ffb627" stroke-width="2.4"/>` : ''}
      ${marks.map(m => `<circle cx="${X(m.p)}" cy="${Y(m.p)}" r="4.2" fill="#ffb627" stroke="${m.side === 'p' ? '#ff6a5c' : '#34d399'}" stroke-width="1.6"/><text x="${+X(m.p) + 6}" y="${+Y(m.p) - 5}" font-size="9" font-weight="700" fill="#e8eef2" font-family="Saira Semi Condensed, sans-serif">${esc(m.name)}</text>`).join('')}
      <g transform="translate(${wpx - 12} 13)"><path d="M0 -7 L3.5 4 L0 2 L-3.5 4 Z" fill="#e8eef2"/><text y="13" font-size="7" text-anchor="middle" fill="#9fb3c2" font-family="Saira Semi Condensed, sans-serif">N</text></g>
    </svg>`;
  };
  // her, from the side: the hull in her topsides colour, boot stripe, mast and sails, her number on the main
  const boatSvg = b => `<svg class="v-boat" viewBox="0 0 120 92" width="120" height="92" aria-hidden="true">
      <path d="M58 6 L58 70 L22 70 Z" fill="#f3f1ea" stroke="#c9cdd4" stroke-width=".8"/>
      <path d="M62 14 L62 70 L96 70 Z" fill="#eef0f2" stroke="#c9cdd4" stroke-width=".8"/>
      <line x1="60" y1="4" x2="60" y2="72" stroke="#a9b3bc" stroke-width="1.6"/>
      <text x="45" y="52" font-size="7.5" font-weight="800" fill="#1d2b3a" text-anchor="middle" font-family="Saira Semi Condensed, sans-serif">${esc(b.sails.country || '')}</text>
      <text x="44" y="63" font-size="11" font-weight="800" fill="#1d2b3a" text-anchor="middle" font-family="Saira Semi Condensed, sans-serif">${esc(b.sails.number)}</text>
      <path d="M8 72 Q60 76 112 70 L104 80 Q60 86 18 80 Z" fill="${esc(b.hull.upper)}" stroke="#0d1a24" stroke-width=".8"/>
      <path d="M18 80 Q60 86 104 80 L102 82 Q60 88 20 82 Z" fill="${esc(b.hull.stripe || '#24324f')}"/>
      <path d="M50 84 L72 84 L66 91 L54 91 Z" fill="#2a2d33"/>
    </svg>`;
  // a crew member: initials in a round avatar, in the club's colours; an empty seat: a dashed circle
  const initials = n => n === 'You' ? 'YOU' : n.split(/\s+/).map(x => /^\d+$/.test(x) ? x : x[0]).join('').slice(0, 3).toUpperCase();
  const avatar = (name, seat, you) => name
    ? `<span class="v-seat"><span class="v-av${you ? ' you' : ''}">${esc(initials(name))}</span><small>${seat}</small></span>`
    : `<span class="v-seat"><span class="v-av empty">+</span><small>${seat}</small></span>`;
  // the wind (where it blows to, from where it comes) and the current (where it sets), on a compass ring
  const arrowDial = (toDeg, col) => `<svg class="v-dial" viewBox="-30 -30 60 60" width="58" height="58" aria-hidden="true">
      <circle r="26" fill="#0b1d2a" stroke="#2e4a5e" stroke-width="1.2"/><text y="-17" font-size="7" text-anchor="middle" fill="#7f97a8" font-family="Saira Semi Condensed, sans-serif">N</text>
      <g transform="rotate(${toDeg})"><line y1="15" y2="-12" stroke="${col}" stroke-width="3" stroke-linecap="round"/><path d="M0 -19 L6 -9 L-6 -9 Z" fill="${col}"/></g></svg>`;
  const flagImg = (f, h) => { try { const c = signalCanvas(f); return `<img class="v-flag" src="${c.toDataURL()}" style="height:${h}px" alt="">`; } catch { return ''; } };

  // ---------- the values, from the setup and its race ----------
  const host = pressed($('hostSeg'))?.dataset.host;
  const burgee = host === 'ggyc' ? (() => { const c = burgeeCanvas('ggyc'); return c ? `<img class="v-burgee" src="${c.toDataURL()}" alt="">` : ''; })() : '';
  const course = (cond.When, $('courseSel')), courseText = course.options[course.selectedIndex]?.text ?? '';
  const nm = (courseText.match(/([\d.]+)\s*nm/) || [])[1] ?? '';
  const legs = w.C.marks.map(m => m.name).join(' ▸ ');
  const seq = S.seq ?? 3, prep = S.prepFlag ?? 'P', turns = S.penaltyTurns ?? 2;
  const opps = [...document.querySelectorAll('#oppList .opp[data-opp]')].map(o => ({ on: o.getAttribute('aria-pressed') === 'true', name: o.querySelector('span')?.textContent ?? '', no: o.querySelector('small')?.textContent ?? '', fill: o.querySelector('i')?.style.background ?? '#888', ring: (o.querySelector('i')?.style.boxShadow.match(/(rgb[^)]*\)|#[0-9a-f]+)/i) || [])[1] ?? '#888' }));
  const chip = o => `<span class="v-chip"><i style="background:${o.fill};box-shadow:0 0 0 2px ${o.ring}"></i><b>${esc(o.no)}</b><small>${esc(o.name)}</small></span>`;
  const seatsDom = $('crewRows'), sel = i => { const s = seatsDom.querySelector(`select[data-seat="${i}"]`); return s && s.value ? s.options[s.selectedIndex].text : ''; };
  const kg = (($('crewSum')?.textContent ?? '').match(/([\d,]+)\s*lb/) || [])[1] ?? '';
  const fromSlip = S.raceFrom === 'slip';
  const day = new Date(w.raceDate + 'T12:00'), dow = day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(), dd = day.getDate(), mon = day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const [hh, mm] = (S.tideTime || '12:00').split(':').map(Number);
  const clock = `<svg class="v-clock" viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true"><circle r="17" fill="#0b1d2a" stroke="#ffb627" stroke-width="1.6"/>
      ${[...Array(12)].map((_, i) => `<line y1="-15" y2="-13" stroke="#7f97a8" stroke-width="1" transform="rotate(${i * 30})"/>`).join('')}
      <line y2="-9" stroke="#e8eef2" stroke-width="2.4" stroke-linecap="round" transform="rotate(${(hh % 12) * 30 + mm / 2})"/><line y2="-13" stroke="#e8eef2" stroke-width="1.6" stroke-linecap="round" transform="rotate(${mm * 6})"/><circle r="1.6" fill="#ffb627"/></svg>`;
  const windM = (cond.Wind || '').match(/(\d+)\s*kt from (\d+)°\s*\((\w+)\)/) || [], windKt = windM[1] ?? Math.round(w.wind.kt), windFrom = Number(windM[2] ?? w.wind.from), windPt = windM[3] ?? '';
  const windTrend = ((cond.Wind || '').match(/(easing|building|steady)[^(]*/) || [''])[0].trim();
  const curM = (cond.Current || '').match(/(Flood|Ebb|Slack)\s*([\d.]+)?\s*kt?/) || [], curKind = curM[1] ?? '', curKt = curM[2] ?? w.cur.kt.toFixed(1);
  const curTurn = ((cond.Current || '').match(/turns to (\w+) ~?([\d:]+)/) || []);
  const seaM = (cond.Sea || '').match(/([\d.]+)\s*ft,\s*([\d.]+)\s*s/) || [];
  const sunSet = ((cond.Sun || '').match(/sets ([\d:]+)/) || [])[1] ?? '';

  // ---------- the left column: four groups, each a picture-first line ----------
  const steps = document.querySelector('#setup .steps');
  const css = document.createElement('style');
  css.textContent = `
    #setup .steps{gap:10px}
    #setup .vfold{border:1px solid var(--rule);border-radius:12px;background:var(--ink)}
    #setup .vfold>header{display:flex;align-items:center;gap:16px;padding:12px 14px;cursor:pointer;min-height:64px}
    #setup .vfold:hover{border-color:rgba(255,182,39,.55)}
    #setup .vfold.open{border-color:var(--accent)}
    #setup .vfold>header .v-go{margin-left:auto;color:var(--accent);font:600 12px/1 var(--f-inst);letter-spacing:.06em;white-space:nowrap}
    #setup .vfold>.fbody{padding:0 14px 14px;display:flex;flex-direction:column;gap:14px}
    #setup .vfold:not(.open)>.fbody{display:none}
    #setup .vfold .step{border-top:0;padding:0}
    #setup .vfold.one .step>span:first-child{display:none}
    #setup .vfold .step>span:first-child::before{content:none}
    #setup .vlab{font:600 9.5px/1 var(--f-inst);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);writing-mode:vertical-rl;transform:rotate(180deg);align-self:stretch;text-align:center;border-right:1px solid var(--rule);padding-left:8px;margin-right:-4px}
    #setup .v-burgee{height:30px;width:auto;border-radius:1px;box-shadow:0 1px 2px rgba(0,0,0,.5)}
    #setup .v-course{display:block;border-radius:8px}
    #setup .v-big{display:flex;flex-direction:column;line-height:1}
    #setup .v-big b{font:700 30px/1 var(--f-inst);letter-spacing:.01em;color:var(--text)}
    #setup .v-big small{font:600 11px/1.2 var(--f-inst);letter-spacing:.08em;color:var(--muted);margin-top:4px;text-transform:uppercase}
    #setup .v-legs{font:600 12px/1.3 var(--f-inst);color:var(--muted);letter-spacing:.06em;max-width:120px}
    #setup .v-si{display:flex;align-items:center;gap:6px}
    #setup .v-flag{border-radius:1px;box-shadow:0 1px 2px rgba(0,0,0,.5)}
    #setup .v-pill{font:700 12px/1 var(--f-inst);letter-spacing:.04em;color:var(--text);border:1px solid var(--rule);border-radius:999px;padding:5px 8px;background:var(--btn)}
    #setup .v-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    #setup .v-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--rule);border-radius:999px;padding:5px 10px 5px 6px;background:var(--btn)}
    #setup .v-chip i{width:14px;height:14px;border-radius:50%;flex:none}
    #setup .v-chip b{font:700 13px/1 var(--f-inst);letter-spacing:.03em}
    #setup .v-chip small{font:600 11px/1 var(--f-inst);color:var(--muted)}
    #setup .v-add{width:30px;height:30px;border-radius:50%;border:1.5px dashed #5f7a8c;color:#9fb3c2;display:inline-grid;place-items:center;font:700 16px/1 var(--f-inst)}
    #setup .v-boatname{display:flex;flex-direction:column;line-height:1.1}
    #setup .v-boatname b{font:700 16px/1 var(--f-inst);letter-spacing:.04em}
    #setup .v-boatname small{font:700 12px/1.3 var(--f-inst);color:var(--accent);letter-spacing:.06em}
    #setup .v-seats{display:flex;gap:10px}
    #setup .v-seat{display:flex;flex-direction:column;align-items:center;gap:4px}
    #setup .v-seat small{font:600 9.5px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    #setup .v-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font:700 12px/1 var(--f-inst);letter-spacing:.02em;color:#fff;background:#24467a;box-shadow:inset 0 0 0 2px #e8eef2}
    #setup .v-av.you{background:#ffb627;color:#1a1205;box-shadow:inset 0 0 0 2px #fff3d6}
    #setup .v-av.empty{background:transparent;box-shadow:none;border:1.5px dashed #5f7a8c;color:#7f97a8;font-size:16px}
    #setup .v-lb{font:600 11px/1.2 var(--f-inst);color:var(--muted);letter-spacing:.06em;text-align:center}
    #setup .v-start{display:flex;flex-direction:column;align-items:center;gap:3px;font:600 9.5px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    #setup .v-cal{width:46px;border-radius:7px;overflow:hidden;border:1px solid var(--rule);text-align:center;background:#f3f1ea;color:#1d2b3a}
    #setup .v-cal span{display:block;background:#c0392b;color:#fff;font:700 9px/1 var(--f-inst);letter-spacing:.1em;padding:3px 0}
    #setup .v-cal b{display:block;font:800 20px/1.05 var(--f-inst);padding-top:2px}
    #setup .v-cal small{display:block;font:700 9px/1 var(--f-inst);letter-spacing:.1em;padding-bottom:3px}
    #setup .v-time{font:700 24px/1 var(--f-inst);letter-spacing:.02em}
    #setup .v-time small{display:block;font:600 10px/1.2 var(--f-inst);letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
    #setup .step::before{display:none!important;content:none!important}
    /* the conditions as pictures */
    #setSide #condSum{display:none}
    #setSide .v-cond{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #setSide .v-tile{display:flex;align-items:center;gap:10px;background:var(--ink);border:1px solid var(--rule);border-radius:10px;padding:8px 10px}
    #setSide .v-tile .v-big b{font-size:24px}
    #setSide .v-tile svg{flex:none}
  `;
  document.head.appendChild(css);
  const groups = [
    { key: 'course', label: 'Club · course', ids: ['hostField', 'courseField'], head: () => `
        ${burgee}${courseSvg(150, 82)}
        <span class="v-big"><b>${esc(nm)}<span style="font-size:15px"> nm</span></b><small>${esc((courseText.match(/Course\s*\d+/) || ['Course'])[0])}</small></span>
        <span class="v-si">${flagImg(prep === 'black' ? 'black' : prep, 22)}<span class="v-pill" title="Sequence">${seq}′</span><span class="v-pill" title="Penalty for a foul">${turns === 1 ? '⟲' : '⟲⟲'}</span></span>` },
    { key: 'fleet', label: 'Fleet', ids: ['fleetField'], head: () => `<span class="v-chips">${opps.filter(o => o.on).map(chip).join('')}<span class="v-add" title="Add a boat">+</span></span>` },
    { key: 'boat', label: 'Boat · crew', ids: ['crewField'], head: () => `
        ${boatSvg(S.boat)}<span class="v-boatname"><b>${esc(S.boat.name || 'Unnamed')}</b><small>${esc(sailNo(S.boat))}</small></span>
        <span class="v-seats">${avatar('You', 'Helm', true)}${avatar(sel(0), 'Main')}${avatar(sel(1), 'Jib')}</span>
        <span class="v-lb">${esc(kg)} lb<br>aboard</span>
        <span class="v-start"><svg viewBox="0 0 34 22" width="34" height="22" aria-hidden="true">${fromSlip
          ? '<rect x="2" y="4" width="30" height="14" rx="2" fill="none" stroke="#9fb3c2" stroke-width="1.4"/><path d="M8 4 V18 M16 4 V18 M24 4 V18" stroke="#9fb3c2" stroke-width="1.2"/>'
          : '<line x1="3" y1="15" x2="31" y2="15" stroke="#ffb627" stroke-width="2.4"/><rect x="2" y="7" width="4" height="8" fill="#e8eef2"/><circle cx="31" cy="15" r="2.6" fill="#ff8a2a"/><path d="M17 3 l3 6 h-6 z" fill="#9fd3ea"/>'}</svg>${fromSlip ? 'Her slip' : 'The line'}</span>` },
    { key: 'when', label: 'Start', ids: ['tideBox'], head: () => `
        <span class="v-cal"><span>${dow}</span><b>${dd}</b><small>${mon}</small></span>${clock}
        <span class="v-time">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}<small>Gun</small></span>` }
  ];
  const members = [...(seatsDom.querySelector('select[data-seat="0"]')?.options ?? [])].filter(o => o.value).map(o => o.text);
  const pickSeat = (seat, cur) => `<span class="v-seatgrp"><span class="v-rowlab">${seat}</span><span class="v-opts">${members.map(n => `<span class="v-pick${n === cur ? ' on' : ''}${n !== cur && (n === sel(0) || n === sel(1)) ? ' taken' : ''}"><span class="v-av">${esc(initials(n))}</span><small>${esc(n)}</small></span>`).join('')}<span class="v-pick${cur ? '' : ' on'}"><span class="v-av empty">–</span><small>Nobody</small></span></span></span>`;
  const boatBody = () => `
    <div class="v-row">${S.boats.map(b => `<span class="v-bcard${b.id === S.boat.id ? ' on' : ''}">${boatSvg(b).replace('width="120" height="92"', 'width="64" height="49"')}<b>${esc(b.name || 'Unnamed')}</b><small>${esc(sailNo(b))}</small></span>`).join('')}<span class="v-bcard add"><span class="v-add">+</span><small>Yacht Club</small></span>
      <span class="v-sep"></span>
      <span class="v-bcard${fromSlip ? '' : ' on'}"><svg viewBox="0 0 34 22" width="46" height="30"><line x1="3" y1="15" x2="31" y2="15" stroke="#ffb627" stroke-width="2.4"/><rect x="2" y="7" width="4" height="8" fill="#e8eef2"/><circle cx="31" cy="15" r="2.6" fill="#ff8a2a"/><path d="M17 3 l3 6 h-6 z" fill="#9fd3ea"/></svg><small>By the line</small></span>
      <span class="v-bcard${fromSlip ? ' on' : ''}${S.boat.slip ? '' : ' off'}"><svg viewBox="0 0 34 22" width="46" height="30"><rect x="2" y="4" width="30" height="14" rx="2" fill="none" stroke="#9fb3c2" stroke-width="1.4"/><path d="M8 4 V18 M16 4 V18 M24 4 V18" stroke="#9fb3c2" stroke-width="1.2"/></svg><small>${S.boat.slip ? 'Her slip' : 'No slip yet'}</small></span></div>
    <div class="v-row v-seatsrow"><span class="v-seatgrp"><span class="v-rowlab">Helm</span><span class="v-opts"><span class="v-pick on"><span class="v-av you">YOU</span><small>You</small></span></span></span>${pickSeat('Main', sel(0))}${pickSeat('Jib · pole', sel(1))}</div>`;
  css.textContent += `
    #setup .v-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    #setup .v-rowlab{display:block;margin-bottom:6px;font:600 9.5px/1 var(--f-inst);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
    #setup .v-pick,#setup .v-bcard{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 8px;border-radius:10px;border:1px solid transparent;cursor:pointer}
    #setup .v-pick small,#setup .v-bcard small{font:600 11px/1 var(--f-inst);color:var(--muted)}
    #setup .v-bcard b{font:700 12px/1 var(--f-inst);letter-spacing:.04em}
    #setup .v-pick.on,#setup .v-bcard.on{border-color:var(--accent);background:var(--btn-hi)}
    #setup .v-pick.taken{opacity:.4}
    #setup .v-bcard{background:var(--btn);border-color:var(--rule);min-width:92px}
    #setup .v-bcard.add{background:transparent;border-style:dashed}
    #setup .v-bcard.off{opacity:.4;cursor:default}
    #setup .vfold.boat .fbody>.step{display:none}
    #setup .v-sep{width:1px;align-self:stretch;background:var(--rule);margin:0 4px}
    #setup .v-seatsrow{align-items:flex-start;gap:18px}
    #setup .v-seatgrp{display:flex;flex-direction:column}
    #setup .v-opts{display:flex;gap:2px}
    #setup .v-pick{padding:4px 6px}
    #setup .v-bcard{padding:5px 8px;min-width:80px}
  `;
  const made = groups.map(g => {
    const box = document.createElement('section'); box.className = 'vfold ' + g.key + (g.ids.length === 1 ? ' one' : '');
    const head = document.createElement('header'); head.innerHTML = `<span class="vlab">${g.label}</span>${g.head()}<span class="v-go">Change ▾</span>`;
    const body = document.createElement('div'); body.className = 'fbody';
    for (const id of g.ids) { const f = $(id); if (f) body.appendChild(f); }
    if (g.key === 'boat') body.insertAdjacentHTML('afterbegin', boatBody());
    box.append(head, body); steps.appendChild(box);
    head.onclick = () => window.__vfold(box.classList.contains('open') ? null : g.key);
    return { g, box, head };
  });
  window.__vfold = key => { for (const { g, box, head } of made) { const on = g.key === key; box.classList.toggle('open', on); head.querySelector('.v-go').textContent = on ? 'Done ▴' : 'Change ▾'; } };

  // ---------- the right column: the day as pictures, the graph kept ----------
  const tiles = document.createElement('div'); tiles.className = 'v-cond';
  tiles.innerHTML = `
    <div class="v-tile" title="${esc(cond.Wind)}">${arrowDial((windFrom + 180) % 360, '#7ee0a5')}<span class="v-big"><b>${esc(windKt)}<span style="font-size:13px"> kt</span></b><small>from ${esc(windPt)}${windTrend ? ' · ' + esc(windTrend.split(' ')[0]) : ''}</small></span></div>
    <div class="v-tile" title="${esc(cond.Current)}">${arrowDial(Math.round(w.cur.set), '#6fb7ff')}<span class="v-big"><b>${esc(curKt)}<span style="font-size:13px"> kt</span></b><small>${esc(curKind)}${curTurn[1] ? ` · ${esc(curTurn[1])} ${esc(curTurn[2])}` : ''}</small></span></div>
    <div class="v-tile" title="${esc(cond.Sea)}"><svg viewBox="0 0 58 40" width="58" height="40" aria-hidden="true"><path d="M2 26 q7 -10 14 0 t14 0 t14 0 t14 0" fill="none" stroke="#9fd3ea" stroke-width="2.4"/><path d="M2 34 q7 -7 14 0 t14 0 t14 0 t14 0" fill="none" stroke="#5c8fb0" stroke-width="2"/></svg><span class="v-big"><b>${esc(seaM[1] ?? '')}<span style="font-size:13px"> ft</span></b><small>${esc(seaM[2] ?? '')} s swell</small></span></div>
    <div class="v-tile" title="${esc(cond.Sun)}"><svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true"><circle r="7" fill="#ffcf5a"/>${[...Array(8)].map((_, i) => `<line y1="-11" y2="-16" stroke="#ffcf5a" stroke-width="2" stroke-linecap="round" transform="rotate(${i * 45})"/>`).join('')}</svg><span class="v-big"><b>${esc(sunSet)}</b><small>sunset</small></span></div>`;
  $('condSum').after(tiles);
})();
